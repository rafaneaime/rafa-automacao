import { describe, it, expect } from 'vitest';
import { parseEvents } from '@/lib/parse-event';
import comment from './fixtures/comment.json';
import message from './fixtures/message.json';
import echo from './fixtures/echo.json';
import commentAndMessage from './fixtures/comment-and-message.json';

describe('parseEvents com comentário', () => {
  it('extrai todos os campos', () => {
    expect(parseEvents(comment)).toEqual([
      {
        kind: 'comment',
        accountIgId: '17841400000000000',
        commentId: '17900000000000000',
        text: 'quero o preço',
        fromId: '9876543210',
        fromUsername: 'fulana',
        mediaId: '18000000000000000',
      },
    ]);
  });
});

describe('parseEvents com mensagem', () => {
  it('lê de entry[].messaging, não de changes', () => {
    expect(parseEvents(message)).toEqual([
      {
        kind: 'message',
        accountIgId: '17841400000000000',
        fromId: '9876543210',
        text: 'oi, quero saber mais',
        mid: 'aWc6...',
      },
    ]);
  });

  it('descarta echo da própria conta', () => {
    expect(parseEvents(echo)).toEqual([]);
  });
});

describe('parseEvents com entrada inválida', () => {
  it('devolve vazio para objeto que não é instagram', () => {
    expect(parseEvents({ object: 'page', entry: [] })).toEqual([]);
  });

  it('devolve vazio para null', () => {
    expect(parseEvents(null)).toEqual([]);
  });

  it('devolve vazio para entry sem changes nem messaging', () => {
    expect(parseEvents({ object: 'instagram', entry: [{ id: '1' }] })).toEqual([]);
  });

  it('ignora change de campo desconhecido', () => {
    const payload = {
      object: 'instagram',
      entry: [{ id: '1', changes: [{ field: 'story_insights', value: {} }] }],
    };
    expect(parseEvents(payload)).toEqual([]);
  });

  it('ignora comentário sem id ou sem autor', () => {
    const payload = {
      object: 'instagram',
      entry: [{ id: '1', changes: [{ field: 'comments', value: { text: 'oi' } }] }],
    };
    expect(parseEvents(payload)).toEqual([]);
  });
});

describe('parseEvents com comentário e mensagem no mesmo payload', () => {
  it('processa ambos de forma independente', () => {
    expect(parseEvents(commentAndMessage)).toEqual([
      {
        kind: 'comment',
        accountIgId: '17841400000000000',
        commentId: '17900000000000000',
        text: 'quero o preço',
        fromId: '9876543210',
        fromUsername: 'fulana',
        mediaId: '18000000000000000',
      },
      {
        kind: 'message',
        accountIgId: '17841400000000000',
        fromId: '1111111111',
        text: 'oi, quero saber mais',
        mid: 'aWc6...',
      },
    ]);
  });
});

describe('mid da mensagem', () => {
  // O mid é a única coisa estável que uma reentrega do mesmo evento traz
  // igual. Sem ele não há como não contar a mesma interação duas vezes.
  it('captura o mid quando existe', () => {
    const [evento] = parseEvents(message);
    expect(evento).toMatchObject({ kind: 'message', mid: 'aWc6...' });
  });

  it('devolve mid nulo quando o payload não traz, sem quebrar', () => {
    const semMid = {
      object: 'instagram',
      entry: [
        {
          id: 'conta',
          messaging: [{ sender: { id: 'pessoa' }, message: { text: 'oi' } }],
        },
      ],
    };
    expect(parseEvents(semMid)).toEqual([
      { kind: 'message', accountIgId: 'conta', fromId: 'pessoa', text: 'oi', mid: null },
    ]);
  });
});
