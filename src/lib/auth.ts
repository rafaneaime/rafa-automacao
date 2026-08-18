import { createHmac, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { env } from './env';

export const SESSION_COOKIE = 'adeus_sessao';

// O valor do cookie é derivado da senha: trocar PANEL_PASSWORD invalida
// todas as sessões automaticamente.
export function sessionValue(): string {
  return createHmac('sha256', env.panelPassword()).update('painel-ok').digest('hex');
}

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export async function isLoggedIn(): Promise<boolean> {
  const value = (await cookies()).get(SESSION_COOKIE)?.value;
  return value ? safeEqual(value, sessionValue()) : false;
}

export function checkPassword(attempt: string): boolean {
  return safeEqual(attempt, env.panelPassword());
}

export async function requirePanelSession(): Promise<void> {
  if (!(await isLoggedIn())) redirect('/login');
}
