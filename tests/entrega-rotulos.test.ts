import { describe, expect, it } from 'vitest';
import {
  STATUS_DE_ENTREGA,
  TEXTOS_DOS_STATUS,
  desfechoDaEntrega,
  diagnosticoSemEntrega,
  normalizarBuscaPessoa,
} from '../src/lib/painel/entrega';

describe('desfechos de entrega', () => {
  it('todo status conhecido tem texto por extenso', () => {
    expect(STATUS_DE_ENTREGA).toEqual(['pending', 'sent', 'error', 'throttled']);
    for (const status of STATUS_DE_ENTREGA) {
      expect(TEXTOS_DOS_STATUS[status].trim()).not.toBe('');
      expect(TEXTOS_DOS_STATUS[status]).not.toBe(status);
    }
  });

  it('status desconhecido aparece cru sem derrubar o diagnóstico', () => {
    expect(desfechoDaEntrega('estado_novo', null)).toEqual({
      rotulo: 'estado_novo',
      detalhe: null,
    });
  });

  it('mantém a mensagem de erro inteira', () => {
    const erro = `Meta respondeu 400: ${'detalhe '.repeat(100)}`;
    expect(desfechoDaEntrega('error', erro)).toEqual({
      rotulo: 'Não enviada',
      detalhe: erro,
    });
  });
});

describe('busca por pessoa', () => {
  it.each([
    ['@Fulano', 'fulano'],
    ['Fulano', 'fulano'],
    ['  @fulano  ', 'fulano'],
    ['@9876543210', '9876543210'],
  ])('normaliza %j para %j', (entrada, esperado) => {
    expect(normalizarBuscaPessoa(entrada)).toBe(esperado);
  });
});

describe('interação sem entrega', () => {
  it('produz um único bloco com o fato e a ignorância registrada', () => {
    expect(diagnosticoSemEntrega(true, false)).toBe(
      'O sistema recebeu o comentário e não enviou DM. O motivo não ficou registrado.',
    );
  });

  it.each([
    [false, false],
    [false, true],
    [true, true],
  ])('não produz a frase para interação=%j e entrega=%j', (interacao, entrega) => {
    expect(diagnosticoSemEntrega(interacao, entrega)).toBeNull();
  });
});
