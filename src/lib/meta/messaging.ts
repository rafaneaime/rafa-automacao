import { GRAPH_BASE, MetaApiError, metaPost } from './client';

/**
 * Um botão da mensagem.
 *
 * Com `url`, leva a pessoa para fora. Com `acao`, não leva a lugar nenhum: o
 * clique volta para cá como evento, e é assim que um botão "já estou seguindo"
 * consegue existir. Os dois juntos não fazem sentido, e o link ganha.
 */
export type Button = { title: string; url?: string; acao?: string };

const PAYLOAD_MAXIMO = 1000;

export function buildMessagePayload(text: string, buttons: Button[]): unknown {
  const uteis = buttons.filter(
    (b) => (b.url && b.url.length > 0) || (b.acao && b.acao.length > 0 && b.acao.length <= PAYLOAD_MAXIMO),
  );

  if (uteis.length === 0) return { text };

  // Botão vai junto do texto de propósito: a private reply é a nossa única
  // chamada. Uma segunda mensagem cairia fora da janela de 24h (erro #10).
  return {
    attachment: {
      type: 'template',
      payload: {
        template_type: 'button',
        text,
        buttons: uteis.map((b) =>
          b.url && b.url.length > 0
            ? { type: 'web_url', url: b.url, title: b.title }
            : { type: 'postback', payload: b.acao, title: b.title },
        ),
      },
    },
  };
}

/*
 * O `host` fecha a lista de parâmetros de cada envio em vez de ser lido de uma
 * constante: a mesma instalação pode ter uma conta no login do Instagram e
 * outra no unificado, e a decisão é da conta, não do arquivo. Quem não informa
 * continua no endereço antigo, que é onde todo painel já conectado vive.
 */
export function publicReply(
  commentId: string,
  message: string,
  token: string,
  host = GRAPH_BASE,
  signal?: AbortSignal,
): Promise<unknown> {
  return metaPost(`/${commentId}/replies`, token, { message }, {}, host, signal);
}

export function privateReply(
  accountIgId: string,
  commentId: string,
  text: string,
  buttons: Button[],
  token: string,
  host = GRAPH_BASE,
  signal?: AbortSignal,
): Promise<unknown> {
  return metaPost(`/${accountIgId}/messages`, token, {
    recipient: { comment_id: commentId },
    message: buildMessagePayload(text, buttons),
  }, {}, host, signal);
}

/*
 * A Meta deixa cada conversa pertencer a um aplicativo de cada vez. Quem chega
 * vindo de outra ferramenta traz as conversas ainda no nome dela: o evento é
 * entregue, a automação casa, e só o envio volta
 * `(#100) A ação é inválida porque não é a dona do tópico`, subcódigo 2534037.
 * Medido numa instalação real em 27/11/2026, com o ManyChat como dono.
 *
 * O protocolo de transferência existe para isso. Pedimos a posse só depois de
 * levar essa recusa, e uma vez só: pedir antes de toda DM seria uma chamada a
 * mais em toda resposta, e insistir não muda nada quando o pedido é negado.
 */
const SUBCODIGO_SEM_POSSE_DA_CONVERSA = 2534037;

function semPosseDaConversa(erro: unknown): erro is MetaApiError {
  if (!(erro instanceof MetaApiError)) return false;
  let corpo: unknown;
  try {
    corpo = JSON.parse(erro.body);
  } catch {
    return false;
  }
  const subcodigo = (corpo as { error?: { error_subcode?: unknown } } | null)?.error?.error_subcode;
  return subcodigo === SUBCODIGO_SEM_POSSE_DA_CONVERSA;
}

export function takeThreadControl(
  accountIgId: string,
  recipientIgId: string,
  token: string,
  host = GRAPH_BASE,
  signal?: AbortSignal,
): Promise<unknown> {
  return metaPost(`/${accountIgId}/take_thread_control`, token, {
    recipient: { id: recipientIgId },
  }, {}, host, signal);
}

export async function sendDm(
  accountIgId: string,
  recipientIgId: string,
  text: string,
  buttons: Button[],
  token: string,
  // Compatibilidade com o ProcessDeps da Base. Identificador interno para
  // atribuição/rastreamento; não é um campo aceito pelo endpoint da Meta.
  _automationId?: number | null,
  host = GRAPH_BASE,
  signal?: AbortSignal,
): Promise<unknown> {
  const enviar = () => metaPost(`/${accountIgId}/messages`, token, {
    recipient: { id: recipientIgId },
    message: buildMessagePayload(text, buttons),
  }, {}, host, signal);

  try {
    return await enviar();
  } catch (erro) {
    if (!semPosseDaConversa(erro)) throw erro;
    try {
      await takeThreadControl(accountIgId, recipientIgId, token, host, signal);
    } catch (erroDaPosse) {
      // Sai como MetaApiError com o status e o corpo do envio, não da posse:
      // quem lê isso em cima classifica recusa da Meta por esse status, e uma
      // recusa de 400 não pode virar incerteza só porque houve um segundo erro.
      // As duas frases juntas, para o registro dizer onde parou.
      throw new MetaApiError(
        `${erro.message} | pedido de posse da conversa recusado: ${
          erroDaPosse instanceof Error ? erroDaPosse.message : String(erroDaPosse)
        }`,
        erro.status,
        erro.body,
      );
    }
    return enviar();
  }
}
