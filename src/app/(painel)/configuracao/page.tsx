import { headers } from 'next/headers';
import { env } from '@/lib/env';
import { WEBHOOK_FIELDS } from '@/lib/meta/subscribe';
import {
  INTEGRACOES,
  credencialPresente,
  estadoDaIntegracao,
  type EstadoDaIntegracao,
  type IdDaIntegracao,
} from '@/lib/painel/saude';
import { Cartao, Chip, Secao, Vazio } from '@/lib/painel/ui';
import type { Account } from '@/lib/repo/types';
import { ConectarBotao } from './conectar-botao';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CARD = 'rounded-lg border border-linha-forte p-4';
const VALOR = 'mt-1 block break-all rounded bg-papel p-2 font-mono text-xs';

const ROTULOS_DOS_ESTADOS: Record<EstadoDaIntegracao, string> = {
  configurado: 'Configurado',
  faltando: 'Faltando',
  opcional: 'Opcional',
};

const CORES_DOS_ESTADOS: Record<EstadoDaIntegracao, string> = {
  configurado: 'bg-subindo-tenue text-subindo-forte',
  faltando: 'bg-caindo-tenue text-caindo-forte',
  opcional: 'bg-frio-tenue text-tinta-media',
};

type LinhasDoResumo = {
  contatos: string;
  automacoes: string;
  disparos: string;
  periodo: string;
};

export default async function ConfiguracaoPage() {
  const bancoInformado = credencialPresente(process.env.DATABASE_URL);
  let bancoOperacional = bancoInformado;
  let account: Account | null = null;
  let linhasResumo: LinhasDoResumo | null = null;

  if (bancoInformado) {
    try {
      // O import também fica dentro da guarda: `db.ts` cria o cliente Neon no
      // carregamento. URL ausente ou inválida não pode derrubar justamente a
      // tela que existe para contar que a instalação está incompleta.
      const [{ getFirstAccount }, { resumirBanco, resumoEmLinhas }] =
        await Promise.all([
          import('@/lib/repo/accounts'),
          import('@/lib/repo/contacts'),
        ]);
      account = await getFirstAccount();
      const resumo = account ? await resumirBanco(account.id) : null;
      linhasResumo = resumo ? resumoEmLinhas(resumo) : null;
    } catch {
      bancoOperacional = false;
      account = null;
      linhasResumo = null;
    }
  }

  const presentes: Record<IdDaIntegracao, boolean> = {
    instagram: account !== null,
    banco: bancoOperacional,
    senha_painel: credencialPresente(process.env.PANEL_PASSWORD),
    assinatura_meta: credencialPresente(process.env.IG_APP_SECRET),
    endereco_app: credencialPresente(process.env.APP_URL),
    hotmart: credencialPresente(process.env.HOTMART_HOTTOK),
    segredo_cron: credencialPresente(process.env.CRON_SECRET),
  };
  const estados = INTEGRACOES.map((integracao) => ({
    integracao,
    estado: estadoDaIntegracao(integracao, presentes[integracao.id]),
  }));
  const tudoConfigurado = estados.every(
    ({ estado }) => estado === 'configurado',
  );
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
          <p className="mt-3 text-sm text-interessado-forte">
            Você está em localhost. O Meta exige HTTPS público — faça o deploy na
            Vercel e volte aqui para copiar a URL de produção.
          </p>
        )}
      </section>

      <Secao
        titulo="Saúde da instalação"
        descricao="O que está ligado nesta cópia e o que deixa de funcionar quando falta."
      >
        {tudoConfigurado ? (
          <Vazio compacto>
            Todas as integrações desta instalação estão configuradas.
          </Vazio>
        ) : (
          <div className="grid gap-3">
            {estados.map(({ integracao, estado }) => (
              <Cartao key={integracao.id} destaque={estado === 'faltando'} className="p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-medium">{integracao.nome}</h3>
                  <Chip cor={CORES_DOS_ESTADOS[estado]}>
                    {ROTULOS_DOS_ESTADOS[estado]}
                  </Chip>
                </div>
                {estado !== 'configurado' && (
                  <p className="mt-2 text-sm">{integracao.seFaltar}</p>
                )}
              </Cartao>
            ))}
          </div>
        )}
      </Secao>
    </div>
  );
}
