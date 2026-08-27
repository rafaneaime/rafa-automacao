import { sql } from '../db';
import type { Account } from './types';

type Row = {
  id: number;
  ig_user_id: string;
  username: string | null;
  access_token: string;
  token_expires_at: Date | null;
};

function toAccount(row: Row): Account {
  return {
    id: row.id,
    igUserId: row.ig_user_id,
    username: row.username,
    accessToken: row.access_token,
    tokenExpiresAt: row.token_expires_at,
  };
}

export async function findAccountByIgId(igUserId: string): Promise<Account | null> {
  const rows = (await sql`
    select id, ig_user_id, username, access_token, token_expires_at
    from accounts where ig_user_id = ${igUserId}
  `) as Row[];
  return rows[0] ? toAccount(rows[0]) : null;
}

export async function getFirstAccount(): Promise<Account | null> {
  const rows = (await sql`
    select id, ig_user_id, username, access_token, token_expires_at
    from accounts order by id limit 1
  `) as Row[];
  return rows[0] ? toAccount(rows[0]) : null;
}

/**
 * Todas as contas conectadas.
 *
 * O produto normal tem uma só, e por isso quase tudo usa `getFirstAccount`.
 * Trabalho que roda sozinho, porém, não pode escolher uma conta e ignorar as
 * outras: a segunda ficaria parada em silêncio, sem nada na tela dizendo isso.
 */
export async function listarContas(): Promise<Account[]> {
  const rows = (await sql`
    select id, ig_user_id, username, access_token, token_expires_at
    from accounts order by id
  `) as Row[];
  return rows.map(toAccount);
}

export async function saveAccount(
  igUserId: string,
  username: string | null,
  accessToken: string,
  expiresInSeconds: number,
): Promise<Account> {
  const rows = (await sql`
    insert into accounts (ig_user_id, username, access_token, token_expires_at)
    values (
      ${igUserId}, ${username}, ${accessToken},
      now() + make_interval(secs => ${expiresInSeconds})
    )
    on conflict (ig_user_id) do update set
      username = excluded.username,
      access_token = excluded.access_token,
      token_expires_at = excluded.token_expires_at
    returning id, ig_user_id, username, access_token, token_expires_at
  `) as Row[];
  return toAccount(rows[0]);
}

export async function updateAccountToken(
  id: number,
  accessToken: string,
  expiresInSeconds: number,
): Promise<void> {
  await sql`
    update accounts set
      access_token = ${accessToken},
      token_expires_at = now() + make_interval(secs => ${expiresInSeconds})
    where id = ${id}
  `;
}
