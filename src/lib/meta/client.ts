/*
 * Dois endereços, porque a Meta tem duas portas para a mesma conta.
 *
 * `graph.instagram.com` atende a API do Instagram com login do Instagram, que
 * é como todo painel conectado até outubro de 2026 fala. Em setembro de 2026 a
 * Meta lançou o **login unificado** e parou de oferecer o login do Instagram
 * em app novo: quem cria um app hoje só enxerga a configuração nova, cuja API
 * mora em `graph.facebook.com`. A Meta mantém as duas, e nós também — uma
 * instalação que já funciona não tem por que ser mexida.
 *
 * O caminho e o corpo das chamadas são os mesmos nos dois; o que muda é o
 * endereço, o tipo de token e como se descobre a conta. Por isso o host é
 * parâmetro, e não constante.
 */
export const GRAPH_BASE = 'https://graph.instagram.com';
export const GRAPH_UNIFICADO = 'https://graph.facebook.com';
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

function buildUrl(path: string, query: Record<string, string>, host = GRAPH_BASE): string {
  const url = new URL(`${host}${path}`);
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
  host = GRAPH_BASE,
): Promise<unknown> {
  const response = await fetch(
    buildUrl(`/${GRAPH_VERSION}${path}`, { ...query, access_token: accessToken }, host),
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
  host = GRAPH_BASE,
): Promise<unknown> {
  return handle(await fetch(buildUrl(path, query, host)));
}
