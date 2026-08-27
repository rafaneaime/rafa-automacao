/**
 * Tela de Contatos — versão do PRODUTO BASE.
 *
 * Exportada como `page.tsx` na base, pela substituição declarada em
 * `distribuicao.json`. Ver `ARCHITECTURE.md` §13.
 *
 * A versão da Plataforma mostra temperatura, filtro, busca e link para o
 * perfil do contato. Esta é a lista simples: a base não tem tabela de score
 * nem a rota `/contatos/[id]`, e linkar para ela daria 404 na conta do aluno.
 */
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
        <p className="text-sm text-tinta-fraca">
          Ninguém interagiu ainda. Assim que alguém comentar ou mandar DM,
          aparece aqui.
        </p>
      ) : (
        <table className="w-full text-sm">
          <thead className="border-b border-linha-forte text-left text-tinta-fraca">
            <tr>
              <th className="py-2 font-normal">Usuário</th>
              <th className="py-2 font-normal">ID</th>
              <th className="py-2 font-normal">Última interação</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-linha">
            {contatos.map((c) => (
              <tr key={c.id}>
                <td className="py-2">{c.username ? `@${c.username}` : '—'}</td>
                <td className="py-2 font-mono text-xs text-tinta-fraca">{c.igUserId}</td>
                <td className="py-2 text-tinta-fraca">
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
