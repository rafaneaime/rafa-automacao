import { describe, expect, it } from 'vitest';
import { aplicarVariaveis, comoChamar } from '@/lib/automations/variaveis';

describe('aplicarVariaveis', () => {
  const ana = { nome: 'Ana Paula Silva', usuario: 'anasilvaa.digital' };

  it('troca o marcador do ManyChat, que é como as pessoas escrevem', () => {
    expect(aplicarVariaveis('Olá {name} tudo bem?', ana)).toBe('Olá Ana tudo bem?');
  });

  it('aceita as grafias que alguém vai tentar', () => {
    for (const marcador of ['{nome}', '{{nome}}', '{{name}}', '{ nome }', '{NOME}', '{first_name}']) {
      expect(aplicarVariaveis(`Oi ${marcador}!`, ana)).toBe('Oi Ana!');
    }
  });

  it('usa só o primeiro nome: ninguém chama pelo nome completo', () => {
    expect(aplicarVariaveis('{nome}, olha isso', ana)).toBe('Ana, olha isso');
  });

  it('cai para o arroba quando o Instagram não conta o nome', () => {
    expect(aplicarVariaveis('Olá {nome}!', { nome: null, usuario: 'fulana' })).toBe('Olá fulana!');
  });

  /*
   * O caso que estragou uma DM de verdade: sem nome, o marcador tem que sumir
   * inteiro. "Olá  tudo bem?" com dois espaços denuncia o buraco tanto quanto
   * "{name}" escrito.
   */
  it('sem nome nenhum, o marcador some e a frase continua de pé', () => {
    expect(aplicarVariaveis('Olá {name} tudo bem?', {})).toBe('Olá tudo bem?');
  });

  it('leva a vírgula órfã junto', () => {
    expect(aplicarVariaveis('Olá, {nome}! Segue o material', {})).toBe('Olá! Segue o material');
  });

  it('texto sem marcador nenhum sai igualzinho', () => {
    const texto = 'Oi! Segue o link do material 👇';
    expect(aplicarVariaveis(texto, {})).toBe(texto);
    expect(aplicarVariaveis(texto, ana)).toBe(texto);
  });

  it('não mexe em chaves que não são marcador', () => {
    expect(aplicarVariaveis('Use o cupom {DESCONTO10}', ana)).toBe('Use o cupom {DESCONTO10}');
  });

  it('troca todas as aparições, não só a primeira', () => {
    expect(aplicarVariaveis('{nome}, {nome}, {nome}', ana)).toBe('Ana, Ana, Ana');
  });

  it('as quebras de linha da mensagem ficam', () => {
    expect(aplicarVariaveis('Olá {nome}\n\nSegue o link', ana)).toBe('Olá Ana\n\nSegue o link');
  });
});

describe('comoChamar', () => {
  it('nome na frente do arroba', () => {
    expect(comoChamar({ nome: 'Ana Paula', usuario: 'ana' })).toBe('Ana');
    expect(comoChamar({ nome: null, usuario: 'ana' })).toBe('ana');
    expect(comoChamar({})).toBe(null);
  });

  it('nome só com espaço não vale como nome', () => {
    expect(comoChamar({ nome: '   ', usuario: 'ana' })).toBe('ana');
  });
});

describe('o texto da pessoa não é mexido', () => {
  /*
   * Uma versão anterior normalizava espaço antes de pontuação e transformava
   * "até logo :)" em "até logo:)". Arrumava um buraco que ela mesma não tinha
   * feito, em texto escrito de propósito.
   */
  it('não come o espaço do emoticon', () => {
    expect(aplicarVariaveis('me segue primeiro :)', {})).toBe('me segue primeiro :)');
    expect(aplicarVariaveis('valeu {nome} ;)', {})).toBe('valeu ;)');
  });

  it('não mexe em espaço duplo que a pessoa escreveu', () => {
    expect(aplicarVariaveis('Olá!  Segue o link', {})).toBe('Olá!  Segue o link');
  });

  it('preserva o resto da frase quando o marcador sai do meio', () => {
    expect(aplicarVariaveis('oi {nome}, tudo certo? :D', {})).toBe('oi, tudo certo? :D');
  });
});
