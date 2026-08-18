import { describe, it, expect } from 'vitest';
import { buildMessagePayload } from '@/lib/meta/messaging';

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
