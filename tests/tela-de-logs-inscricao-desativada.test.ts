import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

/*
 * Inscrição DESATIVADA com todos os campos no lugar: a tela tem de acusar, e
 * tem de calar quando a Meta não diz se ela está ligada.
 *
 * O valor chegava da Meta desde sempre, em `assinatura.ativa`, e nenhum lugar
 * do código o lia. Com ele desprezado, o último ramo desta seção escrevia "o
 * aplicativo está assinado em todos os avisos" para uma instalação que não
 * recebe nada. É a pior linha possível, porque encerra a investigação de quem
 * a lê: em 24 e 25/11/2026 esta tela foi usada como prova de que esta metade
 * estava boa, numa instalação de verdade.
 *
 * A medida é o texto RENDERIZADO, como no arquivo do aplicativo estranho: o que
 * faltou foi a frase na tela da pessoa, não um campo numa estrutura.
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

/** O endereço aparece na linha de tudo certo, e serve para reconhecê-la. */
const ENDERECO = 'https://painel-dela.vercel.app/api/webhook';

/** A frase que não pode sair quando a inscrição está desligada. */
const TUDO_CERTO = 'está assinado em todos os avisos';

/*
 * TODOS os campos assinados, dos dois lados. É esta a combinação que o defeito
 * precisa para aparecer: faltando campo, a tela já tinha o que dizer.
 */
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
  assinaturaDoAplicativo.mockReset();
  aplicativosEstranhos.mockReset().mockReturnValue([]);
  requirePanelSession.mockReset().mockResolvedValue(undefined);
  listDeliveries.mockReset().mockResolvedValue([]);
  listRecentEvents.mockReset().mockResolvedValue([]);
  recebimentoPorTipo.mockReset().mockResolvedValue({ comentarios: 0, entrada: 0 });
  diagnosticarPessoa.mockReset().mockResolvedValue(null);
});

afterEach(() => vi.unstubAllEnvs());

async function abrir(): Promise<string> {
  vi.resetModules();
  const Pagina = (await import('../src/app/(painel)/logs/page')).default;
  return renderToStaticMarkup(await Pagina({ searchParams: Promise.resolve({}) }));
}

describe('a inscrição do aplicativo desativada na Meta', () => {
  /*
   * O invariante, escrito como invariante e não como contagem de campos: com a
   * inscrição desligada, a linha de tudo certo não sai. Vale para qualquer
   * lista de campos que venha a existir.
   */
  it('com tudo assinado e a inscrição desligada, a linha de tudo certo não sai', async () => {
    assinaturaDoAplicativo.mockResolvedValue({
      estado: 'ok',
      assinatura: { callbackUrl: ENDERECO, ativa: false, campos: CAMPOS },
    });

    const html = await abrir();

    expect(html).not.toContain(TUDO_CERTO);
    expect(html).toContain('desativada');
  });

  /*
   * E não manda marcar campo: com a inscrição desligada, marcar campo no portal
   * não faz chegar nada, e seria mandar a pessoa trabalhar à toa.
   */
  it('não manda marcar campo nenhum no portal', async () => {
    assinaturaDoAplicativo.mockResolvedValue({
      estado: 'ok',
      assinatura: { callbackUrl: ENDERECO, ativa: false, campos: [] },
    });

    const html = await abrir();

    expect(html).toContain('desativada');
    expect(html).not.toContain('O aplicativo não está assinado em');
  });

  /*
   * O outro lado, que é o que impede este conserto de virar defeito novo:
   * quando a Meta NÃO diz se a inscrição está ligada, acusar mandaria a pessoa
   * consertar no portal uma instalação que está boa.
   */
  it('cala quando a Meta não disse se a inscrição está ligada', async () => {
    assinaturaDoAplicativo.mockResolvedValue({
      estado: 'ok',
      assinatura: { callbackUrl: ENDERECO, ativa: null, campos: CAMPOS },
    });

    const html = await abrir();

    expect(html).not.toContain('desativada');
    expect(html).toContain(TUDO_CERTO);
  });

  it('com a inscrição ligada e tudo assinado, a tela segue dizendo que está tudo certo', async () => {
    assinaturaDoAplicativo.mockResolvedValue({
      estado: 'ok',
      assinatura: { callbackUrl: ENDERECO, ativa: true, campos: CAMPOS },
    });

    const html = await abrir();

    expect(html).not.toContain('desativada');
    expect(html).toContain(TUDO_CERTO);
  });
});
