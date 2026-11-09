/**
 * Quem consegue fazer o painel falar com a Meta.
 *
 * Conferir a inscrição foi de graça enquanto era leitura. Desde que o painel
 * passou a reassinar sozinho, o mesmo caminho virou um pedido à Meta — e aí
 * importa quem consegue disparar, e com que frequência.
 *
 * São dois caminhos, com donos diferentes:
 *
 * - A rotina diária roda sem CRON_SECRET de propósito (`src/lib/cron-auth.ts`
 *   conta por quê: exigir a variável matou a renovação do token em toda
 *   instalação feita pelo guia). Então a porta é aberta mesmo, e o que se
 *   limita é o estrago: a conferência vale algumas horas, e não uma por
 *   chamada.
 * - A tela de Logs é do dono do painel. O layout já confere a sessão, mas
 *   layout não é tranca — a doc desta versão do Next manda conferir junto do
 *   dado, e aqui o "dado" escreve na Meta.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { NextRequest } from 'next/server';

const {
  getFirstAccount,
  updateAccountToken,
  refreshLongLived,
  garantirInscricao,
  camposQueFaltam,
  assinaturaDoAplicativo,
  requirePanelSession,
  listDeliveries,
  listRecentEvents,
  recebimentoPorTipo,
  diagnosticarPessoa,
} = vi.hoisted(() => ({
  getFirstAccount: vi.fn(),
  updateAccountToken: vi.fn(),
  refreshLongLived: vi.fn(),
  garantirInscricao: vi.fn(),
  camposQueFaltam: vi.fn(),
  assinaturaDoAplicativo: vi.fn(),
  requirePanelSession: vi.fn(),
  listDeliveries: vi.fn(),
  listRecentEvents: vi.fn(),
  recebimentoPorTipo: vi.fn(),
  diagnosticarPessoa: vi.fn(),
}));

vi.mock('../src/lib/repo/accounts', () => ({ getFirstAccount, updateAccountToken }));
vi.mock('../src/lib/meta/token', () => ({ refreshLongLived }));
vi.mock('../src/lib/meta/subscribe', () => ({
  garantirInscricao,
  camposQueFaltam,
  assinaturaDoAplicativo,
}));
vi.mock('../src/lib/auth', () => ({ requirePanelSession }));
vi.mock('../src/lib/repo/deliveries', () => ({ listDeliveries }));
vi.mock('../src/lib/repo/webhook-events', () => ({ listRecentEvents, recebimentoPorTipo }));
vi.mock('../src/lib/repo/diagnostico', () => ({ diagnosticarPessoa }));

const CONTA = {
  id: 1,
  igUserId: '17841400000000000',
  accessToken: 'token-de-mentira',
  dialeto: 'unificado' as const,
  tokenExpiresAt: null,
  username: 'loja',
};

const EM_ORDEM = { estado: 'em-ordem' as const, campos: ['messages'], faltavam: [] };

const pedido = () =>
  new Request('https://exemplo.test/api/cron/refresh-token') as unknown as NextRequest;

/**
 * Módulo novo a cada vez: o teto de tempo mora numa variável do módulo, então
 * reaproveitar o import faria um teste contaminar o outro.
 */
async function rotaDiaria() {
  vi.resetModules();
  return (await import('../src/app/api/cron/refresh-token/route')).GET;
}

beforeEach(() => {
  vi.stubEnv('CRON_SECRET', '');
  getFirstAccount.mockReset().mockResolvedValue(CONTA);
  updateAccountToken.mockReset().mockResolvedValue(undefined);
  refreshLongLived.mockReset();
  garantirInscricao.mockReset().mockResolvedValue(EM_ORDEM);
  camposQueFaltam.mockReset().mockReturnValue([]);
  assinaturaDoAplicativo.mockReset().mockResolvedValue({ ok: false, motivo: 'sem-credencial' });
  requirePanelSession.mockReset().mockResolvedValue(undefined);
  listDeliveries.mockReset().mockResolvedValue([]);
  listRecentEvents.mockReset().mockResolvedValue([]);
  recebimentoPorTipo.mockReset().mockResolvedValue({ comentarios: 0, entrada: 0 });
  diagnosticarPessoa.mockReset().mockResolvedValue(null);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('a rotina diária com a porta aberta', () => {
  it('confere a inscrição na primeira chamada', async () => {
    const GET = await rotaDiaria();

    const corpo = await (await GET(pedido())).json();

    expect(garantirInscricao).toHaveBeenCalledTimes(1);
    expect(corpo.inscricao).toBe('em-ordem');
  });

  /*
   * O ponto do teto. Sem ele, cada chamada anônima custava duas perguntas e um
   * pedido à Meta, e estourar a cota da Meta derruba o painel por tabela.
   */
  it('não refaz a conferência a cada chamada', async () => {
    const GET = await rotaDiaria();

    await GET(pedido());
    await GET(pedido());
    await GET(pedido());

    expect(garantirInscricao).toHaveBeenCalledTimes(1);
  });

  it('diz que não conferiu agora, em vez de inventar que está em ordem', async () => {
    const GET = await rotaDiaria();

    await GET(pedido());
    const corpo = await (await GET(pedido())).json();

    expect(corpo.inscricao).toBe('conferida-ha-pouco');
  });

  /*
   * Rede fora e token vencido devolvem `sem-resposta`. Guardar isso como
   * conferência feita deixaria o painel horas sem conferir por causa de um
   * tropeço de um segundo — e quem está cortado continuaria cortado.
   */
  it('não guarda um tropeço como conferência', async () => {
    garantirInscricao.mockResolvedValue({ estado: 'sem-resposta', campos: [], faltavam: [] });
    const GET = await rotaDiaria();

    await GET(pedido());
    await GET(pedido());

    expect(garantirInscricao).toHaveBeenCalledTimes(2);
  });

  it('não fala com a Meta quando não há conta conectada', async () => {
    getFirstAccount.mockResolvedValue(null);
    const GET = await rotaDiaria();

    await GET(pedido());

    expect(garantirInscricao).not.toHaveBeenCalled();
  });
});

describe('a tela de Logs', () => {
  const abrir = async () => {
    const Pagina = (await import('../src/app/(painel)/logs/page')).default;
    return Pagina({ searchParams: Promise.resolve({}) }).then(renderToStaticMarkup);
  };

  /*
   * Enquanto a tela só lia, uma sessão vazada mostrava. Agora ela escreve na
   * Meta, e efeito não pode depender de quem renderizou primeiro: no App
   * Router o layout e a página renderizam juntos, e o layout nem re-renderiza
   * a cada navegação.
   */
  it('não fala com a Meta antes de conferir a sessão', async () => {
    requirePanelSession.mockRejectedValue(new Error('NEXT_REDIRECT'));

    await expect(abrir()).rejects.toThrow('NEXT_REDIRECT');
    expect(garantirInscricao).not.toHaveBeenCalled();
  });

  it('continua religando para quem é dono do painel', async () => {
    await abrir().catch(() => undefined);

    expect(garantirInscricao).toHaveBeenCalledTimes(1);
    expect(requirePanelSession.mock.invocationCallOrder[0]).toBeLessThan(
      garantirInscricao.mock.invocationCallOrder[0],
    );
  });
});
