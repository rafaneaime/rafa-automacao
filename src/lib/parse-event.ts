export type CommentEvent = {
  kind: 'comment';
  accountIgId: string;
  commentId: string;
  text: string;
  fromId: string;
  fromUsername: string | null;
  mediaId: string | null;
};

/**
 * De qual Story esta mensagem é resposta.
 *
 * Story não tem comentário: o que a pessoa faz é **responder**, e a resposta
 * chega como mensagem direta, igual a qualquer outra. A única coisa que
 * distingue as duas é este campo, que o Meta manda em `message.reply_to.story`
 * — e que este leitor jogava fora.
 *
 * O `id` pode vir sem a `url` e vice-versa, então os dois são opcionais. O que
 * não é opcional é o objeto existir: a presença dele é o sinal de que veio de
 * um Story, mesmo quando o Meta não conta qual.
 */
export type RespostaDeStory = { id: string | null; url: string | null };

export type MessageEvent = {
  kind: 'message';
  accountIgId: string;
  fromId: string;
  text: string;
  /**
   * Identificador da mensagem no Meta. É a única coisa estável que uma
   * reentrega do mesmo evento traz igual — o que faz dele a chave para não
   * contar a mesma interação duas vezes. Pode faltar em payload antigo ou
   * malformado, e aí quem consome decide o que fazer.
   */
  mid: string | null;
  /** `null` quando é DM comum. Ver `RespostaDeStory`. */
  story: RespostaDeStory | null;
};

export type NormalizedEvent = CommentEvent | MessageEvent;

const COMMENT_FIELDS = ['comments', 'live_comments', 'mentions'];

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : null;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function parseComment(accountIgId: string, value: unknown): CommentEvent | null {
  const v = asRecord(value);
  if (!v) return null;

  const from = asRecord(v.from);
  const media = asRecord(v.media);

  const commentId = asString(v.id);
  const fromId = from ? asString(from.id) : null;
  if (!commentId || !fromId) return null;

  return {
    kind: 'comment',
    accountIgId,
    commentId,
    text: asString(v.text) ?? '',
    fromId,
    fromUsername: from ? asString(from.username) : null,
    mediaId: media ? asString(media.id) : null,
  };
}

function parseMessaging(accountIgId: string, item: unknown): MessageEvent | null {
  const m = asRecord(item);
  if (!m) return null;

  const message = asRecord(m.message);
  const sender = asRecord(m.sender);
  if (!message || !sender) return null;

  // Echo é a mensagem que nós mesmos enviamos, devolvida pelo Meta.
  if (message.is_echo === true) return null;

  const fromId = asString(sender.id);
  const text = asString(message.text);
  if (!fromId || text === null) return null;

  return {
    kind: 'message',
    accountIgId,
    fromId,
    text,
    mid: asString(message.mid),
    story: lerRespostaDeStory(message),
  };
}

function lerRespostaDeStory(message: Record<string, unknown>): RespostaDeStory | null {
  const replyTo = asRecord(message.reply_to);
  const story = replyTo ? asRecord(replyTo.story) : null;
  if (!story) return null;

  // O objeto vazio também conta: ele já diz "veio de um Story".
  return { id: asString(story.id), url: asString(story.url) };
}

export function parseEvents(payload: unknown): NormalizedEvent[] {
  const root = asRecord(payload);
  if (!root || root.object !== 'instagram') return [];
  if (!Array.isArray(root.entry)) return [];

  const events: NormalizedEvent[] = [];

  for (const rawEntry of root.entry) {
    const entry = asRecord(rawEntry);
    if (!entry) continue;

    const accountIgId = asString(entry.id);
    if (!accountIgId) continue;

    if (Array.isArray(entry.changes)) {
      for (const rawChange of entry.changes) {
        const change = asRecord(rawChange);
        if (!change) continue;
        const field = asString(change.field);
        if (!field || !COMMENT_FIELDS.includes(field)) continue;
        const event = parseComment(accountIgId, change.value);
        if (event) events.push(event);
      }
    }

    if (Array.isArray(entry.messaging)) {
      for (const item of entry.messaging) {
        const event = parseMessaging(accountIgId, item);
        if (event) events.push(event);
      }
    }
  }

  return events;
}
