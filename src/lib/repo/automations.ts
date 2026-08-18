import { sql } from '../db';
import type { Automation, AutomationStep } from './types';
import {
  validarPublicacao,
  AutomacaoInvalidaError,
} from '../automations/validation';

type AutomationRow = {
  id: number;
  account_id: number;
  name: string;
  status: 'draft' | 'published';
  trigger_type: 'comment' | 'dm';
  media_id: string | null;
  keywords: string[];
  match_mode: Automation['matchMode'];
};

type StepRow = {
  id: number;
  automation_id: number;
  position: number;
  kind: 'public_reply' | 'dm';
  variants: string[];
  buttons: AutomationStep['buttons'];
};

async function attachSteps(rows: AutomationRow[]): Promise<Automation[]> {
  if (rows.length === 0) return [];

  const ids = rows.map((r) => r.id);
  const steps = (await sql`
    select id, automation_id, position, kind, variants, buttons
    from automation_steps
    where automation_id = any(${ids})
    order by position
  `) as StepRow[];

  return rows.map((row) => ({
    id: row.id,
    accountId: row.account_id,
    name: row.name,
    status: row.status,
    triggerType: row.trigger_type,
    mediaId: row.media_id,
    keywords: row.keywords,
    matchMode: row.match_mode,
    steps: steps
      .filter((s) => s.automation_id === row.id)
      .map((s) => ({
        id: s.id,
        position: s.position,
        kind: s.kind,
        variants: s.variants,
        buttons: s.buttons,
      })),
  }));
}

export async function findPublishedAutomations(
  accountId: number,
  trigger: 'comment' | 'dm',
): Promise<Automation[]> {
  const rows = (await sql`
    select id, account_id, name, status, trigger_type, media_id, keywords, match_mode
    from automations
    where account_id = ${accountId}
      and status = 'published'
      and trigger_type = ${trigger}
    order by id
  `) as AutomationRow[];
  return attachSteps(rows);
}

export async function listAutomations(
  accountId: number,
): Promise<(Automation & { deliveryCount: number })[]> {
  const rows = (await sql`
    select a.id, a.account_id, a.name, a.status, a.trigger_type, a.media_id,
           a.keywords, a.match_mode,
           (select count(*)::int from deliveries d
             where d.automation_id = a.id and d.status = 'sent') as delivery_count
    from automations a
    where a.account_id = ${accountId}
    order by a.id desc
  `) as (AutomationRow & { delivery_count: number })[];

  const withSteps = await attachSteps(rows);
  return withSteps.map((a, i) => ({ ...a, deliveryCount: rows[i].delivery_count }));
}

export async function getAutomation(id: number): Promise<Automation | null> {
  const rows = (await sql`
    select id, account_id, name, status, trigger_type, media_id, keywords, match_mode
    from automations where id = ${id}
  `) as AutomationRow[];
  const list = await attachSteps(rows);
  return list[0] ?? null;
}

export async function createAutomation(
  accountId: number,
  name: string,
  triggerType: 'comment' | 'dm',
): Promise<number> {
  const rows = (await sql`
    insert into automations (account_id, name, trigger_type)
    values (${accountId}, ${name}, ${triggerType})
    returning id
  `) as { id: number }[];

  const automationId = rows[0].id;

  await sql`
    insert into automation_steps (automation_id, position, kind, variants, buttons)
    values
      (${automationId}, 0, 'public_reply', '{}', '[]'),
      (${automationId}, 1, 'dm', '{}', '[]')
  `;

  return automationId;
}

export type AutomationFields = {
  name: string;
  status: 'draft' | 'published';
  triggerType: 'comment' | 'dm';
  mediaId: string | null;
  keywords: string[];
  matchMode: Automation['matchMode'];
};

export async function saveAutomation(
  id: number,
  fields: AutomationFields,
  steps: Pick<AutomationStep, 'position' | 'kind' | 'variants' | 'buttons'>[],
): Promise<void> {
  if (fields.status === 'published') {
    const motivo = validarPublicacao(fields.triggerType, steps);
    if (motivo) throw new AutomacaoInvalidaError(motivo);
  }

  // update + delete + inserts precisam ser atômicos: sem transação, um insert que
  // falhar no meio do loop perderia os steps antigos (já apagados) sem terminar de
  // gravar os novos, e dois saves concorrentes na mesma automação poderiam intercalar
  // delete/insert e duplicar ou perder steps.
  await sql.transaction([
    sql`
      update automations set
        name = ${fields.name},
        status = ${fields.status},
        trigger_type = ${fields.triggerType},
        media_id = ${fields.mediaId},
        keywords = ${fields.keywords},
        match_mode = ${fields.matchMode},
        updated_at = now()
      where id = ${id}
    `,
    sql`delete from automation_steps where automation_id = ${id}`,
    ...steps.map(
      (step) => sql`
        insert into automation_steps (automation_id, position, kind, variants, buttons)
        values (${id}, ${step.position}, ${step.kind}, ${step.variants},
                ${JSON.stringify(step.buttons)})
      `,
    ),
  ]);
}

export async function deleteAutomation(id: number): Promise<void> {
  await sql`delete from automations where id = ${id}`;
}
