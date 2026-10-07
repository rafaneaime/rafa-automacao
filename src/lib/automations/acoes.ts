/**
 * O que um botão de ação pede ao sistema.
 *
 * Botão com endereço leva a pessoa para fora e nunca volta a falar com a gente.
 * Botão de ação faz o contrário: o clique vem para cá como evento, e é o que
 * permite perguntar de novo se ela já seguiu — sem obrigá-la a digitar.
 *
 * O valor viaja dentro do payload que a Meta devolve no clique, então mudar
 * este texto quebra os botões que já estão em conversas abertas. Ele é
 * identificador, não rótulo: o que a pessoa lê é o título do botão.
 */
export const ACAO_CONFERIR_SEGUIR = 'conferir_seguir';

export function ehConferirSeguir(acao: string | null | undefined): boolean {
  return acao === ACAO_CONFERIR_SEGUIR;
}
