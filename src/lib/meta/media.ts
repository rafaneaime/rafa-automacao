import { metaGet, GRAPH_VERSION } from './client';

export type Media = { id: string; caption: string | null; type: string | null };

export async function listMedia(igUserId: string, token: string): Promise<Media[]> {
  const raw = await metaGet(`/${GRAPH_VERSION}/${igUserId}/media`, {
    fields: 'id,caption,media_product_type',
    limit: '50',
    access_token: token,
  });

  const data = raw as {
    data?: { id: string; caption?: string; media_product_type?: string }[];
  };

  return (data.data ?? []).map((m) => ({
    id: m.id,
    caption: m.caption ?? null,
    type: m.media_product_type ?? null,
  }));
}
