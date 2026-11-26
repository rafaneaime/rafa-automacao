import { describe, expect, it } from 'vitest';
import { contaDoAviso, contasDoAviso } from '../src/lib/painel/conta-do-aviso';
import { CONTA_NAO_CONECTADA } from '../src/lib/process-event';
import { summarizeResults } from '../src/lib/webhook-summary';

/*
 * De qual conta era o aviso recusado — e, acima de tudo, quando NÃO dizer.
 *
 * A frase "ignorado: conta não conectada" custou um dia de investigação em
 * 24/11/2026 por não dizer de quem era o aviso. O conserto é dizer; o risco do
 * conserto é dizer errado, porque a saída que ele indica é religar a conta do
 * Instagram de outra pessoa.
 */

const MINHA = '17841400000000000';
const OUTRA = '17841499999999999';

/** Um aviso de comentário como o Meta entrega, com o `entry[].id` da conta. */
function aviso(contaId: string | number | null): string {
  const entrada: Record<string, unknown> = { time: 1795466453, changes: [] };
  if (contaId !== null) entrada.id = contaId;
  return JSON.stringify({ object: 'instagram', entry: [entrada] });
}

/** O erro como ele FICA GRAVADO, montado pelo próprio compositor do produto. */
function recusadoPorConta(...outros: string[]): string {
  const texto = summarizeResults([
    { outcome: 'ignored', reason: CONTA_NAO_CONECTADA },
    ...outros.map((reason) => ({ outcome: 'ignored' as const, reason })),
  ]);
  if (texto === null) throw new Error('o compositor não gravou motivo nenhum');
  return texto;
}

describe('qual conta chegou no aviso', () => {
  it('lê o identificador da conta do payload cru', () => {
    expect(contasDoAviso(aviso(MINHA))).toEqual([MINHA]);
  });

  it('lê também quando o Meta manda o identificador como número', () => {
    expect(contasDoAviso(aviso(17841400000000000))).toEqual(['17841400000000000']);
  });

  it('não repete a mesma conta que veio em duas entradas', () => {
    const bruto = JSON.stringify({ entry: [{ id: MINHA }, { id: MINHA }] });
    expect(contasDoAviso(bruto)).toEqual([MINHA]);
  });

  it('devolve lista vazia quando o guardado não é JSON', () => {
    expect(contasDoAviso('<html>erro da Vercel</html>')).toEqual([]);
  });

  it('devolve lista vazia quando não há entrada nenhuma', () => {
    expect(contasDoAviso(JSON.stringify({ object: 'instagram' }))).toEqual([]);
    expect(contasDoAviso(aviso(null))).toEqual([]);
  });
});

describe('o aviso recusado por conta', () => {
  it('nomeia a conta que chegou e a que está conectada', () => {
    expect(contaDoAviso({ raw: aviso(OUTRA), error: recusadoPorConta() }, MINHA))
      .toEqual({ tipo: 'outra-conta', chegou: OUTRA, conectada: MINHA });
  });

  /*
   * O motivo não chega sozinho: um aviso traz vários resultados, e o produto
   * grava os dois lados juntos. Medir a frase crua faria o reconhecimento passar
   * no teste e falhar no painel.
   */
  it('reconhece o motivo mesmo acompanhado de outros na mesma linha', () => {
    const erro = recusadoPorConta('nenhuma automação casou');
    expect(erro).toContain(' | ');
    expect(contaDoAviso({ raw: aviso(OUTRA), error: erro }, MINHA)?.tipo).toBe('outra-conta');
  });

  it('diz que não há conta conectada quando não há', () => {
    for (const vazia of [null, undefined, '', '   ']) {
      expect(contaDoAviso({ raw: aviso(OUTRA), error: recusadoPorConta() }, vazia))
        .toEqual({ tipo: 'sem-conta-conectada', chegou: OUTRA });
    }
  });
});

/*
 * O aviso de exemplo do portal da Meta vem com a conta `0`.
 *
 * Em 24/11/2026 duas instalações novas, a da Adriana e a do Rafael Rodrigues,
 * tinham esse teste como ÚNICO aviso na lista. A tela leu o `0` como conta de
 * verdade, disse que era de outra conta e mandou conectar a conta de novo. Quem
 * leu gerou token novo atrás de um problema que não existia.
 */
describe('o aviso de exemplo do portal', () => {
  it('não é conta trocada: é o teste do portal', () => {
    expect(contaDoAviso({ raw: aviso('0'), error: recusadoPorConta() }, MINHA))
      .toEqual({ tipo: 'teste-do-portal' });
  });

  it('continua sendo o teste do portal quando o Meta manda o zero como número', () => {
    expect(contaDoAviso({ raw: aviso(0), error: recusadoPorConta() }, MINHA))
      .toEqual({ tipo: 'teste-do-portal' });
  });

  /*
   * Sem conta conectada o teste do portal é o mesmo teste do portal. Dizer
   * "este aviso era para a conta 0" seria nomear uma conta que não existe.
   */
  it('não vira "sem conta conectada" quando não há conta nenhuma aqui', () => {
    for (const vazia of [null, undefined, '', '   ']) {
      expect(contaDoAviso({ raw: aviso('0'), error: recusadoPorConta() }, vazia))
        .toEqual({ tipo: 'teste-do-portal' });
    }
  });

  /*
   * A medida é "só zeros", e não a letra `0` exata, porque o que torna o
   * identificador impossível é ser zero, não ter uma casa. E não cala conta
   * legítima: identificador do Instagram não começa com zero.
   */
  it('reconhece o zero com mais de uma casa e não cala conta de verdade', () => {
    expect(contaDoAviso({ raw: aviso('00'), error: recusadoPorConta() }, MINHA))
      .toEqual({ tipo: 'teste-do-portal' });
    expect(contaDoAviso({ raw: aviso(OUTRA), error: recusadoPorConta() }, MINHA))
      .toEqual({ tipo: 'outra-conta', chegou: OUTRA, conectada: MINHA });
  });
});

describe('quando a tela tem de calar', () => {
  it('cala no aviso que não foi recusado por conta', () => {
    expect(contaDoAviso({ raw: aviso(OUTRA), error: null }, MINHA)).toBeNull();
    expect(contaDoAviso({ raw: aviso(OUTRA), error: 'ignorado: nenhuma automação casou' }, MINHA))
      .toBeNull();
    expect(contaDoAviso({ raw: aviso(OUTRA), error: 'ignorado: comentário da própria conta' }, MINHA))
      .toBeNull();
  });

  /*
   * O caso da própria instalação 19: o aviso de exemplo da Meta pode vir sem
   * identificador de conta nenhum. Sem ele não há nada a nomear, e inventar
   * manda religar uma conta à toa.
   */
  it('cala quando o aviso não diz para qual conta era', () => {
    expect(contaDoAviso({ raw: aviso(null), error: recusadoPorConta() }, MINHA)).toBeNull();
    expect(contaDoAviso({ raw: 'nem JSON', error: recusadoPorConta() }, MINHA)).toBeNull();
  });

  it('cala quando chegou mais de uma conta, porque escolher é inventar', () => {
    const bruto = JSON.stringify({ entry: [{ id: OUTRA }, { id: '17841477777777777' }] });
    expect(contaDoAviso({ raw: bruto, error: recusadoPorConta() }, MINHA)).toBeNull();
  });

  /*
   * O aviso era para a conta que está aqui, e ainda assim foi recusado por
   * conta: a causa é outra (procura feita por outro identificador, conta
   * removida no meio). Mandar religar seria mandar consertar o que está certo.
   */
  it('cala quando a conta que chegou é a conectada', () => {
    expect(contaDoAviso({ raw: aviso(MINHA), error: recusadoPorConta() }, MINHA)).toBeNull();
    expect(contaDoAviso({ raw: aviso(MINHA), error: recusadoPorConta() }, ` ${MINHA} `)).toBeNull();
  });
});
