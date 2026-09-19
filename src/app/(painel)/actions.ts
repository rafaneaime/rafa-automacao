'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requirePanelSession } from '@/lib/auth';
import { getFirstAccount } from '@/lib/repo/accounts';
import { contatosSemUsername, gravarPerfilSeAusente } from '@/lib/repo/contacts';
import { getPerfilDaConversa } from '@/lib/meta/profile';
import {
  createAutomation,
  getAutomation,
  saveAutomation,
  deleteAutomation,
} from '@/lib/repo/automations';
import { AutomacaoInvalidaError } from '@/lib/automations/validation';
import { mesclarPassos } from '@/lib/automations/passos';
import type { MatchMode } from '@/lib/matching';
import type { TipoDeGatilho } from '@/lib/repo/types';
import { separarVariacoes } from '@/lib/automations/variacoes';

/**
 * Variações de mensagem. A regra é linha em branco separa — ver
 * `lib/automations/variacoes.ts`, que explica por que ela mudou.
 */
const linhas = separarVariacoes;

/**
 * O gatilho vem de um `<select>`, e o que chega aqui é texto do navegador.
 *
 * Lista fechada, e `comment` quando não reconhecer: um valor inventado no
 * formulário não pode virar automação que nunca dispara, calada. Estava
 * escrito duas vezes como um ternário `=== 'dm'` — que, com o terceiro
 * gatilho, transformaria "responde um Story" em "comentário" na hora de
 * salvar, sem erro nenhum aparecer.
 */
function lerGatilho(valor: FormDataEntryValue | null): TipoDeGatilho {
  return valor === 'dm' || valor === 'story_reply' ? valor : 'comment';
}

/**
 * Busca na Meta o `@` e o nome de quem entrou por mensagem.
 *
 * Contato que chega por comentário traz o `@` no próprio webhook; o que chega
 * por mensagem — inclusive resposta de Story — traz só o id. Desde 18/09/2026
 * isso é preenchido sozinho na chegada, mas quem já estava na lista antes
 * continua aparecendo como um número de 16 dígitos. Este botão é o que
 * conserta o que ficou para trás.
 *
 * Um punhado por clique, e não a lista inteira: são chamadas à Meta, e uma
 * lista grande estouraria o tempo da requisição no meio do caminho, sem dizer
 * quanto tinha feito. Clicar de novo continua de onde parou.
 */
export async function completarPerfisDeContatos() {
  await requirePanelSession();

  const account = await getFirstAccount();
  if (!account) return;

  for (const contato of await contatosSemUsername(account.id, 25)) {
    // Melhor esforço: um perfil que a Meta não devolve não pode impedir os
    // outros. Ele continua na lista para a próxima vez.
    await gravarPerfilSeAusente(
      contato.id,
      await getPerfilDaConversa(contato.igUserId, account.accessToken),
    );
  }

  revalidatePath('/contatos');
}

export async function criarAutomacao(formData: FormData) {
  const account = await getFirstAccount();
  if (!account) redirect('/configuracao');

  const nome = String(formData.get('nome') ?? '').trim() || 'Nova automação';
  const gatilho = lerGatilho(formData.get('gatilho'));

  const id = await createAutomation(account.id, nome, gatilho);
  redirect(`/automacoes/${id}`);
}

export async function salvarAutomacao(formData: FormData) {
  const id = Number(formData.get('id'));
  const publicar = formData.get('acao') === 'publicar';

  const mediaId = String(formData.get('mediaId') ?? '').trim();
  const botaoTitulo = String(formData.get('botaoTitulo') ?? '').trim();
  const botaoUrl = String(formData.get('botaoUrl') ?? '').trim();
  const textosDm = linhas(formData.get('textosDm'));
  const passosDoFormulario = [
    {
      position: 0,
      kind: 'public_reply' as const,
      variants: linhas(formData.get('respostasPublicas')),
      buttons: [],
    },
    {
      position: 1,
      kind: 'dm' as const,
      variants: textosDm,
      buttons: botaoUrl.length > 0 ? [{ title: botaoTitulo || 'Abrir', url: botaoUrl }] : [],
    },
    {
      position: 2,
      kind: 'follow_up' as const,
      variants: linhas(formData.get('followUp1')),
      buttons: [],
    },
    {
      position: 3,
      kind: 'follow_up' as const,
      variants: linhas(formData.get('followUp2')),
      buttons: [],
    },
  ];

  // Publicar sem texto de DM deixa a automação com aparência de ativa e
  // nunca entrega nada (send() não tem o que despachar). Recusa aqui, antes
  // de chegar no banco, em vez de depender só da rede de segurança em
  // runSend/process-event.ts. Salva como rascunho e volta pro editor com o
  // motivo.
  const publicarSemDm = publicar && textosDm.length === 0;
  const atual = await getAutomation(id);

  try {
    await saveAutomation(
      id,
      {
        name: String(formData.get('nome') ?? '').trim() || 'Sem nome',
        status: publicar && !publicarSemDm ? 'published' : 'draft',
        triggerType: lerGatilho(formData.get('gatilho')),
        mediaId: mediaId.length > 0 ? mediaId : null,
        keywords: String(formData.get('palavras') ?? '')
          .split(',')
          .map((k) => k.trim())
          .filter((k) => k.length > 0),
        matchMode: (formData.get('modo') as MatchMode) ?? 'contains',
      },
      mesclarPassos(atual?.steps ?? [], passosDoFormulario),
    );
  } catch (error) {
    if (error instanceof AutomacaoInvalidaError) {
      redirect(`/automacoes/${id}?erro=dm-vazia`);
    }
    throw error;
  }

  revalidatePath('/');
  revalidatePath(`/automacoes/${id}`);

  if (publicarSemDm) redirect(`/automacoes/${id}?erro=dm-vazia`);

  // Sem este redirect a página volta idêntica: quem republica uma automação já
  // publicada não vê nada mudar na tela e conclui que o clique não funcionou.
  // O parâmetro é o que faz aparecer a confirmação no topo do editor.
  redirect(`/automacoes/${id}?ok=${publicar ? 'publicada' : 'rascunho'}`);
}

export async function excluirAutomacao(formData: FormData) {
  await deleteAutomation(Number(formData.get('id')));
  revalidatePath('/');
  redirect('/');
}
