import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getAutomation } from '@/lib/repo/automations';
import { getFirstAccount } from '@/lib/repo/accounts';
import { listMedia, type Media } from '@/lib/meta/media';
import { salvarAutomacao, excluirAutomacao } from '../../actions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CAMPO = 'w-full rounded-md border border-neutral-300 px-3 py-2 text-sm';
const CARD = 'rounded-lg border border-neutral-200 p-4';

export default async function EditorPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ erro?: string }>;
}) {
  const { id } = await params;
  const { erro } = await searchParams;
  const automacao = await getAutomation(Number(id));
  if (!automacao) notFound();

  const account = await getFirstAccount();
  let midias: Media[] = [];
  let erroMidias: string | null = null;

  if (account) {
    try {
      midias = await listMedia(account.igUserId, account.accessToken);
    } catch (error) {
      erroMidias = String(error);
    }
  }

  const publica = automacao.steps.find((s) => s.kind === 'public_reply');
  const dm = automacao.steps.find((s) => s.kind === 'dm');
  const botao = dm?.buttons[0];

  return (
    <div>
      <Link href="/" className="text-sm text-neutral-500 hover:underline">
        ← Automações
      </Link>

      {erro === 'dm-vazia' && (
        <p className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          Não publiquei: a DM privada está vazia. Sem texto ali, ninguém recebe
          nada. Salvei como rascunho — preencha a DM e publique de novo.
        </p>
      )}

      <form action={salvarAutomacao} className="mt-4 flex flex-col gap-6">
        <input type="hidden" name="id" value={automacao.id} />

        <div className={CARD}>
          <h2 className="mb-3 font-medium">Gatilho</h2>
          <div className="flex flex-col gap-3">
            <input name="nome" defaultValue={automacao.name} className={CAMPO} />

            <select name="gatilho" defaultValue={automacao.triggerType} className={CAMPO}>
              <option value="comment">Quando alguém comenta</option>
              <option value="dm">Quando alguém manda DM</option>
            </select>

            {midias.length > 0 ? (
              <select name="mediaId" defaultValue={automacao.mediaId ?? ''} className={CAMPO}>
                <option value="">Qualquer Reel ou post</option>
                {/*
                  A lista vem sem paginação (limit 50 em src/lib/meta/media.ts).
                  Se a automação aponta pra uma mídia fora dessas 50 mais
                  recentes, o <select> não teria essa opção e o navegador cairia
                  pro value="" — e o próximo save gravaria media_id = null,
                  convertendo silenciosamente uma automação de um Reel
                  específico em "qualquer Reel ou post". Esta opção extra
                  preserva o valor atual até ele ser trocado de propósito.
                */}
                {automacao.mediaId && !midias.some((m) => m.id === automacao.mediaId) && (
                  <option value={automacao.mediaId}>
                    Reel atual — não encontrado na lista
                  </option>
                )}
                {midias.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.type === 'REELS' ? 'Reel' : 'Post'} ·{' '}
                    {m.caption ? m.caption.slice(0, 60) : m.id}
                  </option>
                ))}
              </select>
            ) : (
              <>
                <input
                  name="mediaId"
                  defaultValue={automacao.mediaId ?? ''}
                  placeholder="ID do Reel (vazio = qualquer Reel)"
                  className={CAMPO}
                />
                <p className="text-xs text-neutral-500">
                  {erroMidias
                    ? `Não consegui listar suas mídias: ${erroMidias}`
                    : 'Conecte a conta em Configuração para escolher o Reel numa lista.'}
                </p>
              </>
            )}

            <input
              name="palavras"
              defaultValue={automacao.keywords.join(', ')}
              placeholder="Palavras-chave separadas por vírgula"
              className={CAMPO}
            />

            <select name="modo" defaultValue={automacao.matchMode} className={CAMPO}>
              <option value="contains">Contém a palavra</option>
              <option value="exact">É exatamente a palavra</option>
              <option value="any">Qualquer comentário</option>
            </select>
          </div>
        </div>

        <div className={CARD}>
          <h2 className="mb-1 font-medium">Resposta pública no comentário</h2>
          <p className="mb-3 text-sm text-neutral-500">
            Uma por linha. O sistema sorteia entre elas a cada disparo, para não
            parecer robô. Deixe vazio para não responder publicamente.
          </p>
          <textarea
            name="respostasPublicas"
            rows={4}
            defaultValue={publica?.variants.join('\n') ?? ''}
            className={CAMPO}
          />
        </div>

        <div className={CARD}>
          <h2 className="mb-1 font-medium">DM privada</h2>
          <p className="mb-3 text-sm text-neutral-500">
            Uma variação por linha. O pedido de follow e o link vão nesta mesma
            mensagem, de propósito: uma segunda DM cairia fora da janela de 24h
            do Meta e falharia com erro #10.
          </p>
          <textarea
            name="textosDm"
            rows={4}
            defaultValue={dm?.variants.join('\n') ?? ''}
            className={CAMPO}
          />

          <div className="mt-3 flex gap-2">
            <input
              name="botaoTitulo"
              defaultValue={botao?.title ?? ''}
              placeholder="Texto do botão"
              className={CAMPO}
            />
            <input
              name="botaoUrl"
              defaultValue={botao?.url ?? ''}
              placeholder="https://seu-link.com"
              className={CAMPO}
            />
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            name="acao"
            value="rascunho"
            className="rounded-md border border-neutral-300 px-4 py-2 text-sm"
          >
            Salvar rascunho
          </button>
          <button
            name="acao"
            value="publicar"
            className="rounded-md bg-neutral-900 px-4 py-2 text-sm text-white"
          >
            Publicar
          </button>
          <span className="text-sm text-neutral-500">
            {automacao.status === 'published'
              ? 'Publicada — disparando agora'
              : 'Rascunho — não dispara'}
          </span>
        </div>
      </form>

      <form action={excluirAutomacao} className="mt-8">
        <input type="hidden" name="id" value={automacao.id} />
        <button className="text-sm text-red-600 hover:underline">
          Excluir automação
        </button>
      </form>
    </div>
  );
}
