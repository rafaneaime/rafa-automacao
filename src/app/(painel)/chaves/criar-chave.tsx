'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { ESCOPOS, type Escopo } from '@/lib/api/escopos';
import {
  AVISO_DA_CHAVE,
  AVISO_DA_ESCRITA,
  ROTULOS_DOS_ESCOPOS,
} from '@/lib/api/rotulos';
import { Botao, ESTILO_CAMPO } from '@/lib/painel/ui';

type ChaveCriada = {
  chave: string;
  prefixo: string;
};

type RespostaDaCriacao =
  | { ok: true; chave: string; prefixo: string }
  | { ok: false; erro: string };

export function CriarChave({ temConta }: { temConta: boolean }) {
  const router = useRouter();
  const [nome, setNome] = useState('');
  const [escopos, setEscopos] = useState<Escopo[]>(['leitura']);
  const [chaveCriada, setChaveCriada] = useState<ChaveCriada | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [copiada, setCopiada] = useState(false);
  const [carregando, setCarregando] = useState(false);

  function alternarEscopo(escopo: Escopo) {
    setEscopos((atuais) =>
      atuais.includes(escopo)
        ? atuais.filter((atual) => atual !== escopo)
        : [...atuais, escopo],
    );
  }

  async function criar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setCarregando(true);
    setErro(null);
    setCopiada(false);

    try {
      const resposta = await fetch('/api/painel/chaves', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ nome, escopos }),
      });
      // O `.json()` solto estourava quando a resposta não era JSON — e aí a
      // mensagem vinha do catch, falando em tentar de novo. Foi assim que um
      // 404 passou por problema de rede durante uma instalação inteira: até
      // 13/10/2026 a rota desta tela não viajava no pacote da base.
      const dados = (await resposta
        .json()
        .catch(() => null)) as RespostaDaCriacao | null;

      if (!resposta.ok || !dados?.ok) {
        if (dados && !dados.ok) setErro(dados.erro);
        else if (resposta.status === 404) {
          setErro(
            'Esta versão do painel não tem a rota que cria chaves. Rode a ' +
              'atualização do painel e tente de novo.',
          );
        } else {
          setErro(
            `Não foi possível criar a chave (o servidor respondeu ${resposta.status}).`,
          );
        }
        return;
      }

      setChaveCriada({ chave: dados.chave, prefixo: dados.prefixo });
      setNome('');
      router.refresh();
    } catch {
      setErro('Não foi possível criar a chave. Tente novamente.');
    } finally {
      setCarregando(false);
    }
  }

  async function copiar() {
    if (!chaveCriada) return;
    try {
      await navigator.clipboard.writeText(chaveCriada.chave);
      setCopiada(true);
    } catch {
      // A área de transferência exige contexto seguro e pode ser negada pelo
      // navegador. A chave está na tela e dá para selecionar à mão — o que não
      // pode acontecer é a promessa estourar sem ninguém tratar, deixando a
      // pessoa achando que copiou.
      setErro('Não consegui copiar. Selecione a chave acima e copie à mão.');
    }
  }

  return (
    <section className="rounded-xl border border-linha-forte bg-superficie p-5">
      <h2 className="text-lg font-semibold">Criar chave</h2>
      <p className="mt-1 text-sm text-tinta-fraca">
        Use uma chave para conectar agentes e outras integrações à Plataforma.
      </p>

      {!temConta && (
        <p className="mt-4 rounded-md bg-interessado-tenue p-3 text-sm text-interessado-forte">
          Conecte sua conta do Instagram antes de criar uma chave.
        </p>
      )}

      <form className="mt-5 space-y-4" onSubmit={criar}>
        <label className="block text-sm font-medium">
          Nome
          <input
            value={nome}
            onChange={(evento) => setNome(evento.target.value)}
            placeholder="Ex.: agente de atendimento"
            className={`mt-1 w-full ${ESTILO_CAMPO}`}
          />
        </label>

        <fieldset>
          <legend className="text-sm font-medium">Permissões</legend>
          <div className="mt-2 space-y-2">
            {ESCOPOS.map((escopo) => {
              const rotulo = ROTULOS_DOS_ESCOPOS[escopo];
              return (
                <label
                  key={escopo}
                  className="flex items-start gap-3 rounded-md border border-linha-forte p-3"
                >
                  <input
                    type="checkbox"
                    checked={escopos.includes(escopo)}
                    onChange={() => alternarEscopo(escopo)}
                    className="mt-1"
                  />
                  <span>
                    <span className="block text-sm font-medium">{rotulo.nome}</span>
                    <span className="block text-sm text-tinta-fraca">
                      {rotulo.descricao}
                    </span>
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>

        <p className="rounded-md bg-interessado-tenue p-3 text-sm text-interessado-forte">
          {AVISO_DA_ESCRITA}
        </p>

        <Botao type="submit" disabled={carregando || !temConta}>
          {carregando ? 'Criando...' : 'Criar chave'}
        </Botao>
      </form>

      {erro && <p className="mt-3 text-sm text-caindo-forte">{erro}</p>}

      {chaveCriada && (
        <div className="mt-5 rounded-lg border-2 border-interessado-forte bg-interessado-tenue p-4">
          <h3 className="font-semibold">Sua nova chave</h3>
          <p className="mt-1 text-sm text-interessado-forte">{AVISO_DA_CHAVE}</p>
          <code className="mt-3 block break-all rounded bg-superficie p-3 text-sm">
            {chaveCriada.chave}
          </code>
          <button
            type="button"
            onClick={copiar}
            className="mt-3 rounded-md border border-interessado-forte bg-superficie px-3 py-2 text-sm"
          >
            {copiada ? 'Copiada' : 'Copiar chave'}
          </button>
          <p className="mt-3 text-xs text-interessado-forte">
            Criar outra chave substitui somente o valor mostrado neste bloco.
            As duas continuam válidas até que você revogue uma delas.
          </p>
        </div>
      )}
    </section>
  );
}

export function BotaoRevogar({
  id,
  desabilitado,
}: {
  id: number;
  desabilitado: boolean;
}) {
  const router = useRouter();
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  // Revogar não tem volta e derruba a integração no mesmo instante. Um clique
  // errado numa lista de chaves parecidas deixaria um agente fora do ar sem a
  // pessoa entender por quê. Dois passos, com o estrago escrito no meio.
  const [confirmando, setConfirmando] = useState(false);

  async function revogar() {
    setCarregando(true);
    setErro(null);

    try {
      const resposta = await fetch('/api/painel/chaves', {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      const dados = (await resposta.json()) as { ok?: boolean; erro?: string };

      if (!resposta.ok || !dados.ok) {
        setErro(dados.erro ?? 'Não foi possível revogar a chave.');
        return;
      }

      router.refresh();
    } catch {
      setErro('Não foi possível revogar a chave.');
    } finally {
      setCarregando(false);
    }
  }

  if (confirmando) {
    return (
      <div className="mt-3 rounded-md border border-caindo-tenue bg-caindo-tenue p-3">
        <p className="text-sm text-caindo-forte">
          Revogar não tem volta. Quem estiver usando esta chave para de
          funcionar imediatamente.
        </p>
        <div className="mt-2 flex gap-3">
          <button
            type="button"
            onClick={revogar}
            disabled={carregando}
            className="rounded-lg bg-caindo-forte px-3 py-1.5 text-sm font-medium text-papel disabled:opacity-50"
          >
            {carregando ? 'Revogando...' : 'Revogar mesmo assim'}
          </button>
          <button
            type="button"
            onClick={() => setConfirmando(false)}
            disabled={carregando}
            className="text-sm text-tinta-media hover:underline"
          >
            Cancelar
          </button>
        </div>
        {erro && <p className="mt-2 text-xs text-caindo-forte">{erro}</p>}
      </div>
    );
  }

  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={() => setConfirmando(true)}
        disabled={desabilitado}
        className="text-sm text-caindo-forte hover:underline disabled:text-tinta-fraca"
      >
        Revogar
      </button>
      {erro && <p className="mt-1 text-xs text-caindo-forte">{erro}</p>}
    </div>
  );
}

