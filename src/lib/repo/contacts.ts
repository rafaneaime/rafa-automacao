import { sql } from '../db';
import type { Contact } from './types';

/**
 * Devolve o id do contato — o `do update` existe justamente para o `returning`
 * ter o que devolver mesmo quando a linha já existia. Quem chama precisa desse
 * id para ligar a interação ao contato certo.
 */
export async function upsertContact(
  accountId: number,
  igUserId: string,
  username: string | null,
): Promise<number> {
  const rows = (await sql`
    insert into contacts (account_id, ig_user_id, username)
    values (${accountId}, ${igUserId}, ${username})
    on conflict (account_id, ig_user_id) do update set
      username = coalesce(excluded.username, contacts.username),
      last_seen_at = now()
    returning id
  `) as { id: number }[];

  return rows[0].id;
}

/**
 * Este contato ainda está sem `@`?
 *
 * Perguntar ao banco antes de perguntar à Meta: só quem entrou por mensagem
 * direta chega sem `@`, e só na primeira vez. Sem esta conferência, toda
 * mensagem recebida gastaria uma chamada à Meta para reescrever o que já se
 * sabe.
 */
export async function faltaUsername(contactId: number): Promise<boolean> {
  const rows = (await sql`
    select 1 from contacts where id = ${contactId} and username is null
  `) as unknown[];
  return rows.length > 0;
}

/** Preenche só o que está vazio. O que já foi gravado antes prevalece. */
export async function gravarPerfilSeAusente(
  contactId: number,
  perfil: { username: string | null; nome: string | null },
): Promise<void> {
  if (!perfil.username && !perfil.nome) return;
  await sql`
    update contacts set
      username = coalesce(username, ${perfil.username}),
      nome = coalesce(nome, ${perfil.nome})
    where id = ${contactId}
  `;
}

export async function listContacts(accountId: number): Promise<Contact[]> {
  const rows = (await sql`
    select id, ig_user_id, username, nome, first_seen_at, last_seen_at
    from contacts where account_id = ${accountId}
    order by last_seen_at desc
  `) as {
    id: number;
    ig_user_id: string;
    username: string | null;
    nome: string | null;
    first_seen_at: Date;
    last_seen_at: Date;
  }[];

  return rows.map((r) => ({
    id: r.id,
    igUserId: r.ig_user_id,
    username: r.username,
    nome: r.nome,
    firstSeenAt: r.first_seen_at,
    lastSeenAt: r.last_seen_at,
  }));
}

export async function acharContato(
  accountId: number,
  id: number,
): Promise<Contact | null> {
  const rows = (await sql`
    select id, ig_user_id, username, nome, first_seen_at, last_seen_at
    from contacts
    where account_id = ${accountId} and id = ${id}
  `) as {
    id: number;
    ig_user_id: string;
    username: string | null;
    nome: string | null;
    first_seen_at: Date;
    last_seen_at: Date;
  }[];

  const row = rows[0];
  return row
    ? {
        id: row.id,
        igUserId: row.ig_user_id,
        username: row.username,
        nome: row.nome,
        firstSeenAt: row.first_seen_at,
        lastSeenAt: row.last_seen_at,
      }
    : null;
}

export type ResumoDoBanco = {
  contatos: number;
  automacoes: number;
  automacoesPublicadas: number;
  disparosEnviados: number;
  primeiraInteracao: Date | null;
  ultimaInteracao: Date | null;
};

export type LinhasDoResumo = {
  contatos: string;
  automacoes: string;
  disparos: string;
  periodo: string;
};

function quantidade(valor: number, singular: string, plural: string): string {
  return `${valor} ${valor === 1 ? singular : plural}`;
}

export function resumoEmLinhas(resumo: ResumoDoBanco): LinhasDoResumo {
  let periodo = 'Ainda não há interações. Isso é normal em uma instalação nova.';

  if (resumo.primeiraInteracao && resumo.ultimaInteracao) {
    const primeira = resumo.primeiraInteracao.toLocaleDateString('pt-BR');
    const ultima = resumo.ultimaInteracao.toLocaleDateString('pt-BR');
    periodo = primeira === ultima
      ? `Interações em ${primeira}.`
      : `Interações de ${primeira} a ${ultima}.`;
  }

  return {
    contatos: quantidade(resumo.contatos, 'contato', 'contatos'),
    automacoes: `${quantidade(resumo.automacoes, 'automação', 'automações')} (${quantidade(
      resumo.automacoesPublicadas,
      'publicada',
      'publicadas',
    )})`,
    disparos: quantidade(resumo.disparosEnviados, 'disparo enviado', 'disparos enviados'),
    periodo,
  };
}

export async function resumirBanco(accountId: number): Promise<ResumoDoBanco> {
  const rows = (await sql`
    with resumo_contatos as (
      select
        count(*)::int as contatos,
        min(first_seen_at) as primeira_interacao,
        max(last_seen_at) as ultima_interacao
      from contacts
      where account_id = ${accountId}
    ),
    resumo_automacoes as (
      select
        count(*)::int as automacoes,
        count(*) filter (where status = 'published')::int as automacoes_publicadas
      from automations
      where account_id = ${accountId}
    ),
    resumo_disparos as (
      select count(*)::int as disparos_enviados
      from deliveries d
      join automations a on a.id = d.automation_id
      where a.account_id = ${accountId}
        and d.status = 'sent'
    )
    select
      c.contatos,
      a.automacoes,
      a.automacoes_publicadas,
      d.disparos_enviados,
      c.primeira_interacao,
      c.ultima_interacao
    from resumo_contatos c
    cross join resumo_automacoes a
    cross join resumo_disparos d
  `) as {
    contatos: number;
    automacoes: number;
    automacoes_publicadas: number;
    disparos_enviados: number;
    primeira_interacao: Date | null;
    ultima_interacao: Date | null;
  }[];

  const row = rows[0];
  return {
    contatos: row?.contatos ?? 0,
    automacoes: row?.automacoes ?? 0,
    automacoesPublicadas: row?.automacoes_publicadas ?? 0,
    disparosEnviados: row?.disparos_enviados ?? 0,
    primeiraInteracao: row?.primeira_interacao ?? null,
    ultimaInteracao: row?.ultima_interacao ?? null,
  };
}


