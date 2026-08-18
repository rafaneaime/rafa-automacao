import { sql } from '../db';
import type { Contact } from './types';

export async function upsertContact(
  accountId: number,
  igUserId: string,
  username: string | null,
): Promise<void> {
  await sql`
    insert into contacts (account_id, ig_user_id, username)
    values (${accountId}, ${igUserId}, ${username})
    on conflict (account_id, ig_user_id) do update set
      username = coalesce(excluded.username, contacts.username),
      last_seen_at = now()
  `;
}

export async function listContacts(accountId: number): Promise<Contact[]> {
  const rows = (await sql`
    select id, ig_user_id, username, first_seen_at, last_seen_at
    from contacts where account_id = ${accountId}
    order by last_seen_at desc
  `) as {
    id: number;
    ig_user_id: string;
    username: string | null;
    first_seen_at: Date;
    last_seen_at: Date;
  }[];

  return rows.map((r) => ({
    id: r.id,
    igUserId: r.ig_user_id,
    username: r.username,
    firstSeenAt: r.first_seen_at,
    lastSeenAt: r.last_seen_at,
  }));
}
