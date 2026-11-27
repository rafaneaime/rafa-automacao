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
 * A causa mais comum é a chave "Permitir acesso às mensagens" desligada na
 * conta do Instagram. Com ela desligada o envio continua funcionando — o eco
 * da DM e a confirmação de leitura voltam normalmente —, e o Instagram não
 * entrega **nada** que as pessoas mandam. Resposta de Story e DM recebida
 * somem, e do lado de cá é idêntico a "ninguém mandou mensagem".
 *
 * Num painel real isso passou semanas assim, com a dona achando que ninguém
 * respondia os Stories dela. A diferença entre as duas situações está nos
 * webhooks guardados, e é isto que esta consulta lê.
 *
 * Não é causa única: em 26/11/2026 apareceu uma instalação com a chave ligada,
 * a permissão no lugar, e mesmo assim nenhuma mensagem entrando.
 *
 * `entrada` conta só mensagem vinda de fora: eco é o que nós mandamos, e
 * confirmação de leitura não é mensagem de ninguém.
 *
 * `cliques` conta clique em botão da DM, que chega em `postback` e **não tem
 * campo de texto**. Ele existe porque sem ele o aviso acusava a conta errada:
 * automação com botão convida a pessoa a tocar em vez de digitar, e é essa a
 * recomendação da própria tela de automações, porque boa parte some antes de
 * escrever. Numa instalação assim todo o recebimento pode ser clique, o
 * `entrada` fica em zero com o Instagram entregando tudo certo, e a tela
 * mandava mexer numa chave que estava ligada. Clique é prova de recebimento
 * como qualquer outra: quem toca no botão teve a mensagem entregue de volta
 * para cá.
 *
 * O eco fica de fora dos dois: a DM que nós mandamos com botão carrega
 * `"postback"` dentro dela, e contá-la seria o painel provando para si mesmo
 * que recebe o que ele próprio enviou.
 *
 * `desde` é o aviso mais antigo que este painel guardou dentro da janela, e
 * existe porque a contagem sozinha mente em instalação nova. Num painel ligado
 * hoje de manhã, "nenhuma mensagem em 30 dias" é uma frase sobre 30 dias que
 * ninguém observou: o banco tem horas de vida. Quem lê o número precisa ler
 * junto o tempo em que ele foi medido, senão três comentários numa tarde viram
 * prova de defeito. Foi exatamente o que aconteceu em 26/11/2026, e custou a
 * tarde de uma investigação atrás de uma chave que estava certa.
 */
export async function recebimentoPorTipo(
  dias = 30,
): Promise<{ comentarios: number; entrada: number; cliques: number; desde: Date | null }> {
  const rows = (await sql`
    select
      count(*) filter (where raw like '%"comments"%') as comentarios,
      count(*) filter (
        where raw like '%"messaging"%'
          and raw not like '%"is_echo":true%'
          and raw not like '%"read"%'
          and raw like '%"text"%'
      ) as entrada,
      count(*) filter (
        where raw like '%"messaging"%'
          and raw not like '%"is_echo":true%'
          and raw like '%"postback"%'
      ) as cliques,
      min(received_at) as desde
    from webhook_events
    where received_at > now() - make_interval(days => ${dias})
  `) as {
    comentarios: number | string;
    entrada: number | string;
    cliques: number | string;
    desde: string | Date | null;
  }[];

  const desdeBruto = rows[0]?.desde ?? null;
  const desde = desdeBruto ? new Date(desdeBruto) : null;

  return {
    comentarios: Number(rows[0]?.comentarios ?? 0),
    entrada: Number(rows[0]?.entrada ?? 0),
    cliques: Number(rows[0]?.cliques ?? 0),
    desde: desde && !Number.isNaN(desde.getTime()) ? desde : null,
  };
}
