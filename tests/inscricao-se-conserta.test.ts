import { afterEach, describe, expect, it, vi } from 'vitest';
import { garantirInscricao, WEBHOOK_FIELDS } from '@/lib/meta/subscribe';

/*
 * A Meta cancela a inscrição de quem demora a responder: uma hora de entregas
 * falhando e o aplicativo sai da conta. Nada aparece em tela — o painel só
 * para de receber. A causa foi corrigida em 06/11/2026, mas corrigir a causa
 * não religa quem já foi cortado, e a inscrição só era pedida no momento de
 * conectar a conta. Quem foi cortado ficava fora até alguém mandar reconectar
 * à mão, sem ter como descobrir que era isso.
 *
 * O que estes testes prendem: o painel confere, conserta quando dá, e sabe
 * dizer quando não dá — porque "assinei e continua faltando" não é corte da
 * Meta, é campo desmarcado no portal do aplicativo, e o conserto é outro.
 */

const TODOS = WEBHOOK_FIELDS.split(',');

/**
 * O GET devolve a lista da vez; cada POST avança para a lista seguinte, que é
 * como se escreve "depois de assinar, passou a valer isto".
 *
 * A pergunta e o pedido vão para o mesmo caminho — `subscribed_apps` nos dois
 * —, então aqui se separa pelo método, não pelo endereço.
 */
function instagram(listas: readonly string[][]) {
  const chamadas = { get: 0, post: 0 };
  let atual = 0;
  const buscar = vi.fn(async (_url: string, init?: RequestInit) => {
    if (init?.method === 'POST') {
      chamadas.post += 1;
      atual = Math.min(atual + 1, listas.length - 1);
      return Response.json({ success: true }, { status: 200 });
    }
    chamadas.get += 1;
    return Response.json({ data: [{ subscribed_fields: listas[atual] }] }, { status: 200 });
  });
  vi.stubGlobal('fetch', buscar);
  return { chamadas, buscar };
}

function recusa(quando: 'pergunta' | 'pedido') {
  const chamadas = { get: 0, post: 0 };
  const buscar = vi.fn(async (_url: string, init?: RequestInit) => {
    const ehPedido = init?.method === 'POST';
    if (ehPedido) chamadas.post += 1;
    else chamadas.get += 1;
    const recusar = quando === 'pedido' ? ehPedido : !ehPedido;
    if (recusar) {
      return Response.json({ error: { message: 'Invalid OAuth access token' } }, { status: 400 });
    }
    return Response.json({ data: [{ subscribed_fields: [] }] }, { status: 200 });
  });
  vi.stubGlobal('fetch', buscar);
  return { chamadas };
}

afterEach(() => vi.unstubAllGlobals());

describe('o painel confere a inscrição e religa sozinho', () => {
  it('inscrição completa: não pede nada de novo', async () => {
    const { chamadas } = instagram([TODOS]);

    const r = await garantirInscricao('1784', 'IGAAtoken');

    expect(r.estado).toBe('em-ordem');
    expect(r.faltavam).toEqual([]);
    expect(chamadas.post).toBe(0);
  });

  /*
   * O corte da Meta é este: a conta deixa de listar o aplicativo, e a resposta
   * vem vazia. É o estado em que ninguém recebe nada.
   */
  it('conta cortada: assina de novo e diz o que estava faltando', async () => {
    const { chamadas } = instagram([[], TODOS]);

    const r = await garantirInscricao('1784', 'IGAAtoken');

    expect(r.estado).toBe('reassinada');
    expect(r.faltavam).toEqual(TODOS);
    expect(r.campos).toEqual(TODOS);
    expect(chamadas.post).toBe(1);
    // Pergunta, pede, e confere o que passou a valer — não acredita no próprio pedido.
    expect(chamadas.get).toBe(2);
  });

  /*
   * A outra metade da entrega: o aplicativo sem o campo marcado no portal. A
   * Meta aceita o pedido, responde que deu certo, e o campo continua fora.
   * Isso não se conserta daqui, e chamar de "religado" seria mentir para quem
   * está olhando a tela.
   */
  it('campo desmarcado no aplicativo: assina, não resolve, e não finge que resolveu', async () => {
    const { chamadas } = instagram([['messages'], ['messages']]);

    const r = await garantirInscricao('1784', 'IGAAtoken');

    expect(r.estado).toBe('nao-resolveu');
    expect(r.campos).toEqual(['messages']);
    expect(r.faltavam).toEqual(TODOS.filter((c) => c !== 'messages'));
    expect(chamadas.post).toBe(1);
  });

  it('token vencido: não dá para perguntar, então não pede nada', async () => {
    const { chamadas } = recusa('pergunta');

    const r = await garantirInscricao('1784', 'IGAAvencido');

    expect(r.estado).toBe('sem-resposta');
    expect(r.campos).toEqual([]);
    expect(chamadas.post).toBe(0);
  });

  it('pedido recusado: devolve o que faltava em vez de lançar', async () => {
    const { chamadas } = recusa('pedido');

    const r = await garantirInscricao('1784', 'IGAAtoken');

    expect(r.estado).toBe('nao-resolveu');
    expect(r.faltavam).toEqual(TODOS);
    expect(chamadas.post).toBe(1);
  });

  // Remendo que derruba a tela de Logs é pior do que remendo nenhum: é a tela
  // onde se vai quando já está tudo errado.
  it('rede fora: devolve resposta em vez de quebrar a tela', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new Error('fetch failed');
    }));

    await expect(garantirInscricao('1784', 'IGAAtoken')).resolves.toEqual({
      estado: 'sem-resposta',
      campos: [],
      faltavam: [],
    });
  });

  it('respeita o endereço da conta, que no login unificado é outro', async () => {
    const { buscar } = instagram([[], TODOS]);

    await garantirInscricao('1784', 'EAAtoken', 'https://graph.facebook.com');

    for (const [url] of buscar.mock.calls) {
      expect(String(url)).toContain('https://graph.facebook.com/');
    }
  });
});
