import { metaGet, GRAPH_BASE, GRAPH_VERSION } from './client';

export type Media = { id: string; caption: string | null; type: string | null };

/*
 * O `host` existe aqui pelo mesmo motivo dos envios: a conta pode falar pelo
 * login do Instagram ou pelo unificado. Este módulo ficou de fora quando os
 * outros ganharam o parâmetro, em 29/10/2026, e o sintoma foi exato — numa
 * instalação nova a tela da automação dizia que não achava as postagens,
 * porque perguntava no endereço antigo com um token que só o novo entende.
 */
export async function listMedia(igUserId: string, token: string, host = GRAPH_BASE): Promise<Media[]> {
  const raw = await metaGet(`/${GRAPH_VERSION}/${igUserId}/media`, {
    fields: 'id,caption,media_product_type',
    limit: '50',
    access_token: token,
  }, host);

  const data = raw as {
    data?: { id: string; caption?: string; media_product_type?: string }[];
  };

  return (data.data ?? []).map((m) => ({
    id: m.id,
    caption: m.caption ?? null,
    type: m.media_product_type ?? null,
  }));
}
