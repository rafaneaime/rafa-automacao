import { describe, expect, it } from 'vitest';
import {
  INTEGRACOES,
  credencialPresente,
  estadoDaIntegracao,
} from '../src/lib/painel/saude';

describe('saúde da instalação', () => {
  it('toda integração explica o estrago sem repetir o nome da variável', () => {
    const nomesDeVariavel = [
      'DATABASE_URL',
      'PANEL_PASSWORD',
      'IG_APP_SECRET',
      'APP_URL',
      'HOTMART_HOTTOK',
      'CRON_SECRET',
    ];

    expect(INTEGRACOES).toHaveLength(7);
    for (const integracao of INTEGRACOES) {
      expect(integracao.nome.trim()).not.toBe('');
      expect(integracao.seFaltar.trim()).not.toBe('');
      for (const nome of nomesDeVariavel) {
        expect(integracao.seFaltar).not.toContain(nome);
      }
    }
  });

  it('não permite ids repetidos', () => {
    const ids = INTEGRACOES.map((integracao) => integracao.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('classifica presente, obrigatório ausente e opcional ausente', () => {
    const obrigatoria = INTEGRACOES.find((item) => item.id === 'banco');
    const opcional = INTEGRACOES.find((item) => item.id === 'hotmart');
    expect(obrigatoria).toBeDefined();
    expect(opcional).toBeDefined();
    expect(estadoDaIntegracao(obrigatoria!, true)).toBe('configurado');
    expect(estadoDaIntegracao(obrigatoria!, false)).toBe('faltando');
    expect(estadoDaIntegracao(opcional!, false)).toBe('opcional');
  });

  it('integração opcional ausente nunca vira faltando', () => {
    for (const integracao of INTEGRACOES.filter((item) => item.opcional)) {
      expect(estadoDaIntegracao(integracao, false)).toBe('opcional');
    }
  });

  it.each([
    [undefined, false],
    [null, false],
    ['', false],
    ['   ', false],
    ['valor-configurado', true],
    ['  valor-configurado  ', true],
  ])('considera %j presente = %j', (valor, esperado) => {
    expect(credencialPresente(valor)).toBe(esperado);
  });

  it('não carrega formatos de segredo nos textos', () => {
    const formatos = [
      /\bEAA[A-Za-z0-9]{20,}/,
      /\bsk-[A-Za-z0-9_-]{20,}/,
      /\bsk-ant-[A-Za-z0-9_-]{20,}/,
      /postgres(?:ql)?:\/\/[^\s'"]*:[^\s'"@]+@/,
      /\b(?:vercel|neon)_[A-Za-z0-9]{20,}/i,
    ];
    const textos = INTEGRACOES.flatMap((item) => [item.id, item.nome, item.seFaltar]);
    expect(textos.filter((texto) => formatos.some((formato) => formato.test(texto)))).toEqual([]);
  });
});
