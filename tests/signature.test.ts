import { describe, it, expect } from 'vitest';
import { signBody, isValidSignature, isValidVerifyToken } from '@/lib/signature';

const SECRET = 'segredo-do-app';
const BODY = '{"object":"instagram","entry":[]}';

describe('signBody', () => {
  it('gera assinatura no formato sha256=<hex>', () => {
    expect(signBody(BODY, SECRET)).toMatch(/^sha256=[0-9a-f]{64}$/);
  });
});

describe('isValidSignature', () => {
  it('aceita assinatura correta', () => {
    expect(isValidSignature(BODY, signBody(BODY, SECRET), SECRET)).toBe(true);
  });

  it('rejeita assinatura de outro segredo', () => {
    expect(isValidSignature(BODY, signBody(BODY, 'outro'), SECRET)).toBe(false);
  });

  it('rejeita quando o corpo mudou', () => {
    const header = signBody(BODY, SECRET);
    expect(isValidSignature(BODY + ' ', header, SECRET)).toBe(false);
  });

  it('rejeita header ausente', () => {
    expect(isValidSignature(BODY, null, SECRET)).toBe(false);
  });

  it('rejeita header de tamanho diferente sem estourar', () => {
    expect(isValidSignature(BODY, 'sha256=abc', SECRET)).toBe(false);
  });
});

describe('isValidVerifyToken', () => {
  it('aceita token igual', () => {
    expect(isValidVerifyToken('abc123', 'abc123')).toBe(true);
  });

  it('rejeita token diferente', () => {
    expect(isValidVerifyToken('errado', 'abc123')).toBe(false);
  });

  it('rejeita nulo', () => {
    expect(isValidVerifyToken(null, 'abc123')).toBe(false);
  });
});
