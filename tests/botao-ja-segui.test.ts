import { describe, expect, it, vi } from 'vitest';
import { parseEvents } from '@/lib/parse-event';
import { buildMessagePayload } from '@/lib/meta/messaging';
import { ACAO_CONFERIR_SEGUIR } from '@/lib/automations/acoes';

const entrega = (messaging: unknown[]) =>
  JSON.stringify({ object: 'instagram', entry: [{ id: 'conta', messaging }] });

describe('o clique no botão chega como evento', () => {
  it('vira mensagem sem texto, com a ação preenchida', () => {
    const raw = entrega([
      { sender: { id: 'fulana' }, recipient: { id: 'conta' }, timestamp: 1,
        postback: { mid: 'm1', title: 'Já estou seguindo', payload: ACAO_CONFERIR_SEGUIR } },
    ]);
    expect(parseEvents(JSON.parse(raw))).toEqual([
      { kind: 'message', accountIgId: 'conta', fromId: 'fulana', text: '', mid: 'm1', story: null, acao: 'conferir_seguir' },
    ]);
  });

  it('postback sem payload não vira evento: não dá para saber o que a pessoa quis', () => {
    const raw = entrega([{ sender: { id: 'fulana' }, postback: { mid: 'm1', title: 'Oi' } }]);
    expect(parseEvents(JSON.parse(raw))).toEqual([]);
  });

  /*
   * Mensagem comum continua sendo mensagem comum. O ramo novo só vale quando
   * `message` não veio — senão um eco com postback junto viraria clique.
   */
  it('mensagem com texto continua sendo lida como texto', () => {
    const raw = entrega([{ sender: { id: 'fulana' }, message: { mid: 'm2', text: 'oi' } }]);
    const [evento] = parseEvents(JSON.parse(raw));
    expect(evento).toMatchObject({ text: 'oi' });
    expect((evento as { acao?: string }).acao).toBeUndefined();
  });
});

describe('o botão de ação na mensagem', () => {
  it('vira postback, e o de link continua virando link', () => {
    const payload = buildMessagePayload('texto', [
      { title: 'Assistir', url: 'https://exemplo.com' },
      { title: 'Já estou seguindo', acao: ACAO_CONFERIR_SEGUIR },
    ]) as { attachment: { payload: { buttons: Record<string, string>[] } } };

    expect(payload.attachment.payload.buttons).toEqual([
      { type: 'web_url', url: 'https://exemplo.com', title: 'Assistir' },
      { type: 'postback', payload: 'conferir_seguir', title: 'Já estou seguindo' },
    ]);
  });

  it('botão sem endereço e sem ação não existe', () => {
    expect(buildMessagePayload('texto', [{ title: 'Nada' }])).toEqual({ text: 'texto' });
  });

  it('mensagem só com botão de ação ainda é um anexo com botão', () => {
    const payload = buildMessagePayload('me segue', [{ title: 'Já segui', acao: ACAO_CONFERIR_SEGUIR }]) as {
      attachment?: { payload: { text: string; buttons: unknown[] } };
    };
    expect(payload.attachment?.payload.text).toBe('me segue');
    expect(payload.attachment?.payload.buttons).toHaveLength(1);
  });

});
