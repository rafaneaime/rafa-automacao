import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

/*
 * Em qual das duas configurações da Meta esta instalação está, dito na tela.
 *
 * O painel grava o dialeto por conta desde que o login unificado apareceu, em
 * setembro de 2026, e nenhuma tela o mostrava. Em novembro de 2026 três
 * instalações de verdade ficaram dias em investigação, com perguntas indo e
 * voltando pelo atendimento, para descobrir uma coisa que já estava gravada no
 * banco de cada uma delas.
 *
 * A medida é o texto RENDERIZADO, e não o campo: o que faltou foi a frase na
 * tela de quem estava investigando.
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

/** Uma conta conectada e saudável; o que varia entre os casos é só o dialeto. */
function contaCom(dialeto: 'unificado' | 'instagram') {
  return {
    id: 1,
    igUserId: '17841400000000000',
    accessToken: 'token-de-mentira',
    dialeto,
    tokenExpiresAt: null,
    username: 'dela',
  };
}

beforeEach(() => {
  vi.stubEnv('IG_APP_ID', '1122334455');
  getFirstAccount.mockReset().mockResolvedValue(contaCom('unificado'));
  garantirInscricao.mockReset().mockResolvedValue({
    estado: 'em-ordem',
    campos: CAMPOS,
    faltavam: [],
    aplicativos: [{ appId: '1122334455', nome: 'O painel dela', campos: CAMPOS }],
  });
  camposQueFaltam.mockReset().mockReturnValue([]);
  assinaturaDoAplicativo.mockReset().mockResolvedValue({
    estado: 'ok',
    assinatura: { callbackUrl: 'https://painel-dela.vercel.app/api/webhook', ativa: true, campos: CAMPOS },
  });
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

describe('a tela de Logs diz em qual configuração da Meta a instalação está', () => {
  it('no login unificado, a tela nomeia o login unificado', async () => {
    getFirstAccount.mockResolvedValue(contaCom('unificado'));

    const html = await abrir();

    expect(html).toContain('login unificado');
  });

  it('no login do Instagram, a tela nomeia o login do Instagram', async () => {
    getFirstAccount.mockResolvedValue(contaCom('instagram'));

    const html = await abrir();

    expect(html).toContain('login do Instagram');
  });

  /*
   * As duas frases não podem sair juntas: a tela existe para separar os dois
   * casos, e dizer os dois é não dizer nenhum. Vale os dois sentidos, porque
   * "login unificado" não contém "login do Instagram" nem o contrário.
   */
  it('nomeia uma configuração só, nunca as duas', async () => {
    getFirstAccount.mockResolvedValue(contaCom('unificado'));
    expect(await abrir()).not.toContain('login do Instagram');

    getFirstAccount.mockResolvedValue(contaCom('instagram'));
    expect(await abrir()).not.toContain('login unificado');
  });

  /*
   * Sem conta conectada não há dialeto gravado, e inventar um aqui seria pior
   * que calar: a tela estaria afirmando a configuração de uma instalação que
   * ainda não escolheu nenhuma.
   */
  it('sem conta conectada, não afirma configuração nenhuma', async () => {
    getFirstAccount.mockResolvedValue(null);

    const html = await abrir();

    expect(html).not.toContain('login unificado');
    expect(html).not.toContain('login do Instagram');
  });
});
