/**
 * A "ocasião" de uma entrega: uma automação, uma pessoa, uma vez.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * Isto existe por causa de um defeito que custou vendas, em silêncio.
 * ─────────────────────────────────────────────────────────────────────────
 *
 * A trava era `unique (automation_id, ig_user_id)`: **uma entrega por pessoa,
 * por automação, para sempre.** Ela foi escrita para impedir duas DMs pelo
 * mesmo comentário — reentrega do webhook do Meta, ou alguém comentando cinco
 * vezes seguidas no mesmo post. Faz isso muito bem.
 *
 * Mas ela também impedia a segunda DM pela **segunda vez que a pessoa
 * comentou**, semanas depois, em outro post. E essas são coisas diferentes:
 * a segunda é a pessoa recorrente, que já demonstrou interesse antes, e é a
 * mais valiosa da base.
 *
 * Achado em produção com nome e data: `dududrumond` e `eusoualinecamacho`
 * comentaram de novo em 27/08 e não receberam nada, porque tinham recebido
 * aquela mesma automação em **18/08**. `brunaregina932`, que comentava pela
 * primeira vez, recebeu normalmente. Nenhum erro, nenhum log: a automação
 * "funcionou" e simplesmente não mandou.
 *
 * Nada disso aparecia porque as automações do Rafa não têm `media_id` — elas
 * valem para qualquer post. Uma automação por post esconderia o problema; uma
 * automação por palavra-chave o expõe a cada publicação nova.
 *
 * ─────────────────────────────────────────────────────────────────────────
 *
 * A regra agora é **uma entrega por pessoa, por automação, por ocasião** —
 * e ocasião é:
 *
 * - **o post**, quando o gatilho é comentário e sabemos de qual post ele veio.
 *   Cinco comentários no mesmo post são uma ocasião; um comentário no post da
 *   semana seguinte é outra.
 * - **o dia**, quando não há post — DM como gatilho, ou comentário cujo
 *   payload não trouxe a mídia. Manda uma vez por dia e não vira metralhadora.
 *
 * O dia é fronteira grosseira de propósito. A alternativa seria uma janela em
 * horas, que obrigaria a escolher um número sem nada que o justifique; o dia
 * pelo menos é uma unidade que a pessoa que usa o produto reconhece.
 */

/** Sempre UTC, como todo dia calculado neste projeto. */
function diaUtc(agora: Date): string {
  return agora.toISOString().slice(0, 10);
}

/**
 * A ocasião desta entrega, como texto.
 *
 * O prefixo (`post:` / `dia:`) não é enfeite: sem ele, um `media_id` que por
 * acaso parecesse uma data cairia no mesmo balde de um dia, e duas ocasiões
 * diferentes virariam uma. Prefixo separado torna os espaços disjuntos.
 */
export function janelaDaEntrega(mediaId: string | null, agora: Date): string {
  const media = typeof mediaId === 'string' ? mediaId.trim() : '';
  return media.length > 0 ? `post:${media}` : `dia:${diaUtc(agora)}`;
}
