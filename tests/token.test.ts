import { describe, it, expect, vi } from 'vitest';
import { resolveLongLivedToken } from '@/lib/meta/token';
import type { ResolveTokenDeps } from '@/lib/meta/token';

describe('resolveLongLivedToken', () => {
  it('usa o resultado do câmbio quando ig_exchange_token funciona', async () => {
    const exchange = vi.fn().mockResolvedValue({
      accessToken: 'trocado',
      expiresInSeconds: 60 * 60,
    });
    const refresh = vi.fn();
    const deps: ResolveTokenDeps = { exchange, refresh };

    const result = await resolveLongLivedToken('token-curto', 'segredo', deps);

    expect(result).toEqual({ accessToken: 'trocado', expiresInSeconds: 60 * 60 });
    expect(exchange).toHaveBeenCalledWith('token-curto', 'segredo');
    expect(refresh).not.toHaveBeenCalled();
  });

  it('cai para o refresh quando o câmbio falha (token já é de longa duração)', async () => {
    const exchange = vi.fn().mockRejectedValue(new Error('Meta respondeu 400: Session key invalid'));
    const refresh = vi.fn().mockResolvedValue({
      accessToken: 'renovado',
      expiresInSeconds: 60 * 24 * 60 * 60,
    });
    const deps: ResolveTokenDeps = { exchange, refresh };

    const result = await resolveLongLivedToken('token-longo', 'segredo', deps);

    expect(result).toEqual({ accessToken: 'renovado', expiresInSeconds: 60 * 24 * 60 * 60 });
    expect(exchange).toHaveBeenCalledWith('token-longo', 'segredo');
    expect(refresh).toHaveBeenCalledWith('token-longo');
  });

  it('lança erro citando as duas tentativas quando ambas falham', async () => {
    const exchange = vi.fn().mockRejectedValue(new Error('Meta respondeu 400: exchange falhou'));
    const refresh = vi.fn().mockRejectedValue(new Error('Meta respondeu 400: refresh falhou'));
    const deps: ResolveTokenDeps = { exchange, refresh };

    let caught: unknown;
    try {
      await resolveLongLivedToken('token-invalido', 'segredo', deps);
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
