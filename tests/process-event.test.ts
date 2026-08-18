import { describe, it, expect, vi } from 'vitest';
import { processEvent, RATE_LIMIT_PER_HOUR } from '@/lib/process-event';
import type { ProcessDeps } from '@/lib/process-event';
import type { Automation } from '@/lib/repo/types';
import type { CommentEvent, MessageEvent } from '@/lib/parse-event';

const ACCOUNT = { id: 1, igUserId: 'conta', accessToken: 'tok' };

function automation(over: Partial<Automation> = {}): Automation {
  return {
    id: 10,
    accountId: 1,
    name: 'Reel do preço',
    status: 'published',
    triggerType: 'comment',
    mediaId: null,
    keywords: ['preco'],
    matchMode: 'contains',
    steps: [
      { id: 1, position: 0, kind: 'public_reply', variants: ['te chamei!'], buttons: [] },
      {
        id: 2,
        position: 1,
        kind: 'dm',
        variants: ['me segue e pega o link'],
        buttons: [{ title: 'Abrir', url: 'https://exemplo.com' }],
      },
    ],
    ...over,
  };
}

function comment(over: Partial<CommentEvent> = {}): CommentEvent {
  return {
    kind: 'comment',
    accountIgId: 'conta',
    commentId: 'c1',
    text: 'quero o preço',
    fromId: 'fulana',
    fromUsername: 'fulana',
    mediaId: 'm1',
    ...over,
  };
}

function deps(over: Partial<ProcessDeps> = {}): ProcessDeps {
  return {
    findAccount: vi.fn().mockResolvedValue(ACCOUNT),
    findPublishedAutomations: vi.fn().mockResolvedValue([automation()]),
    claimDelivery: vi.fn().mockResolvedValue(true),
    releaseDelivery: vi.fn().mockResolvedValue(undefined),
    markDelivery: vi.fn().mockResolvedValue(undefined),
    countRecentSent: vi.fn().mockResolvedValue(0),
    upsertContact: vi.fn().mockResolvedValue(undefined),
    publicReply: vi.fn().mockResolvedValue({}),
    privateReply: vi.fn().mockResolvedValue({}),
    sendDm: vi.fn().mockResolvedValue({}),
    pick: (items) => items[0],
    ...over,
  };
}

describe('processEvent com comentário', () => {
  it('dispara resposta pública e private reply', async () => {
    const d = deps();
    const result = await processEvent(comment(), d);

    expect(result).toEqual({ outcome: 'sent', automationId: 10 });
    expect(d.publicReply).toHaveBeenCalledWith('c1', 'te chamei!', 'tok');
    expect(d.privateReply).toHaveBeenCalledWith(
      'conta',
      'c1',
      'me segue e pega o link',
      [{ title: 'Abrir', url: 'https://exemplo.com' }],
      'tok',
    );
    expect(d.markDelivery).toHaveBeenCalledWith(10, 'fulana', 'sent', null);
    expect(d.upsertContact).toHaveBeenCalledWith(1, 'fulana', 'fulana');
  });

  it('ignora comentário da própria conta (anti-loop)', async () => {
    const d = deps();
    const result = await processEvent(comment({ fromId: 'conta' }), d);

    expect(result).toEqual({ outcome: 'ignored', reason: 'comentário da própria conta' });
    expect(d.privateReply).not.toHaveBeenCalled();
  });

  it('ignora quando a conta não está conectada', async () => {
    const d = deps({ findAccount: vi.fn().mockResolvedValue(null) });
    const result = await processEvent(comment(), d);

    expect(result).toEqual({ outcome: 'ignored', reason: 'conta não conectada' });
  });

  it('ignora quando nenhuma palavra-chave casa', async () => {
    const d = deps();
    const result = await processEvent(comment({ text: 'bom dia' }), d);

    expect(result).toEqual({ outcome: 'ignored', reason: 'nenhuma automação casou' });
    expect(d.claimDelivery).not.toHaveBeenCalled();
  });

  it('respeita o filtro de Reel', async () => {
    const d = deps({
      findPublishedAutomations: vi.fn().mockResolvedValue([automation({ mediaId: 'outro' })]),
    });
    const result = await processEvent(comment({ mediaId: 'm1' }), d);

    expect(result).toEqual({ outcome: 'ignored', reason: 'nenhuma automação casou' });
  });

  it('não envia duas vezes para a mesma pessoa', async () => {
    const d = deps({ claimDelivery: vi.fn().mockResolvedValue(false) });
    const result = await processEvent(comment(), d);

    expect(result).toEqual({ outcome: 'duplicate', automationId: 10 });
    expect(d.privateReply).not.toHaveBeenCalled();
  });

  it('segura no limite de 750 por hora', async () => {
    const d = deps({
      countRecentSent: vi.fn().mockResolvedValue(RATE_LIMIT_PER_HOUR),
    });
    const result = await processEvent(comment(), d);

    expect(result).toEqual({ outcome: 'throttled', automationId: 10 });
    expect(d.privateReply).not.toHaveBeenCalled();
    expect(d.publicReply).not.toHaveBeenCalled();
    expect(d.markDelivery).toHaveBeenCalledWith(
      10, 'fulana', 'throttled', 'limite de 750 envios por hora atingido',
    );
  });

  it('solta a reserva quando o envio falha, para permitir nova tentativa', async () => {
    const d = deps({
      privateReply: vi.fn().mockRejectedValue(new Error('Meta respondeu 400: token expirado')),
    });
    const result = await processEvent(comment(), d);

    expect(result).toEqual({
      outcome: 'error',
      automationId: 10,
      error: 'Error: Meta respondeu 400: token expirado',
    });
    expect(d.releaseDelivery).toHaveBeenCalledWith(10, 'fulana');
  });

  it('pula a resposta pública quando não há variações cadastradas', async () => {
    const d = deps({
      findPublishedAutomations: vi.fn().mockResolvedValue([
        automation({
          steps: [
            { id: 1, position: 0, kind: 'public_reply', variants: [], buttons: [] },
            { id: 2, position: 1, kind: 'dm', variants: ['oi'], buttons: [] },
          ],
        }),
      ]),
    });
    await processEvent(comment(), d);

    expect(d.publicReply).not.toHaveBeenCalled();
    expect(d.privateReply).toHaveBeenCalled();
  });

  it('não marca sent quando a automação foi publicada sem texto de DM', async () => {
    const d = deps({
      findPublishedAutomations: vi.fn().mockResolvedValue([
        automation({
          steps: [
            { id: 1, position: 0, kind: 'public_reply', variants: ['te chamei!'], buttons: [] },
            { id: 2, position: 1, kind: 'dm', variants: [], buttons: [] },
          ],
        }),
      ]),
    });
    const result = await processEvent(comment(), d);

    expect(result).toEqual({
      outcome: 'error',
      automationId: 10,
      error: 'automação publicada sem texto de DM',
    });
    expect(d.publicReply).toHaveBeenCalled();
    expect(d.privateReply).not.toHaveBeenCalled();
    expect(d.releaseDelivery).toHaveBeenCalledWith(10, 'fulana');
    expect(d.markDelivery).toHaveBeenCalledWith(
      10, 'fulana', 'error', 'automação publicada sem texto de DM',
    );
  });
});

describe('processEvent com mensagem de DM', () => {
  const message: MessageEvent = {
    kind: 'message',
    accountIgId: 'conta',
    fromId: 'fulana',
    text: 'quero o preço',
  };

  it('envia DM direta dentro da janela de 24h', async () => {
    const d = deps({
      findPublishedAutomations: vi
        .fn()
        .mockResolvedValue([automation({ triggerType: 'dm' })]),
    });
    const result = await processEvent(message, d);

    expect(result).toEqual({ outcome: 'sent', automationId: 10 });
    expect(d.sendDm).toHaveBeenCalledWith(
      'conta',
      'fulana',
      'me segue e pega o link',
      [{ title: 'Abrir', url: 'https://exemplo.com' }],
      'tok',
    );
    expect(d.publicReply).not.toHaveBeenCalled();
  });

  it('ignora mensagem da própria conta', async () => {
    const d = deps();
    const result = await processEvent({ ...message, fromId: 'conta' }, d);

    expect(result).toEqual({ outcome: 'ignored', reason: 'mensagem da própria conta' });
    expect(d.sendDm).not.toHaveBeenCalled();
  });

  it('não envia DM duas vezes para a mesma pessoa', async () => {
    const d = deps({
      findPublishedAutomations: vi
        .fn()
        .mockResolvedValue([automation({ triggerType: 'dm' })]),
      claimDelivery: vi.fn().mockResolvedValue(false),
    });
    const result = await processEvent(message, d);

    expect(result).toEqual({ outcome: 'duplicate', automationId: 10 });
    expect(d.sendDm).not.toHaveBeenCalled();
  });

  it('segura DM no limite de 750 por hora', async () => {
    const d = deps({
      findPublishedAutomations: vi
        .fn()
        .mockResolvedValue([automation({ triggerType: 'dm' })]),
      countRecentSent: vi.fn().mockResolvedValue(RATE_LIMIT_PER_HOUR),
    });
    const result = await processEvent(message, d);

    expect(result).toEqual({ outcome: 'throttled', automationId: 10 });
    expect(d.sendDm).not.toHaveBeenCalled();
    expect(d.markDelivery).toHaveBeenCalledWith(
      10, 'fulana', 'throttled', 'limite de 750 envios por hora atingido',
    );
  });

  it('solta a reserva quando o envio de DM falha, para permitir nova tentativa', async () => {
    const d = deps({
      findPublishedAutomations: vi
        .fn()
        .mockResolvedValue([automation({ triggerType: 'dm' })]),
      sendDm: vi.fn().mockRejectedValue(new Error('Meta respondeu 400: token expirado')),
    });
    const result = await processEvent(message, d);

    expect(result).toEqual({
      outcome: 'error',
      automationId: 10,
      error: 'Error: Meta respondeu 400: token expirado',
    });
    expect(d.releaseDelivery).toHaveBeenCalledWith(10, 'fulana');
  });

  it('registra o contato antes de tentar o envio, mesmo quando o envio falha', async () => {
    const d = deps({
      findPublishedAutomations: vi
        .fn()
        .mockResolvedValue([automation({ triggerType: 'dm' })]),
      sendDm: vi.fn().mockRejectedValue(new Error('Meta respondeu 400: token expirado')),
    });
    await processEvent(message, d);

    // upsertContact precisa acontecer antes do envio, para que uma falha de
    // envio ainda registre quem tentou. Comparamos a ordem real das chamadas
    // via mock.invocationCallOrder em vez de só checar "foi chamado".
    expect(d.upsertContact).toHaveBeenCalled();
    const upsertOrder = (d.upsertContact as ReturnType<typeof vi.fn>).mock
      .invocationCallOrder[0];
    const sendOrder = (d.sendDm as ReturnType<typeof vi.fn>).mock.invocationCallOrder[0];
    expect(upsertOrder).toBeLessThan(sendOrder);
  });
});
