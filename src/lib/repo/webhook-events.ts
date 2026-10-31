import { sql } from '../db';
import type { WebhookEventLog } from './types';

export async function recordWebhookEvent(
  raw: string,
  signatureValid: boolean,
): Promise<number> {
  const rows = (await sql`
    insert into webhook_events (raw, signature_valid)
    values (${raw}, ${signatureValid})
    returning id
  `) as { id: number }[];
  return rows[0].id;
}

export async function markWebhookProcessed(
  id: number,
  error: string | null,
): Promise<void> {
  await sql`
    update webhook_events set processed_at = now(), error = ${error}
    where id = ${id}
  `;
}

export async function listRecentEvents(limit = 50): Promise<WebhookEventLog[]> {
  const rows = (await sql`
    select id, received_at, signature_valid, processed_at, error,
      -- Só o começo do payload: o suficiente para dizer o que foi a entrega,
      -- sem trazer 50 payloads inteiros para montar uma tela de lista.
      left(raw, 4000) as raw
    from webhook_events
    order by received_at desc
    limit ${limit}
  `) as {
    id: number;
    received_at: Date;
    signature_valid: boolean;
    processed_at: Date | null;
    error: string | null;
    raw: string | null;
  }[];

  return rows.map((r) => ({
    id: r.id,
    receivedAt: r.received_at,
    signatureValid: r.signature_valid,
    processedAt: r.processed_at,
    error: r.error,
    raw: r.raw,
  }));
}

/**
 * Chega comentário e não chega mensagem?
 *
 * Esse recorte tem uma causa só, e nenhuma tela dizia qual: a chave "Permitir
 * acesso a mensagens" desligada na conta do Instagram. Com ela desligada o
 * envio continua funcionando — o eco da DM e a confirmação de leitura voltam
 * normalmente —, e o Instagram não entrega **nada** que as pessoas mandam.
 * Resposta de Story e DM recebida somem, e do lado de cá é idêntico a
 * "ninguém mandou mensagem".
 *
 * Num painel real isso passou semanas assim, com a dona achando que ninguém
 * respondia os Stories dela. A diferença entre as duas situações está nos
 * webhooks guardados, e é isto que esta consulta lê.
 *
 * `entrada` conta só mensagem vinda de fora: eco é o que nós mandamos, e
 * confirmação de leitura não é mensagem de ninguém.
 */
export async function recebimentoPorTipo(dias = 30): Promise<{ comentarios: number; entrada: number }> {
  const rows = (await sql`
    select
      count(*) filter (where raw like '%"comments"%') as comentarios,
      count(*) filter (
        where raw like '%"messaging"%'
          and raw not like '%"is_echo":true%'
          and raw not like '%"read"%'
          and raw like '%"text"%'
      ) as entrada
    from webhook_events
    where received_at > now() - make_interval(days => ${dias})
  `) as { comentarios: number | string; entrada: number | string }[];

  return {
    comentarios: Number(rows[0]?.comentarios ?? 0),
    entrada: Number(rows[0]?.entrada ?? 0),
  };
}
