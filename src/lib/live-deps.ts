import type { ProcessDeps } from './process-event';
import { findAccountByIgId } from './repo/accounts';
import { findPublishedAutomations, getAutomation } from './repo/automations';
import {
  claimDelivery,
  releaseDelivery,
  markDelivery,
  countRecentSent,
} from './repo/deliveries';
import { upsertContact } from './repo/contacts';
import { publicReply, privateReply, sendDm } from './meta/messaging';
import {
  findSentDelivery,
  sentFollowUps,
  claimFollowUp,
  releaseFollowUp,
} from './repo/follow-ups';

export const liveDeps: ProcessDeps = {
  async findAccount(igUserId) {
    const account = await findAccountByIgId(igUserId);
    if (!account) return null;
    return {
      id: account.id,
      igUserId: account.igUserId,
      accessToken: account.accessToken,
    };
  },
  findPublishedAutomations,
  claimDelivery,
  releaseDelivery,
  markDelivery,
  countRecentSent,
  upsertContact,
  publicReply,
  privateReply,
  sendDm,
  findSentDelivery,
  findAutomationById: getAutomation,
  sentFollowUps,
  claimFollowUp,
  releaseFollowUp,
  // Resposta rotativa: sorteia entre as variações para não parecer robô.
  pick: (items) => items[Math.floor(Math.random() * items.length)],
};
