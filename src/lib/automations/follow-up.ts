import type { Automation, AutomationStep } from '../repo/types';

// Qual mensagem de sequência esta pessoa deve receber agora, ou null se não há
// nenhuma pendente. Passo sem texto é pulado: enviar mensagem vazia gastaria a
// reserva e não entregaria nada.
export function nextFollowUp(
  automation: Automation,
  alreadySent: number[],
): AutomationStep | null {
  const passo = automation.steps
    .filter((s) => s.kind === 'follow_up')
    .filter((s) => s.variants.some((v) => v.trim().length > 0))
    .sort((a, b) => a.position - b.position)
    .find((s) => !alreadySent.includes(s.position));

  if (!passo) return null;

  // Devolve só as variações com texto. Quem chama sorteia uma delas, e sortear
  // uma vazia gastaria a reserva sem enviar nada — a pessoa ficaria marcada
  // como tendo recebido uma mensagem que nunca existiu.
  return { ...passo, variants: passo.variants.filter((v) => v.trim().length > 0) };
}
