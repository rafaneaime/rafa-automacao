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
  return new Date(data).toLocaleString('pt-BR');
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

      <Secao titulo="Eventos recebidos" descricao="Tudo que o Meta entregou. Se estiver vazio, confira o webhook no portal.">
        {webhooksRecentes.length === 0 ? <Vazio>Nenhum evento recebido ainda.</Vazio> : (
          <div className="grid gap-3">{webhooksRecentes.map((evento) => <Cartao key={evento.id} className="flex flex-wrap items-center gap-2 p-3"><span className="text-sm">{dataPtBr(evento.receivedAt)}</span>{!evento.signatureValid && <Chip cor="bg-caindo-tenue text-caindo-forte">Assinatura inválida</Chip>}{evento.error && <span className="break-all font-mono text-xs">{evento.error}</span>}</Cartao>)}</div>
        )}
      </Secao>
    </div>
  );
}
