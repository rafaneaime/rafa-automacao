import { metaGet, GRAPH_VERSION } from './client';

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
): Promise<{ username: string | null; nome: string | null }> {
  try {
    const raw = await metaGet(`/${GRAPH_VERSION}/${igUserId}`, {
      fields: 'name,username',
      access_token: token,
    });
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
