import { describe, expect, it } from 'vitest';
import { janelaObservada } from '../src/lib/painel/janela-observada';

/*
 * O tempo em que uma contagem foi medida, dito em palavras.
 *
 * O aviso "chega comentário e não chega mensagem" usava a janela da consulta,
 * 30 dias, como se fosse o tempo observado. Em 26/11/2026 um painel instalado
 * de manhã disparou o aviso com poucas horas de banco, e a investigação foi
 * atrás de uma chave do Instagram que estava certa.
 *
 * O que se mede aqui é a frase, porque era a frase que mentia.
 */

const AGORA = new Date('2026-11-26T18:00:00-03:00');
const atras = (horas: number) => new Date(AGORA.getTime() - horas * 3_600_000);

describe('a janela observada', () => {
  it('em painel de poucas horas, diz horas e nunca dias', () => {
    const frase = janelaObservada(atras(4), AGORA);

    expect(frase).toBe('nas últimas 4 horas');
    expect(frase).not.toContain('dias');
  });

  it('com um mês de banco, diz os dias que tem', () => {
    expect(janelaObservada(atras(30 * 24), AGORA)).toBe('nos últimos 30 dias');
  });

  it('na primeira hora, fala no singular', () => {
    expect(janelaObservada(atras(1), AGORA)).toBe('na última hora');
  });

  it('entre um e dois dias, diz ontem em vez de "1 dias"', () => {
    const frase = janelaObservada(atras(30), AGORA);

    expect(frase).toBe('desde ontem');
    expect(frase).not.toContain('1 dias');
  });

  /*
   * Sem aviso guardado não há janela, e inventar uma seria repetir o defeito
   * que esta função existe para corrigir.
   */
  it('sem nenhum aviso guardado, não afirma tempo nenhum', () => {
    const frase = janelaObservada(null, AGORA);

    expect(frase).toBe('desde que este painel começou a receber avisos');
    expect(frase).not.toMatch(/\d/);
  });

  /*
   * Relógio do servidor e do banco não são o mesmo relógio. Um instante no
   * futuro viraria "nas últimas -1 horas" e faria a pessoa duvidar do quadro
   * inteiro, que é justo a tela em que ela está confiando para investigar.
   */
  it('com data no futuro, cai na frase genérica em vez de número negativo', () => {
    const frase = janelaObservada(new Date(AGORA.getTime() + 3_600_000), AGORA);

    expect(frase).toBe('desde que este painel começou a receber avisos');
    expect(frase).not.toContain('-');
  });

  it('com data inválida, não quebra nem afirma tempo', () => {
    expect(janelaObservada(new Date('nada disso'), AGORA)).toBe(
      'desde que este painel começou a receber avisos',
    );
  });
});
