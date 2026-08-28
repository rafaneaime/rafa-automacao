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
        className="rounded-lg border border-linha-forte bg-superficie px-4 py-2 text-sm font-medium transition-colors hover:border-tinta disabled:opacity-50"
      >
        {pending && acao === 'rascunho' ? 'Salvando...' : 'Salvar rascunho'}
      </button>
      <button
        name="acao"
        value="publicar"
        disabled={pending}
        className={`rounded-lg px-4 py-2 text-sm font-medium text-papel transition-colors disabled:opacity-50 ${
          // O guia da imersao manda a pessoa procurar exatamente isto: o
          // botao ficar verde escrito "Publicar de novo". A cor vem da
          // paleta, e nao de um verde solto do Tailwind, mas o sinal
          // continua o mesmo.
          publicada ? 'bg-subindo-forte' : 'bg-tinta'
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
