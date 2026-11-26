import { describe, expect, it } from 'vitest';
import { validarEdicaoDeAutomacao } from '../src/lib/mcp/criacao';
import { montarEdicao } from '../src/lib/mcp/edicao';
import { FERRAMENTAS, ferramentasParaEscopos } from '../src/lib/mcp/ferramentas';
import type { Automation } from '../src/lib/repo/types';

/*
 * Editar automação pelo conector.
 *
 * Antes disto o único caminho era criar outra e pausar a antiga, e isso perde o
 * que a tela configurou: a continuação, a mensagem de quem não segue, o post
 * escolhido, o "exigir seguir". Cada `it` aqui corresponde a uma dessas perdas,
 * ou a uma edição que mudaria o que a pessoa não pediu.
 */

const AUTOMACAO: Automation = {
  id: 10,
  accountId: 1,
  name: 'KIT Natal de Memorias (feed)',
  status: 'published',
  triggerType: 'comment',
  mediaId: 'post-123',
  keywords: ['kit'],
  matchMode: 'contains',
  exigirSeguir: true,
  steps: [
    { id: 1, position: 0, kind: 'public_reply', variants: ['te mandei no direct'], buttons: [] },
    {
      id: 2, position: 1, kind: 'dm',
      variants: ['Oiii! Entra no grupo'],
      buttons: [{ title: 'Entrar no grupo', url: 'https://chat.whatsapp.com/antigo' }],
    },
    { id: 3, position: 2, kind: 'dm_nao_segue', variants: ['segue primeiro'], buttons: [{ title: 'Já segui', acao: 'conferir' }] },
    { id: 4, position: 3, kind: 'follow_up', variants: ['ainda dá tempo'], buttons: [] },
  ],
};

describe('validação da edição', () => {
  it('exige o id da automação', () => {
    for (const entrada of [{}, { automacaoId: 0 }, { automacaoId: '10' }, { automacaoId: 1.5 }]) {
      expect(validarEdicaoDeAutomacao({ ...entrada, dm: ['oi'] }).ok).toBe(false);
    }
  });

  /*
   * Edição sem nada para mudar gravaria a automação por cima dela mesma e
   * responderia "pronto": quem pediu acharia que mudou algo, e o que mudou foi
   * a data.
   */
  it('recusa edição que não muda nada', () => {
    const r = validarEdicaoDeAutomacao({ automacaoId: 10 });
    expect(r).toEqual({ ok: false, erro: expect.stringContaining('diga o que mudar') });
  });

  it('leva só o que foi mandado, e nada mais', () => {
    expect(validarEdicaoDeAutomacao({ automacaoId: 10, dm: ['texto novo'] })).toEqual({
      ok: true,
      dados: { automacaoId: 10, dm: ['texto novo'] },
    });
  });

  // Automação no ar com DM vazia aparece ativa e não entrega nada. Quem quer
  // parar de responder pausa.
  it('recusa DM vazia e manda pausar', () => {
    const r = validarEdicaoDeAutomacao({ automacaoId: 10, dm: ['   '] });
    expect(r).toEqual({ ok: false, erro: expect.stringContaining('pause a automação') });
  });

  it('lista vazia de botões é pedido de tirar o botão, e passa', () => {
    expect(validarEdicaoDeAutomacao({ automacaoId: 10, botoes: [] })).toEqual({
      ok: true,
      dados: { automacaoId: 10, botoes: [] },
    });
  });

  it.each([
    ['título longo', [{ titulo: 'Ver o kit completo de natal', link: 'https://exemplo.com' }]],
    ['sem título', [{ titulo: '', link: 'https://exemplo.com' }]],
    ['link sem esquema', [{ titulo: 'Ver o kit', link: 'exemplo.com' }]],
    ['quatro botões', [1, 2, 3, 4].map(() => ({ titulo: 'Ver', link: 'https://exemplo.com' }))],
  ])('recusa botão com %s', (_caso, botoes) => {
    expect(validarEdicaoDeAutomacao({ automacaoId: 10, botoes }).ok).toBe(false);
  });
});

describe('o que vai para o banco', () => {
  it('troca o texto e o botão da DM sem tocar no resto', () => {
    const { fields, passos, mudou } = montarEdicao(AUTOMACAO, {
      automacaoId: 10,
      dm: ['Oi! No Kit Mágico de Natal tem a carta que o Papai Noel responde.'],
      botoes: [{ titulo: 'Ver o kit completo', link: 'https://pay.hotmart.com/F108620246Q?offDiscount=NATAL' }],
    });

    const dm = passos.find((p) => p.kind === 'dm');
    expect(dm?.variants).toEqual(['Oi! No Kit Mágico de Natal tem a carta que o Papai Noel responde.']);
    expect(dm?.buttons).toEqual([
      { title: 'Ver o kit completo', url: 'https://pay.hotmart.com/F108620246Q?offDiscount=NATAL' },
    ]);
    expect(mudou).toEqual(['o texto da DM', 'o botão']);

    // O que ninguém mandou mudar volta igual, inclusive o passo de quem não
    // segue e a continuação, que o caminho de criar outra perderia.
    expect(passos.find((p) => p.kind === 'public_reply')?.variants).toEqual(['te mandei no direct']);
    expect(passos.find((p) => p.kind === 'dm_nao_segue')).toEqual(AUTOMACAO.steps[2] && {
      position: 2, kind: 'dm_nao_segue', variants: ['segue primeiro'], buttons: [{ title: 'Já segui', acao: 'conferir' }],
    });
    expect(passos.filter((p) => p.kind === 'follow_up')).toHaveLength(1);
    expect(fields.triggerType).toBe('comment');
    expect(fields.mediaId).toBe('post-123');
    expect(fields.keywords).toEqual(['kit']);
    expect(fields.matchMode).toBe('contains');
    expect(fields.name).toBe('KIT Natal de Memorias (feed)');
  });

  /*
   * O padrão do banco para `exigir_seguir` é falso e o campo é opcional em
   * `AutomationFields`: esquecer de passá-lo desligaria, numa edição de texto,
   * a exigência que alguém configurou na tela.
   */
  it('não desliga o exigir seguir de quem o ligou', () => {
    const { fields } = montarEdicao(AUTOMACAO, { automacaoId: 10, dm: ['outro texto'] });
    expect(fields.exigirSeguir).toBe(true);
  });

  // Editar não é publicar nem pausar: essas duas têm ferramenta própria, e é
  // assim que ninguém põe um rascunho no ar sem pedir.
  it('mantém o estado, no ar ou em rascunho', () => {
    expect(montarEdicao(AUTOMACAO, { automacaoId: 10, dm: ['x'] }).fields.status).toBe('published');
    const rascunho = { ...AUTOMACAO, status: 'draft' as const };
    expect(montarEdicao(rascunho, { automacaoId: 10, dm: ['x'] }).fields.status).toBe('draft');
  });

  it('lista vazia tira o botão que estava lá', () => {
    const { passos, mudou } = montarEdicao(AUTOMACAO, { automacaoId: 10, botoes: [] });
    expect(passos.find((p) => p.kind === 'dm')?.buttons).toEqual([]);
    expect(mudou).toEqual(['o botão, que saiu']);
  });

  it('botão ausente deixa o botão como está', () => {
    const { passos } = montarEdicao(AUTOMACAO, { automacaoId: 10, dm: ['só o texto'] });
    expect(passos.find((p) => p.kind === 'dm')?.buttons).toEqual([
      { title: 'Entrar no grupo', url: 'https://chat.whatsapp.com/antigo' },
    ]);
  });

  it('cria o passo de DM quando a automação não tem nenhum', () => {
    const semDm = { ...AUTOMACAO, steps: [AUTOMACAO.steps[0]] };
    const { passos } = montarEdicao(semDm, { automacaoId: 10, dm: ['primeiro texto'] });
    expect(passos.find((p) => p.kind === 'dm')).toEqual({
      position: 1, kind: 'dm', variants: ['primeiro texto'], buttons: [],
    });
  });
});

describe('a ferramenta no catálogo', () => {
  it('é escrita, nunca leitura', () => {
    expect(ferramentasParaEscopos(['leitura']).map((f) => f.name)).not.toContain('editar_automacao');
    expect(ferramentasParaEscopos(['leitura', 'escrita']).map((f) => f.name)).toContain('editar_automacao');
  });

  /*
   * A descrição é o que o modelo lê antes de mudar o texto de uma automação que
   * está no ar. Se ela parar de mandar confirmar, some a única barreira entre
   * um mal-entendido e uma DM diferente saindo para gente de verdade.
   */
  it('manda mostrar o texto e confirmar antes', () => {
    const editar = FERRAMENTAS.find((f) => f.name === 'editar_automacao');
    expect(editar?.escopo).toBe('escrita');
    expect(editar?.description).toMatch(/confirmar/i);
    expect(editar?.description).toMatch(/não publica/i);
  });
});
