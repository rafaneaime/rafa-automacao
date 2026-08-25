'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getFirstAccount } from '@/lib/repo/accounts';
import {
  createAutomation,
  getAutomation,
  saveAutomation,
  deleteAutomation,
} from '@/lib/repo/automations';
import { AutomacaoInvalidaError } from '@/lib/automations/validation';
import { mesclarPassos } from '@/lib/automations/passos';
import type { MatchMode } from '@/lib/matching';

function linhas(value: FormDataEntryValue | null): string[] {
  return String(value ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

export async function criarAutomacao(formData: FormData) {
  const account = await getFirstAccount();
  if (!account) redirect('/configuracao');

  const nome = String(formData.get('nome') ?? '').trim() || 'Nova automação';
  const gatilho = formData.get('gatilho') === 'dm' ? 'dm' : 'comment';

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
        triggerType: formData.get('gatilho') === 'dm' ? 'dm' : 'comment',
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
