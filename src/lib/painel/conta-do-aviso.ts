/**
 * De qual conta era o aviso que este painel recusou.
 *
 * A tela de Logs dizia "ignorado: conta não conectada" e parava aí. A frase é
 * verdadeira e não serve para nada: quem lê não tem como saber se o aviso veio
 * para OUTRA conta (e aí o conserto é religar a conta certa) ou se veio para a
 * conta dela com o identificador que o painel guardou diferente do que a Meta
 * manda (o mesmo conserto, por outro motivo) — ou se é outra coisa.
 *
 * EM 24/11/2026 ISSO CUSTOU UM DIA. Uma instalação de verdade clicou em
 * "Testar" no portal da Meta, o aviso de exemplo chegou, a tela disse
 * "ignorado: conta não conectada", e dali não se concluía nada: o aviso de
 * exemplo da Meta vem de uma conta inventada, e ninguém no painel sabia dizer
 * se o identificador que chegou era o dela. O dado estava guardado em
 * `webhook_events.raw` desde sempre. Só não era contado.
 *
 * A REGRA AQUI É CALAR QUANDO NÃO SE SABE. Acusar conta trocada sem ter os dois
 * identificadores manda religar uma conta que já está certa, e quem religa à
 * toa gera token novo na conta de outra pessoa.
 */
import { CONTA_NAO_CONECTADA } from '../process-event';

export type ContaDoAviso =
  /** Chegou para uma conta, e a conectada aqui é outra. */
  | { tipo: 'outra-conta'; chegou: string; conectada: string }
  /** Chegou para uma conta, e este painel não tem conta conectada nenhuma. */
  | { tipo: 'sem-conta-conectada'; chegou: string }
  /** Não chegou para conta nenhuma: é o aviso de exemplo do portal da Meta. */
  | { tipo: 'teste-do-portal' }
  | null;

/**
 * O aviso de exemplo que o botão Testar do portal da Meta manda vem com a conta
 * `0` no lugar do identificador. Zero não é conta de ninguém.
 *
 * EM 24/11/2026 ISSO MANDOU DUAS INSTALAÇÕES NOVAS CONSERTAREM O QUE ESTAVA
 * CERTO. O único aviso que havia chegado era esse teste, a tela leu o `0` como
 * conta de verdade e escreveu "este aviso era para a conta 0, e a conta
 * conectada neste painel é outra: conecte a conta de novo". Quem leu gerou
 * token novo atrás de um problema que não existia.
 *
 * Medimos todos os zeros, e não a letra `0` exata: nenhum identificador de
 * conta do Instagram é só zero, então isto não cala nenhum caso legítimo.
 */
function soZeros(id: string): boolean {
  return /^0+$/.test(id);
}

/**
 * Os identificadores de conta que vieram no aviso, sem repetir.
 *
 * É o `entry[].id` do Meta: a conta que RECEBEU o comentário ou a mensagem.
 * Lido do payload cru, e não do evento já interpretado, de propósito — um
 * aviso de tipo que este painel não sabe ler (`comments` de live, menção, o que
 * a Meta inventar amanhã) não vira evento nenhum, e ainda assim diz para qual
 * conta foi. É justamente nesses que a pergunta "de quem era?" aparece.
 *
 * O payload chega CORTADO em 4.000 letras na tela (ver `listRecentEvents`), e
 * cortado ele não é mais JSON: a leitura falha e esta função devolve lista
 * vazia, que é silêncio. É o lado certo para errar — um aviso de comentário
 * tem algumas centenas de letras, e quem passa de quatro mil é mensagem com
 * anexo, onde esta frase não é o que se está procurando.
 */
export function contasDoAviso(raw: string | null | undefined): string[] {
  if (!raw) return [];

  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return [];
  }
  if (typeof payload !== 'object' || payload === null) return [];
  const entradas = (payload as { entry?: unknown }).entry;
  if (!Array.isArray(entradas)) return [];

  const ids = entradas.flatMap((entrada) => {
    if (typeof entrada !== 'object' || entrada === null) return [];
    const id = (entrada as { id?: unknown }).id;
    if (typeof id === 'string' && id.trim() !== '') return [id.trim()];
    if (typeof id === 'number' && Number.isFinite(id)) return [String(id)];
    return [];
  });

  return [...new Set(ids)];
}

/**
 * O aviso recusado por conta: para quem ele era, e quem está conectado aqui.
 *
 * Devolve `null` em tudo que não dá para afirmar:
 *
 *   - o aviso não foi recusado por conta (foi entregue, ou recusado por outro
 *     motivo): não é assunto desta frase;
 *   - o payload não traz identificador de conta nenhum: nada a nomear;
 *   - traz MAIS DE UM: a frase teria de escolher um, e escolher é inventar;
 *   - o identificador que chegou é o mesmo que está conectado: aí a recusa tem
 *     outra causa, e mandar religar a conta seria mandar consertar o que está
 *     certo.
 *
 * E devolve `teste-do-portal`, que não é conta nenhuma, quando o identificador
 * é só zero: o aviso de exemplo do portal da Meta. Aí há o que dizer, e não é
 * sobre conta trocada.
 */
export function contaDoAviso(
  evento: { raw: string | null | undefined; error: string | null | undefined },
  conectada: string | null | undefined,
): ContaDoAviso {
  if (!evento.error?.includes(CONTA_NAO_CONECTADA)) return null;

  const chegaram = contasDoAviso(evento.raw);
  if (chegaram.length !== 1) return null;
  const chegou = chegaram[0]!;

  /*
    Antes de qualquer comparação: o teste do portal não é assunto de conta
    trocada. Comparar o `0` com a conta conectada daria sempre "são
    diferentes", que é verdade e é a conclusão errada.
  */
  if (soZeros(chegou)) return { tipo: 'teste-do-portal' };

  const minha = (conectada ?? '').trim();
  if (minha === '') return { tipo: 'sem-conta-conectada', chegou };
  if (minha === chegou) return null;

  return { tipo: 'outra-conta', chegou, conectada: minha };
}
