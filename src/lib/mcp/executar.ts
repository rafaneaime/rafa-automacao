/**
 * O que cada ferramenta faz — versão do MEUCHAT.
 *
 * Exportada como `executar.ts` no pacote base, pela substituição declarada em
 * `distribuicao.json`. Ver `ARCHITECTURE.md` §13.
 *
 * A versão da Plataforma responde sobre temperatura, jornada e audiência. Aqui
 * nada disso existe — e prometer no catálogo o que a instalação não tem é pior
 * que não oferecer: o modelo chama, recebe erro, e quem está conversando acha
 * que o próprio painel está quebrado.
 *
 * O que sobra é o que o MEUCHAT realmente faz: automações, contatos e o que
 * saiu de mensagem.
 */
import { comoBooleano, comoInteiro } from './entrada';
import { listContacts } from '../repo/contacts';
import { listDeliveries } from '../repo/deliveries';
import {
  createAutomation,
  getAutomation,
  listAutomations,
  saveAutomation,
} from '../repo/automations';
import { registrarAcaoDeAgente } from '../repo/agent-actions';
import type { DadosDeCriacao, DadosDeEdicao } from './criacao';
import { botoesDoBanco, montarEdicao } from './edicao';

export type ContextoDaExecucao = {
  conta: number;
  chaveId: number;
  args: Record<string, unknown>;
  limite: number;
  criacao?: DadosDeCriacao;
  edicao?: DadosDeEdicao;
};

async function auditar(
  conta: number,
  chaveId: number,
  acao: string,
  alvoId: number,
  detalhe: Record<string, unknown>,
): Promise<void> {
  try {
    await registrarAcaoDeAgente(conta, chaveId, acao, 'automacao', alvoId, detalhe);
  } catch (falha) {
    console.error('mcp: falha ao registrar ação do agente', falha);
  }
}

export async function criarAutomacao(
  { conta, chaveId, criacao }: ContextoDaExecucao,
  publicar: boolean,
): Promise<unknown> {
  if (!criacao) throw new Error('dados da automação ausentes');

  const id = await createAutomation(conta, criacao.nome, criacao.gatilho);
  await saveAutomation(
    id,
    {
      name: criacao.nome,
      status: publicar ? 'published' : 'draft',
      triggerType: criacao.gatilho,
      mediaId: criacao.mediaId,
      keywords: criacao.palavrasChave,
      matchMode: criacao.modoDeCasamento,
    },
    [
      { position: 0, kind: 'public_reply', variants: criacao.respostaPublica, buttons: [] },
      {
        position: 1,
        kind: 'dm',
        variants: criacao.dm,
        buttons: botoesDoBanco(criacao.botoes),
      },
    ],
  );

  await auditar(conta, chaveId, publicar ? 'criar_e_publicar_automacao' : 'criar_automacao', id, {
    nome: criacao.nome,
    gatilho: criacao.gatilho,
  });

  return {
    id,
    nome: criacao.nome,
    publicada: publicar,
    mensagem: publicar
      ? 'A automação está no ar e já responde quem usar a palavra-chave.'
      : 'A automação está em rascunho. Revise e publique no painel de Automações.',
  };
}

/**
 * Publicar faz a automação começar a mandar DM para seguidor de verdade. Por
 * isso a resposta devolve o texto que vai sair: quem pediu precisa poder
 * conferir o que acabou de autorizar, mesmo quando acerta.
 */
export async function publicarAutomacao({ conta, chaveId, args }: ContextoDaExecucao): Promise<unknown> {
  const id = comoInteiro(args.automacaoId);
  if (id === null || id < 1) {
    throw new Error('automacaoId inválido');
  }

  const automacao = await getAutomation(id);
  if (!automacao || automacao.accountId !== conta) throw new Error('automação não encontrada');

  const dm = automacao.steps.find((passo) => passo.kind === 'dm');
  if (!dm || dm.variants.length === 0) {
    throw new Error('a automação não tem mensagem de DM escrita; publique só depois de escrever');
  }

  await saveAutomation(
    id,
    {
      name: automacao.name,
      status: 'published',
      triggerType: automacao.triggerType,
      mediaId: automacao.mediaId,
      keywords: automacao.keywords,
      /*
       * `exigirSeguir` ia junto porque saveAutomation grava `?? false`:
       * publicar pelo Claude desligava, sem avisar, a trava de so responder
       * quem segue. Quem publica daqui nao pediu para mudar condicao nenhuma.
       */
      exigirSeguir: automacao.exigirSeguir,
      matchMode: automacao.matchMode,
    },
    automacao.steps.map((passo) => ({
      position: passo.position,
      kind: passo.kind,
      variants: passo.variants,
      buttons: passo.buttons,
    })),
  );

  await auditar(conta, chaveId, 'publicar_automacao', id, { nome: automacao.name });

  return {
    id,
    nome: automacao.name,
    publicada: true,
    palavrasChave: automacao.keywords,
    dm: dm.variants,
    mensagem: 'No ar. A partir de agora ela responde quem usar a palavra-chave.',
  };
}

/**
 * Tira do ar uma automação que está no ar.
 *
 * O painel não tem um estado de "pausada": publicada ou rascunho. Então pausar
 * é voltar para rascunho, e o texto fica guardado inteiro, para publicar de
 * novo depois sem reescrever nada.
 *
 * Existe porque uma automação que responde qualquer mensagem engole as mais
 * novas do mesmo alcance, e tirar ela do ar por uns dias era a única coisa
 * desta conversa que só dava para fazer na tela.
 */
export async function pausarAutomacao({ conta, chaveId, args }: ContextoDaExecucao): Promise<unknown> {
  const id = comoInteiro(args.automacaoId);
  if (id === null || id < 1) {
    throw new Error('automacaoId inválido');
  }

  const automacao = await getAutomation(id);
  if (!automacao || automacao.accountId !== conta) throw new Error('automação não encontrada');

  await saveAutomation(
    id,
    {
      name: automacao.name,
      status: 'draft',
      triggerType: automacao.triggerType,
      mediaId: automacao.mediaId,
      keywords: automacao.keywords,
      exigirSeguir: automacao.exigirSeguir,
      matchMode: automacao.matchMode,
    },
    automacao.steps.map((passo) => ({
      position: passo.position,
      kind: passo.kind,
      variants: passo.variants,
      buttons: passo.buttons,
    })),
  );

  await auditar(conta, chaveId, 'pausar_automacao', id, { nome: automacao.name });

  return {
    id,
    nome: automacao.name,
    publicada: false,
    mensagem: 'Fora do ar. Ela para de responder agora, e o texto fica guardado para voltar quando você quiser.',
  };
}

/**
 * Muda o que ja existe, em vez de criar outra e pausar a antiga.
 *
 * Criar nova e pausar perde o que a tela configurou e deixa duas automacoes com
 * a mesma palavra-chave no caminho de quem comentar. O que vai para o banco sai
 * de `montarEdicao`, que preserva campo e passo que ninguem mandou mudar.
 *
 * A resposta devolve o texto e os botoes gravados pelo mesmo motivo de
 * `publicarAutomacao`: numa automacao no ar, isto e o que a proxima pessoa vai
 * receber, e quem pediu precisa poder conferir o que acabou de autorizar.
 */
export async function editarAutomacao({ conta, chaveId, edicao }: ContextoDaExecucao): Promise<unknown> {
  if (!edicao) throw new Error('dados da edição ausentes');

  const automacao = await getAutomation(edicao.automacaoId);
  if (!automacao || automacao.accountId !== conta) throw new Error('automação não encontrada');

  const { fields, passos, mudou } = montarEdicao(automacao, edicao);
  await saveAutomation(edicao.automacaoId, fields, passos);
  await auditar(conta, chaveId, 'editar_automacao', edicao.automacaoId, { nome: fields.name, mudou });

  const dm = passos.find((passo) => passo.kind === 'dm');
  const noAr = fields.status === 'published';
  return {
    id: edicao.automacaoId,
    nome: fields.name,
    publicada: noAr,
    mudou,
    palavrasChave: fields.keywords,
    dm: dm?.variants ?? [],
    botoes: dm?.buttons ?? [],
    mensagem: noAr
      ? 'No ar com o texto novo: a próxima pessoa que usar a palavra-chave já recebe isto.'
      : 'Rascunho atualizado. Ninguém recebe nada até alguém publicar.',
  };
}

export async function executar(nome: string, contexto: ContextoDaExecucao): Promise<unknown> {
  const { conta, args, limite } = contexto;

  if (nome === 'criar_automacao') return criarAutomacao(contexto, comoBooleano(args.publicar));
  if (nome === 'editar_automacao') return editarAutomacao(contexto);
  if (nome === 'publicar_automacao') return publicarAutomacao(contexto);
  if (nome === 'pausar_automacao') return pausarAutomacao(contexto);

  if (nome === 'listar_automacoes') {
    const automacoes = await listAutomations(conta);
    return automacoes.map((a) => ({
      id: a.id,
      nome: a.name,
      status: a.status,
      gatilho: a.triggerType,
      palavrasChave: a.keywords,
      valeParaTodosOsPosts: a.mediaId === null,
      /*
       * Quem responde qualquer mensagem engole o resto. Entre automacoes do
       * mesmo alcance a mais antiga ganha, entao uma assim, publicada ha
       * meses, faz a nova nunca disparar. Sem este campo, so o painel conta
       * isso, e quem monta uma automacao nova daqui nao tem como saber.
       */
      respondeQualquerMensagem: a.matchMode === 'any',
    }));
  }

  if (nome === 'buscar_contatos') {
    const busca = typeof args.busca === 'string' ? args.busca.trim().toLowerCase() : '';
    const contatos = await listContacts(conta);
    return contatos
      .filter((c) => (busca ? (c.username ?? '').toLowerCase().includes(busca) : true))
      .slice(0, limite)
      .map((c) => ({
        contatoId: c.id,
        usuario: c.username,
        nome: c.nome,
        ultimaInteracao: c.lastSeenAt,
      }));
  }

  // `entregas_recentes`: o que o sistema mandou, e o que o Instagram respondeu.
  // É a ferramenta de diagnóstico — "mandou?" é a primeira pergunta de quem
  // acha que a automação não funcionou.
  const entregas = await listDeliveries(limite);
  return entregas.map((d) => ({
    quando: d.createdAt,
    automacao: d.automationName,
    tipo: d.kind === 'dm' ? 'mensagem' : 'continuação',
    situacao: d.status,
    erro: d.error,
  }));
}
