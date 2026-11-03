import { describe, it, expect, vi } from 'vitest';
import { buildMessagePayload, sendDm } from '@/lib/meta/messaging';

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
