import { metaGet } from './client';

export type TokenResult = { accessToken: string; expiresInSeconds: number };

function readToken(raw: unknown): TokenResult {
  const data = raw as { access_token?: string; expires_in?: number };
  if (!data.access_token) {
    throw new Error(`Resposta de token sem access_token: ${JSON.stringify(raw)}`);
  }
  return {
    accessToken: data.access_token,
    expiresInSeconds: data.expires_in ?? 60 * 24 * 60 * 60,
  };
}

export async function exchangeForLongLived(
  shortToken: string,
  appSecret: string,
): Promise<TokenResult> {
  return readToken(
    await metaGet('/access_token', {
      grant_type: 'ig_exchange_token',
      client_secret: appSecret,
      access_token: shortToken,
    }),
  );
}

export async function refreshLongLived(token: string): Promise<TokenResult> {
  return readToken(
    await metaGet('/refresh_access_token', {
      grant_type: 'ig_refresh_token',
      access_token: token,
    }),
  );
}

export type ResolveTokenDeps = {
  exchange(token: string, appSecret: string): Promise<TokenResult>;
  refresh(token: string): Promise<TokenResult>;
};

const defaultResolveDeps: ResolveTokenDeps = {
  exchange: exchangeForLongLived,
  refresh: refreshLongLived,
};

/**
 * O painel "Configuração da API com login do Instagram" da Meta hoje gera
 * tokens que já nascem de longa duração (60 dias) — mas o fluxo antigo
 * (Graph API Explorer) ainda entrega tokens de curta duração (~1h) que
 * precisam passar por ig_exchange_token.
 *
 * Como não dá para saber de antemão qual dos dois o ambiente tem, tentamos
 * o câmbio primeiro (cobre o caso de curta duração) e, se ele falhar,
 * tentamos o refresh (cobre o caso de o token já ser de longa duração — que
 * é o caso comum hoje). Se os dois falharem, o token não presta mesmo, e o
 * erro final cita as duas tentativas para não confundir quem for debugar.
 */
export async function resolveLongLivedToken(
  token: string,
  appSecret: string,
  deps: ResolveTokenDeps = defaultResolveDeps,
): Promise<TokenResult> {
  try {
    return await deps.exchange(token, appSecret);
  } catch (exchangeError) {
    try {
      return await deps.refresh(token);
    } catch (refreshError) {
      throw new Error(
        'Não foi possível obter um token de longa duração. ' +
          `Tentativa 1 (ig_exchange_token, para token de curta duração) falhou: ${exchangeError}. ` +
          `Tentativa 2 (ig_refresh_token, para token já de longa duração) falhou: ${refreshError}.`,
      );
    }
  }
}
