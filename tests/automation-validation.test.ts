import { describe, it, expect } from 'vitest';
import { validarPublicacao } from '@/lib/automations/validation';

const dmCheia = { kind: 'dm' as const, variants: ['oi'] };
const dmVazia = { kind: 'dm' as const, variants: [] };
const publicaCheia = { kind: 'public_reply' as const, variants: ['te chamei'] };
const publicaVazia = { kind: 'public_reply' as const, variants: [] };

describe('validarPublicacao', () => {
  it('aceita automação de comentário com DM preenchida', () => {
    expect(validarPublicacao('comment', [publicaCheia, dmCheia])).toBeNull();
  });

  it('aceita mesmo sem resposta pública, que é opcional', () => {
    expect(validarPublicacao('comment', [publicaVazia, dmCheia])).toBeNull();
  });

  it('recusa quando a DM está vazia', () => {
    expect(validarPublicacao('comment', [publicaCheia, dmVazia])).toBe(
      'A automação não tem texto de DM. Sem isso ela não envia nada.',
    );
  });

  it('recusa quando não existe passo de DM', () => {
    expect(validarPublicacao('comment', [publicaCheia])).toBe(
      'A automação não tem texto de DM. Sem isso ela não envia nada.',
    );
  });

  it('recusa gatilho de DM sem texto de DM', () => {
    expect(validarPublicacao('dm', [dmVazia])).toBe(
      'A automação não tem texto de DM. Sem isso ela não envia nada.',
    );
  });

  it('ignora variações em branco ao decidir', () => {
    const so_espaco = { kind: 'dm' as const, variants: ['   ', ''] };
    expect(validarPublicacao('comment', [so_espaco])).toBe(
      'A automação não tem texto de DM. Sem isso ela não envia nada.',
    );
  });
});
