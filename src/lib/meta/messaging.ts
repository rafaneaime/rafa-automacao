import { metaPost } from './client';

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

export function publicReply(
  commentId: string,
  message: string,
  token: string,
): Promise<unknown> {
  return metaPost(`/${commentId}/replies`, token, { message });
}

export function privateReply(
  accountIgId: string,
  commentId: string,
  text: string,
  buttons: Button[],
  token: string,
): Promise<unknown> {
  return metaPost(`/${accountIgId}/messages`, token, {
    recipient: { comment_id: commentId },
    message: buildMessagePayload(text, buttons),
  });
}

export function sendDm(
  accountIgId: string,
  recipientIgId: string,
  text: string,
  buttons: Button[],
  token: string,
): Promise<unknown> {
  return metaPost(`/${accountIgId}/messages`, token, {
    recipient: { id: recipientIgId },
    message: buildMessagePayload(text, buttons),
  });
}
