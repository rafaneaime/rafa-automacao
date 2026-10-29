import { afterEach, describe, expect, it, vi } from 'vitest';
import { hostProvavelDoToken, identificarConta } from '@/lib/meta/dialeto';
import { sendDm } from '@/lib/meta/messaging';
import { assinaturaDoAplicativo, camposQueFaltam } from '@/lib/meta/subscribe';

/*
 * 29/10/2026: a Meta parou de oferecer a configuração com login do Instagram
 * em aplicativo novo. Quem cria o app hoje só enxerga o login unificado, que
 * atende em `graph.facebook.com` e entrega um token de usuário do sistema.
 *
 * As duas portas continuam abertas: painel já conectado não muda de caminho.
 * Por isso a conexão pergunta antes de decidir, em vez de supor pelo texto do
 * token — supor erraria em silêncio, e o sintoma seria "conectei e não
 * acontece nada".
 */

const responder = (resposta: Record<string, (() => unknown) | unknown>) =>
  vi.fn(async (url: string) => {
    for (const [trecho, corpo] of Object.entries(resposta)) {
      if (url.includes(trecho)) {
        const dados = typeof corpo === 'function' ? (corpo as () => unknown)() : corpo;
        return Response.json(dados as object, { status: 200 });
      }
    }
    return Response.json({ error: { message: 'Invalid OAuth access token' } }, { status: 400 });
  });

afterEach(() => vi.unstubAllGlobals());

describe('de qual lado da Meta este token fala', () => {
  it('token do login do Instagram: identifica pela conta que /me devolve', async () => {
    const buscar = responder({ 'graph.instagram.com': { user_id: '1784100', username: 'loja' } });
    vi.stubGlobal('fetch', buscar);

    expect(await identificarConta('IGAAumtoken')).toEqual({
      dialeto: 'instagram',
      igUserId: '1784100',
      username: 'loja',
    });
    expect(buscar.mock.calls[0][0]).toContain('graph.instagram.com');
  });

  it('token de usuário do sistema: identifica pela conta compartilhada', async () => {
    const buscar = responder({
      assigned_instagram_accounts: { data: [{ id: '1784200', username: 'estudio' }] },
    });
    vi.stubGlobal('fetch', buscar);

    expect(await identificarConta('EAAumtoken')).toEqual({
      dialeto: 'unificado',
      igUserId: '1784200',
      username: 'estudio',
    });
    expect(buscar.mock.calls[0][0]).toContain('graph.facebook.com');
  });

  /*
   * O prefixo só escolhe a ordem das tentativas. Um token que não começa com
   * nenhum dos dois ainda precisa conectar — errar a ordem custa uma chamada,
   * não o resultado.
   */
  it('prefixo desconhecido: tenta os dois e fica com o que respondeu', async () => {
    const buscar = responder({ 'graph.instagram.com': { user_id: '1784300', username: null } });
    vi.stubGlobal('fetch', buscar);

    const conta = await identificarConta('token-de-formato-novo');
    expect(conta.dialeto).toBe('instagram');
    expect(buscar.mock.calls.length).toBeGreaterThan(1);
  });

  /*
   * Mais de uma conta compartilhada é a hora de perguntar, não de chutar: um
   * palpite aqui conecta o painel na conta errada, e quem descobre é a pessoa
   * que recebeu a DM de outra empresa.
   */
  it('duas contas no mesmo token: recusa dizendo quais são', async () => {
    vi.stubGlobal('fetch', responder({
      assigned_instagram_accounts: {
        data: [{ id: '1', username: 'loja' }, { id: '2', username: 'estudio' }],
      },
    }));

    await expect(identificarConta('EAAumtoken')).rejects.toThrow(/loja, estudio/);
  });

  /*
   * 29/10/2026, contra um aplicativo real: o token gerado na tela da Meta
   * funciona na conta e não aparece em `assigned_instagram_accounts`, que só
   * lista o que foi compartilhado pelo fluxo de login de produção. Como é por
   * essa tela que todo aluno passa, o id informado tem que vir antes da
   * descoberta — senão a conexão falha com o token certo na mão.
   */
  it('id informado: confere na conta em vez de procurar na lista vazia', async () => {
    const buscar = responder({
      '17841400271562799': { id: '17841400271562799', username: 'rneaime' },
      assigned_instagram_accounts: { data: [] },
    });
    vi.stubGlobal('fetch', buscar);

    expect(await identificarConta('EAAumtoken', '17841400271562799')).toEqual({
      dialeto: 'unificado',
      igUserId: '17841400271562799',
      username: 'rneaime',
    });
    expect(buscar.mock.calls.every(([url]) => !String(url).includes('assigned_instagram_accounts'))).toBe(true);
  });

  it('sem id informado e sem conta na lista: explica de onde copiar o número', async () => {
    vi.stubGlobal('fetch', responder({ assigned_instagram_accounts: { data: [] } }));
    await expect(identificarConta('EAAumtoken')).rejects.toThrow(/id da conta/);
  });

  it('token que nenhum dos dois aceita: erro conta as duas tentativas', async () => {
    vi.stubGlobal('fetch', responder({}));
    await expect(identificarConta('EAAruim')).rejects.toThrow(/instagram:[\s\S]*unificado:|unificado:[\s\S]*instagram:/);
  });
});

describe('palpite pelo formato do token', () => {
  // O padrão é o endereço antigo: instalação que já funciona não passa a
  // depender de palpite.
  it.each([
    ['EAAabc', 'graph.facebook.com'],
    ['IGAAabc', 'graph.instagram.com'],
    ['qualquer-outra-coisa', 'graph.instagram.com'],
  ])('%j vai para %s', (token, host) => {
    expect(hostProvavelDoToken(token)).toContain(host);
  });
});

/*
 * A assinatura do aplicativo é a metade da entrega que nenhuma tela mostrava.
 * Em 29/10/2026 um comentário não chegava num painel com tudo certo: a conta
 * pedia todos os avisos e o aplicativo não tinha nenhum campo marcado — que é
 * como a configuração de login unificado nasce.
 */
describe('o que o aplicativo está assinado para receber', () => {
  it('lê com o token do aplicativo e separa o que falta', async () => {
    const buscar = responder({
      '/subscriptions': {
        data: [{
          object: 'instagram',
          callback_url: 'https://painel.exemplo/api/webhook',
          active: true,
          fields: [{ name: 'comments' }, { name: 'messages' }],
        }],
      },
    });
    vi.stubGlobal('fetch', buscar);

    const assinatura = await assinaturaDoAplicativo('123', 'segredo');
    expect(assinatura).toEqual({
      callbackUrl: 'https://painel.exemplo/api/webhook',
      ativa: true,
      campos: ['comments', 'messages'],
    });
    expect(camposQueFaltam(assinatura!.campos)).toEqual([
      'messaging_postbacks', 'messaging_seen', 'live_comments',
    ]);
    // O token do aplicativo é o id e o segredo juntos, e vai codificado.
    expect(buscar.mock.calls[0][0]).toContain('123%7Csegredo');
  });

  it('aplicativo sem assinatura nenhuma devolve nulo, e não lista vazia', async () => {
    vi.stubGlobal('fetch', responder({ '/subscriptions': { data: [] } }));
    expect(await assinaturaDoAplicativo('123', 'segredo')).toBeNull();
  });
});

describe('envio respeita o endereço da conta', () => {
  it('manda a DM no host informado, sem mudar o corpo', async () => {
    const buscar = vi.fn(async () => Response.json({ message_id: 'm1' }, { status: 200 }));
    vi.stubGlobal('fetch', buscar);

    await sendDm('1784200', '99', 'oi', [], 'EAAtoken', 'https://graph.facebook.com');

    const [url, opcoes] = buscar.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain('https://graph.facebook.com/');
    expect(url).toContain('/1784200/messages');
    expect(JSON.parse(String(opcoes.body))).toEqual({ recipient: { id: '99' }, message: { text: 'oi' } });
  });

  it('sem host informado, continua no endereço antigo', async () => {
    const buscar = vi.fn(async (_url: string) => Response.json({ message_id: 'm1' }, { status: 200 }));
    vi.stubGlobal('fetch', buscar);

    await sendDm('1784200', '99', 'oi', [], 'IGAAtoken');
    expect(buscar.mock.calls[0][0]).toContain('https://graph.instagram.com/');
  });
});
