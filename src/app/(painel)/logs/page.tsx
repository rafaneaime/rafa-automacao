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
import { listRecentEvents } from '@/lib/repo/webhook-events';
import { resumirEntrega } from '@/lib/painel/resumo-da-entrega';
import { camposInscritos, camposQueFaltam } from '@/lib/meta/subscribe';
import { getFirstAccount } from '@/lib/repo/accounts';
import { NOME_DO_CAMPO } from '@/lib/painel/campos-do-webhook';

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
   */
  const conta = await getFirstAccount();
  const inscricao = await (async () => {
    if (!conta?.accessToken) return { ok: false as const, motivo: 'conta-nao-conectada' as const };
    try {
      return { ok: true as const, campos: await camposInscritos(conta.igUserId, conta.accessToken) };
    } catch {
      return { ok: false as const, motivo: 'nao-respondeu' as const };
    }
  })();
  const faltando = inscricao.ok ? camposQueFaltam(inscricao.campos) : [];

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
          {!inscricao.ok ? (
            <p className="text-sm">
              {inscricao.motivo === 'conta-nao-conectada'
                ? 'Conecte a conta do Instagram em Configuração para poder perguntar isto ao Instagram.'
                : 'Não consegui perguntar ao Instagram agora. Tente recarregar esta tela em alguns instantes.'}
            </p>
          ) : (
            <>
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
              {/*
                Estar na lista não é garantia de entrega, e dizer o contrário
                custa caro. Numa instalação, "comentário em post" aparecia aqui
                e nenhum comentário chegava: a conta pede os avisos, mas quem
                entrega é o aplicativo no portal da Meta, e ele tem a própria
                lista de campos assinados. Essa segunda lista não dá para ler
                por API com as credenciais que a instalação tem — então a tela
                diz onde olhar em vez de fingir que sabe.
              */}
              {faltando.length === 0 && (
                <p className="mt-4 text-sm text-tinta-media">
                  Esta é a lista que a <strong>sua conta</strong> pediu. Se um
                  aviso está aqui e mesmo assim nunca chega nada dele, o lugar
                  de olhar é o aplicativo no portal da Meta: em Webhooks, na
                  seção do Instagram, cada campo tem o próprio botão de
                  inscrever. Conta inscrita e aplicativo sem o campo marcado dá
                  exatamente isto — uma lista bonita aqui e silêncio lá embaixo.
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
          <div className="grid gap-3">{webhooksRecentes.map((evento) => (
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
            </Cartao>
          ))}</div>
        )}
      </Secao>
    </div>
  );
}
