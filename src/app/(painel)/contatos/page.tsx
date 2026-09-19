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
import { completarPerfisDeContatos } from '../actions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function ContatosPage() {
  const account = await getFirstAccount();
  const contatos = account ? await listContacts(account.id) : [];

  return (
    <div>
      <h1 className="mb-6 text-xl font-semibold">Contatos</h1>

      {/*
        Quem entrou por mensagem aparece como número: o webhook de mensagem não
        traz o `@`. Novos já chegam preenchidos; este botão busca os antigos.
      */}
      {contatos.some((c) => !c.username) && (
        <form action={completarPerfisDeContatos} className="mb-6">
          <p className="mb-2 text-sm text-tinta-media">
            Alguns contatos aparecem como número porque entraram por mensagem direta, e o
            aviso do Instagram não traz o @ de quem escreveu.
          </p>
          <button
            type="submit"
            className="rounded-lg border border-linha-forte px-3 py-2 text-sm font-medium hover:border-tinta"
          >
            Buscar @ e nome no Instagram
          </button>
          <span className="ml-2 text-xs text-tinta-fraca">
            até 25 por vez; clique de novo se sobrar
          </span>
        </form>
      )}

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
