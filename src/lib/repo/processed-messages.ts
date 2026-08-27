import { sql } from '../db';

/**
 * Reserva atômica de uma mensagem recebida, pelo `mid` do Meta.
 *
 * Devolve `false` quando aquela mensagem já foi processada — o que acontece
 * toda vez que o Meta reentrega, e ele reentrega quando a resposta demora.
 */
export async function claimMessage(accountId: number, mid: string): Promise<boolean> {
  const rows = (await sql`
    insert into processed_messages (account_id, mid)
    values (${accountId}, ${mid})
    on conflict (account_id, mid) do nothing
    returning id
  `) as { id: number }[];
  return rows.length > 0;
}

/**
 * Solta a reserva quando o processamento falha.
 *
 * Sem isso, uma falha de envio consumiria a única chance daquela mensagem: a
 * reentrega seguinte seria recusada como duplicata e a pessoa nunca receberia
 * a continuação. Mesma regra de releaseDelivery.
 */
export async function releaseMessage(accountId: number, mid: string): Promise<void> {
  await sql`
    delete from processed_messages
    where account_id = ${accountId} and mid = ${mid}
  `;
}
