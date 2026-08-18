import type { NextRequest } from 'next/server';
import { refreshLongLived } from '@/lib/meta/token';
import { getFirstAccount, updateAccountToken } from '@/lib/repo/accounts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DIAS_PARA_RENOVAR = 10;

export async function GET(request: NextRequest) {
  const segredo = process.env.CRON_SECRET;
  if (segredo && request.headers.get('authorization') !== `Bearer ${segredo}`) {
    return Response.json({ erro: 'Não autorizado.' }, { status: 401 });
  }

  const account = await getFirstAccount();
  if (!account) return Response.json({ ok: true, acao: 'nenhuma conta conectada' });

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
    // Sem CRON_SECRET esta rota é pública. O detalhe do erro — que inclui a
    // resposta crua do Meta e o fbtrace_id — vai só para o log do servidor.
    console.error('[cron/refresh-token] falha ao renovar:', error);
    return Response.json(
      { ok: false, erro: 'Não foi possível renovar o token. Veja os logs do deploy.' },
      { status: 500 },
    );
  }
}
