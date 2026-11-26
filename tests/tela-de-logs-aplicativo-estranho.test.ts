import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

/*
 * A tela de Logs tem de ACUSAR que os avisos da conta vão para outro
 * aplicativo, e tem de ficar calada quando não sabe de quem são.
 *
 * O arquivo é separado do que prova a função pura de propósito: aqui os módulos
 * são dublês, e a função pura não pode ser medida contra o próprio dublê.
 *
 * A medida é o texto RENDERIZADO, e não o que a função devolve: foi o texto que
 * faltou numa instalação por quatorze dias, com as duas metades do diagnóstico
 * respondendo certo sobre dois aplicativos diferentes.
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

const OUTRO = { appId: '999', nome: 'Radar antigo', campos: ['comments'] };

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
    campos: ['comments', 'messages'],
    faltavam: [],
    aplicativos: [OUTRO],
  });
  camposQueFaltam.mockReset().mockReturnValue([]);
  assinaturaDoAplicativo.mockReset().mockResolvedValue({ estado: 'sem-credencial' });
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

describe('os avisos indo para outro aplicativo', () => {
  it('a tela acusa, e nomeia quem recebe e qual é o deste painel', async () => {
    aplicativosEstranhos.mockReturnValue([OUTRO]);

    const html = await abrir();

    expect(html).toContain('vão para outro aplicativo');
    expect(html).toContain('Radar antigo');
    expect(html).toContain('1122334455');
  });

  it('pergunta de quem são os avisos com a identificação deste painel', async () => {
    await abrir();

    expect(aplicativosEstranhos).toHaveBeenCalledWith([OUTRO], '1122334455');
  });

  /*
   * O caso em que a Meta não disse de quem são os avisos, ou falta a
   * identificação no ambiente. Acusar aí manda religar uma conta que já está no
   * aplicativo certo.
   */
  it('fica calada quando não há aplicativo estranho a nomear', async () => {
    aplicativosEstranhos.mockReturnValue([]);

    const html = await abrir();

    expect(html).not.toContain('vão para outro aplicativo');
  });

  it('não acusa quando não deu para perguntar ao Instagram', async () => {
    garantirInscricao.mockResolvedValue({
      estado: 'sem-resposta',
      campos: [],
      faltavam: [],
      aplicativos: [],
    });
    aplicativosEstranhos.mockReturnValue([OUTRO]);

    const html = await abrir();

    expect(html).not.toContain('vão para outro aplicativo');
    expect(aplicativosEstranhos).not.toHaveBeenCalled();
  });
});
