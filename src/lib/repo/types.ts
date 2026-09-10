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

/**
 * O que faz a automação disparar.
 *
 * `story_reply` é resposta de Story — que chega como mensagem direta, porque
 * Story não tem comentário. Ela existe separada de `dm` para que a pessoa possa
 * responder só quem veio do Story, sem pegar toda a caixa de entrada.
 */
export const GATILHOS = ['comment', 'dm', 'story_reply'] as const;

export type TipoDeGatilho = (typeof GATILHOS)[number];

export type Automation = {
  id: number;
  accountId: number;
  name: string;
  status: 'draft' | 'published';
  triggerType: TipoDeGatilho;
  mediaId: string | null;
  keywords: string[];
  matchMode: MatchMode;
  steps: AutomationStep[];
};

export type Contact = {
  id: number;
  igUserId: string;
  username: string | null;
  /**
   * O nome que a própria pessoa escreveu num formulário do site.
   *
   * Diferente de `username`, que é o arroba do Instagram: serve para achar a
   * pessoa, não para falar com ela. "Oi rosangelarodrigues8194" não é como se
   * começa uma mensagem.
   */
  nome: string | null;
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
