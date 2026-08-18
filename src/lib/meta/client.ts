export const GRAPH_BASE = 'https://graph.instagram.com';
export const GRAPH_VERSION = 'v23.0';

export class MetaApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: string,
  ) {
    super(message);
    this.name = 'MetaApiError';
  }
}

function buildUrl(path: string, query: Record<string, string>): string {
  const url = new URL(`${GRAPH_BASE}${path}`);
  for (const [key, value] of Object.entries(query)) {
    url.searchParams.set(key, value);
  }
  return url.toString();
}

async function handle(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!response.ok) {
    throw new MetaApiError(
      `Meta respondeu ${response.status}: ${text}`,
      response.status,
      text,
    );
  }
  return text ? JSON.parse(text) : {};
}

export async function metaPost(
  path: string,
  accessToken: string,
  body: unknown,
  query: Record<string, string> = {},
): Promise<unknown> {
  const response = await fetch(
    buildUrl(`/${GRAPH_VERSION}${path}`, { ...query, access_token: accessToken }),
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    },
  );
  return handle(response);
}

export async function metaGet(
  path: string,
  query: Record<string, string>,
): Promise<unknown> {
  return handle(await fetch(buildUrl(path, query)));
}
