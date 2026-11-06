import { after } from 'next/server';

/**
 * Faz o trabalho DEPOIS de a resposta já ter saído.
 *
 * Existe por um motivo medido, não por elegância.
 *
 * Até 06/11/2026 o webhook do Instagram fazia tudo dentro da requisição —
 * inclusive mandar a DM, que são várias idas à Meta. Nos dados de um painel
 * real, em 12 dias: quando o evento era ignorado, a resposta saía em 0,12s;
 * quando a automação disparava de verdade, levava de 4 a 7 SEGUNDOS, e o pior
 * caso bateu 30,8s. Só no dia 29/10 foram 252 eventos acima de 5s.
 *
 * A Meta espera resposta em torno de 5 segundos. Quem demora mais entra na
 * fila de reentrega e, se a coisa persistir por uma hora, ela CANCELA a
 * inscrição do aplicativo naquela conta — sem erro visível no painel de apps.
 * É o que explicava o sintoma que ninguém entendia: funciona com movimento
 * baixo, engasga na live e no story que viraliza, e volta sozinho depois. Na
 * live de 03/11 os comentários chegaram espaçados de 2 a 5 minutos, um a um:
 * a Meta recuando.
 *
 * Agora a resposta sai em seguida ao registro do evento, e o envio acontece
 * fora da requisição. A Meta vê um endereço rápido; o trabalho é o mesmo.
 *
 * **Degrada para o comportamento antigo, nunca some com o trabalho.** Fora de
 * uma requisição do Next — nos testes, num script, numa plataforma que não
 * suporte `after` — `after()` lança, e aí o trabalho roda aqui mesmo, antes da
 * resposta. Mais lento, igual ao que era: nunca silencioso.
 *
 * O trabalho adiado roda dentro da MESMA execução da função, e o teto de tempo
 * dela continua valendo: quem chama precisa declarar `maxDuration` suficiente,
 * senão a hospedagem corta no meio depois de a resposta já ter saído.
 */
export async function depois(trabalho: () => Promise<void>): Promise<void> {
  /*
   * O erro é engolido aqui dentro de propósito.
   *
   * Depois que a resposta saiu não existe ninguém para receber uma falha: uma
   * promessa rejeitada solta derruba o processo inteiro em Node e levaria
   * junto as outras entregas que estiverem em andamento. O lugar de aparecer é
   * o console da hospedagem — e o motivo de cada evento já é gravado em
   * `webhook_events`, que é onde a tela de Logs procura.
   */
  const protegido = async () => {
    try {
      await trabalho();
    } catch (erro) {
      console.error('depois: o trabalho pós-resposta falhou', erro);
    }
  };

  try {
    after(protegido);
  } catch {
    await protegido();
  }
}
