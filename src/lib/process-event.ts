import { matchesKeyword } from './matching';
import type { NormalizedEvent, CommentEvent, MessageEvent } from './parse-event';
import type { Automation } from './repo/types';
import type { Button } from './meta/messaging';
import { nextFollowUp } from './automations/follow-up';

export const RATE_LIMIT_PER_HOUR = 750;

export type ProcessDeps = {
  findAccount(
    accountIgId: string,
  ): Promise<{ id: number; igUserId: string; accessToken: string } | null>;
  findPublishedAutomations(
    accountId: number,
    trigger: 'comment' | 'dm',
  ): Promise<Automation[]>;
  claimDelivery(
    automationId: number,
    igUserId: string,
    commentId: string | null,
  ): Promise<boolean>;
  releaseDelivery(automationId: number, igUserId: string): Promise<void>;
  markDelivery(
    automationId: number,
    igUserId: string,
    status: 'sent' | 'error' | 'throttled',
    error: string | null,
  ): Promise<void>;
  countRecentSent(accountId: number): Promise<number>;
  upsertContact(
    accountId: number,
    igUserId: string,
    username: string | null,
  ): Promise<void>;
  publicReply(commentId: string, message: string, token: string): Promise<unknown>;
  privateReply(
    accountIgId: string,
    commentId: string,
    text: string,
    buttons: Button[],
    token: string,
  ): Promise<unknown>;
  sendDm(
    accountIgId: string,
    recipientIgId: string,
    text: string,
    buttons: Button[],
    token: string,
  ): Promise<unknown>;
  findSentDelivery(
    accountId: number,
    igUserId: string,
  ): Promise<{ id: number; automationId: number } | null>;
  findAutomationById(automationId: number): Promise<Automation | null>;
  sentFollowUps(deliveryId: number): Promise<number[]>;
  claimFollowUp(deliveryId: number, position: number): Promise<boolean>;
  releaseFollowUp(deliveryId: number, position: number): Promise<void>;
  pick<T>(items: T[]): T;
};

export type ProcessResult =
  | { outcome: 'ignored'; reason: string }
  | { outcome: 'sent'; automationId: number }
  | { outcome: 'duplicate'; automationId: number }
  | { outcome: 'throttled'; automationId: number }
  | { outcome: 'error'; automationId: number; error: string };

function findMatch(
  automations: Automation[],
  text: string,
  mediaId: string | null,
): Automation | undefined {
  return automations.find(
    (a) =>
      (a.mediaId === null || a.mediaId === mediaId) &&
      matchesKeyword(text, a.keywords, a.matchMode),
  );
}

async function runSend(
  automation: Automation,
  igUserId: string,
  send: () => Promise<number>,
  deps: ProcessDeps,
): Promise<ProcessResult> {
  try {
    const dispatched = await send();
    if (dispatched === 0) {
      // Automação publicada sem texto de DM: nada foi de fato enviado, mesmo
      // sem erro do Meta. Marcar 'sent' aqui enganaria o painel (Logs e
      // Contatos mostrariam sucesso para uma mensagem que nunca saiu) e
      // travaria a pessoa pra sempre via o unique constraint de dedup.
      // Solta a reserva primeiro (enquanto o status ainda é 'pending', que é
      // a condição que releaseDelivery apaga) e só então tenta marcar o
      // erro, para que uma nova tentativa funcione assim que o operador
      // preencher a DM.
      await deps.releaseDelivery(automation.id, igUserId);
      const error = 'automação publicada sem texto de DM';
      await deps.markDelivery(automation.id, igUserId, 'error', error);
      return { outcome: 'error', automationId: automation.id, error };
    }
    await deps.markDelivery(automation.id, igUserId, 'sent', null);
    return { outcome: 'sent', automationId: automation.id };
  } catch (error) {
    // Solta a reserva: sem isso, um token expirado bloquearia essa pessoa
    // para sempre, mesmo depois de o problema ser corrigido.
    await deps.releaseDelivery(automation.id, igUserId);
    return {
      outcome: 'error',
      automationId: automation.id,
      error: String(error),
    };
  }
}

type Account = { id: number; igUserId: string; accessToken: string };

type GuardsOk = { ok: true; account: Account; automation: Automation };
type GuardsFail = { ok: false; result: ProcessResult };

/**
 * Sequência de guardas compartilhada por comentário e DM:
 * anti-loop -> conta -> automação -> claim (dedup) -> rate limit -> upsertContact.
 * Preserva essa ordem exatamente; qualquer early-return já é o ProcessResult final.
 */
async function runGuards(
  opts: {
    fromId: string;
    accountIgId: string;
    ignoredSelfReason: string;
    trigger: 'comment' | 'dm';
    text: string;
    mediaId: string | null;
    commentId: string | null;
    username: string | null;
  },
  deps: ProcessDeps,
): Promise<GuardsOk | GuardsFail> {
  if (opts.fromId === opts.accountIgId) {
    return { ok: false, result: { outcome: 'ignored', reason: opts.ignoredSelfReason } };
  }

  const account = await deps.findAccount(opts.accountIgId);
  if (!account) {
    return { ok: false, result: { outcome: 'ignored', reason: 'conta não conectada' } };
  }

  const automations = await deps.findPublishedAutomations(account.id, opts.trigger);
  const automation = findMatch(automations, opts.text, opts.mediaId);
  if (!automation) {
    return { ok: false, result: { outcome: 'ignored', reason: 'nenhuma automação casou' } };
  }

  const claimed = await deps.claimDelivery(automation.id, opts.fromId, opts.commentId);
  if (!claimed) {
    return { ok: false, result: { outcome: 'duplicate', automationId: automation.id } };
  }

  if ((await deps.countRecentSent(account.id)) >= RATE_LIMIT_PER_HOUR) {
    await deps.markDelivery(
      automation.id,
      opts.fromId,
      'throttled',
      `limite de ${RATE_LIMIT_PER_HOUR} envios por hora atingido`,
    );
    return { ok: false, result: { outcome: 'throttled', automationId: automation.id } };
  }

  await deps.upsertContact(account.id, opts.fromId, opts.username);

  return { ok: true, account, automation };
}

async function processComment(
  event: CommentEvent,
  deps: ProcessDeps,
): Promise<ProcessResult> {
  const guards = await runGuards(
    {
      fromId: event.fromId,
      accountIgId: event.accountIgId,
      ignoredSelfReason: 'comentário da própria conta',
      trigger: 'comment',
      text: event.text,
      mediaId: event.mediaId,
      commentId: event.commentId,
      username: event.fromUsername,
    },
    deps,
  );
  if (!guards.ok) return guards.result;

  const { account, automation } = guards;
  const publicStep = automation.steps.find((s) => s.kind === 'public_reply');
  const dmStep = automation.steps.find((s) => s.kind === 'dm');

  return runSend(
    automation,
    event.fromId,
    async () => {
      if (publicStep && publicStep.variants.length > 0) {
        await deps.publicReply(
          event.commentId,
          deps.pick(publicStep.variants),
          account.accessToken,
        );
      }
      // Só a DM conta como "mensagem entregue": a resposta pública é
      // opcional (o editor deixa vazio de propósito), mas esta é uma
      // automação comentário→DM — sem a DM não houve entrega nenhuma.
      if (dmStep && dmStep.variants.length > 0) {
        await deps.privateReply(
          account.igUserId,
          event.commentId,
          deps.pick(dmStep.variants),
          dmStep.buttons,
          account.accessToken,
        );
        return 1;
      }
      return 0;
    },
    deps,
  );
}

// Continuação da conversa: a pessoa respondeu, e a resposta dela abriu a janela
// de 24h do Meta. É o único momento em que podemos mandar mais mensagens.
// Devolve null quando não há follow-up pendente, e aí o fluxo normal por
// palavra-chave assume.
async function tentarFollowUp(
  event: MessageEvent,
  account: { id: number; igUserId: string; accessToken: string },
  deps: ProcessDeps,
): Promise<ProcessResult | null> {
  const delivery = await deps.findSentDelivery(account.id, event.fromId);
  if (!delivery) return null;

  const automation = await deps.findAutomationById(delivery.automationId);
  if (!automation || automation.status !== 'published') return null;

  const enviados = await deps.sentFollowUps(delivery.id);
  const passo = nextFollowUp(automation, enviados);
  if (!passo) return null;

  if ((await deps.countRecentSent(account.id)) >= RATE_LIMIT_PER_HOUR) {
    return { outcome: 'throttled', automationId: automation.id };
  }

  const reservou = await deps.claimFollowUp(delivery.id, passo.position);
  if (!reservou) {
    // Claim perdido: outra invocação concorrente já está mandando este
    // follow-up agora. Devolver null aqui cairia no casamento por
    // palavra-chave e podia mandar uma segunda mensagem pela mesma pessoa —
    // por isso o outcome tem que ser duplicate, não null.
    return { outcome: 'duplicate', automationId: automation.id };
  }

  try {
    await deps.sendDm(
      account.igUserId,
      event.fromId,
      deps.pick(passo.variants.filter((v) => v.trim().length > 0)),
      passo.buttons,
      account.accessToken,
    );
    return { outcome: 'sent', automationId: automation.id };
  } catch (error) {
    await deps.releaseFollowUp(delivery.id, passo.position);
    return { outcome: 'error', automationId: automation.id, error: String(error) };
  }
}

async function processMessage(
  event: MessageEvent,
  deps: ProcessDeps,
): Promise<ProcessResult> {
  if (event.fromId === event.accountIgId) {
    return { outcome: 'ignored', reason: 'mensagem da própria conta' };
  }

  const account = await deps.findAccount(event.accountIgId);
  if (!account) return { outcome: 'ignored', reason: 'conta não conectada' };

  const followUp = await tentarFollowUp(event, account, deps);
  if (followUp) return followUp;

  const guards = await runGuards(
    {
      fromId: event.fromId,
      accountIgId: event.accountIgId,
      ignoredSelfReason: 'mensagem da própria conta',
      trigger: 'dm',
      text: event.text,
      mediaId: null,
      commentId: null,
      username: null,
    },
    deps,
  );
  if (!guards.ok) return guards.result;

  const { automation } = guards;
  const dmStep = automation.steps.find((s) => s.kind === 'dm');

  return runSend(
    automation,
    event.fromId,
    async () => {
      if (dmStep && dmStep.variants.length > 0) {
        await deps.sendDm(
          account.igUserId,
          event.fromId,
          deps.pick(dmStep.variants),
          dmStep.buttons,
          account.accessToken,
        );
        return 1;
      }
      return 0;
    },
    deps,
  );
}

export function processEvent(
  event: NormalizedEvent,
  deps: ProcessDeps,
): Promise<ProcessResult> {
  return event.kind === 'comment'
    ? processComment(event, deps)
    : processMessage(event, deps);
}
