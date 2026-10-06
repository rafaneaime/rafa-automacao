/**
 * O nome da pessoa dentro da mensagem.
 *
 * Um comprador escreveu "Olá {name} tudo bem?" na DM e a mensagem saiu com o
 * `{name}` literal, do jeito que estava escrito. Ele não inventou a sintaxe:
 * é a do ManyChat, e quem vem de lá escreve assim sem pensar. Ignorar o
 * marcador não é neutro — vira uma DM esquisita na casa de gente real, com
 * cara de automação quebrada.
 *
 * Aceita as duas grafias, com uma chave ou duas, em inglês e em português,
 * porque o custo de aceitar a mais é zero e o de recusar é uma mensagem
 * estragada.
 *
 * Quando não se sabe o nome — e isso é comum, porque o webhook de mensagem traz
 * só o identificador — o marcador **some**, junto com o espaço que sobraria.
 * "Olá  tudo bem?" com dois espaços denuncia o buraco; "Olá tudo bem?" não.
 */

const MARCADORES = /\{\{?\s*(name|nome|first_name|primeiro_nome|usuario|username)\s*\}?\}/gi;

export type DadosDaPessoa = {
  /** Nome como o Instagram conta, quando conta. */
  nome?: string | null;
  /** O arroba, sem a arroba. */
  usuario?: string | null;
};

/** Só o primeiro nome: "Ana Paula Silva" vira "Ana". */
function primeiroNome(nome: string): string {
  return nome.trim().split(/\s+/)[0] ?? '';
}

export function comoChamar(pessoa: DadosDaPessoa): string | null {
  const nome = typeof pessoa.nome === 'string' ? primeiroNome(pessoa.nome) : '';
  if (nome) return nome;
  const usuario = typeof pessoa.usuario === 'string' ? pessoa.usuario.trim() : '';
  return usuario || null;
}

export function aplicarVariaveis(texto: string, pessoa: DadosDaPessoa): string {
  const tratamento = comoChamar(pessoa);
  if (tratamento !== null) return texto.replace(MARCADORES, tratamento);

  /*
   * Sem nome, sai o marcador e **só** o que estava colado nele: o espaço e a
   * vírgula que sobrariam órfãos ("Olá, {nome}!" viraria "Olá,!").
   *
   * Nada além disso. Uma versão anterior normalizava espaço duplo e espaço
   * antes de pontuação no texto inteiro, e comia o espaço de "até logo :)" —
   * arrumando um buraco que ela mesma não tinha feito, em texto que a pessoa
   * escreveu de propósito.
   */
  return texto
    .replace(new RegExp(`[ \\t]*,?[ \\t]*${MARCADORES.source}`, 'gi'), '')
    .trim();
}
