/**
 * Em quanto tempo uma contagem do painel foi medida, dito em palavras.
 *
 * A tela de Logs avisava "Nos últimos 30 dias entraram comentários, e nenhuma
 * mensagem de ninguém" usando uma consulta de janela fixa de 30 dias. Num
 * painel instalado de manhã, isso é uma afirmação sobre 30 dias que ninguém
 * observou: o banco tem horas de vida, e "nenhuma mensagem ainda" é o
 * esperado, não um defeito.
 *
 * Em 26/11/2026 uma instalação de poucas horas disparou esse aviso, e a
 * investigação foi atrás de uma chave do Instagram que estava certa o tempo
 * todo. O número estava certo; a janela que a frase alegava é que não existia.
 *
 * Então aqui não há limiar nenhum, de propósito. Nada é escondido e nada é
 * suavizado: a tela diz o tempo de verdade em que mediu, e quem lê decide o
 * peso. "Nas últimas 4 horas" e "nos últimos 30 dias" são a mesma contagem
 * com significados opostos, e essa diferença é do leitor, não nossa.
 *
 * @param desde  o aviso mais antigo guardado na janela, ou null quando o
 *               painel ainda não guardou nenhum.
 * @param agora  o instante da leitura, recebido para a função ser pura.
 */
export function janelaObservada(desde: Date | null, agora: Date): string {
  const GENERICA = 'desde que este painel começou a receber avisos';
  if (!desde || Number.isNaN(desde.getTime())) return GENERICA;

  const ms = agora.getTime() - desde.getTime();
  /*
   * Futuro ou instante zero cai na frase genérica em vez de virar "nas últimas
   * 0 horas". Relógio de servidor e de banco não são o mesmo relógio, e um
   * número negativo na tela faria a pessoa duvidar do resto do quadro.
   */
  if (ms <= 0) return GENERICA;

  const horas = Math.floor(ms / 3_600_000);
  if (horas < 2) return 'na última hora';
  if (horas < 24) return `nas últimas ${horas} horas`;
  if (horas < 48) return 'desde ontem';

  return `nos últimos ${Math.floor(horas / 24)} dias`;
}
