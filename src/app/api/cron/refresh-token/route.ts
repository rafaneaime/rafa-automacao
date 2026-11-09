import type { NextRequest } from 'next/server';
import { refreshLongLived } from '@/lib/meta/token';
import { getFirstAccount, updateAccountToken } from '@/lib/repo/accounts';
import { authorizeCron } from '@/lib/cron-auth';
import { garantirInscricao, type Reinscricao } from '@/lib/meta/subscribe';
import { hostDoDialeto } from '@/lib/meta/dialeto';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DIAS_PARA_RENOVAR = 10;

/*
 * Por quanto tempo uma conferência de inscrição vale.
 *
 * `authorizeCron` deixa a rotina rodar sem CRON_SECRET de propósito, e o
 * motivo está escrito em `src/lib/cron-auth.ts`: exigir a variável devolvia 503
 * e matava a renovação do token em toda instalação feita pelo guia, que não
 * pede essa variável em passo nenhum. Foi o que derrubou o painel da Amanda, e
 * um teste trava essa decisão.
 *
 * O preço é que, sem segredo, quem descobrir o endereço faz o painel falar com
 * a Meta. Antes isso devolvia uma resposta curta e ia embora; desde que a
 * conferência da inscrição entrou aqui, passou a custar duas perguntas e um
 * pedido à Meta por chamada — e estourar a cota da Meta derruba o painel por
 * tabela.
 *
 * Então a conferência passa a valer algumas horas. A rotina de verdade roda
 * uma vez por dia e nunca esbarra nisto; uma enxurrada de chamadas anônimas na
 * mesma instância passa a custar uma conferência em vez de uma por chamada.
 * Isto não é autenticação e não se faz passar por ela: é um teto para o
 * estrago, do lado de cá. Instância nova começa com o relógio zerado, e tudo
 * bem — conferir de novo é inofensivo; o que não pode é ser por chamada.
 */
const CONFERENCIA_VALE_POR_MS = 6 * 60 * 60 * 1000;
let conferidaAte = 0;

export async function GET(request: NextRequest) {
  const denied = authorizeCron(request);
  if (denied) return denied;

  const account = await getFirstAccount();
  if (!account) return Response.json({ ok: true, acao: 'nenhuma conta conectada' });

  /*
   * Antes do token, a inscrição do webhook.
   *
   * Esta rotina roda todo dia em toda instalação, já tem a conta na mão e já
   * está autorizada — é o único lugar do painel que acorda sozinho. Então é
   * aqui que o corte da Meta se remenda sem ninguém pedir: cortado durante uma
   * live, o painel volta na próxima passada, no máximo um dia depois.
   *
   * Vale para os dois dialetos, e por isso vem antes da conta de dias do
   * token: o do login unificado não expira, e a rotina devolvia "não precisa"
   * sem olhar mais nada.
   *
   * Não aborta a renovação se falhar — `garantirInscricao` não lança.
   */
  let inscricao: Reinscricao | null = null;
  if (Date.now() >= conferidaAte) {
    inscricao = await garantirInscricao(
      account.igUserId,
      account.accessToken,
      hostDoDialeto(account.dialeto),
    );
    /*
     * Só adia a próxima quando deu para perguntar. Rede fora ou token vencido
     * devolvem `sem-resposta`, e guardar isso como conferência deixaria o
     * painel seis horas sem conferir por causa de um tropeço de um segundo.
     */
    if (inscricao.estado !== 'sem-resposta') {
      conferidaAte = Date.now() + CONFERENCIA_VALE_POR_MS;
    }
    if (inscricao.estado === 'reassinada') {
      console.warn(
        '[cron/refresh-token] a Meta havia cancelado a inscrição; reassinada:',
        inscricao.faltavam.join(', '),
      );
    }
  }
  const estadoDaInscricao = inscricao?.estado ?? 'conferida-ha-pouco';

  /*
   * Token do login unificado é de usuário do sistema e não expira — a própria
   * tela da Meta escreve "Expiração: nunca". Pedir `ig_refresh_token` para ele
   * é erro todo dia, e erro diário que não significa nada é como se deixa de
   * olhar para o que significa.
   */
  if (account.dialeto === 'unificado') {
    return Response.json({
      ok: true,
      acao: 'token do login unificado não expira',
      inscricao: estadoDaInscricao,
    });
  }

  const diasRestantes = account.tokenExpiresAt
    ? (new Date(account.tokenExpiresAt).getTime() - Date.now()) / 86_400_000
    : 0;

  if (diasRestantes > DIAS_PARA_RENOVAR) {
    return Response.json({
      ok: true,
      acao: 'ainda não precisa',
      diasRestantes: Math.round(diasRestantes),
      inscricao: estadoDaInscricao,
    });
  }

  try {
    const { accessToken, expiresInSeconds } = await refreshLongLived(account.accessToken);
    await updateAccountToken(account.id, accessToken, expiresInSeconds);
    return Response.json({
      ok: true,
      acao: 'renovado',
      novosDias: Math.round(expiresInSeconds / 86400),
      inscricao: estadoDaInscricao,
    });
  } catch (error) {
    // O detalhe do erro — que inclui a
    // resposta crua do Meta e o fbtrace_id — vai só para o log do servidor.
    console.error('[cron/refresh-token] falha ao renovar:', error);
    return Response.json(
      {
        ok: false,
        erro: 'Não foi possível renovar o token. Veja os logs do deploy.',
        inscricao: estadoDaInscricao,
      },
      { status: 500 },
    );
  }
}
