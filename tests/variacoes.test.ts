import { describe, expect, it } from 'vitest';
import {
  contarVariacoes,
  juntarVariacoes,
  separarVariacoes,
} from '../src/lib/automations/variacoes';

describe('separarVariacoes', () => {
  it('mantém uma mensagem de várias linhas como UMA variação', () => {
    // O caso que causou o defeito em produção: uma DM de três linhas virava
    // três variações, e o sistema sorteava uma. Quem comentou recebeu só
    // "Oiiiii!" e um botão.
    const dm = [
      'Oiiiii!',
      'Aqui é a Amanda. Você comentou no meu post.',
      'É só clicar no botão abaixo para saber mais.',
    ].join('\n');

    const variacoes = separarVariacoes(dm);

    expect(variacoes).toHaveLength(1);
    expect(variacoes[0]).toBe(dm);
  });

  it('separa em linha em branco', () => {
    expect(separarVariacoes('Oi!\nTudo bem?\n\nOlá!\nComo vai?')).toEqual([
      'Oi!\nTudo bem?',
      'Olá!\nComo vai?',
    ]);
  });

  it('trata várias linhas em branco seguidas como um separador só', () => {
    expect(separarVariacoes('um\n\n\n\ndois')).toEqual(['um', 'dois']);
  });

  it('trata linha só com espaço ou tab como linha em branco', () => {
    // Ninguém enxerga a diferença na tela, então ela não pode mudar o
    // resultado — senão duas variações viram uma por causa de um espaço.
    expect(separarVariacoes('um\n   \ndois')).toEqual(['um', 'dois']);
    expect(separarVariacoes('um\n\t\ndois')).toEqual(['um', 'dois']);
  });

  it('normaliza a quebra do Windows', () => {
    expect(separarVariacoes('um\r\n\r\ndois')).toEqual(['um', 'dois']);
    expect(separarVariacoes('linha um\r\nlinha dois')).toEqual([
      'linha um\nlinha dois',
    ]);
  });

  it('apara o espaço em volta, mas preserva a quebra de dentro', () => {
    expect(separarVariacoes('  Oi!\nTudo bem?  ')).toEqual(['Oi!\nTudo bem?']);
  });

  it('devolve lista vazia para o que não é mensagem', () => {
    for (const entrada of ['', '   ', '\n\n\n', null, undefined]) {
      expect(separarVariacoes(entrada)).toEqual([]);
    }
  });
});

describe('juntarVariacoes', () => {
  it('é o inverso exato de separar', () => {
    // Se não fosse, reabrir o editor e salvar transformaria duas variações
    // numa mensagem de duas linhas, em silêncio.
    const casos = [
      ['Oi!'],
      ['Oi!\nTudo bem?', 'Olá!'],
      ['linha um\nlinha dois\nlinha três'],
      ['a', 'b', 'c'],
    ];

    for (const variacoes of casos) {
      expect(separarVariacoes(juntarVariacoes(variacoes))).toEqual(variacoes);
    }
  });

  it('vazio dos dois lados', () => {
    expect(juntarVariacoes([])).toBe('');
    expect(separarVariacoes('')).toEqual([]);
  });
});

describe('contarVariacoes', () => {
  it('conta o que a tela vai mostrar enquanto a pessoa digita', () => {
    expect(contarVariacoes('')).toBe(0);
    expect(contarVariacoes('Oiiiii!\nAqui é a Amanda.\nClique abaixo.')).toBe(1);
    expect(contarVariacoes('Oi!\n\nOlá!\n\nE aí!')).toBe(3);
  });
});
