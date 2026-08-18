import { env } from '@/lib/env';
import { isLoggedIn } from '@/lib/auth';
import { resolveLongLivedToken } from '@/lib/meta/token';
import { getProfile } from '@/lib/meta/profile';
import { subscribeApp } from '@/lib/meta/subscribe';
import { saveAccount } from '@/lib/repo/accounts';
import { escolherToken } from '@/lib/token-source';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  if (!(await isLoggedIn())) {
    return Response.json({ erro: 'Não autenticado.' }, { status: 401 });
  }

  let tokenDoCorpo: string | undefined;
  try {
    const corpo = (await request.json()) as { token?: string };
    tokenDoCorpo = corpo.token;
  } catch {
    // Corpo vazio ou inválido é aceitável: cai para a variável de ambiente.
  }

  const token = escolherToken(tokenDoCorpo, env.accessToken());
  if (!token) {
    return Response.json(
      {
        erro:
          'Nenhum token informado. Cole o token da página Configuração da API ' +
          'com login do Instagram (Casos de uso → Personalizar) no campo acima.',
      },
      { status: 400 },
    );
  }

  try {
    // 1. Garante um token de longa duração (60 dias). O token pode vir de
    // dois fluxos diferentes: curta duração (Graph API Explorer, ainda
    // precisa de ig_exchange_token) ou já de longa duração (painel "Configuração
    // da API com login do Instagram" da Meta). resolveLongLivedToken tenta os
    // dois caminhos.
    const { accessToken, expiresInSeconds } = await resolveLongLivedToken(
      token,
      env.igAppSecret(),
    );

    // 2. Descobre de quem é a conta.
    const { igUserId, username } = await getProfile(accessToken);

    // 3. Guarda no banco; daqui pra frente o token de trabalho vem daqui.
    await saveAccount(igUserId, username, accessToken, expiresInSeconds);

    // 4. Assina os campos do webhook.
    await subscribeApp(igUserId, accessToken);

    return Response.json({
      ok: true,
      igUserId,
      username,
      expiraEm: `${Math.round(expiresInSeconds / 86400)} dias`,
    });
  } catch (error) {
    return Response.json({ erro: String(error) }, { status: 400 });
  }
}
