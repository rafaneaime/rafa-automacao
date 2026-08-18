import { describe, it, expect } from 'vitest';
import { normalize, matchesKeyword } from '@/lib/matching';

describe('normalize', () => {
  it('remove acentos e caixa', () => {
    expect(normalize('  PREÇO Já ')).toBe('preco ja');
  });
});

describe('matchesKeyword modo contains', () => {
  it('acha a palavra no meio da frase', () => {
    expect(matchesKeyword('quero o preço disso', ['preco'], 'contains')).toBe(true);
  });

  it('ignora acento e caixa dos dois lados', () => {
    expect(matchesKeyword('QUERO O PREÇO', ['Preço'], 'contains')).toBe(true);
  });

  it('rejeita quando não aparece', () => {
    expect(matchesKeyword('bom dia', ['preco'], 'contains')).toBe(false);
  });

  it('aceita se qualquer palavra da lista casar', () => {
    expect(matchesKeyword('manda o link', ['preco', 'link'], 'contains')).toBe(true);
  });
});

describe('matchesKeyword modo exact', () => {
  it('aceita comentário idêntico à palavra', () => {
    expect(matchesKeyword('  Preço ', ['preco'], 'exact')).toBe(true);
  });

  it('rejeita quando há mais texto em volta', () => {
    expect(matchesKeyword('qual o preço', ['preco'], 'exact')).toBe(false);
  });
});

describe('matchesKeyword modo any', () => {
  it('aceita qualquer comentário, mesmo sem palavras cadastradas', () => {
    expect(matchesKeyword('qualquer coisa', [], 'any')).toBe(true);
  });
});

describe('matchesKeyword casos de borda', () => {
  it('rejeita quando não há palavras e o modo exige palavra', () => {
    expect(matchesKeyword('oi', [], 'contains')).toBe(false);
  });

  it('ignora palavras vazias na lista', () => {
    expect(matchesKeyword('oi', ['', '  '], 'contains')).toBe(false);
  });
});
