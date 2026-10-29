import type { NextRequest } from 'next/server';
import { refreshLongLived } from '@/lib/meta/token';
import { getFirstAccount, updateAccountToken } from '@/lib/repo/accounts';
import { authorizeCron } from '@/lib/cron-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DIAS_PARA_RENOVAR = 10;

export async function GET(request: NextRequest) {
  const denied = authorizeCron(request);
  if (denied) return denied;

  const account = await getFirstAccount();
  if (!account) return Response.json({ ok: true, acao: 'nenhuma conta conectada' });

  /*
   * Token do login unificado é de usuário do sistema e não expira — a própria
   * tela da Meta escreve "Expiração: nunca". Pedir `ig_refresh_token` para ele
   * é erro todo dia, e erro diário que não significa nada é como se deixa de
   * olhar para o que significa.
   */
  if (account.dialeto === 'unificado') {
    return Response.json({ ok: true, acao: 'token do login unificado não expira' });
  }

  const diasRestantes = account.tokenExpiresAt
    ? (new Date(account.tokenExpiresAt).getTime() - Date.now()) / 86_400_000
    : 0;

  if (diasRestantes > DIAS_PARA_RENOVAR) {
    return Response.json({
      ok: true,
      acao: 'ainda não precisa',
      diasRestantes: Math.round(diasRestantes),
    });
  }

  try {
    const { accessToken, expiresInSeconds } = await refreshLongLived(account.accessToken);
    await updateAccountToken(account.id, accessToken, expiresInSeconds);
    return Response.json({
      ok: true,
      acao: 'renovado',
      novosDias: Math.round(expiresInSeconds / 86400),
    });
  } catch (error) {
    // O detalhe do erro — que inclui a
    // resposta crua do Meta e o fbtrace_id — vai só para o log do servidor.
    console.error('[cron/refresh-token] falha ao renovar:', error);
    return Response.json(
      { ok: false, erro: 'Não foi possível renovar o token. Veja os logs do deploy.' },
      { status: 500 },
    );
  }
}
