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
    select id, received_at, signature_valid, processed_at, error
    from webhook_events
    order by received_at desc
    limit ${limit}
  `) as {
    id: number;
    received_at: Date;
    signature_valid: boolean;
    processed_at: Date | null;
    error: string | null;
  }[];

  return rows.map((r) => ({
    id: r.id,
    receivedAt: r.received_at,
    signatureValid: r.signature_valid,
    processedAt: r.processed_at,
    error: r.error,
  }));
}
