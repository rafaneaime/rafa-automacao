/**
 * Fiação do pipeline — versão do PRODUTO BASE.
 *
 * Este arquivo é exportado como `live-deps.ts` na base, via a substituição
 * declarada em `distribuicao.json`. Ver `ARCHITECTURE.md` §13.
 *
 * A diferença para a versão da Plataforma é uma só: lá, `sendDm` e
 * `privateReply` são embrulhados para trocar a URL do botão por um link
 * rastreado. Aqui o botão vai com o link fixo que a pessoa digitou.
 *
 * Mantenha os dois em sincronia. Qualquer dependência nova do pipeline precisa
 * entrar nos dois arquivos, senão a base quebra no build do aluno.
 */
import type { ProcessDeps } from './process-event';
import { findAccountByIgId } from './repo/accounts';
import { findPublishedAutomations, getAutomation } from './repo/automations';
import {
  claimDelivery,
  releaseDelivery,
  markDelivery,
  countRecentSent,
} from './repo/deliveries';
import { faltaUsername, gravarPerfilSeAusente, upsertContact } from './repo/contacts';
import { getPerfilDaConversa } from './meta/profile';
import { claimMessage, releaseMessage } from './repo/processed-messages';
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
  claimMessage,
  releaseMessage,
  upsertContact,
  // Uma consulta ao banco por mensagem, e uma à Meta só na primeira vez que
  // aquele contato aparece sem `@`.
  async completarPerfil(contactId, igUserId, token) {
    if (!(await faltaUsername(contactId))) return;
    await gravarPerfilSeAusente(contactId, await getPerfilDaConversa(igUserId, token));
  },
  // No-op de propósito. A tabela de eventos é da Plataforma e não existe na
  // instalação base; o pipeline chama isto do mesmo jeito nos dois lados, e é
  // isso que mantém process-event.ts idêntico. Ver ARCHITECTURE.md §13.
  registrarInteracao: async () => {},
  publicReply,
  // O fromIgId existe para a Plataforma saber de quem e a DM antes de
  // despachar. A base nao rastreia link, entao ignora e repassa o resto.
  privateReply: (accountIgId, commentId, _fromIgId, text, buttons, token) =>
    privateReply(accountIgId, commentId, text, buttons, token),
  // `sendDm` do Meta tem menos parâmetros do que a dependência declara, e isso
  // basta: aqui não existe link rastreado para carimbar com a automação.
  sendDm,
  findSentDelivery,
  findAutomationById: getAutomation,
  sentFollowUps,
  claimFollowUp,
  releaseFollowUp,
  // Resposta rotativa: sorteia entre as variações para não parecer robô.
  pick: (items) => items[Math.floor(Math.random() * items.length)],
};
