import { GRAPH_BASE, GRAPH_UNIFICADO, GRAPH_VERSION, metaGet, metaPost } from './client';

/*
 * `live_comments` entrou em 06/10/2026: comentário em transmissão ao vivo chega
 * no mesmo formato do comentário em post, e a automação de comentário já sabe
 * tratá-lo. Conferido contra a conta de produção — a Meta aceitou o campo e
 * passou a listá-lo entre os inscritos.
 *
 * Quem conectou antes disso continua sem ele até reconectar: a inscrição é
 * feita uma vez, na conexão. A tela de Logs diz quais avisos estão valendo.
 */
export const WEBHOOK_FIELDS = 'messages,messaging_postbacks,comments,messaging_seen,live_comments';

export function subscribeApp(accountIgId: string, token: string, host = GRAPH_BASE): Promise<unknown> {
  return metaPost(`/${accountIgId}/subscribed_apps`, token, {}, {
    subscribed_fields: WEBHOOK_FIELDS,
  }, host);
}

/**
 * Quais campos o Instagram está realmente mandando para esta instalação.
 *
 * A conexão pede `WEBHOOK_FIELDS` inteiro, mas o que vale é o que a Meta
 * aceitou: um campo que o aplicativo não tem marcado no portal simplesmente
 * não entra, e ninguém avisa. O resultado é um painel que recebe reação e
 * confirmação de leitura, não recebe comentário nenhum, e não tem como dizer
 * a diferença entre "ninguém comentou" e "comentário não chega aqui".
 *
 * Em outubro de 2026 essa diferença custou dias numa instalação. A resposta
 * estava a uma pergunta de distância — esta.
 */
export async function camposInscritos(
  accountIgId: string,
  token: string,
  host = GRAPH_BASE,
): Promise<string[]> {
  const bruto = await metaGet(`/${GRAPH_VERSION}/${accountIgId}/subscribed_apps`, {
    fields: 'subscribed_fields',
    access_token: token,
  }, host);
  const dados = (bruto as { data?: unknown })?.data;
  if (!Array.isArray(dados)) return [];
  return [
    ...new Set(
      dados.flatMap((app) => {
        const campos = (app as { subscribed_fields?: unknown })?.subscribed_fields;
        return Array.isArray(campos) ? campos.filter((c): c is string => typeof c === 'string') : [];
      }),
    ),
  ];
}

/** Os campos pedidos que não voltaram. Vazio é a resposta boa. */
export function camposQueFaltam(inscritos: readonly string[]): string[] {
  return WEBHOOK_FIELDS.split(',').filter((campo) => !inscritos.includes(campo));
}

export type AssinaturaDoAplicativo = {
  callbackUrl: string | null;
  ativa: boolean;
  campos: string[];
};

/**
 * O que o **aplicativo** está assinado para receber.
 *
 * Isto é outra coisa do que `camposInscritos`, e a diferença custou uma tarde
 * em 29/10/2026. A conta pode estar inscrita em tudo — a tela da Meta liga
 * essa chave sozinha — e, se o aplicativo não tiver nenhum campo marcado, a
 * Meta aceita a configuração, verifica o endereço, responde 200 ao desafio e
 * **não entrega evento nenhum**. Nenhuma tela dizia isso.
 *
 * Na configuração antiga os campos já vinham marcados; na de login unificado
 * nascem todos desmarcados, então isso deixou de ser caso raro e virou o
 * estado inicial de toda instalação nova.
 *
 * Pergunta-se com o token do aplicativo — o id e o segredo juntos —, que não
 * fala pela conta de ninguém e não depende de quem conectou. Sempre em
 * `graph.facebook.com`: a assinatura é do aplicativo, não da conta, e mora lá
 * nos dois dialetos.
 */
export async function assinaturaDoAplicativo(
  appId: string,
  appSecret: string,
): Promise<AssinaturaDoAplicativo | null> {
  const bruto = await metaGet(
    `/${GRAPH_VERSION}/${appId}/subscriptions`,
    { access_token: `${appId}|${appSecret}` },
    GRAPH_UNIFICADO,
  );
  const dados = (bruto as { data?: unknown })?.data;
  if (!Array.isArray(dados)) return null;
  const instagram = dados.find(
    (item) => (item as { object?: unknown })?.object === 'instagram',
  ) as { callback_url?: unknown; active?: unknown; fields?: unknown } | undefined;
  if (!instagram) return null;
  const campos = Array.isArray(instagram.fields)
    ? instagram.fields.flatMap((campo) => {
        const nome = (campo as { name?: unknown })?.name;
        return typeof nome === 'string' ? [nome] : [];
      })
    : [];
  return {
    callbackUrl: typeof instagram.callback_url === 'string' ? instagram.callback_url : null,
    ativa: instagram.active === true,
    campos,
  };
}
