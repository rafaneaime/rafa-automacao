/**
 * Mudar uma automação que já existe, sem desmontar o que ninguém pediu.
 *
 * A parte que decide fica aqui, separada do banco, porque é ela que erra: o
 * caminho antigo do MCP era criar uma automação nova e pausar a antiga, e isso
 * perde o que a tela tinha configurado — a continuação, a mensagem de quem não
 * segue, o post escolhido, o "exigir seguir". Quem pede para trocar o texto de
 * uma DM não está pedindo uma automação nova.
 *
 * Então a regra é uma só: **o que não foi mandado não é tocado.** Campo ausente
 * continua com o valor que está no banco, passo que a edição não menciona volta
 * igual, e o estado (rascunho ou no ar) não muda aqui — publicar e pausar têm
 * ferramentas próprias, e é assim que ninguém põe no ar sem pedir.
 */
import type { Button } from '../meta/messaging';
import type { AutomationFields } from '../repo/automations';
import type { Automation, AutomationStep } from '../repo/types';
import type { BotaoDaDm, DadosDeEdicao } from './criacao';

export type PassoParaGravar = Pick<AutomationStep, 'position' | 'kind' | 'variants' | 'buttons'>;

export type Edicao = {
  fields: AutomationFields;
  passos: PassoParaGravar[];
  /** O que mudou, em palavras, para o registro de ação do agente e para a resposta. */
  mudou: string[];
};

/**
 * O botão como o banco guarda.
 *
 * A ferramenta fala em titulo e link porque é o que quem pede entende; o envio
 * monta o template com title e url. A tradução vive aqui, num lugar só: quando
 * ela estava espalhada, o MCP gravava `buttons: []` e a DM saía sem o botão que
 * a resposta dizia ter criado.
 */
export function botoesDoBanco(botoes: BotaoDaDm[]): Button[] {
  return botoes.map((botao) => ({ title: botao.titulo, url: botao.link }));
}

export function montarEdicao(automacao: Automation, edicao: DadosDeEdicao): Edicao {
  const mudou: string[] = [];
  const anotar = (o_que: string) => mudou.push(o_que);

  const fields: AutomationFields = {
    name: edicao.nome ?? automacao.name,
    // Editar não publica e não pausa. Quem muda o texto de um rascunho não
    // quer que ele entre no ar por causa disso.
    status: automacao.status,
    triggerType: automacao.triggerType,
    mediaId: automacao.mediaId,
    keywords: edicao.palavrasChave ?? automacao.keywords,
    matchMode: edicao.modoDeCasamento ?? automacao.matchMode,
    // Sem isto, editar o texto desligaria a exigência de seguir sem ninguém
    // pedir: o padrão do banco é falso, e o campo é opcional.
    exigirSeguir: automacao.exigirSeguir,
  };

  if (edicao.nome !== undefined && edicao.nome !== automacao.name) anotar('o nome');
  if (edicao.palavrasChave !== undefined) anotar('as palavras-chave');
  if (edicao.modoDeCasamento !== undefined) anotar('o modo de casamento');

  let temDm = false;
  const passos: PassoParaGravar[] = automacao.steps.map((passo) => {
    if (passo.kind === 'dm') {
      temDm = true;
      return {
        position: passo.position,
        kind: passo.kind,
        variants: edicao.dm ?? passo.variants,
        buttons: edicao.botoes ? botoesDoBanco(edicao.botoes) : passo.buttons,
      };
    }
    if (passo.kind === 'public_reply' && edicao.respostaPublica !== undefined) {
      return {
        position: passo.position,
        kind: passo.kind,
        variants: edicao.respostaPublica,
        buttons: passo.buttons,
      };
    }
    return {
      position: passo.position,
      kind: passo.kind,
      variants: passo.variants,
      buttons: passo.buttons,
    };
  });

  if (edicao.dm !== undefined) anotar('o texto da DM');
  if (edicao.botoes !== undefined) anotar(edicao.botoes.length === 0 ? 'o botão, que saiu' : 'o botão');
  if (edicao.respostaPublica !== undefined) anotar('o comentário público');

  /*
   * Automação sem passo de DM não deveria existir — `createAutomation` cria os
   * dois. Mas se existir, trocar o texto da DM precisa criar o passo em vez de
   * gravar em silêncio uma edição que não mudou nada.
   */
  if (!temDm && edicao.dm !== undefined) {
    const ultima = passos.reduce((maior, passo) => Math.max(maior, passo.position), -1);
    passos.push({
      position: ultima + 1,
      kind: 'dm',
      variants: edicao.dm,
      buttons: edicao.botoes ? botoesDoBanco(edicao.botoes) : [],
    });
  }

  return { fields, passos, mudou };
}
