import { metaPost } from './client';

export const WEBHOOK_FIELDS = 'messages,messaging_postbacks,comments,messaging_seen';

export function subscribeApp(accountIgId: string, token: string): Promise<unknown> {
  return metaPost(`/${accountIgId}/subscribed_apps`, token, {}, {
    subscribed_fields: WEBHOOK_FIELDS,
  });
}
