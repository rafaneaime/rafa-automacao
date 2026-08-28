import { describe, expect, it } from 'vitest';
import { janelaDaEntrega } from '../src/lib/automations/janela';

const AGORA = new Date('2026-08-27T15:30:00Z');

describe('janelaDaEntrega', () => {
  it('usa o post quando o comentário diz de qual post veio', () => {
    expect(janelaDaEntrega('17998877665544332', AGORA)).toBe('post:17998877665544332');
  });

  it('posts diferentes são ocasiões diferentes', () => {
    // É isto que devolve a segunda DM para quem comenta de novo, semanas
    // depois, em outro post.
    expect(janelaDaEntrega('post-a', AGORA)).not.toBe(janelaDaEntrega('post-b', AGORA));
  });

  it('o mesmo post é a mesma ocasião, em qualquer horário do dia', () => {
    // Cinco comentários no mesmo post são uma ocasião só, mesmo separados por
    // horas — que é o que a trava original acertava e precisa continuar
    // acertando.
    const manha = janelaDaEntrega('m1', new Date('2026-08-27T08:00:00Z'));
    const noite = janelaDaEntrega('m1', new Date('2026-08-27T23:00:00Z'));
    expect(manha).toBe(noite);
  });

  it('sem post, cai no dia', () => {
    for (const vazio of [null, '', '   ']) {
      expect(janelaDaEntrega(vazio, AGORA)).toBe('dia:2026-08-27');
    }
  });

  it('o dia vira em UTC, como todo dia deste projeto', () => {
    // 23h em Brasília é o dia seguinte em UTC. O importante não é qual data
    // sai, é que seja a mesma regra do resto do sistema.
    expect(janelaDaEntrega(null, new Date('2026-08-27T23:59:59Z'))).toBe('dia:2026-08-27');
    expect(janelaDaEntrega(null, new Date('2026-08-28T00:00:00Z'))).toBe('dia:2026-08-28');
  });

  it('post e dia nunca colidem, mesmo se o post parecer uma data', () => {
    // Sem o prefixo, um media_id que fosse "2026-08-27" cairia no mesmo balde
    // do dia 27 — duas ocasiões diferentes viradas uma.
    expect(janelaDaEntrega('2026-08-27', AGORA)).not.toBe(janelaDaEntrega(null, AGORA));
  });
});
