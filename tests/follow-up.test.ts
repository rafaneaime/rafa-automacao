import { describe, it, expect } from 'vitest';
import { nextFollowUp } from '@/lib/automations/follow-up';
import type { Automation, AutomationStep } from '@/lib/repo/types';

function passo(position: number, kind: AutomationStep['kind'], variants: string[]): AutomationStep {
  return { id: position, position, kind, variants, buttons: [] };
}

function automacao(steps: AutomationStep[]): Automation {
  return {
    id: 1,
    accountId: 1,
    name: 'Teste',
    status: 'published',
    triggerType: 'comment',
    mediaId: null,
    keywords: ['preco'],
    matchMode: 'contains',
    steps,
  };
}

describe('nextFollowUp', () => {
  it('devolve null quando a automação não tem follow-up', () => {
    const a = automacao([passo(0, 'public_reply', ['oi']), passo(1, 'dm', ['link'])]);
    expect(nextFollowUp(a, [])).toBeNull();
  });

  it('devolve o primeiro follow-up quando nada foi enviado', () => {
    const a = automacao([passo(1, 'dm', ['link']), passo(2, 'follow_up', ['e aí?'])]);
    expect(nextFollowUp(a, [])?.position).toBe(2);
  });

  it('pula os que já foram enviados', () => {
    const a = automacao([
      passo(2, 'follow_up', ['primeiro']),
      passo(3, 'follow_up', ['segundo']),
    ]);
    expect(nextFollowUp(a, [2])?.position).toBe(3);
  });

  it('devolve null quando todos já foram enviados', () => {
    const a = automacao([
      passo(2, 'follow_up', ['primeiro']),
      passo(3, 'follow_up', ['segundo']),
    ]);
    expect(nextFollowUp(a, [2, 3])).toBeNull();
  });

  it('respeita a ordem mesmo se os passos vierem embaralhados', () => {
    const a = automacao([
      passo(3, 'follow_up', ['segundo']),
      passo(2, 'follow_up', ['primeiro']),
    ]);
    expect(nextFollowUp(a, [])?.position).toBe(2);
  });

  it('ignora follow-up sem texto, em vez de enviar mensagem vazia', () => {
    const a = automacao([
      passo(2, 'follow_up', ['   ', '']),
      passo(3, 'follow_up', ['com texto']),
    ]);
    expect(nextFollowUp(a, [])?.position).toBe(3);
  });

  it('não confunde passo de DM com follow-up', () => {
    const a = automacao([passo(1, 'dm', ['a DM original'])]);
    expect(nextFollowUp(a, [])).toBeNull();
  });

  it('devolve só as variações com texto, descartando as vazias', () => {
    const a = automacao([passo(2, 'follow_up', ['', 'com texto', '   '])]);
    expect(nextFollowUp(a, [])?.variants).toEqual(['com texto']);
  });

  it('não altera a automação recebida', () => {
    const original = passo(2, 'follow_up', ['', 'com texto']);
    const a = automacao([original]);
    nextFollowUp(a, []);
    expect(original.variants).toEqual(['', 'com texto']);
  });
});
