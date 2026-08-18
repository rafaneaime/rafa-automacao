import { getFirstAccount } from '@/lib/repo/accounts';
import { listContacts } from '@/lib/repo/contacts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function ContatosPage() {
  const account = await getFirstAccount();
  const contatos = account ? await listContacts(account.id) : [];

  return (
    <div>
      <h1 className="mb-6 text-xl font-semibold">Contatos</h1>

      {contatos.length === 0 ? (
        <p className="text-sm text-neutral-500">
          Ninguém interagiu ainda. Assim que alguém comentar ou mandar DM,
          aparece aqui.
        </p>
      ) : (
        <table className="w-full text-sm">
          <thead className="border-b border-neutral-200 text-left text-neutral-500">
            <tr>
              <th className="py-2 font-normal">Usuário</th>
              <th className="py-2 font-normal">ID</th>
              <th className="py-2 font-normal">Última interação</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {contatos.map((c) => (
              <tr key={c.id}>
                <td className="py-2">{c.username ? `@${c.username}` : '—'}</td>
                <td className="py-2 font-mono text-xs text-neutral-500">{c.igUserId}</td>
                <td className="py-2 text-neutral-500">
                  {new Date(c.lastSeenAt).toLocaleString('pt-BR')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
