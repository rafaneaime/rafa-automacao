import { sql } from '../db';

// A entrada da pessoa na automação. Só interessa quem realmente recebeu a DM
// original — quem falhou ou foi segurado pelo limite não tem sequência a
// continuar.
export async function findSentDelivery(
  accountId: number,
  igUserId: string,
): Promise<{ id: number; automationId: number } | null> {
  const rows = (await sql`
    select d.id, d.automation_id
    from deliveries d
    join automations a on a.id = d.automation_id
    where a.account_id = ${accountId}
      and d.ig_user_id = ${igUserId}
      and d.status = 'sent'
    order by d.created_at desc, d.id desc
    limit 1
  `) as { id: number; automation_id: number }[];

  return rows[0] ? { id: rows[0].id, automationId: rows[0].automation_id } : null;
}

export async function sentFollowUps(deliveryId: number): Promise<number[]> {
  const rows = (await sql`
    select position from follow_ups_sent where delivery_id = ${deliveryId}
  `) as { position: number }[];
  return rows.map((r) => r.position);
}

// Reserva atômica, igual à de deliveries: só um envio ganha a corrida se o
// mesmo evento chegar duas vezes.
export async function claimFollowUp(
  deliveryId: number,
  position: number,
): Promise<boolean> {
  const rows = (await sql`
    insert into follow_ups_sent (delivery_id, position)
    values (${deliveryId}, ${position})
    on conflict (delivery_id, position) do nothing
    returning id
  `) as { id: number }[];
  return rows.length > 0;
}

// Solta a reserva quando o envio falha, para a pessoa não ficar presa sem a
// mensagem depois que a causa for corrigida.
export async function releaseFollowUp(
  deliveryId: number,
  position: number,
): Promise<void> {
  await sql`
    delete from follow_ups_sent
    where delivery_id = ${deliveryId} and position = ${position}
  `;
}
