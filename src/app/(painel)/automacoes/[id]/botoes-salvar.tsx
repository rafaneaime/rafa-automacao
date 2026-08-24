'use client';

import { useFormStatus } from 'react-dom';

// Salvar leva de um a três segundos (server action + banco). Sem estado de
// espera, o botão fica idêntico durante todo esse tempo e a pessoa conclui que
// o clique não pegou — foi exatamente o que aconteceu na primeira imersão.
// `data` traz o FormData do envio em curso, incluindo o botão que o disparou,
// e é assim que sabemos qual dos dois rótulos trocar.
export function BotoesSalvar({ publicada }: { publicada: boolean }) {
  const { pending, data } = useFormStatus();
  const acao = data?.get('acao');

  return (
    <>
      <button
        name="acao"
        value="rascunho"
        disabled={pending}
        className="rounded-md border border-neutral-300 px-4 py-2 text-sm disabled:opacity-50"
      >
        {pending && acao === 'rascunho' ? 'Salvando...' : 'Salvar rascunho'}
      </button>
      <button
        name="acao"
        value="publicar"
        disabled={pending}
        className={`rounded-md px-4 py-2 text-sm text-white disabled:opacity-50 ${
          publicada ? 'bg-green-700' : 'bg-neutral-900'
        }`}
      >
        {pending && acao === 'publicar'
          ? 'Publicando...'
          : publicada
            ? 'Publicar de novo'
            : 'Publicar'}
      </button>
    </>
  );
}
