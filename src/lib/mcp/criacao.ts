import { comoLista } from './entrada';
import type { MatchMode } from '../matching';
import { GATILHOS, type TipoDeGatilho } from '../repo/types';

/**
 * O botao que acompanha a DM.
 *
 * Titulo curto porque o Instagram corta em 20 caracteres, e link obrigatorio:
 * botao sem destino nao e desenhado no envio e a pessoa veria a DM sem o
 * caminho prometido no texto.
 */
export type BotaoDaDm = { titulo: string; link: string };

export type DadosDeCriacao = {
  nome: string;
  gatilho: TipoDeGatilho;
  palavrasChave: string[];
  modoDeCasamento: MatchMode;
  mediaId: string | null;
  respostaPublica: string[];
  dm: string[];
  botoes: BotaoDaDm[];
};

/**
 * O que muda numa automacao que ja existe.
 *
 * Campo ausente quer dizer "nao mexa", e e por isso que tudo aqui e opcional:
 * trocar o texto da DM nao pode apagar as palavras-chave que ninguem mencionou.
 * Lista vazia em `botoes` e a forma de tirar o botao, e isso e diferente de
 * ausente de proposito.
 */
export type DadosDeEdicao = {
  automacaoId: number;
  nome?: string;
  palavrasChave?: string[];
  modoDeCasamento?: MatchMode;
  respostaPublica?: string[];
  dm?: string[];
  botoes?: BotaoDaDm[];
};

export type ResultadoDaEdicao =
  | { ok: true; dados: DadosDeEdicao }
  | { ok: false; erro: string };

export type ResultadoDaCriacao =
  | { ok: true; dados: DadosDeCriacao }
  | { ok: false; erro: string };

function ehGatilho(valor: unknown): valor is TipoDeGatilho {
  return GATILHOS.includes(valor as TipoDeGatilho);
}

function objeto(valor: unknown): Record<string, unknown> | null {
  if (typeof valor !== 'object' || valor === null || Array.isArray(valor)) return null;
  return valor as Record<string, unknown>;
}


function listaDeTextos(valor: unknown, campo: string): string[] | string {
  if (!Array.isArray(valor) || valor.some((item) => typeof item !== 'string')) {
    return `${campo} deve ser uma lista de textos.`;
  }
  return valor.map((item) => item.trim()).filter((item) => item.length > 0);
}

const TITULO_MAXIMO = 20;

/*
 * Botao, que a ferramenta nao aceitava e a tela aceita.
 *
 * Criar automacao pelo MCP gravava sempre `buttons: []`: a DM saia com o link
 * escrito no meio do texto, ou sem link nenhum, e a unica forma de por o botao
 * era abrir o painel. Quem pede a automacao por aqui pede a automacao inteira.
 */
function listaDeBotoes(valor: unknown): BotaoDaDm[] | string {
  if (valor === undefined) return [];
  if (!Array.isArray(valor)) return 'botoes deve ser uma lista.';
  if (valor.length > 3) return 'o Instagram aceita no maximo 3 botoes.';

  const botoes: BotaoDaDm[] = [];
  for (const item of valor) {
    const botao = objeto(item);
    if (!botao) return 'cada botao deve ter titulo e link.';
    const titulo = typeof botao.titulo === 'string' ? botao.titulo.trim() : '';
    const link = typeof botao.link === 'string' ? botao.link.trim() : '';
    if (titulo.length === 0) return 'cada botao precisa de um titulo.';
    if (titulo.length > TITULO_MAXIMO) {
      return `o titulo do botao passa de ${TITULO_MAXIMO} caracteres, que e o que o Instagram mostra.`;
    }
    if (!/^https?:\/\//.test(link)) return 'o link do botao precisa comecar com http:// ou https://.';
    botoes.push({ titulo, link });
  }
  return botoes;
}

export function validarEdicaoDeAutomacao(entrada: unknown): ResultadoDaEdicao {
  const dados = objeto(entrada);
  if (!dados) return { ok: false, erro: 'A entrada deve ser um objeto.' };

  const id = dados.automacaoId;
  if (typeof id !== 'number' || !Number.isSafeInteger(id) || id < 1) {
    return { ok: false, erro: 'automacaoId deve ser o id da automação, que vem de listar_automacoes.' };
  }

  const edicao: DadosDeEdicao = { automacaoId: id };

  if (dados.nome !== undefined) {
    if (typeof dados.nome !== 'string' || dados.nome.trim().length === 0) {
      return { ok: false, erro: 'nome não pode ficar vazio.' };
    }
    edicao.nome = dados.nome.trim();
  }

  if (dados.dm !== undefined) {
    const dm = listaDeTextos(comoLista(dados.dm), 'dm');
    if (typeof dm === 'string') return { ok: false, erro: dm };
    /*
     * DM vazia e automacao sem texto: ela continuaria no ar, aparecendo ativa, e
     * nao entregaria nada. Quem quer parar de responder pausa a automacao.
     */
    if (dm.length === 0) return { ok: false, erro: 'dm precisa ter ao menos uma variação; para parar de responder, pause a automação.' };
    edicao.dm = dm;
  }

  if (dados.botoes !== undefined) {
    const botoes = listaDeBotoes(comoLista(dados.botoes));
    if (typeof botoes === 'string') return { ok: false, erro: botoes };
    edicao.botoes = botoes;
  }

  if (dados.respostaPublica !== undefined) {
    const resposta = listaDeTextos(comoLista(dados.respostaPublica), 'respostaPublica');
    if (typeof resposta === 'string') return { ok: false, erro: resposta };
    edicao.respostaPublica = resposta;
  }

  if (dados.palavrasChave !== undefined) {
    const palavras = listaDeTextos(comoLista(dados.palavrasChave), 'palavrasChave');
    if (typeof palavras === 'string') return { ok: false, erro: palavras };
    edicao.palavrasChave = [...new Set(palavras)];
  }

  if (dados.modoDeCasamento !== undefined) {
    const modo = dados.modoDeCasamento;
    if (modo !== 'contains' && modo !== 'exact' && modo !== 'any') {
      return { ok: false, erro: 'modoDeCasamento inválido.' };
    }
    edicao.modoDeCasamento = modo;
  }

  /*
   * Edicao sem nada para mudar grava a automacao por cima dela mesma e responde
   * "pronto". Quem pediu fica achando que mudou algo, e o que mudou foi so a
   * data. Recusar aqui diz onde esta o engano.
   */
  if (Object.keys(edicao).length === 1) {
    return { ok: false, erro: 'diga o que mudar: dm, botoes, respostaPublica, nome, palavrasChave ou modoDeCasamento.' };
  }

  return { ok: true, dados: edicao };
}

export function validarCriacaoDeAutomacao(entrada: unknown): ResultadoDaCriacao {
  const dados = objeto(entrada);
  if (!dados) return { ok: false, erro: 'A entrada deve ser um objeto.' };

  if (typeof dados.nome !== 'string' || dados.nome.trim().length === 0) {
    return { ok: false, erro: 'nome é obrigatório.' };
  }
  // Lista derivada do tipo: gatilho novo entra aqui sozinho. A versão anterior
  // comparava com dois literais, e teria recusado `story_reply` com uma
  // mensagem dizendo que ele não existe.
  if (!ehGatilho(dados.gatilho)) {
    return { ok: false, erro: `gatilho deve ser um de: ${GATILHOS.join(', ')}.` };
  }

  const dm = listaDeTextos(comoLista(dados.dm), 'dm');
  if (typeof dm === 'string') return { ok: false, erro: dm };
  if (dm.length === 0) return { ok: false, erro: 'dm precisa ter ao menos uma variação.' };

  const palavras = dados.palavrasChave === undefined
    ? []
    : listaDeTextos(comoLista(dados.palavrasChave), 'palavrasChave');
  if (typeof palavras === 'string') return { ok: false, erro: palavras };

  const respostaPublica = dados.respostaPublica === undefined
    ? []
    : listaDeTextos(comoLista(dados.respostaPublica), 'respostaPublica');
  if (typeof respostaPublica === 'string') return { ok: false, erro: respostaPublica };

  const botoes = listaDeBotoes(comoLista(dados.botoes));
  if (typeof botoes === 'string') return { ok: false, erro: botoes };

  const modo = dados.modoDeCasamento ?? 'contains';
  if (modo !== 'contains' && modo !== 'exact' && modo !== 'any') {
    return { ok: false, erro: 'modoDeCasamento inválido.' };
  }
  if (dados.mediaId !== undefined && typeof dados.mediaId !== 'string') {
    return { ok: false, erro: 'mediaId deve ser texto.' };
  }

  return {
    ok: true,
    dados: {
      nome: dados.nome.trim(),
      gatilho: dados.gatilho,
      palavrasChave: [...new Set(palavras)],
      modoDeCasamento: modo,
      mediaId: dados.mediaId?.trim() || null,
      respostaPublica,
      dm,
      botoes,
    },
  };
}
