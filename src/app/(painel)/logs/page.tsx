import { listDeliveries } from '@/lib/repo/deliveries';
import { listRecentEvents } from '@/lib/repo/webhook-events';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CORES: Record<string, string> = {
  sent: 'bg-green-100 text-green-800',
  error: 'bg-red-100 text-red-800',
  throttled: 'bg-amber-100 text-amber-800',
  pending: 'bg-neutral-100 text-neutral-600',
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
        <p className="mb-4 text-sm text-neutral-500">
          O que cada automação fez, e o erro exato do Meta quando falhou.
        </p>

        {disparos.length === 0 ? (
          <p className="text-sm text-neutral-500">
            Nenhum disparo ainda. Rode <code>npm run simulate:comment</code> para
            testar sem precisar comentar no Instagram.
          </p>
        ) : (
          <ul className="divide-y divide-neutral-100 border-y border-neutral-200">
            {disparos.map((d) => (
              <li key={d.id} className="py-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-medium">{d.automationName}</span>
                  <span className={`rounded-full px-2 py-0.5 text-xs ${CORES[d.status] ?? ''}`}>
                    {ROTULOS[d.status] ?? d.status}
                  </span>
                </div>
                <p className="text-xs text-neutral-500">
                  {d.igUserId} · {new Date(d.createdAt).toLocaleString('pt-BR')}
                </p>
                {d.error && (
                  <p className="mt-1 break-all font-mono text-xs text-red-700">{d.error}</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-1 text-lg font-semibold">Eventos recebidos</h2>
        <p className="mb-4 text-sm text-neutral-500">
          Tudo que o Meta entregou no webhook. Se aqui está vazio, o problema é a
          configuração do webhook no portal, não a automação.
        </p>

        {eventos.length === 0 ? (
          <p className="text-sm text-neutral-500">Nenhum evento recebido ainda.</p>
        ) : (
          <ul className="divide-y divide-neutral-100 border-y border-neutral-200 text-sm">
            {eventos.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center gap-2 py-2">
                <span className="text-neutral-500">
                  {new Date(e.receivedAt).toLocaleString('pt-BR')}
                </span>
                {!e.signatureValid && (
                  <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-800">
                    assinatura inválida
                  </span>
                )}
                {e.error && (
                  <span className="break-all font-mono text-xs text-red-700">{e.error}</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
