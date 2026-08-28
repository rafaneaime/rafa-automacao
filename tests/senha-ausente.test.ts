import { afterEach, describe, expect, it } from 'vitest';
import { checkPassword, temSenhaConfigurada } from '../src/lib/auth';

const ORIGINAL = process.env.PANEL_PASSWORD;

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.PANEL_PASSWORD;
  else process.env.PANEL_PASSWORD = ORIGINAL;
});

describe('painel sem senha configurada', () => {
  it('reconhece ausente, vazia e só com espaço', () => {
    delete process.env.PANEL_PASSWORD;
    expect(temSenhaConfigurada()).toBe(false);

    for (const valor of ['', '   ', '\t']) {
      process.env.PANEL_PASSWORD = valor;
      expect(temSenhaConfigurada()).toBe(false);
    }
  });

  it('recusa qualquer tentativa em vez de lançar', () => {
    // Antes, `checkPassword` chamava `env.panelPassword()`, que lança quando a
    // variável não existe: o login respondia com erro e a pessoa não tinha
    // como saber por quê.
    delete process.env.PANEL_PASSWORD;

    for (const tentativa of ['', 'qualquer', 'undefined', 'null']) {
      expect(() => checkPassword(tentativa)).not.toThrow();
      expect(checkPassword(tentativa)).toBe(false);
    }
  });

  it('string vazia na variável não abre o painel', () => {
    // O caso que abriria a porta: senha vazia configurada e alguém mandando
    // string vazia. As duas viram "sem senha", e sem senha ninguém entra.
    process.env.PANEL_PASSWORD = '';
    expect(checkPassword('')).toBe(false);
  });

  it('com senha configurada, continua funcionando como antes', () => {
    process.env.PANEL_PASSWORD = 'senha-de-teste';
    expect(temSenhaConfigurada()).toBe(true);
    expect(checkPassword('senha-de-teste')).toBe(true);
    expect(checkPassword('outra')).toBe(false);
  });
});
