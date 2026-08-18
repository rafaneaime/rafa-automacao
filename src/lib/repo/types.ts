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
  kind: 'public_reply' | 'dm';
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
};

export type WebhookEventLog = {
  id: number;
  receivedAt: Date;
  signatureValid: boolean;
  processedAt: Date | null;
  error: string | null;
};
