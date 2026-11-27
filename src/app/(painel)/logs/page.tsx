import {
  desfechoDaEntrega,
  diagnosticoSemEntrega,
  normalizarBuscaPessoa,
  type StatusDeEntrega,
} from '@/lib/painel/entrega';
import { IconeGlobo } from '@/lib/painel/icones';
import { Botao, Cartao, Chip, ESTILO_CAMPO, Secao, TituloDaTela, Vazio } from '@/lib/painel/ui';
import { diagnosticarPessoa } from '@/lib/repo/diagnostico';
import { listDeliveries } from '@/lib/repo/deliveries';
import { listRecentEvents, recebimentoPorTipo } from '@/lib/repo/webhook-events';
import { resumirEntrega } from '@/lib/painel/resumo-da-entrega';
import { contaDoAviso } from '@/lib/painel/conta-do-aviso';
import { janelaObservada } from '@/lib/painel/janela-observada';
import {
  aplicativosEstranhos,
  assinaturaDoAplicativo,
  camposQueFaltam,
  garantirInscricao,
  type LeituraDaAssinatura,
} from '@/lib/meta/subscribe';
import { hostDoDialeto } from '@/lib/meta/dialeto';
import { getFirstAccount } from '@/lib/repo/accounts';
import { NOME_DO_CAMPO } from '@/lib/painel/campos-do-webhook';
import { requirePanelSession } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CORES_DOS_STATUS: Record<StatusDeEntrega, string> = {
  sent: 'bg-subindo-tenue text-subindo-forte',
  error: 'bg-caindo-tenue text-caindo-forte',
  throttled: 'bg-frio-tenue text-tinta-media',
  pending: 'bg-frio-tenue text-tinta-media',
};

function corDoStatus(status: string): string {
  return status in CORES_DOS_STATUS
    ? CORES_DOS_STATUS[status as StatusDeEntrega]
    : 'bg-frio-tenue text-tinta-media';
}

function dataPtBr(data: Date): string {
  return new Date(data).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}

export default async function LogsPage({
  searchParams,
}: {
  searchParams: Promise<{ pessoa?: string | string[] }>;
}) {
  /*
   * A sessão se confere aqui, e não só no layout.
   *
   * O layout do painel já chama isto, mas a doc desta versão avisa que
   * checagem em layout não vale como tranca: layout não re-renderiza a cada
   * navegação, e layout e página renderizam juntos — "do the checks close to
   * your data source", em 01-app/02-guides/authentication.md. Enquanto esta
   * tela só lia, o pior caso era mostrar. Agora ela também assina de novo na
   * Meta, e efeito não pode depender de quem renderizou primeiro. As telas de
   * Atendimento já fazem assim.
   */
  await requirePanelSession();

  const params = await searchParams;
  const valor = Array.isArray(params.pessoa) ? params.pessoa[0] : params.pessoa;
  const busca = normalizarBuscaPessoa(valor);
  const [disparos, webhooksRecentes, diagnostico] = await Promise.all([
    listDeliveries(100),
    listRecentEvents(30),
    busca ? diagnosticarPessoa(busca) : Promise.resolve(null),
  ]);

  /*
   * O que o Instagram aceitou mandar para cá.
   *
   * A conexao pede todos os campos, mas quem decide e a Meta: campo que o
   * aplicativo não tem marcado no portal não entra, e ninguém avisa. Sem esta
   * pergunta, a tela não distingue "ninguém comentou" de "comentário não chega
   * aqui" — e as duas conclusões levam a dias de investigação em direções
   * opostas.
   *
   * Falha de rede ou token vencido não derruba a tela de Logs: ela é
   * justamente onde se vai quando algo já está errado.
   *
   * Esta tela não só pergunta: se estiver faltando campo, ela assina de novo
   * antes de desenhar. A Meta cancela a inscrição de quem demora a responder,
   * e quem foi cancelado não tinha como descobrir que era isso. Aqui é onde a
   * pessoa chega quando "parou de funcionar" — então é aqui que conserta, e
   * não só onde fica escrito o que está errado. A rotina diária conserta quem
   * nunca abriu esta tela.
   */
  const conta = await getFirstAccount();
  const inscricao = await (async () => {
    if (!conta?.accessToken) return { ok: false as const, motivo: 'conta-nao-conectada' as const };
    const conferida = await garantirInscricao(
      conta.igUserId,
      conta.accessToken,
      hostDoDialeto(conta.dialeto),
    );
    if (conferida.estado === 'sem-resposta') {
      return { ok: false as const, motivo: 'nao-respondeu' as const };
    }
    return {
      ok: true as const,
      campos: conferida.campos,
      reassinada: conferida.estado === 'reassinada',
      faltavam: conferida.faltavam,
      aplicativos: conferida.aplicativos,
    };
  })();
  const faltando = inscricao.ok ? camposQueFaltam(inscricao.campos) : [];

  /*
   * Os avisos desta conta estão indo para outro aplicativo?
   *
   * A pergunta que faltava. As duas metades acima podem responder certo cada
   * uma sobre um aplicativo diferente: a conta inscrita no aplicativo A, e a
   * identificação e a chave secreta deste painel do aplicativo B. Aí a Meta
   * entrega no endereço de A, aqui não chega nada, e tudo parece pronto. Foi o
   * que custou quatorze dias de uma instalação em novembro de 2026.
   *
   * Silêncio quando não se sabe: sem identificação no ambiente ou na resposta
   * da Meta, `aplicativosEstranhos` devolve lista vazia e esta tela não diz
   * nada. Acusar por falta de dado manda consertar o que não está quebrado.
   */
  const estranhos = inscricao.ok
    ? aplicativosEstranhos(inscricao.aplicativos, process.env.IG_APP_ID ?? '')
    : [];

  /*
   * A outra metade da mesma pergunta, e a que ninguém fazia.
   *
   * A conta pode estar inscrita em tudo e o aplicativo em nada — e aí a Meta
   * verifica o endereço, responde ao desafio e não entrega evento algum. Na
   * configuração de login unificado os campos nascem **todos desmarcados**,
   * então esse é o estado inicial de toda instalação nova. Melhor esforço:
   * esta tela nunca pode quebrar por causa de um diagnóstico.
   */
  // Chega comentário e nunca chega mensagem: ver `recebimentoPorTipo`.
  const recebimento = await recebimentoPorTipo().catch(() => null);
  /*
   * Clique em botão entra na conta. Ele chega em `postback`, sem campo de
   * texto, e automação com botão é a forma recomendada na própria tela de
   * automações. Numa instalação assim o recebimento inteiro pode ser clique:
   * contar só texto acusaria o Instagram de não entregar o que ele entregou.
   */
  const mensagemNuncaChega = Boolean(
    recebimento &&
      recebimento.comentarios >= 3 &&
      recebimento.entrada === 0 &&
      (recebimento.cliques ?? 0) === 0,
  );
  /*
   * O aviso diz em quanto tempo mediu, e não a janela da consulta. Ver
   * `janelaObservada`: a frase antiga afirmava 30 dias em painel de horas.
   */
  const janelaCrua = janelaObservada(recebimento?.desde ?? null, new Date());
  const janela = janelaCrua.charAt(0).toUpperCase() + janelaCrua.slice(1);

  const leitura = await assinaturaDoAplicativo(
    process.env.IG_APP_ID ?? '',
    process.env.IG_APP_SECRET ?? '',
  ).catch((): LeituraDaAssinatura => ({ estado: 'nao-perguntei' }));
  const faltandoNoApp = leitura.estado === 'ok' ? camposQueFaltam(leitura.assinatura.campos) : [];

  const temInteracao = Boolean(
    diagnostico && (diagnostico.webhooks.total > 0 || diagnostico.eventos.total > 0),
  );
  const semEntrega = diagnostico
    ? diagnosticoSemEntrega(temInteracao, diagnostico.entregas.total > 0)
    : null;
  const nuncaVimos = Boolean(
    diagnostico && !diagnostico.identidade && diagnostico.webhooks.total === 0 &&
      diagnostico.entregas.total === 0 && diagnostico.eventos.total === 0,
  );

  return (
    <div>
      <TituloDaTela titulo="Logs" pergunta="Por que uma pessoa comentou e não recebeu?" icone={<IconeGlobo className="h-5 w-5" />} />

      <Secao titulo="Diagnosticar uma pessoa" descricao="Busque pelo @usuário ou pelo id do Instagram.">
        <Cartao destaque className="p-4">
          <form className="flex flex-col gap-3 sm:flex-row" method="get">
            <label className="grow text-sm font-medium">
              Pessoa
              <input name="pessoa" defaultValue={valor ?? ''} placeholder="@usuario ou 9876543210" className={`mt-1 w-full ${ESTILO_CAMPO}`} />
            </label>
            <Botao type="submit" className="self-end">Buscar</Botao>
          </form>
        </Cartao>

        {diagnostico && (
          <div className="mt-4 space-y-4">
            {nuncaVimos ? <Vazio>Nunca vimos esta pessoa.</Vazio> : (
              <>
                <Cartao className="p-4">
                  <h3 className="font-semibold">
                    {diagnostico.identidade?.username ? `@${diagnostico.identidade.username}` : diagnostico.identidade?.igUserId ?? busca}
                  </h3>
                  {diagnostico.identidade?.username && <p className="mt-1 text-sm">{diagnostico.identidade.igUserId}</p>}
                  <div className="mt-4 flex flex-wrap gap-6">
                    <div><p className="text-xs">Webhooks recebidos</p><p className="numero mt-1 text-2xl font-semibold">{diagnostico.webhooks.total}</p></div>
                    <div><p className="text-xs">Último webhook</p><p className="mt-1 text-sm font-medium">{diagnostico.webhooks.ultimoEm ? dataPtBr(diagnostico.webhooks.ultimoEm) : 'Nenhum'}</p></div>
                  </div>
                  {diagnostico.webhooks.varreduraLimitada && <p className="mt-3 text-sm">A varredura foi limitada aos 500 payloads compatíveis mais recentes.</p>}
                </Cartao>

                {semEntrega && <Cartao destaque className="p-4"><p className="text-sm font-medium">{semEntrega}</p></Cartao>}

                <Cartao className="p-4">
                  <h3 className="font-semibold">Entregas ({diagnostico.entregas.total})</h3>
                  {diagnostico.entregas.itens.length === 0 ? <Vazio compacto>Nenhuma entrega registrada.</Vazio> : (
                    <ul className="mt-3 space-y-4">
                      {diagnostico.entregas.itens.map((entrega) => {
                        const desfecho = desfechoDaEntrega(entrega.status, entrega.error);
                        return <li key={entrega.id}>
                          <div className="flex flex-wrap items-center justify-between gap-2"><span className="font-medium">{entrega.automationName}</span><Chip cor={corDoStatus(entrega.status)}>{desfecho.rotulo}</Chip></div>
                          <p className="mt-1 text-xs">{dataPtBr(entrega.createdAt)}</p>
                          {desfecho.detalhe && <p className="mt-2 break-all font-mono text-xs">{desfecho.detalhe}</p>}
                        </li>;
                      })}
                    </ul>
                  )}
                  {diagnostico.entregas.total > 50 && <p className="mt-3 text-sm">Mostrando os 50 registros mais recentes de {diagnostico.entregas.total}.</p>}
                </Cartao>

                {diagnostico.eventos.disponiveis && (
                  <Cartao className="p-4">
                    <h3 className="font-semibold">Eventos ({diagnostico.eventos.total})</h3>
                    {diagnostico.eventos.itens.length === 0 ? <Vazio compacto>Nenhum evento registrado.</Vazio> : (
                      <ul className="mt-3 space-y-2">{diagnostico.eventos.itens.map((evento) => <li key={evento.id} className="flex flex-wrap justify-between gap-2 text-sm"><span>{evento.eventType}</span><span>{dataPtBr(evento.occurredAt)}</span></li>)}</ul>
                    )}
                    {diagnostico.eventos.total > 50 && <p className="mt-3 text-sm">Mostrando os 50 registros mais recentes de {diagnostico.eventos.total}.</p>}
                  </Cartao>
                )}
              </>
            )}
          </div>
        )}
      </Secao>

      <Secao titulo="Disparos recentes" descricao="O que cada automação fez e o erro exato do Meta quando falhou.">
        {disparos.length === 0 ? <Vazio>Nenhum disparo ainda. Teste com a segunda conta do Instagram; a própria conta é ignorada de propósito.</Vazio> : (
          <div className="grid gap-3">{disparos.map((entrega) => {
            const desfecho = desfechoDaEntrega(entrega.status, entrega.error);
            return <Cartao key={`${entrega.kind}-${entrega.id}`} className="p-4">
              <div className="flex flex-wrap items-center justify-between gap-3"><div className="flex flex-wrap items-center gap-2"><span className="font-medium">{entrega.automationName}</span>{entrega.kind === 'follow_up' && <Chip>Continuação {entrega.continuacao}</Chip>}</div><Chip cor={corDoStatus(entrega.status)}>{desfecho.rotulo}</Chip></div>
              <p className="mt-1 text-xs">{entrega.igUserId} · {dataPtBr(entrega.createdAt)}</p>
              {desfecho.detalhe && <p className="mt-2 break-all font-mono text-xs">{desfecho.detalhe}</p>}
            </Cartao>;
          })}</div>
        )}
      </Secao>

      <Secao
        titulo="O que o Instagram manda para cá"
        descricao="Os avisos que a sua conta pediu para receber. Falta um deles? Esse tipo de evento nunca chega, por mais que aconteça no Instagram."
      >
        <Cartao className="p-4">
          {/*
            Qual conta está conectada, dito aqui.
            Numa instalação passamos dias atrás de um comentário que não
            chegava, com tudo certo no portal — e a pergunta que ninguém tinha
            feito era se o post comentado era desta conta. O dado estava em
            Configuração, a duas telas de distância de quem estava investigando.
          */}
          {conta && (
            <p className="mb-3 text-sm">
              Conta conectada:{' '}
              <strong>{conta.username ? `@${conta.username}` : conta.igUserId}</strong>
              <span className="numero ml-2 text-xs text-tinta-fraca">{conta.igUserId}</span>
              <br />
              <span className="text-tinta-media">
                Só o que acontece <strong>nesta</strong> conta chega aqui. Comentário
                em post de outro perfil não chega, e comentário feito por ela mesma
                também não — o Instagram não avisa quando o dono comenta no
                próprio post.
              </span>
              <br />
              {/*
                Por qual porta da Meta esta conta fala, dito na tela.
                O painel guarda isso por conta desde que o login unificado
                apareceu, e nenhuma tela mostrava. Em novembro de 2026 três
                instalações passaram dias em investigação sem que ninguém
                soubesse em qual das duas configurações elas estavam — e a
                resposta estava gravada no banco o tempo todo. Aqui é fato, e
                só fato: o que cada configuração entrega ainda está sendo
                medido, e frase que afirma o que não foi medido defende o
                defeito no dia em que a medida contrariar.
              */}
              <span className="text-tinta-media">
                Esta conta fala com a Meta pela configuração de{' '}
                <strong>
                  {conta.dialeto === 'unificado'
                    ? 'login unificado'
                    : 'login do Instagram'}
                </strong>
                . Quando um aviso não chega, é a primeira coisa que o suporte
                precisa saber.
              </span>
            </p>
          )}
          {mensagemNuncaChega && (
            <div className="mb-3 rounded-lg bg-caindo-tenue px-4 py-3 text-sm">
              <p className="font-medium text-caindo-forte">
                Comentário chega aqui e mensagem não.
              </p>
              <p className="mt-1 text-tinta-media">
                {/*
                  O tempo medido de verdade, e não os 30 dias da consulta. Num
                  painel ligado hoje a frase antiga afirmava 30 dias de
                  observação que não existiam, e em 26/11/2026 mandou uma
                  investigação inteira atrás de uma chave que estava certa.
                */}
                <strong>{janela}</strong> entraram {recebimento?.comentarios ?? 0}{' '}
                comentários e nada vindo de ninguém: nem DM, nem resposta de
                Story, nem clique em botão. A causa mais comum é uma chave
                desligada na conta do Instagram:{' '}
                {/*
                  O caminho abaixo foi lido da tela do Instagram, na ordem, em
                  26/11/2026, a partir do print de uma instalação de verdade.
                  Antes dizia "Mensagens e respostas DE stories" e pulava
                  "Pedidos de contato", que é onde "Ferramentas conectadas" mora.
                  Quem seguiu aquele caminho chegou numa tela que não tem a
                  chave, e concluiu que a chave não existia. Texto que descreve
                  a tela de outro sistema não é protegido por teste nenhum: ele
                  se confere lendo, na ordem, como a pessoa lê.
                */}
                <strong>Configurações e privacidade → Mensagens e respostas a
                stories → Pedidos de contato → Ferramentas conectadas → Permitir
                acesso às mensagens</strong>. Enquanto ela estiver desligada, o
                envio funciona e o recebimento não, e nada mais no painel
                denuncia isso.{' '}
                {/*
                  Em 26/11/2026 apareceu a primeira instalação com a chave já
                  ligada e mensagem nenhuma chegando. Então "quase sempre" não
                  é "sempre", e a tela precisa dizer o que fazer quando não é.
                  O que ela NÃO faz é apontar a próxima causa: nenhuma foi
                  medida ainda, e chutar aqui mandaria a pessoa mexer no
                  aplicativo dela atrás de um defeito que talvez não esteja lá.
                */}
                Se você conferir e ela já estiver ligada, então não é isto, e
                esta tela sozinha não diz o que é: guarde este aviso e procure o
                suporte.
              </p>
            </div>
          )}
          {!inscricao.ok ? (
            <p className="text-sm">
              {inscricao.motivo === 'conta-nao-conectada'
                ? 'Conecte a conta do Instagram em Configuração para poder perguntar isto ao Instagram.'
                : 'Não consegui perguntar ao Instagram agora. Tente recarregar esta tela em alguns instantes.'}
            </p>
          ) : (
            <>
              {estranhos.length > 0 && (
                <div className="mb-3 rounded-lg bg-caindo-tenue px-4 py-3 text-sm">
                  <p className="font-medium text-caindo-forte">
                    Os avisos desta conta vão para outro aplicativo.
                  </p>
                  <p className="mt-1 text-tinta-media">
                    A conta pediu os avisos, e quem os recebe é{' '}
                    {estranhos
                      .map((app) => app.nome ?? `o aplicativo ${app.appId}`)
                      .join(', ')}
                    . O aplicativo deste painel é outro:{' '}
                    <span className="numero">{process.env.IG_APP_ID}</span>.
                    Enquanto forem dois, nada chega aqui, por mais que as telas da
                    Meta estejam todas certas. Para igualar, abra Configuração e
                    conecte a conta de novo com o token gerado no aplicativo deste
                    painel; se o token estiver certo e o painel errado, a
                    identificação e a chave secreta na Vercel precisam sair{' '}
                    <strong>as duas do mesmo aplicativo</strong>.
                  </p>
                </div>
              )}
              <ul className="flex flex-wrap gap-2">
                {inscricao.campos.length === 0 ? (
                  <li className="text-sm">Nenhum. Nenhum evento vai chegar aqui.</li>
                ) : (
                  inscricao.campos.map((campo) => (
                    <li key={campo}>
                      <Chip cor="bg-subindo-tenue text-subindo-forte">
                        {NOME_DO_CAMPO[campo] ?? campo}
                      </Chip>
                    </li>
                  ))
                )}
              </ul>
              {inscricao.reassinada && (
                <div className="mt-4 text-sm">
                  <p className="font-medium">
                    O Instagram havia parado de mandar{' '}
                    {inscricao.faltavam.map((c) => NOME_DO_CAMPO[c] ?? c).join(', ')}{' '}
                    para este painel. Já está religado.
                  </p>
                  <p className="mt-1 text-tinta-media">
                    É o que o Instagram faz quando o painel demora a responder: ele
                    cancela o envio e não avisa em tela nenhuma. O painel assinou de
                    novo ao abrir esta tela e os avisos voltam daqui pra frente — o
                    que chegou enquanto estava cancelado não volta. Se isso se
                    repetir, conte para quem cuida da sua instalação.
                  </p>
                </div>
              )}
              {/*
                Estar na lista da conta não é garantia de entrega: quem entrega
                é o aplicativo, e ele tem a própria lista de campos assinados.
                Esta tela dizia que essa segunda lista não dava para ler por
                API — estava errado, e isso custou uma tarde em 29/10/2026. Dá:
                com o token do aplicativo, que é o id e o segredo juntos, e os
                dois estão em toda instalação. Agora a tela lê em vez de mandar
                o leitor conferir à mão.
              */}
              {leitura.estado === 'sem-credencial' ? (
                <p className="mt-4 text-sm text-tinta-media">
                  Não consegui perguntar: falta no ambiente a identificação ou a chave
                  secreta do aplicativo (<code>IG_APP_ID</code> e{' '}
                  <code>IG_APP_SECRET</code>). Sem as duas eu não tenho como ler esta
                  metade — o resto do painel funciona, e isto aqui fica cego.
                </p>
              ) : leitura.estado === 'nao-perguntei' ? (
                <p className="mt-4 text-sm text-tinta-media">
                  A Meta recusou a pergunta, então não é campo desmarcado no portal:
                  é o <strong>par</strong>. O painel usa a identificação e a chave
                  secreta do aplicativo <strong>juntas</strong>, e a Meta recusa o
                  conjunto quando uma veio de uma tela do app e a outra de outra.
                  Confira na Vercel se as duas saíram da mesma tela. Se estiverem
                  certas, pode ter sido a Meta fora do ar: recarregue daqui a pouco.
                </p>
              ) : leitura.estado === 'sem-inscricao' ? (
                <p className="mt-4 text-sm text-tinta-media">
                  Perguntei, e o <strong>aplicativo</strong> não tem inscrição do
                  Instagram. Confira em Webhooks, na seção do Instagram, no portal da
                  Meta: conta inscrita e aplicativo sem campo marcado dá silêncio aqui
                  embaixo, com tudo parecendo certo em cima.
                </p>
              ) : leitura.estado === 'ok' && leitura.assinatura.ativa === false ? (
                <div className="mt-4 text-sm">
                  {/*
                    A inscrição pode estar DESATIVADA com todos os campos no lugar,
                    e até 25/11/2026 esta tela não perguntava isso.

                    O valor vinha da Meta desde sempre, em `assinatura.ativa`: era
                    lido, guardado num tipo e jogado fora — nenhum consumidor no
                    código inteiro. Sem ele, o último ramo escrevia "está assinado
                    em todos os avisos" para quem não recebe nada. É a pior linha
                    possível, porque encerra a investigação de quem a lê: foi o que
                    aconteceu numa instalação de verdade em 24 e 25/11/2026, onde
                    esta tela foi usada como prova de que esta metade estava boa.

                    Vem ANTES do campo que falta de propósito. Com a inscrição
                    desativada, marcar campo no portal não faz chegar nada, e
                    mandar marcar seria mandar a pessoa trabalhar à toa.

                    E é `=== false`, não `!ativa`: quando a Meta não diz se a
                    inscrição está ligada, o valor é `null`, e acusar nesse caso
                    mandaria consertar no portal uma instalação que está boa.
                    Calar quando não se sabe é o certo aqui, porque o preço dos
                    dois erros não é o mesmo.
                  */}
                  <p className="font-medium">
                    A inscrição do aplicativo está <strong>desativada</strong> na Meta.
                  </p>
                  <p className="mt-1 text-tinta-media">
                    Enquanto ela estiver assim, nenhum aviso chega aqui, nem com os
                    campos todos assinados, nem com a conta pedindo todos eles. No
                    portal da Meta, em Webhooks → Instagram, a inscrição precisa voltar
                    a ficar ativa. Se não houver como fazer isso por aí, conte para
                    quem cuida da sua instalação.
                  </p>
                </div>
              ) : faltandoNoApp.length > 0 ? (
                <div className="mt-4 text-sm">
                  <p className="font-medium">
                    O aplicativo não está assinado em:{' '}
                    {faltandoNoApp.map((c) => NOME_DO_CAMPO[c] ?? c).join(', ')}.
                  </p>
                  <p className="mt-1 text-tinta-media">
                    Esses avisos não chegam aqui, por mais que a conta os peça. No
                    portal da Meta, em Webhooks → Instagram, cada campo tem o próprio
                    botão de assinar. Na configuração de login unificado eles nascem
                    todos desmarcados.
                  </p>
                </div>
              ) : (
                <p className="mt-4 text-sm text-tinta-media">
                  O aplicativo está assinado em todos os avisos que o painel usa, e
                  entrega em{' '}
                  <span className="break-all">
                    {leitura.estado === 'ok'
                      ? leitura.assinatura.callbackUrl ?? 'nenhum endereço'
                      : 'nenhum endereço'}
                  </span>.
                </p>
              )}
              {faltando.length > 0 && (
                <div className="mt-4 text-sm">
                  <p className="font-medium">
                    Falta: {faltando.map((c) => NOME_DO_CAMPO[c] ?? c).join(', ')}.
                  </p>
                  <p className="mt-1">
                    {faltando.includes('comments')
                      ? 'Sem o aviso de comentário, automação de comentário nunca dispara: o Instagram não conta para cá que alguém comentou. '
                      : ''}
                    Abra Configuração e conecte a conta de novo: a conexão pede todos os
                    avisos. Se continuar faltando depois disso, o aplicativo no portal da
                    Meta é que não tem esse campo marcado.
                  </p>
                </div>
              )}
            </>
          )}
        </Cartao>
      </Secao>

      <Secao titulo="Eventos recebidos" descricao="Tudo que o Meta entregou. Se estiver vazio, confira o webhook no portal.">
        {webhooksRecentes.length === 0 ? <Vazio>Nenhum evento recebido ainda.</Vazio> : (
          <div className="grid gap-3">{webhooksRecentes.map((evento) => {
            /*
              De qual conta era o aviso que o painel recusou.

              "ignorado: conta não conectada" é verdade e não conclui nada: quem
              lê não sabe se o aviso era de outra conta ou da dela com o
              identificador trocado. O dado está no payload guardado, e a função
              cala quando não dá para afirmar.
            */
            const deQuemEra = contaDoAviso(evento, conta?.igUserId);
            return (
              <Cartao key={evento.id} className="flex flex-wrap items-center gap-2 p-3">
                <span className="text-sm">{dataPtBr(evento.receivedAt)}</span>
                {/*
                  O resumo é o que faltava: a lista dizia só o horário, e "chegou
                  alguma coisa" não ajuda ninguém a entender por que a automação
                  não disparou.
                */}
                <span className="text-sm text-tinta-media">{resumirEntrega(evento.raw)}</span>
                {!evento.signatureValid && <Chip cor="bg-caindo-tenue text-caindo-forte">Assinatura inválida</Chip>}
                {evento.error && <span className="break-all font-mono text-xs">{evento.error}</span>}
                {deQuemEra && (
                  <p className="basis-full text-sm">
                    {deQuemEra.tipo === 'teste-do-portal' ? (
                      <>
                        {/*
                          O aviso de exemplo do portal vem com a conta 0. Até
                          25/11/2026 esta linha o tratava como conta de verdade e
                          mandava reconectar: duas instalações novas geraram token
                          atrás de um problema que não existia.

                          O que ela diz agora é o que o teste prova e o que ele
                          NÃO prova. Para quem só tem esse aviso na lista, é a
                          diferença entre "está tudo entregando" e "ainda não
                          chegou aviso de verdade nenhum".
                        */}
                        Este é o <strong>aviso de exemplo do portal da Meta</strong>, o do botão
                        Testar: ele vem com a conta{' '}
                        <strong className="numero">0</strong>, que não é conta de ninguém, e por
                        isso o painel descarta. Ele mostra que o portal alcança este endereço.
                        Ele não mostra que aviso de conta de verdade chega: para isso, comente em
                        uma publicação sua com outro perfil e volte aqui.
                      </>
                    ) : deQuemEra.tipo === 'outra-conta' ? (
                      <>
                        Este aviso era para a conta{' '}
                        <strong className="numero">{deQuemEra.chegou}</strong>, e a conta conectada
                        neste painel é{' '}
                        <strong className="numero">{deQuemEra.conectada}</strong>. São contas
                        diferentes: por isso ele foi descartado, e nenhuma automação dispara por
                        avisos dessa outra conta. Se a conta de cima é a sua, abra Configuração e
                        conecte a conta de novo, com o token dela.
                      </>
                    ) : (
                      <>
                        Este aviso era para a conta{' '}
                        <strong className="numero">{deQuemEra.chegou}</strong>, e este painel não
                        tem conta conectada. Abra Configuração e conecte a conta do Instagram: até
                        lá, todo aviso que chegar vai ser descartado assim.
                      </>
                    )}
                  </p>
                )}
              </Cartao>
            );
          })}</div>
        )}
      </Secao>
    </div>
  );
}
