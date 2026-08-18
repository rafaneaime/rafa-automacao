import { describe, it, expect } from 'vitest';
import { escolherToken } from '@/lib/token-source';

describe('escolherToken', () => {
  it('prefere o token colado no painel', () => {
    expect(escolherToken('colado', 'do-env')).toBe('colado');
  });

  it('cai para a variável de ambiente quando nada foi colado', () => {
    expect(escolherToken(undefined, 'do-env')).toBe('do-env');
  });

  it('ignora token colado só com espaços', () => {
    expect(escolherToken('   ', 'do-env')).toBe('do-env');
  });

  it('remove espaços das pontas do token colado', () => {
    expect(escolherToken('  colado  ', 'do-env')).toBe('colado');
  });

  it('devolve null quando não há token em lugar nenhum', () => {
    expect(escolherToken(undefined, '')).toBeNull();
  });
});
