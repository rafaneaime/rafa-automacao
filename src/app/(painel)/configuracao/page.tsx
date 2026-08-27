import { headers } from 'next/headers';
import { env } from '@/lib/env';
import { getFirstAccount } from '@/lib/repo/accounts';
import { resumirBanco, resumoEmLinhas } from '@/lib/repo/contacts';
import { WEBHOOK_FIELDS } from '@/lib/meta/subscribe';
import { ConectarBotao } from './conectar-botao';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CARD = 'rounded-lg border border-linha-forte p-4';
const VALOR = 'mt-1 block break-all rounded bg-papel p-2 font-mono text-xs';

export default async function ConfiguracaoPage() {
  const account = await getFirstAccount();
  const resumo = account ? await resumirBanco(account.id) : null;
  const linhasResumo = resumo ? resumoEmLinhas(resumo) : null;
  const host = (await headers()).get('host') ?? 'localhost:3000';
  const protocolo = host.startsWith('localhost') ? 'http' : 'https';
  const callbackUrl = `${protocolo}://${host}/api/webhook`;

  const diasRestantes = account?.tokenExpiresAt
    ? Math.round(
        (new Date(account.tokenExpiresAt).getTime() - Date.now()) / 86_400_000,
      )
    : null;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold">Configuração</h1>

      <section className={CARD}>
        <h2 className="mb-3 font-medium">Conta</h2>
        {account ? (
          <div className="text-sm">
            <p>
              Conectada como{' '}
              <strong>{account.username ? `@${account.username}` : account.igUserId}</strong>
            </p>
            <label className="mt-3 block text-tinta-fraca">
              Identificador desta conta no Instagram
              <code className={VALOR}>{account.igUserId}</code>
            </label>
            <p className="mt-3 text-tinta-fraca">
              Token válido por mais {diasRestantes ?? '?'} dias. A renovação é
              automática, todo dia, quando faltarem menos de 10.
            </p>
          </div>
        ) : (
          <p className="text-sm text-tinta-media">
            Nenhuma conta conectada. Cole o token gerado no portal do Meta no
            campo abaixo e clique em conectar — o token curto será trocado por
            um de 60 dias.
          </p>
        )}
        <ConectarBotao />
      </section>

      {linhasResumo && (
        <section className={CARD}>
          <h2 className="mb-1 font-medium">Seus dados</h2>
          <p className="mb-4 text-sm text-tinta-fraca">
            Uma conferência rápida do banco desta conta.
          </p>

          <div className="grid gap-3 sm:grid-cols-3">
            <p className="rounded bg-papel p-3 text-sm font-medium">
              {linhasResumo.contatos}
            </p>
            <p className="rounded bg-papel p-3 text-sm font-medium">
              {linhasResumo.automacoes}
            </p>
            <p className="rounded bg-papel p-3 text-sm font-medium">
              {linhasResumo.disparos}
            </p>
          </div>

          <p className="mt-4 text-sm text-tinta-media">{linhasResumo.periodo}</p>
          <p className="mt-2 text-sm text-tinta-fraca">
            Estes números vêm do banco. Se você atualizou o sistema e eles continuam
            aqui, nenhum dado foi perdido.
          </p>
        </section>
      )}

      <section className={CARD}>
        <h2 className="mb-1 font-medium">Webhook no portal do Meta</h2>
        <p className="mb-3 text-sm text-tinta-fraca">
          Em developers.facebook.com, produto Webhooks, objeto Instagram. Cole os
          dois valores abaixo e assine os campos listados.
        </p>

        <label className="block text-sm text-tinta-fraca">
          Callback URL
          <code className={VALOR}>{callbackUrl}</code>
        </label>

        <label className="mt-3 block text-sm text-tinta-fraca">
          Verify Token
          <code className={VALOR}>{env.verifyToken()}</code>
        </label>

        <label className="mt-3 block text-sm text-tinta-fraca">
          Campos assinados
          <code className={VALOR}>{WEBHOOK_FIELDS}</code>
        </label>

        {protocolo === 'http' && (
          <p className="mt-3 text-sm text-amber-700">
            Você está em localhost. O Meta exige HTTPS público — faça o deploy na
            Vercel e volte aqui para copiar a URL de produção.
          </p>
        )}
      </section>
    </div>
  );
}
