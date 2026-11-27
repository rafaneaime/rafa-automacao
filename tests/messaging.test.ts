import { describe, it, expect, vi } from 'vitest';
import { buildMessagePayload, sendDm } from '@/lib/meta/messaging';
import { MetaApiError } from '@/lib/meta/client';

/*
 * A ordem dos últimos três parâmetros é o lugar onde duas correções se
 * cruzaram: a automação veio do pacote Base, o endereço veio do login
 * unificado da Meta e o cancelamento veio do atendimento. Trocar dois de lugar
 * manda número no campo da URL e derruba toda DM da instalação.
 */
it('aceita automação, endereço e cancelamento nesta ordem, sem trocar nada de lugar', async () => {
  const originalFetch = globalThis.fetch;
  const fetcher = vi.fn(async (_url: unknown, _options: RequestInit) => Response.json({message_id:'teste'}));
  globalThis.fetch = fetcher as typeof fetch;
  try {
    await sendDm('a','p','Oi',[],'token-local',42);
    expect(fetcher.mock.calls[0][1].signal).toBeUndefined();
    // Sem endereço informado continua o de sempre, que é onde vive todo painel
    // conectado pelo login do Instagram.
    expect(String(fetcher.mock.calls[0][0])).toContain('https://graph.instagram.com/');

    const signal = AbortSignal.timeout(1000);
    await sendDm('a','p','Oi',[],'token-local',42,'https://graph.facebook.com',signal);
    expect(fetcher.mock.calls[1][1].signal).toBe(signal);
    expect(String(fetcher.mock.calls[1][0])).toContain('https://graph.facebook.com/');
  } finally { globalThis.fetch = originalFetch; }
});

/*
 * O dono da conversa. Quem vem de outra ferramenta recebe o evento, casa a
 * automação e leva (#100) subcódigo 2534037 só na hora de responder. Medido na
 * conta de uma instalação real em 27/11/2026.
 */
describe('conversa que pertence a outro aplicativo', () => {
  const RECUSA_SEM_POSSE = {
    error: {
      message: '(#100) A ação é inválida porque não é a dona do tópico.',
      type: 'OAuthException',
      code: 100,
      error_subcode: 2534037,
    },
  };

  function comFetch(responder: (url: string) => Response) {
    const fetcher = vi.fn(async (url: unknown, _opcoes: RequestInit) => responder(String(url)));
    const original = globalThis.fetch;
    globalThis.fetch = fetcher as unknown as typeof fetch;
    return { fetcher, restaurar: () => { globalThis.fetch = original; } };
  }

  it('pede a posse e reenvia quando a Meta recusa por não ser a dona', async () => {
    let envios = 0;
    const { fetcher, restaurar } = comFetch((url) => {
      if (url.includes('/take_thread_control')) return Response.json({ success: true });
      envios += 1;
      return envios === 1
        ? Response.json(RECUSA_SEM_POSSE, { status: 400 })
        : Response.json({ message_id: 'depois-da-posse' });
    });
    try {
      await expect(sendDm('conta', 'pessoa', 'Oi', [], 'tok')).resolves.toEqual({
        message_id: 'depois-da-posse',
      });
    } finally { restaurar(); }

    const chamadas = fetcher.mock.calls.map((c) => String(c[0]));
    expect(chamadas).toHaveLength(3);
    expect(chamadas[1]).toContain('/conta/take_thread_control');
    expect(JSON.parse(String(fetcher.mock.calls[1][1].body))).toEqual({
      recipient: { id: 'pessoa' },
    });
  });

  it('pede a posse no mesmo endereço do envio', async () => {
    let envios = 0;
    const { fetcher, restaurar } = comFetch((url) => {
      if (url.includes('/take_thread_control')) return Response.json({ success: true });
      envios += 1;
      return envios === 1
        ? Response.json(RECUSA_SEM_POSSE, { status: 400 })
        : Response.json({ message_id: 'ok' });
    });
    try {
      await sendDm('conta', 'pessoa', 'Oi', [], 'tok', null, 'https://graph.facebook.com');
    } finally { restaurar(); }

    expect(String(fetcher.mock.calls[1][0])).toContain('https://graph.facebook.com/');
  });

  /*
   * A guarda do contrário. Sem ela, pedir a posse em toda falha passaria: toda
   * recusa da Meta viraria uma chamada a mais e um reenvio que ninguém pediu.
   */
  it('não pede posse nenhuma quando a recusa é outra', async () => {
    const fora = { error: { message: '(#10) Fora da janela de 24h', code: 10 } };
    const { fetcher, restaurar } = comFetch(() => Response.json(fora, { status: 400 }));
    try {
      await expect(sendDm('conta', 'pessoa', 'Oi', [], 'tok')).rejects.toThrow('#10');
    } finally { restaurar(); }

    expect(fetcher.mock.calls).toHaveLength(1);
  });

  it('não insiste: se o reenvio falhar de novo, o erro sai', async () => {
    const { fetcher, restaurar } = comFetch((url) =>
      url.includes('/take_thread_control')
        ? Response.json({ success: true })
        : Response.json(RECUSA_SEM_POSSE, { status: 400 }),
    );
    try {
      await expect(sendDm('conta', 'pessoa', 'Oi', [], 'tok')).rejects.toThrow('2534037');
    } finally { restaurar(); }

    expect(fetcher.mock.calls.filter((c) => String(c[0]).includes('take_thread_control')))
      .toHaveLength(1);
  });

  it('quando a posse é negada, o erro continua sendo o do envio e cita as duas', async () => {
    const negada = { error: { message: 'Nenhum usuário correspondente encontrado', code: 100 } };
    const { restaurar } = comFetch((url) =>
      url.includes('/take_thread_control')
        ? Response.json(negada, { status: 400 })
        : Response.json(RECUSA_SEM_POSSE, { status: 400 }),
    );
    try {
      const erro = await sendDm('conta', 'pessoa', 'Oi', [], 'tok').catch((e) => e);
      expect(erro).toBeInstanceOf(MetaApiError);
      // O status é o do envio: em cima, 400 é recusa, e 5xx é incerteza. Se
      // saísse o erro da posse, uma recusa certa poderia virar incerteza.
      expect((erro as MetaApiError).status).toBe(400);
      expect((erro as MetaApiError).message).toContain('2534037');
      expect((erro as MetaApiError).message).toContain('posse da conversa recusado');
    } finally { restaurar(); }
  });
});

describe('buildMessagePayload', () => {
  it('manda texto puro quando não há botões', () => {
    expect(buildMessagePayload('oi', [])).toEqual({ text: 'oi' });
  });

  it('coloca texto e botão de link na MESMA mensagem', () => {
    expect(
      buildMessagePayload('me segue e pega o link', [
        { title: 'Abrir', url: 'https://exemplo.com' },
      ]),
    ).toEqual({
      attachment: {
        type: 'template',
        payload: {
          template_type: 'button',
          text: 'me segue e pega o link',
          buttons: [{ type: 'web_url', url: 'https://exemplo.com', title: 'Abrir' }],
        },
      },
    });
  });

  it('descarta botões sem URL', () => {
    expect(buildMessagePayload('oi', [{ title: 'Vazio', url: '' }])).toEqual({
      text: 'oi',
    });
  });
});
