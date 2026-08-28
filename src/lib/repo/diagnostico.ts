import { parseEvents } from '../parse-event';
import { sql } from '../db';
import { escaparBuscaIlike } from '../busca';

const LIMITE_REGISTROS = 50;
const LIMITE_CANDIDATOS_WEBHOOK = 500;

export type IdentidadeDoDiagnostico = {
  contactId: number | null;
  igUserId: string;
  username: string | null;
};

export type EntregaDoDiagnostico = {
  id: number;
  automationName: string;
  status: string;
  error: string | null;
  createdAt: Date;
};

export type EventoDoDiagnostico = {
  id: number;
  eventType: string;
  occurredAt: Date;
};

export type DiagnosticoDaPessoa = {
  identidade: IdentidadeDoDiagnostico | null;
  webhooks: {
    total: number;
    ultimoEm: Date | null;
    varreduraLimitada: boolean;
  };
  entregas: { total: number; itens: EntregaDoDiagnostico[] };
  eventos: {
    disponiveis: boolean;
    total: number;
    itens: EventoDoDiagnostico[];
  };
};

type ContatoRow = {
  id: number | string;
  ig_user_id: string;
  username: string | null;
};

async function buscarContato(busca: string): Promise<ContatoRow | null> {
  const rows = (await sql`
    select id, ig_user_id, username
    from contacts
    where ig_user_id = ${busca} or lower(username) = ${busca}
    order by last_seen_at desc
    limit 1
  `) as ContatoRow[];
  return rows[0] ?? null;
}

async function buscarContatoPeloIgId(igUserId: string): Promise<ContatoRow | null> {
  const rows = (await sql`
    select id, ig_user_id, username
    from contacts
    where ig_user_id = ${igUserId}
    order by last_seen_at desc
    limit 1
  `) as ContatoRow[];
  return rows[0] ?? null;
}

type WebhookRow = { received_at: Date; raw: string };

async function candidatosDoWebhook(busca: string): Promise<WebhookRow[]> {
  // `raw` é texto sem índice. O LIKE serve apenas para reduzir candidatos;
  // quem confirma a identidade é `parseEvents` abaixo. O teto impede uma
  // busca por nome de varrer indefinidamente o banco da instalação.
  // `%` e `_` sao coringas do LIKE, e underscore em @ do Instagram e comum
  // (`igor.braga_` existe nesta base). Sem escape, a busca casa demais: com o
  // teto abaixo, os payloads certos sao empurrados para fora por falso
  // positivo e a tela diz "nunca vimos esta pessoa" — que e mentira.
  const padrao = `%${escaparBuscaIlike(busca)}%`;

  return (await sql`
    select received_at, raw
    from webhook_events
    where raw ilike ${padrao} escape '\'
    order by received_at desc
    limit ${LIMITE_CANDIDATOS_WEBHOOK}
  `) as WebhookRow[];
}

function eventosDoPayload(raw: string) {
  try {
    return parseEvents(JSON.parse(raw));
  } catch {
    return [];
  }
}

async function resolverPeloWebhook(busca: string): Promise<IdentidadeDoDiagnostico | null> {
  const candidatos = await candidatosDoWebhook(busca);
  for (const candidato of candidatos) {
    for (const evento of eventosDoPayload(candidato.raw)) {
      const username = evento.kind === 'comment' ? evento.fromUsername : null;
      if (
        evento.fromId.toLowerCase() === busca ||
        username?.toLowerCase() === busca
      ) {
        return { contactId: null, igUserId: evento.fromId, username };
      }
    }
  }
  return null;
}

async function resumirWebhooks(igUserId: string) {
  const candidatos = await candidatosDoWebhook(igUserId);
  const correspondentes = candidatos.filter((candidato) =>
    eventosDoPayload(candidato.raw).some((evento) => evento.fromId === igUserId),
  );
  return {
    total: correspondentes.length,
    ultimoEm: correspondentes[0]?.received_at ?? null,
    varreduraLimitada: candidatos.length === LIMITE_CANDIDATOS_WEBHOOK,
  };
}

async function buscarEntregas(igUserId: string) {
  const rows = (await sql`
    select
      d.id, a.name as automation_name, d.status, d.error, d.created_at,
      count(*) over()::int as total
    from deliveries d
    join automations a on a.id = d.automation_id
    where d.ig_user_id = ${igUserId}
    order by d.created_at desc, d.id desc
    limit ${LIMITE_REGISTROS}
  `) as {
    id: number | string;
    automation_name: string;
    status: string;
    error: string | null;
    created_at: Date;
    total: number | string;
  }[];
  return {
    total: Number(rows[0]?.total ?? 0),
    itens: rows.map((row) => ({
      id: Number(row.id),
      automationName: row.automation_name,
      status: row.status,
      error: row.error,
      createdAt: row.created_at,
    })),
  };
}

async function tabelaDeEventosExiste(): Promise<boolean> {
  const rows = (await sql`
    select to_regclass('public.events') is not null as existe
  `) as { existe: boolean }[];
  return rows[0]?.existe ?? false;
}

async function buscarEventos(contactId: number | null) {
  if (!(await tabelaDeEventosExiste())) {
    return { disponiveis: false, total: 0, itens: [] };
  }
  if (contactId === null) {
    return { disponiveis: true, total: 0, itens: [] };
  }

  const rows = (await sql`
    select id, event_type, occurred_at, count(*) over()::int as total
    from events
    where contact_id = ${contactId}
    order by occurred_at desc, id desc
    limit ${LIMITE_REGISTROS}
  `) as {
    id: number | string;
    event_type: string;
    occurred_at: Date;
    total: number | string;
  }[];
  return {
    disponiveis: true,
    total: Number(rows[0]?.total ?? 0),
    itens: rows.map((row) => ({
      id: Number(row.id),
      eventType: row.event_type,
      occurredAt: row.occurred_at,
    })),
  };
}

export async function diagnosticarPessoa(busca: string): Promise<DiagnosticoDaPessoa> {
  let contato = await buscarContato(busca);
  let identidade: IdentidadeDoDiagnostico | null = contato
    ? {
        contactId: Number(contato.id),
        igUserId: contato.ig_user_id,
        username: contato.username,
      }
    : await resolverPeloWebhook(busca);

  // Uma entrega pode existir sem contato em bases antigas. Para busca por id,
  // ela ainda é evidência de que conhecemos a pessoa.
  const idParaEntregas = identidade?.igUserId ?? busca;
  const entregas = await buscarEntregas(idParaEntregas);
  if (!identidade && entregas.total > 0) {
    identidade = { contactId: null, igUserId: busca, username: null };
  }

  if (identidade && identidade.contactId === null) {
    contato = await buscarContatoPeloIgId(identidade.igUserId);
    if (contato) {
      identidade = {
        contactId: Number(contato.id),
        igUserId: contato.ig_user_id,
        username: contato.username ?? identidade.username,
      };
    }
  }

  const webhooks = identidade
    ? await resumirWebhooks(identidade.igUserId)
    : { total: 0, ultimoEm: null, varreduraLimitada: false };
  const eventos = await buscarEventos(identidade?.contactId ?? null);

  return { identidade, webhooks, entregas, eventos };
}
