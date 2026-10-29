import { metaGet, GRAPH_BASE, GRAPH_VERSION } from './client';

/**
 * Quem é a pessoa do outro lado de uma mensagem direta.
 *
 * O webhook de comentário traz o `@` de quem comentou; o de mensagem **não
 * traz nada além do id**. Enquanto só comentário criava contato, isso não
 * aparecia. Com a resposta de Story — que chega como mensagem —, o painel
 * passou a listar números de 16 dígitos onde deveria estar o `@`.
 *
 * A Meta devolve os dois campos para quem conversou com a conta. Conferido em
 * 18/09/2026 contra contatos reais: `name` e `username` vêm preenchidos.
 *
 * Melhor esforço: qualquer falha aqui devolve tudo nulo. É enfeite de tela —
 * nunca pode segurar ou derrubar uma entrega.
 */
export async function getPerfilDaConversa(
  igUserId: string,
  token: string,
  host = GRAPH_BASE,
): Promise<{ username: string | null; nome: string | null }> {
  try {
    const raw = await metaGet(`/${GRAPH_VERSION}/${igUserId}`, {
      fields: 'name,username',
      access_token: token,
    }, host);
    const dados = raw as { username?: unknown; name?: unknown };
    const texto = (valor: unknown) =>
      typeof valor === 'string' && valor.trim() !== '' ? valor.trim().slice(0, 120) : null;
    return { username: texto(dados.username), nome: texto(dados.name) };
  } catch {
    return { username: null, nome: null };
  }
}

export async function getProfile(
  token: string,
): Promise<{ igUserId: string; username: string | null }> {
  const raw = await metaGet(`/${GRAPH_VERSION}/me`, {
    fields: 'user_id,username',
    access_token: token,
  });

  const data = raw as { user_id?: string; id?: string; username?: string };
  const igUserId = data.user_id ?? data.id;

  if (!igUserId) {
    throw new Error(
      `Não consegui ler o ID da conta. Resposta do Meta: ${JSON.stringify(raw)}. ` +
        'Confira se a conta é Business ou Creator e se o token tem o escopo instagram_business_basic.',
    );
  }

  return { igUserId: String(igUserId), username: data.username ?? null };
}

/**
 * A pessoa já segue a conta?
 *
 * `true`, `false`, ou `null` quando não dá para saber — e o `null` é a parte
 * importante. Conferido em 06/10/2026 contra 12 contatos reais, e o padrão não
 * tem nada a ver com data: a Meta responde para quem **escreveu** para a conta
 * (DM ou resposta de Story), e recusa com "User consent is required to access
 * user profile" para quem apenas comentou, mesmo tendo recebido DM nossa.
 *
 * Ou seja: dá para checar antes de responder uma DM ou um Story. Não dá para
 * checar na hora em que alguém comenta, porque nesse momento a pessoa ainda não
 * falou com a conta. Fingir que dá, e segurar o link de quem comentou, seria
 * punir a pessoa por um limite que é nosso.
 *
 * Por isso `null` nunca significa "não segue". Quem consome manda a mensagem
 * normal — na dúvida, a pessoa recebe o que pediu.
 */
export async function segueAConta(
  igUserId: string,
  token: string,
  host = GRAPH_BASE,
): Promise<boolean | null> {
  try {
    const raw = await metaGet(`/${GRAPH_VERSION}/${igUserId}`, {
      fields: 'is_user_follow_business',
      access_token: token,
    }, host);
    const valor = (raw as { is_user_follow_business?: unknown }).is_user_follow_business;
    return typeof valor === 'boolean' ? valor : null;
  } catch {
    return null;
  }
}
