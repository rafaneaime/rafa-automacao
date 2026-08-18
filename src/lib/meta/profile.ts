import { metaGet, GRAPH_VERSION } from './client';

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
