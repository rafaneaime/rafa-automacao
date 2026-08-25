import { sql } from '../db';
import type { DeliveryLog } from './types';

export async function claimDelivery(
  automationId: number,
  igUserId: string,
  commentId: string | null,
): Promise<boolean> {
  const rows = (await sql`
    insert into deliveries (automation_id, ig_user_id, comment_id, status)
    values (${automationId}, ${igUserId}, ${commentId}, 'pending')
    on conflict (automation_id, ig_user_id) do nothing
    returning id
  `) as { id: number }[];
  return rows.length > 0;
}

// Solta a reserva quando o envio falha, para que um novo comentário possa
// tentar de novo depois que a causa (token, permissão) for corrigida.
export async function releaseDelivery(
  automationId: number,
  igUserId: string,
): Promise<void> {
  await sql`
    delete from deliveries
    where automation_id = ${automationId} and ig_user_id = ${igUserId}
      and status = 'pending'
  `;
}

export async function markDelivery(
  automationId: number,
  igUserId: string,
  status: 'sent' | 'error' | 'throttled',
  error: string | null,
): Promise<void> {
  await sql`
    update deliveries set status = ${status}, error = ${error}
    where automation_id = ${automationId} and ig_user_id = ${igUserId}
  `;
}

export async function countRecentSent(accountId: number): Promise<number> {
  const rows = (await sql`
    select count(*)::int as total
    from (
      select d.id
      from deliveries d
      join automations a on a.id = d.automation_id
      where a.account_id = ${accountId}
        and d.status = 'sent'
        and d.created_at > now() - interval '1 hour'

      union all

      select f.id
      from follow_ups_sent f
      join deliveries d on d.id = f.delivery_id
      join automations a on a.id = d.automation_id
      where a.account_id = ${accountId}
        and f.sent_at > now() - interval '1 hour'
    ) recent_sent
  `) as { total: number }[];
  return rows[0]?.total ?? 0;
}

export type DeliveryLogRow = {
  id: number;
  automation_name: string;
  ig_user_id: string;
  status: string;
  error: string | null;
  created_at: Date;
  kind: 'dm' | 'follow_up';
  position: number | null;
};

export function mapDeliveryRows(rows: DeliveryLogRow[]): DeliveryLog[] {
  return rows
    .map((r) => ({
      id: r.id,
      automationName: r.automation_name,
      igUserId: r.ig_user_id,
      status: r.status,
      error: r.error,
      createdAt: r.created_at,
      kind: r.kind,
      // A coluna vale 2 e 3 porque os passos 0 e 1 são a resposta pública e a
      // DM. Subtrair 1 assume esse layout, que é o que createAutomation grava
      // hoje. Se os follow-ups passarem a ocupar outras posições (P2-004), a
      // numeração aqui sai errada — numerar por ordem dentro da entrega não
      // serve, porque o limite da consulta pode cortar um irmão da lista.
      continuacao:
        r.kind === 'follow_up' && r.position !== null ? r.position - 1 : null,
    }))
    .sort((a, b) => {
      const porData = b.createdAt.getTime() - a.createdAt.getTime();
      if (porData !== 0) return porData;
      if (a.kind !== b.kind) return a.kind < b.kind ? -1 : 1;
      return b.id - a.id;
    });
}

export async function listDeliveries(limit = 100): Promise<DeliveryLog[]> {
  const rows = (await sql`
    select id, automation_name, ig_user_id, status, error, created_at, kind, position
    from (
      select
        d.id,
        a.name as automation_name,
        d.ig_user_id,
        d.status,
        d.error,
        d.created_at,
        'dm'::text as kind,
        null::integer as position
      from deliveries d
      join automations a on a.id = d.automation_id

      union all

      select
        f.id,
        a.name as automation_name,
        d.ig_user_id,
        'sent'::text as status,
        null::text as error,
        f.sent_at as created_at,
        'follow_up'::text as kind,
        f.position
      from follow_ups_sent f
      join deliveries d on d.id = f.delivery_id
      join automations a on a.id = d.automation_id
    ) combined_deliveries
    order by created_at desc, kind asc, id desc
    limit ${limit}
  `) as DeliveryLogRow[];

  return mapDeliveryRows(rows);
}
