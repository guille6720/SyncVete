import { afterEach, describe, expect, it, vi } from 'vitest';

describe('isAcademiaEnabled', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('defaults to disabled outside Vercel preview/production', async () => {
    vi.stubEnv('NEXT_PUBLIC_ACADEMIA_ENABLED', undefined);
    vi.stubEnv('VERCEL_ENV', 'development');
    const { isAcademiaEnabled } = await import('./feature-flag');
    expect(isAcademiaEnabled()).toBe(false);
  });

  it('enables on Vercel preview even without the flag', async () => {
    vi.stubEnv('NEXT_PUBLIC_ACADEMIA_ENABLED', undefined);
    vi.stubEnv('VERCEL_ENV', 'preview');
    const { isAcademiaEnabled } = await import('./feature-flag');
    expect(isAcademiaEnabled()).toBe(true);
  });

  it('enables on Vercel production by default', async () => {
    vi.stubEnv('NEXT_PUBLIC_ACADEMIA_ENABLED', undefined);
    vi.stubEnv('VERCEL_ENV', 'production');
    const { isAcademiaEnabled } = await import('./feature-flag');
    expect(isAcademiaEnabled()).toBe(true);
  });

  it('enables when flag is true', async () => {
    vi.stubEnv('NEXT_PUBLIC_ACADEMIA_ENABLED', 'true');
    vi.stubEnv('VERCEL_ENV', 'development');
    const { isAcademiaEnabled } = await import('./feature-flag');
    expect(isAcademiaEnabled()).toBe(true);
  });

  it('can force off on production with flag false', async () => {
    vi.stubEnv('NEXT_PUBLIC_ACADEMIA_ENABLED', 'false');
    vi.stubEnv('VERCEL_ENV', 'production');
    const { isAcademiaEnabled } = await import('./feature-flag');
    expect(isAcademiaEnabled()).toBe(false);
  });
});
