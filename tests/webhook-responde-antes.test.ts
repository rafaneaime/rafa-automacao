import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * A resposta à Meta sai ANTES do envio da DM.
 *
 * Em 06/11/2026 ficou medido num painel real: quando o evento era ignorado a
 * resposta saía em 0,12s, mas quando a automação disparava de verdade levava
 * de 4 a 7 segundos — várias idas à Meta dentro da requisição. A Meta espera
 * em torno de 5s; passando disso ela espaça as entregas e, se persistir por
 * uma hora, cancela a inscrição do aplicativo na conta. Era por isso que
 * comentário de live e resposta de story paravam de chegar justamente quando
 * havia movimento, e voltavam sozinhos depois.
 *
 * Este teste trava a ordem: resposta primeiro, trabalho depois. Se alguém
 * reintroduzir um `await` do envio antes do `return`, ele quebra aqui — e não
 * numa live, três semanas depois, sem ninguém entender por quê.
 */
const ordem: string[] = [];
const marcados: { id: number; erro: string | null }[] = [];

/*
 * `after` do Next só funciona dentro de uma requisição de verdade. Aqui ele é
 * trocado por uma fila que o teste dispara na mão — é o que permite afirmar
 * que a resposta já tinha saído quando o trabalho começou.
 */
const fila: (() => Promise<void>)[] = [];
vi.mock('next/server', () => ({ after: (fn: () => Promise<void>) => { fila.push(fn); } }));

vi.mock('@/lib/repo/webhook-events', () => ({
  recordWebhookEvent: vi.fn(async () => { ordem.push('gravou a chegada'); return 1; }),
  markWebhookProcessed: vi.fn(async (id: number, erro: string | null) => {
    ordem.push('marcou processado');
    marcados.push({ id, erro });
  }),
  listRecentEvents: vi.fn(async () => []),
}));
vi.mock('@/lib/live-deps', () => ({ liveDeps: {} }));
vi.mock('@/lib/process-event', () => ({
  processEvent: vi.fn(async () => { ordem.push('enviou a DM'); return { ok: true }; }),
}));
vi.mock('@/lib/parse-event', () => ({ parseEvents: vi.fn(() => [{ kind: 'comment' }]) }));

const { POST } = await import('@/app/api/webhook/route');
const { createHmac } = await import('node:crypto');

const SEGREDO = 'segredo-de-teste';
const corpo = '{"object":"instagram","entry":[]}';

const pedido = () =>
  new Request('https://exemplo.test/api/webhook', {
    method: 'POST',
    headers: {
      'x-hub-signature-256': 'sha256=' + createHmac('sha256', SEGREDO).update(corpo, 'utf8').digest('hex'),
    },
    body: corpo,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }) as any;

describe('o webhook responde antes de trabalhar', () => {
  beforeEach(() => {
    ordem.length = 0;
    marcados.length = 0;
    fila.length = 0;
    process.env.IG_APP_SECRET = SEGREDO;
    process.env.VERIFY_TOKEN = 'verificacao';
  });

  it('a chegada é gravada, mas a DM só sai depois da resposta', async () => {
    const resposta = await POST(pedido());

    expect(resposta.status).toBe(200);
    expect(ordem).toEqual(['gravou a chegada']);
    expect(fila).toHaveLength(1);
  });

  it('o trabalho adiado envia e marca o evento como processado', async () => {
    await POST(pedido());
    for (const trabalho of fila) await trabalho();

    expect(ordem).toEqual(['gravou a chegada', 'enviou a DM', 'marcou processado']);
    expect(marcados[0]?.id).toBe(1);
  });

  it('falha depois da resposta não escapa: a Meta já recebeu o 200', async () => {
    const { processEvent } = await import('@/lib/process-event');
    vi.mocked(processEvent).mockRejectedValueOnce(new Error('a Meta recusou'));

    const resposta = await POST(pedido());
    await expect(Promise.all(fila.map((t) => t()))).resolves.toBeDefined();

    expect(resposta.status).toBe(200);
    expect(marcados[0]?.erro).toMatch(/a Meta recusou/);
  });
});
