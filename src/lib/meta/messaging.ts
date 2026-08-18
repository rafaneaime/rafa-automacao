import { metaPost } from './client';

export type Button = { title: string; url: string };

export function buildMessagePayload(text: string, buttons: Button[]): unknown {
  const withUrl = buttons.filter((b) => b.url && b.url.length > 0);

  if (withUrl.length === 0) return { text };

  // Botão vai junto do texto de propósito: a private reply é a nossa única
  // chamada. Uma segunda mensagem cairia fora da janela de 24h (erro #10).
  return {
    attachment: {
      type: 'template',
      payload: {
        template_type: 'button',
        text,
        buttons: withUrl.map((b) => ({
          type: 'web_url',
          url: b.url,
          title: b.title,
        })),
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
