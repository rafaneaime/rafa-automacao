'use client';

import { useState } from 'react';

export function ConectarBotao() {
  const [token, setToken] = useState('');
  const [estado, setEstado] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);

  async function conectar() {
    setCarregando(true);
    setEstado(null);

    const resposta = await fetch('/api/connect', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token }),
    });
    const dados = await resposta.json();

    setEstado(
      dados.ok
        ? `Conectado como ${dados.username ?? dados.igUserId}. Token válido por ${dados.expiraEm}.`
        : `Falhou: ${dados.erro}`,
    );
    setCarregando(false);

    if (dados.ok) window.location.reload();
  }

  return (
    <div className="mt-4 flex flex-col gap-2">
      <label className="text-sm text-neutral-600">
        Token de acesso
        <input
          type="password"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder="Cole aqui o token gerado no portal do Meta"
          className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
        />
      </label>
      <p className="text-xs text-neutral-500">
        Deixe em branco para usar o token configurado nas variáveis de ambiente.
      </p>

      <button
        onClick={conectar}
        disabled={carregando}
        className="self-start rounded-md bg-neutral-900 px-4 py-2 text-sm text-white disabled:opacity-50"
      >
        {carregando ? 'Conectando...' : 'Conectar / reconectar conta'}
      </button>

      {estado && <p className="mt-1 break-all text-sm">{estado}</p>}
    </div>
  );
}
