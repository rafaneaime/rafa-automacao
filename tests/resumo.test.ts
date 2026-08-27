import { beforeAll, describe, expect, it } from 'vitest';
import type { ResumoDoBanco } from '@/lib/repo/contacts';

let resumoEmLinhas: typeof import('@/lib/repo/contacts').resumoEmLinhas;

beforeAll(async () => {
  process.env.DATABASE_URL = 'postgres://teste:teste@localhost/teste';
  ({ resumoEmLinhas } = await import('@/lib/repo/contacts'));
});

function resumo(overrides: Partial<ResumoDoBanco> = {}): ResumoDoBanco {
  return {
    contatos: 0,
    automacoes: 0,
    automacoesPublicadas: 0,
    disparosEnviados: 0,
    primeiraInteracao: null,
    ultimaInteracao: null,
    ...overrides,
  };
}

describe('resumoEmLinhas', () => {
  it('descreve banco vazio como instalação nova normal', () => {
    expect(resumoEmLinhas(resumo())).toEqual({
      contatos: '0 contatos',
      automacoes: '0 automações (0 publicadas)',
      disparos: '0 disparos enviados',
      periodo: 'Ainda não há interações. Isso é normal em uma instalação nova.',
    });
  });

  it('mostra contatos e período mesmo sem nenhum disparo', () => {
    expect(
      resumoEmLinhas(
        resumo({
          contatos: 2,
          automacoes: 3,
          automacoesPublicadas: 1,
          primeiraInteracao: new Date('2026-08-10T12:00:00Z'),
          ultimaInteracao: new Date('2026-08-24T12:00:00Z'),
        }),
      ),
    ).toEqual({
      contatos: '2 contatos',
      automacoes: '3 automações (1 publicada)',
      disparos: '0 disparos enviados',
      periodo: 'Interações de 10/08/2026 a 24/08/2026.',
    });
  });

  it('não cria Invalid Date quando min e max são nulos', () => {
    const linhas = resumoEmLinhas(
      resumo({ contatos: 4, automacoes: 1, automacoesPublicadas: 1 }),
    );

    expect(linhas.periodo).toBe(
      'Ainda não há interações. Isso é normal em uma instalação nova.',
    );
    expect(Object.values(linhas).join(' ')).not.toContain('Invalid Date');
  });

  it('usa singular nos três indicadores e em data única', () => {
    const instante = new Date('2026-08-24T12:00:00Z');

    expect(
      resumoEmLinhas(
        resumo({
          contatos: 1,
          automacoes: 1,
          automacoesPublicadas: 1,
          disparosEnviados: 1,
          primeiraInteracao: instante,
          ultimaInteracao: instante,
        }),
      ),
    ).toEqual({
      contatos: '1 contato',
      automacoes: '1 automação (1 publicada)',
      disparos: '1 disparo enviado',
      periodo: 'Interações em 24/08/2026.',
    });
  });
});
