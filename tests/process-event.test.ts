import { describe, it, expect, vi } from 'vitest';
import { processEvent, RATE_LIMIT_PER_HOUR } from '@/lib/process-event';
import type { ProcessDeps } from '@/lib/process-event';
import type { Automation } from '@/lib/repo/types';
import type { CommentEvent, MessageEvent, RespostaDeStory } from '@/lib/parse-event';

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
    claimMessage: vi.fn().mockResolvedValue(true),
    releaseMessage: vi.fn().mockResolvedValue(undefined),
    upsertContact: vi.fn().mockResolvedValue(99),
    registrarInteracao: vi.fn().mockResolvedValue(undefined),
    publicReply: vi.fn().mockResolvedValue({}),
    privateReply: vi.fn().mockResolvedValue({}),
    sendDm: vi.fn().mockResolvedValue({}),
    findSentDelivery: vi.fn().mockResolvedValue(null),
    findAutomationById: vi.fn().mockResolvedValue(null),
    sentFollowUps: vi.fn().mockResolvedValue([]),
    claimFollowUp: vi.fn().mockResolvedValue(true),
    releaseFollowUp: vi.fn().mockResolvedValue(undefined),
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
      'fulana',
      'me segue e pega o link',
      [{ title: 'Abrir', url: 'https://exemplo.com' }],
      'tok',
      // A automação vai junto: é ela que a Plataforma carimba no link
      // rastreado para saber, depois, qual oferta gerou a compra.
      10,
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
    expect(d.releaseDelivery).toHaveBeenCalledWith(10, 'fulana', 'post:m1');
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
    expect(d.releaseDelivery).toHaveBeenCalledWith(10, 'fulana', 'post:m1');
    expect(d.markDelivery).toHaveBeenCalledWith(
      10, 'fulana', 'error', 'automação publicada sem texto de DM',
    );
  });
});

describe('processEvent com mensagem de DM', () => {
  const message: MessageEvent = {
    kind: 'message',
    story: null,
    mid: 'mid-1',
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
      10,
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
    expect(d.releaseDelivery).toHaveBeenCalledWith(
      10,
      'fulana',
      expect.stringMatching(/^dia:\d{4}-\d{2}-\d{2}$/),
    );
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

/**
 * Resposta de Story chega como DM; o que muda é para onde ela olha primeiro.
 *
 * A queda para `dm` não é conveniência: sem ela, quem já responde resposta de
 * Story com uma automação de DM veria ela parar de funcionar no dia em que
 * este código subisse, sem ter mexido em nada.
 */
describe('processEvent com resposta de Story', () => {
  const doStory = (
    story: RespostaDeStory = { id: 'story-1', url: 'https://exemplo/s1' },
  ): MessageEvent => ({
    kind: 'message', story, mid: 'mid-s1',
    accountIgId: 'conta', fromId: 'fulana', text: 'quero o preço',
  });

  function porGatilho(mapa: Partial<Record<string, Automation[]>>) {
    return vi.fn(async (_conta: number, gatilho: string) => mapa[gatilho] ?? []);
  }

  it('prefere a automação de Story quando existe', async () => {
    const daStory = automation({ id: 20, triggerType: 'story_reply' });
    const d = deps({
      findPublishedAutomations: porGatilho({
        story_reply: [daStory],
        dm: [automation({ id: 10, triggerType: 'dm' })],
      }),
    });
    expect(await processEvent(doStory(), d)).toEqual({ outcome: 'sent', automationId: 20 });
  });

  it('sem automação de Story, cai na de DM — comportamento de antes', async () => {
    const d = deps({
      findPublishedAutomations: porGatilho({ dm: [automation({ id: 10, triggerType: 'dm' })] }),
    });
    expect(await processEvent(doStory(), d)).toEqual({ outcome: 'sent', automationId: 10 });
  });

  it('DM comum nunca procura automação de Story', async () => {
    const buscar = porGatilho({ dm: [automation({ triggerType: 'dm' })] });
    const d = deps({ findPublishedAutomations: buscar });
    await processEvent({ ...doStory(), story: null }, d);
    expect(buscar.mock.calls.map((c) => c[1])).toEqual(['dm']);
  });

  /**
   * A automação de DM não muda de comportamento por causa desta mudança.
   *
   * Ela sempre entregou uma vez por dia. Se a resposta de Story passasse a
   * trocar a janela dela, quem responde dois Stories num dia começaria a
   * receber duas DMs de uma automação que ninguém mexeu.
   */
  it('automação de DM que pega resposta de Story continua na janela do dia', async () => {
    const d = deps({
      findPublishedAutomations: porGatilho({ dm: [automation({ triggerType: 'dm' })] }),
    });
    await processEvent(doStory({ id: 'story-1', url: null }), d);
    await processEvent(doStory({ id: 'story-2', url: null }), d);
    const janelas = (d.claimDelivery as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[3]);
    expect(new Set(janelas).size).toBe(1);
    expect(janelas[0]).toMatch(/^dia:/);
  });

  it('o Story é a ocasião: dois Stories no mesmo dia são duas entregas', async () => {
    const d = deps({
      findPublishedAutomations: porGatilho({
        story_reply: [automation({ triggerType: 'story_reply' })],
      }),
    });
    await processEvent(doStory({ id: 'story-1', url: null }), d);
    await processEvent(doStory({ id: 'story-2', url: null }), d);
    const janelas = (d.claimDelivery as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[3]);
    expect(new Set(janelas).size).toBe(2);
  });

  /**
   * O defeito que apareceu no painel do Rafa em 18/09/2026: sete contatos
   * listados como números de 16 dígitos, todos vindos de resposta de Story.
   * Comentário traz o `@` no webhook; mensagem não traz nada além do id.
   */
  it('busca o perfil de quem chega por mensagem, com a conta e o token certos', async () => {
    const completarPerfil = vi.fn().mockResolvedValue(undefined);
    const d = deps({
      completarPerfil,
      findPublishedAutomations: porGatilho({ story_reply: [automation({ triggerType: 'story_reply' })] }),
    });
    await processEvent(doStory(), d);
    expect(completarPerfil).toHaveBeenCalledWith(99, 'fulana', 'tok');
  });

  it('falha ao buscar o perfil não atrapalha a entrega', async () => {
    const d = deps({
      completarPerfil: vi.fn().mockRejectedValue(new Error('Meta fora do ar')),
      findPublishedAutomations: porGatilho({ story_reply: [automation({ triggerType: 'story_reply' })] }),
    });
    expect(await processEvent(doStory(), d)).toEqual({ outcome: 'sent', automationId: 10 });
    expect(d.sendDm).toHaveBeenCalled();
  });

  it('registra resposta de Story, com de qual Story veio', async () => {
    const d = deps({
      findPublishedAutomations: porGatilho({
        story_reply: [automation({ triggerType: 'story_reply' })],
      }),
    });
    await processEvent(doStory(), d);
    expect(d.registrarInteracao).toHaveBeenCalledWith(expect.objectContaining({
      tipo: 'resposta_de_story',
      detalhe: { storyId: 'story-1', storyUrl: 'https://exemplo/s1' },
    }));
  });

  it('Story sem id nem url não inventa detalhe vazio', async () => {
    const d = deps({
      findPublishedAutomations: porGatilho({
        story_reply: [automation({ triggerType: 'story_reply' })],
      }),
    });
    await processEvent(doStory({ id: null, url: null }), d);
    expect(d.registrarInteracao).toHaveBeenCalledWith(expect.objectContaining({
      tipo: 'resposta_de_story', detalhe: {},
    }));
  });

  it('DM comum continua registrada como dm_recebida, sem detalhe', async () => {
    const d = deps({
      findPublishedAutomations: porGatilho({ dm: [automation({ triggerType: 'dm' })] }),
    });
    await processEvent({ ...doStory(), story: null }, d);
    const dados = (d.registrarInteracao as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(dados.tipo).toBe('dm_recebida');
    expect(dados).not.toHaveProperty('detalhe');
  });
});

describe('processEvent com follow-up', () => {
  const resposta = {
    kind: 'message' as const,
    story: null,
    mid: 'mid-2',
    accountIgId: 'conta',
    fromId: 'fulana',
    text: 'quanto custa?',
  };

  function comFollowUp(over: Partial<ProcessDeps> = {}): ProcessDeps {
    const auto = automation({
      steps: [
        { id: 2, position: 1, kind: 'dm', variants: ['link'], buttons: [] },
        { id: 3, position: 2, kind: 'follow_up', variants: ['te ajudo?'], buttons: [] },
      ],
    });
    return deps({
      findSentDelivery: vi.fn().mockResolvedValue({ id: 50, automationId: 10 }),
      findAutomationById: vi.fn().mockResolvedValue(auto),
      sentFollowUps: vi.fn().mockResolvedValue([]),
      claimFollowUp: vi.fn().mockResolvedValue(true),
      releaseFollowUp: vi.fn().mockResolvedValue(undefined),
      ...over,
    });
  }

  it('envia o follow-up quando a pessoa responde', async () => {
    const d = comFollowUp();
    const r = await processEvent(resposta, d);

    expect(r).toEqual({ outcome: 'sent', automationId: 10 });
    expect(d.sendDm).toHaveBeenCalledWith('conta', 'fulana', 'te ajudo?', [], 'tok', 10);
    expect(d.claimFollowUp).toHaveBeenCalledWith(50, 2);
  });

  it('não envia o mesmo follow-up duas vezes', async () => {
    const d = comFollowUp({ sentFollowUps: vi.fn().mockResolvedValue([2]) });
    const r = await processEvent(resposta, d);

    expect(r).toEqual({ outcome: 'ignored', reason: 'nenhuma automação casou' });
    expect(d.sendDm).not.toHaveBeenCalled();
  });

  it('respeita o limite por hora', async () => {
    const d = comFollowUp({
      countRecentSent: vi.fn().mockResolvedValue(RATE_LIMIT_PER_HOUR),
    });
    const r = await processEvent(resposta, d);

    expect(r).toEqual({ outcome: 'throttled', automationId: 10 });
    expect(d.sendDm).not.toHaveBeenCalled();
    expect(d.claimFollowUp).not.toHaveBeenCalled();
  });

  it('não cai para palavra-chave quando o claim do follow-up é perdido para uma invocação concorrente', async () => {
    const d = comFollowUp({ claimFollowUp: vi.fn().mockResolvedValue(false) });
    const r = await processEvent(resposta, d);

    expect(r).toEqual({ outcome: 'duplicate', automationId: 10 });
    expect(d.sendDm).not.toHaveBeenCalled();
    expect(d.findPublishedAutomations).not.toHaveBeenCalled();
  });

  it('solta a reserva quando o envio falha', async () => {
    const d = comFollowUp({
      sendDm: vi.fn().mockRejectedValue(new Error('Meta respondeu 400')),
    });
    const r = await processEvent(resposta, d);

    expect(r.outcome).toBe('error');
    expect(d.releaseFollowUp).toHaveBeenCalledWith(50, 2);
  });

  it('cai para o casamento por palavra-chave quando a pessoa nunca recebeu nada', async () => {
    const d = comFollowUp({ findSentDelivery: vi.fn().mockResolvedValue(null) });
    await processEvent({ ...resposta, text: 'quero o preço' }, d);

    expect(d.findPublishedAutomations).toHaveBeenCalledWith(1, 'dm');
  });

  it('ignora resposta da própria conta antes de qualquer consulta', async () => {
    const d = comFollowUp();
    const r = await processEvent({ ...resposta, fromId: 'conta' }, d);

    expect(r).toEqual({ outcome: 'ignored', reason: 'mensagem da própria conta' });
    expect(d.findSentDelivery).not.toHaveBeenCalled();
  });
});

describe('registro de interação no histórico', () => {
  it('registra o comentário e a DM enviada, nessa ordem', async () => {
    const d = deps();
    await processEvent(comment(), d);

    const chamadas = (d.registrarInteracao as ReturnType<typeof vi.fn>).mock.calls.map(
      ([dados]) => [dados.tipo, dados.referencia, dados.contactId],
    );
    expect(chamadas).toEqual([
      ['comentario', 'c1', 99],
      ['dm_enviada', 'c1-resposta', 99],
    ]);
  });

  // Histórico é importante, entrega é essencial. Se a gravação falhar, a DM
  // precisa sair do mesmo jeito — o contrário seria automação parando por
  // causa de telemetria.
  it('falha ao registrar não impede o envio', async () => {
    const d = deps({
      registrarInteracao: vi.fn().mockRejectedValue(new Error('banco fora do ar')),
    });

    const resultado = await processEvent(comment(), d);

    expect(resultado).toEqual({ outcome: 'sent', automationId: 10 });
    expect(d.privateReply).toHaveBeenCalled();
    expect(d.markDelivery).toHaveBeenCalledWith(10, 'fulana', 'sent', null);
  });

  it('não registra envio quando o disparo falha', async () => {
    const d = deps({
      privateReply: vi.fn().mockRejectedValue(new Error('Meta respondeu 400')),
    });
    await processEvent(comment(), d);

    const tipos = (d.registrarInteracao as ReturnType<typeof vi.fn>).mock.calls.map(
      ([dados]) => dados.tipo,
    );
    expect(tipos).toEqual(['comentario']);
  });

  it('não registra nada quando as guardas barram o evento', async () => {
    const d = deps({ findPublishedAutomations: vi.fn().mockResolvedValue([]) });
    await processEvent(comment(), d);
    expect(d.registrarInteracao).not.toHaveBeenCalled();
  });
});

describe('dedup da mensagem pelo mid', () => {
  function message(over: Partial<MessageEvent> = {}): MessageEvent {
    return {
      kind: 'message',
      story: null,
      mid: 'mid-1',
      accountIgId: 'conta',
      fromId: 'fulana',
      text: 'quero o preço',
      ...over,
    };
  }

  // O caso que motivou tudo: numa reentrega do Meta, o sistema via a mensagem
  // 1 já enviada, escolhia a 2 e mandava. Duas mensagens de uma resposta só,
  // sem erro nenhum aparecer.
  it('reentrega da mesma mensagem não dispara nada', async () => {
    const d = deps({ claimMessage: vi.fn().mockResolvedValue(false) });

    const resultado = await processEvent(message(), d);

    expect(resultado.outcome).toBe('duplicate');
    expect(d.sendDm).not.toHaveBeenCalled();
    expect(d.findSentDelivery).not.toHaveBeenCalled();
  });

  it('reserva depois do anti-loop, para o próprio eco não gastar reserva', async () => {
    const d = deps();
    await processEvent(message({ fromId: 'conta' }), d);
    expect(d.claimMessage).not.toHaveBeenCalled();
  });

  it('mensagem sem mid segue sem a proteção, em vez de ser recusada', async () => {
    const d = deps();
    const resultado = await processEvent(message({ mid: null }), d);

    expect(d.claimMessage).not.toHaveBeenCalled();
    expect(resultado.outcome).not.toBe('duplicate');
  });

  // Sem soltar, uma falha de envio consumiria a única chance daquela
  // mensagem: a reentrega seguinte seria recusada e a pessoa nunca receberia.
  it('falha de envio solta a reserva para a reentrega poder tentar', async () => {
    const d = deps({
      sendDm: vi.fn().mockRejectedValue(new Error('Meta respondeu 400')),
    });

    const resultado = await processEvent(message(), d);

    expect(resultado.outcome).toBe('error');
    expect(d.releaseMessage).toHaveBeenCalledWith(1, 'mid-1');
  });

  it('envio bem-sucedido mantém a reserva', async () => {
    const d = deps();
    await processEvent(message(), d);
    expect(d.releaseMessage).not.toHaveBeenCalled();
  });
});

describe('a reserva de entrega é por ocasião, não para sempre', () => {
  it('reserva pelo post quando o comentário diz de qual post veio', async () => {
    const d = deps();
    await processEvent(comment({ mediaId: 'm1' }), d);
    expect(d.claimDelivery).toHaveBeenCalledWith(10, 'fulana', 'c1', 'post:m1');
  });

  it('a mesma pessoa em outro post é outra ocasião', async () => {
    // O defeito que isto conserta: `dududrumond` comentou em 18/08, recebeu, e
    // em 27/08 comentou de novo em outro post e não recebeu nada — a reserva
    // era permanente. As duas chamadas abaixo precisam pedir reservas
    // diferentes, senão a segunda nunca acontece.
    const d = deps();
    await processEvent(comment({ mediaId: 'post-de-agosto' }), d);
    await processEvent(comment({ mediaId: 'post-de-setembro' }), d);

    const ocasioes = (d.claimDelivery as unknown as { mock: { calls: unknown[][] } })
      .mock.calls.map((chamada) => chamada[3]);

    expect(ocasioes).toEqual(['post:post-de-agosto', 'post:post-de-setembro']);
    expect(new Set(ocasioes).size).toBe(2);
  });

  it('sem post, a ocasião é o dia — para DM não virar metralhadora', async () => {
    const d = deps();
    await processEvent(comment({ mediaId: null }), d);
    expect(d.claimDelivery).toHaveBeenCalledWith(
      10,
      'fulana',
      'c1',
      expect.stringMatching(/^dia:\d{4}-\d{2}-\d{2}$/),
    );
  });
});
