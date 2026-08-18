export type CommentEvent = {
  kind: 'comment';
  accountIgId: string;
  commentId: string;
  text: string;
  fromId: string;
  fromUsername: string | null;
  mediaId: string | null;
};

export type MessageEvent = {
  kind: 'message';
  accountIgId: string;
  fromId: string;
  text: string;
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

  return { kind: 'message', accountIgId, fromId, text };
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
