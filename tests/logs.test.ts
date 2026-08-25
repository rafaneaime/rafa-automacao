import { beforeAll, describe, expect, it } from 'vitest';

let mapDeliveryRows: typeof import('@/lib/repo/deliveries').mapDeliveryRows;

beforeAll(async () => {
  process.env.DATABASE_URL = 'postgres://teste:teste@localhost/teste';
  ({ mapDeliveryRows } = await import('@/lib/repo/deliveries'));
});

const ORIGINAL = new Date('2026-08-24T10:00:00Z');
const FOLLOW_UP_1 = new Date('2026-08-24T11:00:00Z');
const FOLLOW_UP_2 = new Date('2026-08-24T12:00:00Z');

function linhaDm(id = 10, createdAt = ORIGINAL) {
  return {
    id,
    automation_name: 'Boas-vindas',
    ig_user_id: 'pessoa-1',
    status: 'sent',
    error: null,
    created_at: createdAt,
    kind: 'dm' as const,
    position: null,
  };
}

function linhaFollowUp(id: number, position: number, createdAt: Date) {
  return {
    id,
    automation_name: 'Boas-vindas',
    ig_user_id: 'pessoa-1',
    status: 'sent',
    error: null,
    created_at: createdAt,
    kind: 'follow_up' as const,
    position,
  };
}

describe('mapDeliveryRows', () => {
  it('converte a entrega original em dm sem posição de continuação', () => {
    expect(mapDeliveryRows([linhaDm()])).toEqual([{
      id: 10,
      automationName: 'Boas-vindas',
      igUserId: 'pessoa-1',
      status: 'sent',
      error: null,
      createdAt: ORIGINAL,
      kind: 'dm',
      continuacao: null,
    }]);
  });

  it('converte a posição 2 no rótulo continuação 1', () => {
    expect(mapDeliveryRows([linhaFollowUp(20, 2, FOLLOW_UP_1)])[0]).toMatchObject({
      kind: 'follow_up',
      continuacao: 1,
    });
  });

  it('converte a posição 3 no rótulo continuação 2', () => {
    expect(mapDeliveryRows([linhaFollowUp(21, 3, FOLLOW_UP_2)])[0]).toMatchObject({
      kind: 'follow_up',
      continuacao: 2,
    });
  });

  it('ordena a mistura por data decrescente com a original por último', () => {
    const resultado = mapDeliveryRows([
      linhaDm(),
      linhaFollowUp(20, 2, FOLLOW_UP_1),
      linhaFollowUp(21, 3, FOLLOW_UP_2),
    ]);

    expect(resultado.map(({ kind, continuacao }) => [kind, continuacao])).toEqual([
      ['follow_up', 2],
      ['follow_up', 1],
      ['dm', null],
    ]);
  });

  it('desempata datas iguais de forma independente da ordem de entrada', () => {
    const empate = new Date('2026-08-24T12:00:00Z');
    const linhas = [
      linhaFollowUp(20, 2, empate),
      linhaDm(10, empate),
      linhaFollowUp(21, 3, empate),
    ];

    const idsEsperados = [10, 21, 20];
    expect(mapDeliveryRows(linhas).map(({ id }) => id)).toEqual(idsEsperados);
    expect(mapDeliveryRows([...linhas].reverse()).map(({ id }) => id)).toEqual(idsEsperados);
  });
});
