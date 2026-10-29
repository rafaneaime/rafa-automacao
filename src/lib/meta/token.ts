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
/**
 * O que o valor colado parece ser, antes de perguntar à Meta.
 *
 * "Invalid OAuth access token - Cannot parse access token" é o erro que a Meta
 * devolve quando o texto não tem forma de token nenhum — e ela devolve o mesmo
 * para o App Secret colado no lugar do token, para o valor cortado no meio e
 * para a cópia que veio com quebra de linha. Quem instala lê isso duas vezes,
 * em inglês, e conclui que o token "venceu".
 *
 * Então a conferência acontece aqui, com o valor em mãos, onde dá para dizer o
 * que fazer. Nada disto é regra da Meta: é o que esses valores parecem na
 * prática, e por isso o aviso fala em "parece" e deixa seguir quando não tem
 * certeza.
 */
export function problemaNoFormato(token: string): string | null {
  const texto = token.trim();
  if (texto.length === 0) return 'o campo está vazio.';

  if (/\s/.test(texto)) {
    return 'o valor tem espaço ou quebra de linha no meio. Isso acontece quando a cópia vem de um PDF ou de uma mensagem — copie direto da tela da Meta, do começo ao fim.';
  }

  // O App Secret é um hexadecimal de 32 caracteres. Token do Instagram é bem
  // mais longo e começa com IGAA (ou EAA, no fluxo antigo pelo Facebook).
  if (/^[0-9a-f]{32}$/i.test(texto)) {
    return 'isso parece o App Secret, não o token de acesso. O secret é aquele campo curto ao lado do ID do app; o token é bem mais longo e sai do botão "Gerar token".';
  }

  if (/^\d{8,20}$/.test(texto)) {
    return 'isso parece o ID do app, não o token de acesso. O ID é só números; o token é bem mais longo e começa com letras.';
  }

  if (texto.length < 50) {
    return 'o valor é curto demais para um token de acesso. Confira se a cópia pegou o texto inteiro — ele costuma passar de cem caracteres.';
  }

  return null;
}

export async function resolveLongLivedToken(
  token: string,
  appSecret: string,
  deps: ResolveTokenDeps = defaultResolveDeps,
): Promise<TokenResult> {
  const formato = problemaNoFormato(token);
  if (formato) throw new Error(`O token não foi aceito: ${formato}`);

  try {
    return await deps.exchange(token, appSecret);
  } catch (exchangeError) {
    try {
      return await deps.refresh(token);
    } catch (refreshError) {
      const naoEhToken = [exchangeError, refreshError].every((e) =>
        /cannot parse access token/i.test(String(e)),
      );
      if (naoEhToken) {
        throw new Error(
          'A Meta não reconheceu esse valor como um token de acesso. ' +
            'Volte em Casos de uso → Personalizar e abra a configuração da API ' +
            'do seu aplicativo — "com login do Instagram" nos aplicativos ' +
            'antigos, "com login unificado" nos criados a partir de setembro ' +
            'de 2026, que é a única que a Meta oferece agora. Clique em ' +
            '"Gerar token" e copie o valor novo inteiro: ele passa de cem ' +
            'caracteres e começa com IGAA ou EAA, conforme a configuração. ' +
            'O App Secret e o ID do app, que ficam na mesma página, não servem aqui.',
        );
      }
      throw new Error(
        'Não foi possível obter um token de longa duração. ' +
          `Tentativa 1 (ig_exchange_token, para token de curta duração) falhou: ${exchangeError}. ` +
          `Tentativa 2 (ig_refresh_token, para token já de longa duração) falhou: ${refreshError}.`,
      );
    }
  }
}
