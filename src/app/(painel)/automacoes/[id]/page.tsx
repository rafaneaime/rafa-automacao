import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getAutomation } from '@/lib/repo/automations';
import { getFirstAccount } from '@/lib/repo/accounts';
import { listMedia, type Media } from '@/lib/meta/media';
import { salvarAutomacao, excluirAutomacao } from '../../actions';
import { BotoesSalvar } from './botoes-salvar';
import { CamposDeVariacoes } from './campo-variacoes';

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
  if (!account || automacao.accountId !== account.id) notFound();
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
  const naoSegue = automacao.steps.find((s) => s.kind === 'dm_nao_segue');
  // O Instagram só conta se a pessoa segue depois que ela escreve para a conta.
  // Quem comentou ainda não escreveu, e a pergunta volta recusada.
  const podeConferirSeSegue = automacao.triggerType !== 'comment';
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
        <p className="mt-4 rounded-md border border-subindo-tenue bg-subindo-tenue px-3 py-2 text-sm text-subindo-forte">
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
              <option value="story_reply">Quando alguém responde um Story</option>
            </select>
            {/*
              Story não tem comentário: a resposta chega como DM. Sem esta
              frase, "responde um Story" e "manda DM" parecem a mesma coisa
              escrita de dois jeitos, e a pessoa escolhe no chute.
            */}
            <p className="text-sm text-tinta-media">
              Resposta de Story chega como mensagem direta. A automação de
              Story pega só quem veio de um Story; a de DM pega o resto.
            </p>

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
            Escreva a resposta. Para ter mais de uma versão, e o sistema sortear
            entre elas a cada disparo, use o botão de acrescentar. Deixe vazio
            para não responder publicamente.
          </p>
          <CamposDeVariacoes
            name="respostasPublicas"
            rows={4}
            defaultValues={publica?.variants ?? []}
            className={CAMPO}
            rotuloDeAdicionar="Acrescentar outra resposta"
          />
        </div>

        <div className={CARD}>
          <h2 className="mb-1 font-medium">DM privada</h2>
          <p className="mb-3 text-sm text-tinta-fraca">
            Escreva a mensagem — as quebras de linha e as linhas em branco ficam
            nela, do jeito que você escrever. Para ter mais de uma versão, e o
            sistema sortear entre elas a cada disparo, use o botão de
            acrescentar. O pedido de follow e o link vão nesta mesma mensagem, de
            propósito: uma segunda DM cairia fora da janela de 24h do Meta e
            falharia com erro #10.
          </p>
          <p className="mb-3 text-sm text-tinta-fraca">
            Escreva <code>{'{nome}'}</code> onde o nome da pessoa deve entrar —{' '}
            <code>{'{name}'}</code> também vale, que é como se escreve no
            ManyChat. Quando o Instagram não conta o nome de quem comentou, o
            marcador some junto com o espaço que sobraria, em vez de sair
            escrito na mensagem.
          </p>
          <CamposDeVariacoes
            name="textosDm"
            rows={4}
            defaultValues={dm?.variants ?? []}
            className={CAMPO}
            rotuloDeAdicionar="Acrescentar outra versão da DM"
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
          <h2 className="mb-1 font-medium">Quem ainda não segue</h2>
          {podeConferirSeSegue ? (
            <>
              <p className="mb-3 text-sm text-tinta-fraca">
                Mensagem que sai <strong>no lugar da DM acima</strong> enquanto a
                pessoa não seguir a conta.
              </p>
              <CamposDeVariacoes
                name="textosNaoSegue"
                rows={3}
                defaultValues={naoSegue?.variants ?? []}
                className={CAMPO}
                rotuloDeAdicionar="Acrescentar outra versão"
              />
              <p className="mt-3 text-sm text-tinta-media">
                Se o Instagram não responder se a pessoa segue, ela recebe a DM
                normal. Na dúvida, quem pediu recebe o que pediu.
              </p>
            </>
          ) : (
            <>
              {/*
                A caixinha e o texto sao decisoes separadas: quem desmarca
                continua com a mensagem escrita, e remarcar nao obriga a
                reescrever nada.
              */}
              <label className="mb-3 flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  name="exigirSeguir"
                  value="sim"
                  defaultChecked={automacao.exigirSeguir}
                  className="mt-1"
                />
                <span>
                  <strong>Exigir que a pessoa siga antes de receber.</strong>{' '}
                  Com isto marcado, enquanto ela não seguir, toda resposta dela
                  recebe o texto abaixo e a continuação da conversa fica
                  esperando. Desmarcado, o texto não é usado e todo mundo recebe
                  igual.
                </span>
              </label>
              <p className="mb-3 rounded-md bg-interessado-tenue p-3 text-sm text-interessado-forte">
                Na hora do comentário não dá para conferir: o Instagram só conta
                se a pessoa segue depois que ela <strong>escreve</strong> para
                você, e quem comentou ainda não escreveu. Mas quando ela{' '}
                <strong>responde a sua DM</strong>, ela escreveu — e aí dá.
              </p>
              <p className="mb-3 text-sm text-tinta-fraca">
                Então o caminho que funciona é este: na DM acima, peça uma
                resposta (&ldquo;responde aqui que eu te mando&rdquo;) e deixe o
                link para a <strong>Continuação da conversa</strong>, logo
                abaixo. Escreva o pedido de seguir aqui, e quem ainda não seguir
                recebe ele no lugar da continuação — de novo a cada resposta,
                até seguir.
              </p>
              <CamposDeVariacoes
                name="textosNaoSegue"
                rows={3}
                defaultValues={naoSegue?.variants ?? []}
                className={CAMPO}
                rotuloDeAdicionar="Acrescentar outra versão"
              />
              <label className="mt-3 block text-sm text-tinta-media">
                Botão de conferir (opcional)
                <input
                  name="botaoConferirSeguir"
                  defaultValue={naoSegue?.buttons[0]?.title ?? ''}
                  placeholder="Já estou seguindo"
                  maxLength={20}
                  className={`${CAMPO} mt-1`}
                />
              </label>
              <p className="mt-2 text-sm text-tinta-fraca">
                Este botão não leva a lugar nenhum: ao tocar nele, a pessoa
                avisa que seguiu e a conta é conferida na hora. Se seguiu mesmo,
                ela recebe a continuação; se não, recebe este texto de novo.
                Sem o botão, ela precisa digitar uma resposta — e boa parte some
                antes disso. O Instagram aceita até 20 caracteres no título.
              </p>
              <p className="mt-3 text-sm text-tinta-media">
                Se o Instagram não responder se a pessoa segue, a conversa corre
                normalmente. Quando a consulta falha, quem ficaria sem o material
                é alguém que talvez já siga você.
              </p>
            </>
          )}
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
            <CamposDeVariacoes
              name="followUp1"
              rows={3}
              defaultValues={followUps[0]?.variants ?? []}
              className={CAMPO}
            />
          </label>
          <div className="mt-2 flex gap-2">
            <input
              name="botaoFollowUp1Titulo"
              defaultValue={followUps[0]?.buttons[0]?.title ?? ''}
              placeholder="Texto do botão"
              className={CAMPO}
            />
            <input
              name="botaoFollowUp1Url"
              defaultValue={followUps[0]?.buttons[0]?.url ?? ''}
              placeholder="https://seu-link.com"
              className={CAMPO}
            />
          </div>

          <label className="mt-4 block text-sm text-tinta-media">
            Mensagem 2
            <CamposDeVariacoes
              name="followUp2"
              rows={3}
              defaultValues={followUps[1]?.variants ?? []}
              className={CAMPO}
            />
          </label>
          <div className="mt-2 flex gap-2">
            <input
              name="botaoFollowUp2Titulo"
              defaultValue={followUps[1]?.buttons[0]?.title ?? ''}
              placeholder="Texto do botão"
              className={CAMPO}
            />
            <input
              name="botaoFollowUp2Url"
              defaultValue={followUps[1]?.buttons[0]?.url ?? ''}
              placeholder="https://seu-link.com"
              className={CAMPO}
            />
          </div>
          <p className="mt-3 text-sm text-tinta-fraca">
            O botão é opcional e só aparece quando você preenche o endereço. É
            melhor que o link solto no texto: o Instagram desenha o botão, e o
            clique conta como clique.
          </p>
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
        <button className="text-sm text-caindo-forte hover:underline">
          Excluir automação
        </button>
      </form>
    </div>
  );
}
