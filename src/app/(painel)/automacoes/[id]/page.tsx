import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getAutomation } from '@/lib/repo/automations';
import { getFirstAccount } from '@/lib/repo/accounts';
import { listMedia, type Media } from '@/lib/meta/media';
import { salvarAutomacao, excluirAutomacao } from '../../actions';
import { BotoesSalvar } from './botoes-salvar';
import { juntarVariacoes } from '@/lib/automations/variacoes';
import { CampoDeVariacoes } from './campo-variacoes';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CAMPO = 'w-full rounded-md border border-linha-forte px-3 py-2 text-sm';
const CARD = 'rounded-lg border border-linha-forte p-4';

export default async function EditorPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ erro?: string; ok?: string }>;
}) {
  const { id } = await params;
  const { erro, ok } = await searchParams;
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
  const followUps = automacao.steps
    .filter((s) => s.kind === 'follow_up')
    .sort((a, b) => a.position - b.position);

  return (
    <div>
      <Link href="/" className="text-sm text-tinta-fraca hover:underline">
        ← Automações
      </Link>

      <div className="mt-2 flex items-center gap-3">
        <h1 className="text-xl font-semibold">{automacao.name}</h1>
        <span
          className={`rounded-full px-2 py-1 text-xs ${
            automacao.status === 'published'
              ? 'bg-subindo-tenue text-subindo-forte'
              : 'bg-frio-tenue text-tinta-media'
          }`}
        >
          {automacao.status === 'published' ? 'Publicada' : 'Rascunho'}
        </span>
      </div>

      {erro === 'dm-vazia' && (
        <p className="mt-4 rounded-md border border-caindo-tenue bg-caindo-tenue px-3 py-2 text-sm text-caindo-forte">
          Não publiquei: a DM privada está vazia. Sem texto ali, ninguém recebe
          nada. Salvei como rascunho — preencha a DM e publique de novo.
        </p>
      )}

      {ok === 'publicada' && (
        <p className="mt-4 rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-subindo-forte">
          Publicada. A partir de agora ela dispara sozinha, a cada comentário que
          casar com as palavras-chave.
        </p>
      )}

      {ok === 'rascunho' && (
        <p className="mt-4 rounded-md border border-linha-forte bg-papel px-3 py-2 text-sm text-tinta-media">
          Rascunho salvo. Ela ainda <strong>não</strong> dispara — clique em
          Publicar quando estiver pronta.
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
                <p className="text-xs text-tinta-fraca">
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
          <p className="mb-3 text-sm text-tinta-fraca">
            Escreva a resposta. Para ter mais de uma versão, e o sistema
            sortear entre elas, separe cada uma com <strong>uma linha em
            branco</strong>. Deixe vazio para não responder publicamente.
          </p>
          <CampoDeVariacoes
            name="respostasPublicas"
            rows={4}
            defaultValue={juntarVariacoes(publica?.variants ?? [])}
            className={CAMPO}
          />
        </div>

        <div className={CARD}>
          <h2 className="mb-1 font-medium">DM privada</h2>
          <p className="mb-3 text-sm text-tinta-fraca">
            Escreva a mensagem — as quebras de linha ficam nela. Para ter mais
            de uma versão, e o sistema sortear entre elas, separe cada uma com{' '}
            <strong>uma linha em branco</strong>. O pedido de follow e o link
            vão nesta mesma mensagem, de propósito: uma segunda DM cairia fora
            da janela de 24h do Meta e falharia com erro #10.
          </p>
          <CampoDeVariacoes
            name="textosDm"
            rows={4}
            defaultValue={juntarVariacoes(dm?.variants ?? [])}
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

        <div className={CARD}>
          <h2 className="mb-1 font-medium">Continuação da conversa</h2>
          <p className="mb-3 text-sm text-tinta-fraca">
            Mensagens que saem <strong>depois que a pessoa responder</strong> a
            sua DM. Uma por linha em cada campo: a primeira resposta dela dispara
            a mensagem 1, a resposta seguinte dispara a mensagem 2.
          </p>
          <p className="mb-3 rounded-md bg-interessado-tenue p-3 text-sm text-interessado-forte">
            Elas só saem se a pessoa responder. O Instagram não permite continuar
            a conversa sozinho — a resposta dela é o que abre a janela de 24 horas
            que autoriza a próxima mensagem. Se ela nunca responder, nada é
            enviado, e isso não é defeito.
          </p>

          <label className="block text-sm text-tinta-media">
            Mensagem 1
            <CampoDeVariacoes
              name="followUp1"
              rows={3}
              defaultValue={juntarVariacoes(followUps[0]?.variants ?? [])}
              className={CAMPO}
            />
          </label>

          <label className="mt-3 block text-sm text-tinta-media">
            Mensagem 2
            <CampoDeVariacoes
              name="followUp2"
              rows={3}
              defaultValue={juntarVariacoes(followUps[1]?.variants ?? [])}
              className={CAMPO}
            />
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <BotoesSalvar publicada={automacao.status === 'published'} />
          <span className="text-sm text-tinta-fraca">
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
