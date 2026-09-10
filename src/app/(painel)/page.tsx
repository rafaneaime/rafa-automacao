import Link from 'next/link';
import { getFirstAccount } from '@/lib/repo/accounts';
import { listAutomations } from '@/lib/repo/automations';
import { IconeMegafone } from '@/lib/painel/icones';
import {
  Botao,
  Cartao,
  Chip,
  ESTILO_CAMPO,
  TituloDaTela,
  Vazio,
} from '@/lib/painel/ui';
import { criarAutomacao } from './actions';
import type { TipoDeGatilho } from '@/lib/repo/types';

const GATILHO: Record<TipoDeGatilho, string> = {
  comment: 'Comentário',
  dm: 'DM',
  story_reply: 'Resposta de Story',
};

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function AutomacoesPage() {
  const account = await getFirstAccount();

  if (!account) {
    return (
      <div>
        <TituloDaTela
          titulo="Automações"
          pergunta="O que dispara sozinho quando alguém comenta ou manda DM."
          icone={<IconeMegafone className="h-5 w-5" />}
        />
        <Vazio>
          Nenhuma conta conectada ainda.{' '}
          <Link href="/configuracao" className="underline">
            Conecte seu Instagram
          </Link>{' '}
          para começar.
        </Vazio>
      </div>
    );
  }

  const automacoes = await listAutomations(account.id);

  return (
    <div>
      <TituloDaTela
        titulo="Automações"
        pergunta="O que dispara sozinho quando alguém comenta ou manda DM."
        icone={<IconeMegafone className="h-5 w-5" />}
      />

      <form action={criarAutomacao} className="mb-6 flex flex-wrap gap-2">
        <input
          name="nome"
          placeholder="Nome da automação"
          className={`flex-1 ${ESTILO_CAMPO}`}
        />
        <select
          name="gatilho"
          className={ESTILO_CAMPO}
        >
          <option value="comment">Comentário</option>
          <option value="dm">DM</option>
        </select>
        <Botao>Criar</Botao>
      </form>

      {automacoes.length === 0 ? (
        <Vazio>Nenhuma automação ainda. Crie a primeira acima.</Vazio>
      ) : (
        <Cartao>
        <ul className="divide-y divide-linha">
          {automacoes.map((a) => (
            <li key={a.id} className="flex items-center justify-between gap-3 p-4">
              <div>
                <Link href={`/automacoes/${a.id}`} className="font-medium hover:underline">
                  {a.name}
                </Link>
                <p className="mt-0.5 text-sm text-tinta-media">
                  {GATILHO[a.triggerType] ?? 'DM'}
                  {' · '}
                  {a.matchMode === 'any'
                    ? 'qualquer texto'
                    : a.keywords.join(', ') || 'sem palavra-chave'}
                  {' · '}
                  {a.deliveryCount} disparo{a.deliveryCount === 1 ? '' : 's'}
                </p>
              </div>
              <Chip
                cor={
                  a.status === 'published'
                    ? 'bg-subindo-tenue text-subindo-forte'
                    : 'bg-frio-tenue text-tinta-media'
                }
              >
                {a.status === 'published' ? 'Publicada' : 'Rascunho'}
              </Chip>
            </li>
          ))}
        </ul>
        </Cartao>
      )}
    </div>
  );
}
