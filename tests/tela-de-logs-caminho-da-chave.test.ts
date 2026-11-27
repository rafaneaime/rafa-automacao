import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

/*
 * O caminho até a chave "Permitir acesso às mensagens", dito como a tela do
 * Instagram diz.
 *
 * Em 26/11/2026 o print de uma instalação de verdade mostrou que o caminho
 * escrito aqui estava errado em dois lugares: dizia "Mensagens e respostas DE
 * stories", e pulava "Pedidos de contato", que é onde "Ferramentas conectadas"
 * mora. Quem seguia aquilo chegava numa tela sem a chave.
 *
 * Esta guarda proíbe a forma errada e exige o passo que faltava. Ela não
 * congela a frase inteira de propósito: o texto pode ser reescrito, e um teste
 * que reprovasse qualquer reescrita ensinaria a mexer no teste. E ela mede o
 * HTML RENDERIZADO, não a fonte, porque o defeito era o que a pessoa lia.
 *
 * O que ela NÃO prova: que o caminho continua certo. A Meta muda as telas dela
 * quando quer, e nenhum teste nosso fica sabendo. Isso se confere abrindo o
 * Instagram.
 */

const {
  garantirInscricao,
  camposQueFaltam,
  assinaturaDoAplicativo,
  aplicativosEstranhos,
  getFirstAccount,
  requirePanelSession,
  listDeliveries,
  listRecentEvents,
  recebimentoPorTipo,
  diagnosticarPessoa,
} = vi.hoisted(() => ({
  garantirInscricao: vi.fn(),
  camposQueFaltam: vi.fn(),
  assinaturaDoAplicativo: vi.fn(),
  aplicativosEstranhos: vi.fn(),
  getFirstAccount: vi.fn(),
  requirePanelSession: vi.fn(),
  listDeliveries: vi.fn(),
  listRecentEvents: vi.fn(),
  recebimentoPorTipo: vi.fn(),
  diagnosticarPessoa: vi.fn(),
}));

vi.mock('../src/lib/meta/subscribe', () => ({
  garantirInscricao,
  camposQueFaltam,
  assinaturaDoAplicativo,
  aplicativosEstranhos,
}));
vi.mock('../src/lib/repo/accounts', () => ({ getFirstAccount, updateAccountToken: vi.fn() }));
vi.mock('../src/lib/auth', () => ({ requirePanelSession }));
vi.mock('../src/lib/repo/deliveries', () => ({ listDeliveries }));
vi.mock('../src/lib/repo/webhook-events', () => ({ listRecentEvents, recebimentoPorTipo }));
vi.mock('../src/lib/repo/diagnostico', () => ({ diagnosticarPessoa }));

const CAMPOS = ['comments', 'messages', 'messaging_postbacks', 'messaging_seen', 'live_comments'];

beforeEach(() => {
  vi.stubEnv('IG_APP_ID', '1122334455');
  getFirstAccount.mockReset().mockResolvedValue({
    id: 1,
    igUserId: '17841400000000000',
    accessToken: 'token-de-mentira',
    dialeto: 'unificado',
    tokenExpiresAt: null,
    username: 'dela',
  });
  garantirInscricao.mockReset().mockResolvedValue({
    estado: 'em-ordem',
    campos: CAMPOS,
    faltavam: [],
    aplicativos: [{ appId: '1122334455', nome: 'O painel dela', campos: CAMPOS }],
  });
  camposQueFaltam.mockReset().mockReturnValue([]);
  assinaturaDoAplicativo.mockReset().mockResolvedValue({
    estado: 'ok',
    assinatura: {
      callbackUrl: 'https://painel-dela.vercel.app/api/webhook',
      ativa: true,
      campos: CAMPOS,
    },
  });
  aplicativosEstranhos.mockReset().mockReturnValue([]);
  requirePanelSession.mockReset().mockResolvedValue(undefined);
  listDeliveries.mockReset().mockResolvedValue([]);
  listRecentEvents.mockReset().mockResolvedValue([]);
  diagnosticarPessoa.mockReset().mockResolvedValue(null);
  /*
   * Comentário entrando e mensagem nenhuma: é o caso que faz o aviso
   * aparecer. A forma é a que `recebimentoPorTipo` devolve de verdade, com os
   * quatro contadores: mock de um formato que não existe esconde o defeito que
   * o formato de verdade causaria.
   */
  recebimentoPorTipo
    .mockReset()
    .mockResolvedValue({ comentarios: 12, entrada: 0, cliques: 0, nossos: 0, desde: null });
});

afterEach(() => vi.unstubAllEnvs());

async function abrir(): Promise<string> {
  vi.resetModules();
  const Pagina = (await import('../src/app/(painel)/logs/page')).default;
  return renderToStaticMarkup(await Pagina({ searchParams: Promise.resolve({}) }));
}

describe('o caminho até a chave das mensagens', () => {
  it('nomeia o passo "Pedidos de contato", que é onde a chave mora', async () => {
    expect(await abrir()).toContain('Pedidos de contato');
  });

  /*
   * A forma errada, exatamente como estava escrita. Proibir esta e não a
   * família inteira: "stories" sozinho é legítimo e aparece em outras frases
   * da tela.
   */
  it('não manda a pessoa para "respostas de stories", que não é o nome da tela', async () => {
    expect(await abrir()).not.toContain('respostas de stories');
  });

  /*
   * O nome da primeira tela, que estava errado desde sempre.
   *
   * Em 27/11/2026 os prints das telas de verdade mostraram que ela se chama
   * "Configurações e atividade". "Configurações e privacidade" não existe no
   * aplicativo, e estava escrito aqui, no guia e na skill.
   */
  it('começa o caminho pela tela que existe', async () => {
    const html = await abrir();

    expect(html).toContain('Configurações e atividade');
    expect(html).not.toContain('Configurações e privacidade');
  });

  /*
   * "Ferramentas conectadas" é título de seção, não lista.
   *
   * Por algumas horas de 27/11/2026 esta tela mandou a pessoa conferir se o
   * aplicativo dela aparecia numa lista de ferramentas conectadas. Essa lista
   * não existe: embaixo daquele título há uma chave e nada mais. Mandar
   * procurar o que não existe é pior do que o texto que isso substituiu,
   * porque quem não acha conclui que o problema é ele.
   *
   * A guarda proíbe a forma errada e não a família inteira. Falar do título
   * da seção continua legítimo, e é por ele que a pessoa se localiza na tela.
   * E "lista" sozinho não pode ser proibido: esta mesma tela fala, com razão,
   * da lista de avisos que a conta assinou, que é outra coisa e é verdadeira.
   */
  it('não manda procurar o aplicativo numa lista que não existe', async () => {
    const html = await abrir();

    expect(html).toContain('Ferramentas conectadas');
    expect(html).not.toMatch(/aplicativo[^.]{0,60}(aparecer|estar) n[a-z]* lista/i);
  });

  /*
   * Com a chave ligada o aviso perde a função se parar na chave, e inventar a
   * causa seguinte é pior ainda: nenhuma foi medida. Dizer até onde sabe é o
   * que resta, e é honesto.
   */
  it('diz o que fazer quando a chave já estiver ligada', async () => {
    expect(await abrir()).toContain('já estiver ligada');
  });

  /*
   * A frase antiga dizia "Nos últimos 30 dias" porque a consulta tem janela de
   * 30 dias, não porque alguém observou 30 dias. Numa instalação de hoje de
   * manhã isso é afirmar um mês que não existiu, e foi o que mandou a
   * investigação de 26/11/2026 atrás de uma chave que estava certa.
   */
  it('em painel de poucas horas, diz as horas e não afirma 30 dias', async () => {
    recebimentoPorTipo.mockResolvedValue({
      comentarios: 12,
      entrada: 0,
      desde: new Date(Date.now() - 4 * 3_600_000),
    });

    const html = await abrir();

    expect(html).toContain('ltimas 4 horas');
    expect(html).not.toContain('30 dias');
  });

  /*
   * Guarda do contrário: sem o recorte (mensagem entrando normalmente) o aviso
   * não sai, e a tela não manda ninguém mexer em chave nenhuma.
   */
  it('com mensagem entrando, não fala da chave', async () => {
    recebimentoPorTipo.mockResolvedValue({ comentarios: 12, entrada: 7, cliques: 0 });

    const html = await abrir();

    expect(html).not.toContain('Pedidos de contato');
    expect(html).not.toContain('Permitir acesso');
  });

  /*
   * Clique chegando e escrito não: o terceiro estado, e o mais delicado.
   *
   * Clique em botão chega em `postback`, sem campo de texto, e a automação que
   * a própria tela recomenda convida a pessoa a tocar em vez de digitar. Numa
   * instalação assim, "ninguém escreveu" e "o escrito não chega" produzem
   * exatamente a mesma contagem: o painel NÃO tem como separar os dois.
   *
   * Por isso esta tela não pode acusar aqui, e também não pode calar. Calar
   * foi o defeito publicado em 26/11/2026: clique cancelava o aviso inteiro, e
   * em 27/11 uma instalação com o defeito de verdade estava muda por causa
   * disso. O certo é contar o que viu e entregar o teste que separa.
   */
  it('com clique entrando, conta o clique e não afirma que nada chega', async () => {
    recebimentoPorTipo.mockResolvedValue({
      comentarios: 12,
      entrada: 0,
      cliques: 5,
      nossos: 30,
    });

    const html = await abrir();

    expect(html).toContain('Chega clique em botão');
    // A acusação do outro estado não pode vazar para este.
    expect(html).not.toContain('nada vindo de ninguém');
  });

  it('com clique entrando, entrega o teste que separa os dois casos', async () => {
    recebimentoPorTipo.mockResolvedValue({
      comentarios: 12,
      entrada: 0,
      cliques: 5,
      nossos: 30,
    });

    const html = await abrir();

    expect(html).toContain('DM escrita agora');
    expect(html).toContain('Configurações e atividade');
  });

  /*
   * Eco e confirmação de leitura chegam pelo mesmo canal da mensagem recebida.
   * Se eles chegam e nada das pessoas chega, o canal está vivo e o que falta é
   * autorização. Dizer isso muda o diagnóstico, então a tela precisa dizer.
   */
  it('quando só o eco chega, diz que o canal está vivo', async () => {
    recebimentoPorTipo.mockResolvedValue({
      comentarios: 12,
      entrada: 0,
      cliques: 0,
      nossos: 42,
    });

    const html = await abrir();

    expect(html).toContain('canal está vivo');
  });

  it('quando nem o eco chega, não afirma que o canal está vivo', async () => {
    recebimentoPorTipo.mockResolvedValue({
      comentarios: 12,
      entrada: 0,
      cliques: 0,
      nossos: 0,
    });

    const html = await abrir();

    expect(html).not.toContain('canal está vivo');
    expect(html).toContain('Nem o eco');
  });
});
