import Link from 'next/link';
import { getFirstAccount } from '@/lib/repo/accounts';
import { listAutomations } from '@/lib/repo/automations';
import { criarAutomacao } from './actions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function AutomacoesPage() {
  const account = await getFirstAccount();

  if (!account) {
    return (
      <div>
        <h1 className="mb-2 text-xl font-semibold">Automações</h1>
        <p className="text-sm text-neutral-600">
          Nenhuma conta conectada ainda.{' '}
          <Link href="/configuracao" className="underline">
            Conecte seu Instagram
          </Link>{' '}
          para começar.
        </p>
      </div>
    );
  }

  const automacoes = await listAutomations(account.id);

  return (
    <div>
      <h1 className="mb-6 text-xl font-semibold">Automações</h1>

      <form action={criarAutomacao} className="mb-8 flex flex-wrap gap-2">
        <input
          name="nome"
          placeholder="Nome da automação"
          className="flex-1 rounded-md border border-neutral-300 px-3 py-2 text-sm"
        />
        <select
          name="gatilho"
          className="rounded-md border border-neutral-300 px-3 py-2 text-sm"
        >
          <option value="comment">Comentário</option>
          <option value="dm">DM</option>
        </select>
        <button className="rounded-md bg-neutral-900 px-4 py-2 text-sm text-white">
          Criar
        </button>
      </form>

      {automacoes.length === 0 ? (
        <p className="text-sm text-neutral-500">
          Nenhuma automação ainda. Crie a primeira acima.
        </p>
      ) : (
        <ul className="divide-y divide-neutral-200 border-y border-neutral-200">
          {automacoes.map((a) => (
            <li key={a.id} className="flex items-center justify-between py-3">
              <div>
                <Link href={`/automacoes/${a.id}`} className="font-medium hover:underline">
                  {a.name}
                </Link>
                <p className="text-sm text-neutral-500">
                  {a.triggerType === 'comment' ? 'Comentário' : 'DM'}
                  {' · '}
                  {a.matchMode === 'any'
                    ? 'qualquer texto'
                    : a.keywords.join(', ') || 'sem palavra-chave'}
                  {' · '}
                  {a.deliveryCount} disparo{a.deliveryCount === 1 ? '' : 's'}
                </p>
              </div>
              <span
                className={`rounded-full px-2 py-1 text-xs ${
                  a.status === 'published'
                    ? 'bg-green-100 text-green-800'
                    : 'bg-neutral-100 text-neutral-600'
                }`}
              >
                {a.status === 'published' ? 'Publicada' : 'Rascunho'}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
