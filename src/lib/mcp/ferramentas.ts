/**
 * As ferramentas que o agente enxerga — versão do MEUCHAT.
 *
 * Exportada como `ferramentas.ts` no pacote base, pela substituição declarada
 * em `distribuicao.json`. Ver `ARCHITECTURE.md` §13.
 *
 * O catálogo é menor que o da Plataforma, e isso é a coisa certa: temperatura,
 * jornada e audiência não existem aqui. Oferecer uma ferramenta que a
 * instalação não tem faz o modelo chamar, receber erro, e quem está
 * conversando concluir que o painel quebrou.
 *
 * **Publicar manda mensagem para gente de verdade.** A descrição manda mostrar
 * o texto antes de chamar — é orientação ao modelo, não tranca: o custo de um
 * mal-entendido aqui é uma DM que já saiu.
 */

import { comoInteiro } from './entrada';
import type { Escopo } from '../api/chave';

export type DefinicaoDeFerramenta = {
  name: string;
  title: string;
  description: string;
  escopo: Escopo;
  inputSchema: Record<string, unknown>;
};

const LIMITE = {
  type: 'integer',
  minimum: 1,
  maximum: 200,
  description: 'Quantos registros trazer. Padrão 50, teto 200.',
} as const;

export const FERRAMENTAS: DefinicaoDeFerramenta[] = [
  {
    name: 'listar_automacoes',
    escopo: 'leitura',
    title: 'Listar automações',
    description:
      'Mostra as automações da conta: nome, se está no ar ou em rascunho, o gatilho, ' +
      'as palavras-chave e se ela responde qualquer mensagem. Use antes de criar uma ' +
      'nova, para não repetir palavra-chave já usada e para ver se alguma responde ' +
      'qualquer mensagem, porque essa pega na frente das mais novas do mesmo alcance. ' +
      'Também é daqui que vem o id que publicar_automacao precisa.',
    inputSchema: { type: 'object', additionalProperties: false },
  },
  {
    name: 'buscar_contatos',
    escopo: 'leitura',
    title: 'Buscar contatos',
    description:
      'Lista quem já interagiu, do mais recente para o mais antigo, com o @ e o nome ' +
      'quando o Instagram informou. Use para achar uma pessoa ou ver quem chegou agora.',
    inputSchema: {
      type: 'object',
      properties: {
        busca: { type: 'string', description: 'Parte do @ da pessoa.' },
        limite: LIMITE,
      },
      additionalProperties: false,
    },
  },
  {
    name: 'entregas_recentes',
    escopo: 'leitura',
    title: 'Mensagens enviadas',
    description:
      'O que o sistema mandou e o que o Instagram respondeu, do mais novo para o mais ' +
      'antigo, com o erro quando houve. É a ferramenta para responder "a automação ' +
      'disparou?" e para entender por que alguém não recebeu.',
    inputSchema: {
      type: 'object',
      properties: { limite: LIMITE },
      additionalProperties: false,
    },
  },
  {
    name: 'criar_automacao',
    title: 'Criar automação',
    escopo: 'escrita',
    description:
      'Cria uma automação. Com publicar=false (o padrão) ela nasce em rascunho e ' +
      'ninguém recebe nada até alguém publicar no painel. Com publicar=true ela entra ' +
      'no ar na hora e passa a responder seguidores de verdade — nesse caso, MOSTRE o ' +
      'texto da DM e a palavra-chave e espere a pessoa confirmar antes de chamar.',
    inputSchema: {
      type: 'object',
      properties: {
        publicar: {
          type: 'boolean',
          description:
            'Verdadeiro coloca no ar imediatamente. Só use quando a pessoa confirmou o texto.',
        },
        nome: { type: 'string', description: 'Nome exibido no painel.' },
        gatilho: {
          type: 'string',
          enum: ['comment', 'dm', 'story_reply'],
          description: 'comment é comentário no post; story_reply é resposta de Story.',
        },
        palavrasChave: { type: 'array', items: { type: 'string' } },
        modoDeCasamento: { type: 'string', enum: ['contains', 'exact', 'any'] },
        mediaId: { type: 'string', description: 'Id do post; ausente vale para todos.' },
        respostaPublica: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Variações da resposta no comentário, uma por item. Em resposta de Story não é usada.',
        },
        dm: {
          type: 'array',
          minItems: 1,
          items: { type: 'string' },
          description: 'Variações da DM, uma por item. Uma delas é sorteada a cada disparo.',
        },
        botoes: {
          type: 'array',
          maxItems: 3,
          description:
            'Botões que vão junto da DM. O título aparece no botão e o link é para onde ele leva.',
          items: {
            type: 'object',
            properties: {
              titulo: { type: 'string', description: 'Até 20 caracteres.' },
              link: { type: 'string', description: 'Começa com http:// ou https://.' },
            },
            required: ['titulo', 'link'],
            additionalProperties: false,
          },
        },
      },
      required: ['nome', 'gatilho', 'dm'],
      additionalProperties: false,
    },
  },
  {
    name: 'editar_automacao',
    title: 'Editar automação',
    escopo: 'escrita',
    description:
      'Muda uma automação que já existe: o texto da DM, os botões, o comentário público, ' +
      'o nome, as palavras-chave. Só o que você mandar muda, e o resto fica como está — ' +
      'o gatilho, o post, a mensagem de quem não segue e as continuações continuam as ' +
      'mesmas. Editar não publica e não pausa: se ela já estiver no ar, o texto novo vale ' +
      'para a próxima pessoa que escrever, então MOSTRE o texto e espere a pessoa ' +
      'confirmar antes de chamar. Para tirar o botão, mande botoes como lista vazia. ' +
      'O id vem de listar_automacoes.',
    inputSchema: {
      type: 'object',
      properties: {
        automacaoId: { type: 'integer', minimum: 1, description: 'Id da automação.' },
        nome: { type: 'string', description: 'Nome exibido no painel.' },
        palavrasChave: { type: 'array', items: { type: 'string' } },
        modoDeCasamento: { type: 'string', enum: ['contains', 'exact', 'any'] },
        respostaPublica: {
          type: 'array',
          items: { type: 'string' },
          description: 'Variações do comentário público, uma por item.',
        },
        dm: {
          type: 'array',
          minItems: 1,
          items: { type: 'string' },
          description: 'Variações da DM, uma por item.',
        },
        botoes: {
          type: 'array',
          maxItems: 3,
          description:
            'Botões que vão junto da DM. Lista vazia tira o botão; ausente deixa como está.',
          items: {
            type: 'object',
            properties: {
              titulo: { type: 'string', description: 'Até 20 caracteres.' },
              link: { type: 'string', description: 'Começa com http:// ou https://.' },
            },
            required: ['titulo', 'link'],
            additionalProperties: false,
          },
        },
      },
      required: ['automacaoId'],
      additionalProperties: false,
    },
  },
  {
    name: 'publicar_automacao',
    title: 'Publicar automação',
    escopo: 'escrita',
    description:
      'Coloca no ar uma automação que já existe. A partir daí ela responde de verdade ' +
      'quem usar a palavra-chave. MOSTRE o texto da DM e espere a pessoa confirmar ' +
      'antes de chamar. O id vem de listar_automacoes.',
    inputSchema: {
      type: 'object',
      properties: {
        automacaoId: { type: 'integer', minimum: 1, description: 'Id da automação.' },
      },
      required: ['automacaoId'],
      additionalProperties: false,
    },
  },
  {
    name: 'pausar_automacao',
    title: 'Pausar automação',
    escopo: 'escrita',
    description:
      'Tira do ar uma automação que está no ar. Ela para de responder na hora e o ' +
      'texto fica guardado, para publicar de novo quando quiser. Use quando uma ' +
      'automação antiga responde qualquer mensagem e fica na frente da nova. ' +
      'DIGA qual automação vai sair do ar e espere a pessoa confirmar antes de ' +
      'chamar. O id vem de listar_automacoes.',
    inputSchema: {
      type: 'object',
      properties: {
        automacaoId: { type: 'integer', minimum: 1, description: 'Id da automação.' },
      },
      required: ['automacaoId'],
      additionalProperties: false,
    },
  },
];

export function ferramentasParaEscopos(escopos: readonly string[]): DefinicaoDeFerramenta[] {
  return FERRAMENTAS.filter((ferramenta) => escopos.includes(ferramenta.escopo));
}

export function acharFerramenta(nome: unknown): DefinicaoDeFerramenta | null {
  return FERRAMENTAS.find((f) => f.name === nome) ?? null;
}

export function limiteDaFerramenta(valor: unknown): number {
  const pedido = comoInteiro(valor);
  if (pedido === null || pedido < 1) return 50;
  return Math.min(pedido, 200);
}
