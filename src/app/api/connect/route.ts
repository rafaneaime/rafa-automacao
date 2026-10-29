import { env } from '@/lib/env';
import { isLoggedIn } from '@/lib/auth';
import { resolveLongLivedToken } from '@/lib/meta/token';
import { hostDoDialeto, identificarConta } from '@/lib/meta/dialeto';
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
  let contaInformada: string | null = null;
  try {
    const corpo = (await request.json()) as { token?: string; contaId?: string };
    tokenDoCorpo = corpo.token;
    const id = typeof corpo.contaId === 'string' ? corpo.contaId.trim() : '';
    // Só dígitos: o campo é copiado da tela da Meta, e o que vem junto costuma
    // ser espaço ou quebra de linha, não outro id.
    contaInformada = /^\d{5,}$/.test(id) ? id : null;
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
    /*
     * 1. Descobre por qual porta da Meta este token fala, e de quem é a conta.
     *
     * O mesmo campo serve aos dois caminhos de propósito: quem instala não
     * precisa saber se o aplicativo dele caiu no login do Instagram ou no
     * unificado — e desde setembro de 2026 isso não é mais escolha de
     * ninguém, a Meta decide pela idade do aplicativo.
     */
    // O campo da tela ganha do ambiente: quem digitou agora quer o que digitou.
    const identificada = await identificarConta(token, contaInformada ?? env.igUserId() ?? null);

    /*
     * 2. No login do Instagram, garante um token de 60 dias: o colado pode ser
     *    de curta duração (Graph API Explorer) ou já longo (painel da Meta).
     *    No unificado não há troca nem renovação — o token do usuário do
     *    sistema não expira, e a própria tela da Meta diz isso.
     */
    const { accessToken, expiresInSeconds } =
      identificada.dialeto === 'instagram'
        ? await resolveLongLivedToken(token, env.igAppSecret())
        : { accessToken: token, expiresInSeconds: null };

    // 3. Confere a conta com o token definitivo, que pode não ser o colado.
    const { igUserId, username } =
      identificada.dialeto === 'instagram' ? await getProfile(accessToken) : identificada;

    // 4. Guarda no banco; daqui pra frente o token de trabalho vem daqui.
    await saveAccount(igUserId, username, accessToken, expiresInSeconds, identificada.dialeto);

    // 5. Assina os campos do webhook, no endereço do dialeto desta conta.
    await subscribeApp(igUserId, accessToken, hostDoDialeto(identificada.dialeto));

    return Response.json({
      ok: true,
      igUserId,
      username,
      conexao: identificada.dialeto === 'unificado' ? 'login unificado' : 'login do Instagram',
      expiraEm: expiresInSeconds === null ? 'não expira' : `${Math.round(expiresInSeconds / 86400)} dias`,
    });
  } catch (error) {
    return Response.json({ erro: String(error) }, { status: 400 });
  }
}
