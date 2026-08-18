import type { ProcessResult } from './process-event';

/**
 * Resume os resultados de processEvent numa única string pra persistir em
 * webhook_events.error. Antes, só outcome 'error' virava algo visível — os
 * outros (ignored/duplicate/throttled) eram descartados, e a tela de Logs
 * mostrava error = null pra eventos que na verdade foram ignorados de
 * propósito (conta não conectada, palavra-chave não bateu, etc.), fazendo o
 * texto "se aqui está vazio, o problema é o webhook" mentir.
 *
 * outcome 'sent' não entra aqui: já tem registro próprio na tabela
 * deliveries, e não é diagnóstico de nada errado.
 */
export function summarizeResults(results: ProcessResult[]): string | null {
  const lines = results
    .map((result) => {
      switch (result.outcome) {
        case 'error':
          return result.error;
        case 'ignored':
          return `ignorado: ${result.reason}`;
        case 'duplicate':
          return `duplicado: automação ${result.automationId}`;
        case 'throttled':
          return `limitado: automação ${result.automationId}`;
        case 'sent':
          return null;
      }
    })
    .filter((line): line is string => line !== null);

  return lines.length > 0 ? lines.join(' | ') : null;
}
