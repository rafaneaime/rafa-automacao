import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

/*
 * A tela de Logs tem de DIZER de qual conta era o aviso que ela recusou — e tem
 * de calar quando o aviso não diz.
 *
 * A medida é o texto RENDERIZADO, com os dois identificadores dentro. Foi o que
 * faltou em 24/11/2026: a linha dizia "ignorado: conta não conectada", a dona
 * do painel leu, e dali não saía conclusão nenhuma — nem para ela, nem para
 * quem estava investigando de fora.
 *
 * Arquivo separado do que prova a função pura de propósito: aqui os módulos são
 * dublês, e função pura não se mede contra o próprio dublê.
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

const MINHA = '17841400000000000';
const OUTRA = '17841499999999999';

/** Um aviso recusado por conta, como ele fica guardado. */
function avisoRecusado(contaId: string | null, error = 'ignorado: conta não conectada') {
  const entrada: Record<string, unknown> = { time: 1795466453, changes: [] };
  if (contaId !== null) entrada.id = contaId;
  return {
    id: 7,
    receivedAt: new Date('2026-11-24T15:57:00Z'),
    signatureValid: true,
    processedAt: new Date('2026-11-24T15:57:01Z'),
    error,
    raw: JSON.stringify({ object: 'instagram', entry: [entrada] }),
  };
}

beforeEach(() => {
  vi.stubEnv('IG_APP_ID', '1122334455');
  getFirstAccount.mockReset().mockResolvedValue({
    id: 1,
    igUserId: MINHA,
    accessToken: 'token-de-mentira',
    dialeto: 'unificado',
    tokenExpiresAt: null,
    username: 'dela',
  });
  garantirInscricao.mockReset().mockResolvedValue({
    estado: 'em-ordem',
    campos: ['comments', 'messages'],
    faltavam: [],
    aplicativos: [],
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

describe('de quem era o aviso recusado', () => {
  it('a tela nomeia a conta que chegou e a que está conectada', async () => {
    listRecentEvents.mockResolvedValue([avisoRecusado(OUTRA)]);

    const html = await abrir();

    expect(html).toContain('era para a conta');
    expect(html).toContain(OUTRA);
    expect(html).toContain(MINHA);
    expect(html).toContain('conecte a conta de novo');
  });

  it('e diz o que fazer quando não há conta conectada nenhuma', async () => {
    getFirstAccount.mockResolvedValue(null);
    listRecentEvents.mockResolvedValue([avisoRecusado(OUTRA)]);

    const html = await abrir();

    expect(html).toContain('era para a conta');
    expect(html).toContain(OUTRA);
    expect(html).toContain('não tem conta conectada');
  });
});

/*
 * O aviso de exemplo do portal, na tela renderizada.
 *
 * Era o único aviso na lista de duas instalações novas em 24/11/2026, e a tela
 * dizia que era de outra conta e mandava conectar a conta de novo. A medida que
 * importa é dupla: a frase certa aparece E a instrução errada não aparece.
 */
describe('o aviso de exemplo do portal', () => {
  it('a tela diz que é o teste do portal e o que ele não prova', async () => {
    listRecentEvents.mockResolvedValue([avisoRecusado('0')]);

    const html = await abrir();

    expect(html).toContain('aviso de exemplo do portal da Meta');
    expect(html).toContain('não mostra que aviso de conta de verdade chega');
  });

  it('e não manda conectar a conta de novo por causa dele', async () => {
    listRecentEvents.mockResolvedValue([avisoRecusado('0')]);

    const html = await abrir();

    expect(html).not.toContain('era para a conta');
    expect(html).not.toContain('conecte a conta de novo');
  });

  it('nem quando este painel não tem conta conectada nenhuma', async () => {
    getFirstAccount.mockResolvedValue(null);
    listRecentEvents.mockResolvedValue([avisoRecusado('0')]);

    const html = await abrir();

    expect(html).toContain('aviso de exemplo do portal da Meta');
    expect(html).not.toContain('era para a conta');
  });
});

describe('quando a tela cala', () => {
  it('cala no aviso que foi recusado por outro motivo', async () => {
    listRecentEvents.mockResolvedValue([
      avisoRecusado(OUTRA, 'ignorado: nenhuma automação casou'),
    ]);

    const html = await abrir();

    expect(html).not.toContain('era para a conta');
  });

  it('cala quando o aviso não diz para qual conta era', async () => {
    listRecentEvents.mockResolvedValue([avisoRecusado(null)]);

    const html = await abrir();

    expect(html).not.toContain('era para a conta');
  });

  /*
   * O aviso era para a conta que está aqui: a recusa tem outra causa, e mandar
   * religar seria mandar consertar o que está certo.
   */
  it('cala quando a conta que chegou é a conectada', async () => {
    listRecentEvents.mockResolvedValue([avisoRecusado(MINHA)]);

    const html = await abrir();

    expect(html).not.toContain('era para a conta');
  });
});
