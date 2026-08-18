import { describe, it, expect } from 'vitest';
import { summarizeResults } from '@/lib/webhook-summary';
import type { ProcessResult } from '@/lib/process-event';

describe('summarizeResults', () => {
  it('retorna null quando não há resultados', () => {
    expect(summarizeResults([])).toBeNull();
  });

  it('retorna null quando só há envios com sucesso', () => {
    const results: ProcessResult[] = [
      { outcome: 'sent', automationId: 1 },
      { outcome: 'sent', automationId: 2 },
    ];
    expect(summarizeResults(results)).toBeNull();
  });

  it('prefixa ignored com "ignorado"', () => {
    const results: ProcessResult[] = [
      { outcome: 'ignored', reason: 'nenhuma automação casou' },
    ];
    expect(summarizeResults(results)).toBe('ignorado: nenhuma automação casou');
  });

  it('prefixa duplicate com "duplicado" e o id da automação', () => {
    const results: ProcessResult[] = [{ outcome: 'duplicate', automationId: 7 }];
    expect(summarizeResults(results)).toBe('duplicado: automação 7');
  });

  it('prefixa throttled com "limitado" e o id da automação', () => {
    const results: ProcessResult[] = [{ outcome: 'throttled', automationId: 7 }];
    expect(summarizeResults(results)).toBe('limitado: automação 7');
  });

  it('mantém o formato atual de error, sem prefixo', () => {
    const results: ProcessResult[] = [
      { outcome: 'error', automationId: 3, error: 'Meta respondeu 400: token expirado' },
    ];
    expect(summarizeResults(results)).toBe('Meta respondeu 400: token expirado');
  });

  it('junta múltiplos outcomes com " | ", ignorando os sent', () => {
    const results: ProcessResult[] = [
      { outcome: 'sent', automationId: 1 },
      { outcome: 'ignored', reason: 'conta não conectada' },
      { outcome: 'duplicate', automationId: 7 },
      { outcome: 'error', automationId: 9, error: 'Erro #10' },
    ];
    expect(summarizeResults(results)).toBe(
      'ignorado: conta não conectada | duplicado: automação 7 | Erro #10',
    );
  });
});
