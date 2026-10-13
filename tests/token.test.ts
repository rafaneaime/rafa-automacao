import { describe, it, expect, vi } from 'vitest';
import { problemaNoFormato, resolveLongLivedToken } from '@/lib/meta/token';

/* Forma de token de verdade: a conferência de formato roda antes da rede. */
const COMO_TOKEN = `IGAA${'x'.repeat(160)}`;
import type { ResolveTokenDeps } from '@/lib/meta/token';

describe('resolveLongLivedToken', () => {
  it('usa o resultado do câmbio quando ig_exchange_token funciona', async () => {
    const exchange = vi.fn().mockResolvedValue({
      accessToken: 'trocado',
      expiresInSeconds: 60 * 60,
    });
    const refresh = vi.fn();
    const deps: ResolveTokenDeps = { exchange, refresh };

    const result = await resolveLongLivedToken(COMO_TOKEN, 'segredo', deps);

    expect(result).toEqual({ accessToken: 'trocado', expiresInSeconds: 60 * 60 });
    expect(exchange).toHaveBeenCalledWith(COMO_TOKEN, 'segredo');
    expect(refresh).not.toHaveBeenCalled();
  });

  it('cai para o refresh quando o câmbio falha (token já é de longa duração)', async () => {
    const exchange = vi.fn().mockRejectedValue(new Error('Meta respondeu 400: Session key invalid'));
    const refresh = vi.fn().mockResolvedValue({
      accessToken: 'renovado',
      expiresInSeconds: 60 * 24 * 60 * 60,
    });
    const deps: ResolveTokenDeps = { exchange, refresh };

    const result = await resolveLongLivedToken(COMO_TOKEN, 'segredo', deps);

    expect(result).toEqual({ accessToken: 'renovado', expiresInSeconds: 60 * 24 * 60 * 60 });
    expect(exchange).toHaveBeenCalledWith(COMO_TOKEN, 'segredo');
    expect(refresh).toHaveBeenCalledWith(COMO_TOKEN);
  });

  it('lança erro citando as duas tentativas quando ambas falham', async () => {
    const exchange = vi.fn().mockRejectedValue(new Error('Meta respondeu 400: exchange falhou'));
    const refresh = vi.fn().mockRejectedValue(new Error('Meta respondeu 400: refresh falhou'));
    const deps: ResolveTokenDeps = { exchange, refresh };

    let caught: unknown;
    try {
      await resolveLongLivedToken(COMO_TOKEN, 'segredo', deps);
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(Error);
    const message = (caught as Error).message;
    expect(message).toContain('ig_exchange_token');
    expect(message).toContain('exchange falhou');
    expect(message).toContain('ig_refresh_token');
    expect(message).toContain('refresh falhou');
  });
});

describe('o que a pessoa colou, antes de perguntar à Meta', () => {
  /*
   * Numa instalação, o painel devolveu "Invalid OAuth access token - Cannot
   * parse access token" duas vezes seguidas, em inglês, dentro de um texto
   * sobre ig_exchange_token e ig_refresh_token. Quem lê conclui que o token
   * venceu — e o que aconteceu foi outra coisa: o valor não era um token.
   */
  const tokenDeVerdade = 'IGAA' + 'x'.repeat(160);

  it('deixa passar um token com cara de token', () => {
    expect(problemaNoFormato(tokenDeVerdade)).toBe(null);
  });

  it('reconhece o App Secret, que é o engano mais comum', () => {
    expect(problemaNoFormato('a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6')).toContain('App Secret');
  });

  it('reconhece o ID do app', () => {
    expect(problemaNoFormato('1234567890123456')).toContain('ID do app');
  });

  it('reconhece a cópia que veio quebrada', () => {
    expect(problemaNoFormato(`IGAA${'x'.repeat(80)} ${'y'.repeat(80)}`)).toContain('quebra de linha');
    expect(problemaNoFormato(`IGAA${'x'.repeat(80)}\n${'y'.repeat(80)}`)).toContain('quebra de linha');
  });

  it('reconhece o valor cortado no meio', () => {
    expect(problemaNoFormato('IGAAxxxxxxxxxxxx')).toContain('curto demais');
  });

  it('campo vazio não vira chamada à Meta', () => {
    expect(problemaNoFormato('   ')).toContain('vazio');
  });

  /*
   * O aviso fala em "parece" e nada disto é regra publicada da Meta. Se o
   * formato mudar, o palpite erra — mas erra avisando, e a pessoa ainda pode
   * colar de novo. O contrário seria recusar um token bom.
   */
  it('token de formato desconhecido mas comprido segue para a Meta decidir', () => {
    expect(problemaNoFormato('ZZZ' + 'q'.repeat(120))).toBe(null);
  });
});
