import { listDeliveries } from '@/lib/repo/deliveries';
import { listRecentEvents } from '@/lib/repo/webhook-events';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CORES: Record<string, string> = {
  sent: 'bg-subindo-tenue text-subindo-forte',
  error: 'bg-caindo-tenue text-caindo-forte',
  throttled: 'bg-interessado-tenue text-interessado-forte',
  pending: 'bg-frio-tenue text-tinta-media',
};

const ROTULOS: Record<string, string> = {
  sent: 'enviado',
  error: 'erro',
  throttled: 'segurado',
  pending: 'pendente',
};

export default async function LogsPage() {
  const [disparos, eventos] = await Promise.all([
    listDeliveries(100),
    listRecentEvents(30),
  ]);

  return (
    <div className="flex flex-col gap-10">
      <section>
        <h1 className="mb-1 text-xl font-semibold">Disparos</h1>
        <p className="mb-4 text-sm text-tinta-fraca">
          O que cada automação fez, e o erro exato do Meta quando falhou.
        </p>

        {disparos.length === 0 ? (
          <p className="text-sm text-tinta-fraca">
            Nenhum disparo ainda. Comente a palavra-chave no seu post ou Reel
            usando a <strong>segunda</strong> conta do Instagram — a que você
            cadastrou como Testador do Instagram — e não a conta que roda a
            automação: comentários dela são ignorados de propósito.
          </p>
        ) : (
          <ul className="divide-y divide-linha border-y border-linha-forte">
            {disparos.map((d) => (
              <li key={`${d.kind}-${d.id}`} className="py-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{d.automationName}</span>
                    {d.kind === 'follow_up' && (
                      <span className="rounded-full bg-frio-tenue px-2 py-0.5 text-xs text-tinta-media">
                        continuação {d.continuacao}
                      </span>
                    )}
                  </div>
                  <span className={`rounded-full px-2 py-0.5 text-xs ${CORES[d.status] ?? ''}`}>
                    {ROTULOS[d.status] ?? d.status}
                  </span>
                </div>
                <p className="text-xs text-tinta-fraca">
                  {d.igUserId} · {new Date(d.createdAt).toLocaleString('pt-BR')}
                </p>
                {d.error && (
                  <p className="mt-1 break-all font-mono text-xs text-caindo-forte">{d.error}</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-1 text-lg font-semibold">Eventos recebidos</h2>
        <p className="mb-4 text-sm text-tinta-fraca">
          Tudo que o Meta entregou no webhook. Se aqui está vazio, o problema é a
          configuração do webhook no portal, não a automação.
        </p>

        {eventos.length === 0 ? (
          <p className="text-sm text-tinta-fraca">Nenhum evento recebido ainda.</p>
        ) : (
          <ul className="divide-y divide-linha border-y border-linha-forte text-sm">
            {eventos.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center gap-2 py-2">
                <span className="text-tinta-fraca">
                  {new Date(e.receivedAt).toLocaleString('pt-BR')}
                </span>
                {!e.signatureValid && (
                  <span className="rounded-full bg-caindo-tenue px-2 py-0.5 text-xs text-caindo-forte">
                    assinatura inválida
                  </span>
                )}
                {e.error && (
                  <span className="break-all font-mono text-xs text-caindo-forte">{e.error}</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
