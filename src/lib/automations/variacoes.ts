/**
 * Como um campo de texto vira variações de mensagem.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * Isto existe por causa de um defeito que aconteceu com gente de verdade.
 * ─────────────────────────────────────────────────────────────────────────
 *
 * A regra antiga era **uma variação por linha**. Alguém escreveu uma DM
 * normal, de três linhas:
 *
 *     Oiiiii!
 *     Aqui é a Amanda. Você comentou no meu post.
 *     É só clicar no botão abaixo para saber mais.
 *
 * O sistema guardou isso como **três variações** e, a cada disparo, sorteou
 * uma. Quem comentou recebeu só "Oiiiii!" e um botão. A pessoa seguinte
 * receberia só "Aqui é a Amanda…", sem contexto nenhum.
 *
 * Nada falhou: nenhum erro, nenhum log, a automação "funcionou". O rótulo
 * dizia "uma variação por linha" e o código cumpriu o rótulo à risca.
 *
 * O erro foi de desenho, e é sempre o mesmo: **a quebra de linha é o
 * caractere mais natural do mundo dentro de uma mensagem.** Usá-la como
 * separador entre mensagens obriga a pessoa a lembrar de uma regra
 * justamente quando está fazendo a coisa mais óbvia possível.
 *
 * A regra agora é **linha em branco separa variações**. Uma mensagem de
 * três linhas continua sendo uma mensagem de três linhas — que é o que
 * qualquer pessoa espera ao apertar Enter.
 */

/**
 * Quebra o texto do campo nas variações que ele contém.
 *
 * Linha em branco (ou várias) separa; quebra simples fica dentro da
 * mensagem. Espaço em volta de cada bloco sai; a quebra interna fica.
 */
export function separarVariacoes(texto: unknown): string[] {
  return String(texto ?? '')
    // \r\n antes de dividir: caixa de texto no Windows manda \r\n, e sem
    // normalizar o "\n\s*\n" não casaria do mesmo jeito nos dois sistemas.
    .replace(/\r\n?/g, '\n')
    .split(/\n[ \t]*\n+/)
    .map((bloco) => bloco.trim())
    .filter((bloco) => bloco.length > 0);
}

/**
 * O caminho de volta, para o editor mostrar o que está guardado.
 *
 * Precisa ser o inverso exato de `separarVariacoes`: se juntasse com uma
 * quebra só, reabrir e salvar transformaria duas variações numa mensagem de
 * duas linhas, em silêncio.
 */
export function juntarVariacoes(variacoes: readonly string[]): string {
  return variacoes.join('\n\n');
}

/**
 * Quantas variações o texto tem, para a tela poder dizer isso enquanto a
 * pessoa digita. É o que faltava: a regra existia e nada mostrava o efeito
 * dela até a mensagem já ter saído para alguém.
 */
export function contarVariacoes(texto: unknown): number {
  return separarVariacoes(texto).length;
}
