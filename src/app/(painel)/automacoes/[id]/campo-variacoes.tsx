'use client';

import { useState } from 'react';
import { separarVariacoes } from '@/lib/automations/variacoes';

/**
 * O campo de mensagem, com o efeito da regra visível enquanto se digita.
 *
 * A regra — linha em branco separa variações — já existia escrita acima do
 * campo, e não bastou: alguém escreveu uma DM de três linhas, o sistema
 * guardou três mensagens e sorteou uma, e quem comentou recebeu só "Oiiiii!".
 * Ninguém viu nada errado até a mensagem já ter saído.
 *
 * O contador conserta isso porque ele não pede que a pessoa lembre da regra:
 * ele mostra o resultado dela. "1 variação" ou "3 variações, sorteadas a cada
 * disparo" responde a pergunta antes que ela precise ser feita.
 */
export function CampoDeVariacoes({
  name,
  defaultValue,
  rows = 4,
  className,
}: {
  name: string;
  defaultValue: string;
  rows?: number;
  className: string;
}) {
  const [texto, setTexto] = useState(defaultValue);
  const variacoes = separarVariacoes(texto);

  return (
    <div>
      <textarea
        name={name}
        rows={rows}
        value={texto}
        onChange={(evento) => setTexto(evento.target.value)}
        className={className}
      />

      {variacoes.length > 0 && (
        <div className="mt-2 text-xs text-tinta-fraca">
          {variacoes.length === 1 ? (
            <p>
              <strong className="font-medium text-tinta-media">
                1 mensagem.
              </strong>{' '}
              Para escrever outra versão dela, separe com uma linha em branco.
            </p>
          ) : (
            <>
              <p>
                <strong className="font-medium text-tinta-media">
                  {variacoes.length} variações
                </strong>{' '}
                — o sistema sorteia uma a cada disparo. Cada pessoa recebe uma
                só.
              </p>
              <ol className="mt-1.5 space-y-1">
                {variacoes.map((variacao, indice) => (
                  <li key={indice} className="flex gap-2">
                    <span className="numero shrink-0">{indice + 1}.</span>
                    {/*
                      A quebra de linha de dentro fica visível aqui: é assim
                      que a pessoa confere que a mensagem dela não foi partida
                      em pedaços sem ela perceber.
                    */}
                    <span className="whitespace-pre-wrap">{variacao}</span>
                  </li>
                ))}
              </ol>
            </>
          )}
        </div>
      )}
    </div>
  );
}
