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
    from deliveries d
    join automations a on a.id = d.automation_id
    where a.account_id = ${accountId}
      and d.status = 'sent'
      and d.created_at > now() - interval '1 hour'
  `) as { total: number }[];
  return rows[0]?.total ?? 0;
}

export async function listDeliveries(limit = 100): Promise<DeliveryLog[]> {
  const rows = (await sql`
    select d.id, a.name as automation_name, d.ig_user_id, d.status, d.error, d.created_at
    from deliveries d
    join automations a on a.id = d.automation_id
    order by d.created_at desc
    limit ${limit}
  `) as {
    id: number;
    automation_name: string;
    ig_user_id: string;
    status: string;
    error: string | null;
    created_at: Date;
  }[];

  return rows.map((r) => ({
    id: r.id,
    automationName: r.automation_name,
    igUserId: r.ig_user_id,
    status: r.status,
    error: r.error,
    createdAt: r.created_at,
  }));
}
