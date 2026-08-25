import type { MatchMode } from '../matching';
import type { Button } from '../meta/messaging';

export type Account = {
  id: number;
  igUserId: string;
  username: string | null;
  accessToken: string;
  tokenExpiresAt: Date | null;
};

export type AutomationStep = {
  id: number;
  position: number;
  kind: 'public_reply' | 'dm' | 'follow_up';
  variants: string[];
  buttons: Button[];
};

export type Automation = {
  id: number;
  accountId: number;
  name: string;
  status: 'draft' | 'published';
  triggerType: 'comment' | 'dm';
  mediaId: string | null;
  keywords: string[];
  matchMode: MatchMode;
  steps: AutomationStep[];
};

export type Contact = {
  id: number;
  igUserId: string;
  username: string | null;
  firstSeenAt: Date;
  lastSeenAt: Date;
};

export type DeliveryLog = {
  id: number;
  automationName: string;
  igUserId: string;
  status: string;
  error: string | null;
  createdAt: Date;
  kind: 'dm' | 'follow_up';
  /**
   * O número mostrado na etiqueta ("continuação 1"), contando a partir de 1 —
   * NÃO a coluna `position` de follow_ups_sent, que vale 2 e 3 porque 0 e 1
   * são a resposta pública e a DM. Tem nome próprio de propósito: passar este
   * valor para claimFollowUp ou nextFollowUp acerta o passo errado.
   */
  continuacao: number | null;
};

export type WebhookEventLog = {
  id: number;
  receivedAt: Date;
  signatureValid: boolean;
  processedAt: Date | null;
  error: string | null;
};
