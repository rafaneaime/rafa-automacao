import { GRAPH_BASE, GRAPH_UNIFICADO, GRAPH_VERSION, MetaApiError, metaGet, metaPost } from './client';

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
export type AplicativoInscrito = {
  /** A identificação do aplicativo, quando a Meta a manda. */
  appId: string | null;
  nome: string | null;
  campos: string[];
};

/**
 * QUAIS aplicativos recebem os avisos desta conta, e não só quais avisos.
 *
 * A diferença custou quatorze dias numa instalação em novembro de 2026. A
 * resposta da Meta é uma lista de aplicativos, e a gente somava os campos de
 * todos eles sem olhar de quem eram. Com isso, "não falta aviso nenhum" era a
 * resposta tanto para a conta inscrita no aplicativo DESTE painel quanto para a
 * conta inscrita em OUTRO aplicativo da pessoa — e no segundo caso a Meta
 * entrega os avisos no endereço do outro, a tela de Eventos recebidos fica
 * vazia para sempre, e nada em tela nenhuma diz isso.
 *
 * Acontece de verdade: quem passa dias tentando acaba com mais de um
 * aplicativo, e o token colado no painel pode ter saído de um enquanto a
 * identificação e a chave secreta saíram de outro. Aí as duas metades do
 * diagnóstico respondem certo, cada uma sobre um aplicativo diferente.
 *
 * `appId` vem `null` quando a Meta responde sem a identificação. Nesse caso
 * ninguém afirma nada: a soma dos campos continua valendo, e a tela não acusa
 * aplicativo estranho com base em ausência de dado.
 */
export async function aplicativosInscritos(
  accountIgId: string,
  token: string,
  host = GRAPH_BASE,
): Promise<AplicativoInscrito[]> {
  const caminho = `/${GRAPH_VERSION}/${accountIgId}/subscribed_apps`;
  /*
   * Pede a identificação junto. Se esta versão da Meta não aceitar o campo, a
   * pergunta antiga é refeita: diagnóstico novo não pode cegar o que já
   * funciona.
   */
  let bruto: unknown;
  try {
    bruto = await metaGet(caminho, { fields: 'id,name,subscribed_fields', access_token: token }, host);
  } catch (erro) {
    /*
     * Refaz só quando a Meta RECUSOU o pedido (400), que é como ela responde a
     * campo que não conhece. Rede fora e token vencido não ganham segunda
     * tentativa: seria dobrar o custo de toda falha para cobrir um caso que não
     * é esse.
     */
    if (!(erro instanceof MetaApiError) || erro.status !== 400) throw erro;
    bruto = await metaGet(caminho, { fields: 'subscribed_fields', access_token: token }, host);
  }

  const dados = (bruto as { data?: unknown })?.data;
  if (!Array.isArray(dados)) return [];
  return dados.map((item) => {
    const app = item as { id?: unknown; name?: unknown; subscribed_fields?: unknown };
    const campos = Array.isArray(app.subscribed_fields)
      ? app.subscribed_fields.filter((c): c is string => typeof c === 'string')
      : [];
    return {
      appId: typeof app.id === 'string' && app.id.trim() !== '' ? app.id : null,
      nome: typeof app.name === 'string' && app.name.trim() !== '' ? app.name : null,
      campos,
    };
  });
}

/**
 * Os aplicativos que recebem os avisos desta conta e NÃO são o deste painel.
 *
 * Vazio é a resposta boa, e é também a resposta quando não se sabe: sem a
 * identificação do nosso aplicativo no ambiente, ou sem a identificação na
 * resposta da Meta, ninguém acusa ninguém.
 */
export function aplicativosEstranhos(
  inscritos: readonly AplicativoInscrito[],
  nosso: string,
): AplicativoInscrito[] {
  const nossoId = nosso.trim();
  if (nossoId === '') return [];
  const identificados = inscritos.filter((app) => app.appId !== null);
  if (identificados.length === 0) return [];
  if (identificados.some((app) => app.appId === nossoId)) return [];
  return identificados;
}

export async function camposInscritos(
  accountIgId: string,
  token: string,
  host = GRAPH_BASE,
): Promise<string[]> {
  const apps = await aplicativosInscritos(accountIgId, token, host);
  return [...new Set(apps.flatMap((app) => app.campos))];
}

/** Os campos pedidos que não voltaram. Vazio é a resposta boa. */
export function camposQueFaltam(inscritos: readonly string[]): string[] {
  return WEBHOOK_FIELDS.split(',').filter((campo) => !inscritos.includes(campo));
}

export type Reinscricao = {
  estado: 'em-ordem' | 'reassinada' | 'nao-resolveu' | 'sem-resposta';
  /** O que o Instagram está mandando agora. Vazio quando não deu para perguntar. */
  campos: string[];
  /** O que faltava quando a conferência começou. É isto que diz que houve corte. */
  faltavam: string[];
  /**
   * Para QUEM a conta manda esses avisos. Vem junto porque a resposta da Meta
   * já traz isso, e quem lê esta conferência é exatamente quem precisa saber
   * que os avisos podem estar indo para outro aplicativo.
   */
  aplicativos: AplicativoInscrito[];
};

/**
 * Confere a inscrição e, se estiver faltando campo, assina de novo.
 *
 * A Meta cancela a inscrição de quem demora a responder: uma hora de entregas
 * falhando e o aplicativo sai da conta do aluno. Não aparece erro em tela
 * nenhuma — o painel simplesmente para de receber, e quem conectou acha que
 * desinstalou alguma coisa. Era o que acontecia em live e em story com muita
 * resposta, enquanto o painel levava de 4 a 7 segundos para confirmar cada
 * mensagem.
 *
 * A causa foi corrigida em 06/11/2026: a confirmação sai antes do trabalho.
 * Mas corrigir a causa não desfaz o corte de quem já foi cortado, e a
 * inscrição só era pedida num lugar — no momento de conectar a conta. Ou seja:
 * quem foi cortado ficava fora até alguém mandar reconectar à mão, sem ter
 * como saber que era isso. Agora o painel confere e remenda sozinho.
 *
 * Assinar de novo é inofensivo: a Meta aceita o mesmo pedido quantas vezes
 * vier e o resultado é o mesmo. Por isso a conferência pode rodar todo dia e
 * sempre que alguém abre a tela de Logs.
 *
 * `nao-resolveu` é a resposta que não se conserta daqui: pedimos, a Meta
 * aceitou, e o campo continua fora. Isso é o **aplicativo** sem o campo
 * marcado no portal, e aí a inscrição da conta não tem como suprir —
 * `assinaturaDoAplicativo` é quem conta essa metade. Repetir o pedido nesse
 * caso é um gasto pequeno e deliberado, para não precisar guardar estado.
 *
 * Nunca lança: é remendo, e remendo que derruba a tela onde se vai quando algo
 * já está errado é pior do que remendo nenhum.
 */
export async function garantirInscricao(
  accountIgId: string,
  token: string,
  host = GRAPH_BASE,
): Promise<Reinscricao> {
  let aplicativos: AplicativoInscrito[];
  try {
    aplicativos = await aplicativosInscritos(accountIgId, token, host);
  } catch {
    return { estado: 'sem-resposta', campos: [], faltavam: [], aplicativos: [] };
  }
  const campos = [...new Set(aplicativos.flatMap((app) => app.campos))];

  const faltavam = camposQueFaltam(campos);
  if (faltavam.length === 0) return { estado: 'em-ordem', campos, faltavam: [], aplicativos };

  try {
    await subscribeApp(accountIgId, token, host);
    const depois = await aplicativosInscritos(accountIgId, token, host);
    const agora = [...new Set(depois.flatMap((app) => app.campos))];
    return {
      estado: camposQueFaltam(agora).length === 0 ? 'reassinada' : 'nao-resolveu',
      campos: agora,
      faltavam,
      aplicativos: depois,
    };
  } catch {
    return { estado: 'nao-resolveu', campos, faltavam, aplicativos };
  }
}

export type AssinaturaDoAplicativo = {
  callbackUrl: string | null;
  /**
   * Se a Meta diz que a inscrição está LIGADA. `null` é "ela não disse".
   *
   * Eram dois valores, e `instagram.active === true` jogava o "não disse" no
   * mesmo balde do "está desligada". Quem lê isto escreve na tela da pessoa
   * que a inscrição dela está desativada — e dizer isso para uma instalação
   * que está boa, porque a Meta mudou o formato da resposta ou deixou o campo
   * de fora, manda a pessoa mexer no portal para consertar o que não está
   * quebrado. Ausência não é negação, e por isso ela tem valor próprio.
   */
  ativa: boolean | null;
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
/**
 * Por que a leitura nao deu, quando nao da.
 *
 * Antes isto era `null` para tudo, e a tela mandava a pessoa conferir os
 * campos marcados no portal da Meta. So que `null` significava tres coisas
 * diferentes, e duas delas nao tem nada a ver com o portal:
 *
 * - `sem-credencial`: o par nao esta no ambiente. Nada foi perguntado.
 * - `nao-perguntei`: a Meta recusou o pedido. O caso que a gente achou em
 *   16/11/2026 e o par **misturado** -- identificacao de uma tela do app e
 *   chave secreta de outra. O painel usa as duas juntas como token do
 *   aplicativo (`id|segredo`), e a Meta recusa o conjunto. Mandar essa pessoa
 *   marcar campo no portal e manda-la consertar o que nao esta quebrado.
 * - `sem-inscricao`: perguntei, a Meta respondeu, e o aplicativo nao tem
 *   inscricao do Instagram. Este sim e portal.
 */
export type LeituraDaAssinatura =
  | { estado: 'ok'; assinatura: AssinaturaDoAplicativo }
  | { estado: 'sem-credencial' }
  | { estado: 'nao-perguntei' }
  | { estado: 'sem-inscricao' };

export async function assinaturaDoAplicativo(
  appId: string,
  appSecret: string,
): Promise<LeituraDaAssinatura> {
  if (appId.trim() === '' || appSecret.trim() === '') return { estado: 'sem-credencial' };

  let bruto: unknown;
  try {
    bruto = await metaGet(
      `/${GRAPH_VERSION}/${appId}/subscriptions`,
      { access_token: `${appId}|${appSecret}` },
      GRAPH_UNIFICADO,
    );
  } catch {
    // A excecao pode carregar a requisicao, e a requisicao carrega o segredo.
    return { estado: 'nao-perguntei' };
  }

  const dados = (bruto as { data?: unknown })?.data;
  if (!Array.isArray(dados)) return { estado: 'nao-perguntei' };
  const instagram = dados.find(
    (item) => (item as { object?: unknown })?.object === 'instagram',
  ) as { callback_url?: unknown; active?: unknown; fields?: unknown } | undefined;
  if (!instagram) return { estado: 'sem-inscricao' };
  const campos = Array.isArray(instagram.fields)
    ? instagram.fields.flatMap((campo) => {
        const nome = (campo as { name?: unknown })?.name;
        return typeof nome === 'string' ? [nome] : [];
      })
    : [];
  return {
    estado: 'ok',
    assinatura: {
      callbackUrl: typeof instagram.callback_url === 'string' ? instagram.callback_url : null,
      ativa: typeof instagram.active === 'boolean' ? instagram.active : null,
      campos,
    },
  };
}
