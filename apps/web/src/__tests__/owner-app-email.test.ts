import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { ownerAppOrigin, sendOwnerAppEmail } from '../lib/owner-app-email';

function staging() {
  vi.stubEnv('SYNCVETE_ENV', 'staging');
  vi.stubEnv('OWNER_APP_ENABLED', 'true');
  vi.stubEnv('VERCEL_ENV', 'preview');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://owmcrqvnfubyjxrlyhlc.supabase.co');
  vi.stubEnv('OWNER_APP_STAGING_SUPABASE_URL', 'https://owmcrqvnfubyjxrlyhlc.supabase.co');
}
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('owner app delivery', () => {
  it('never calls the provider outside staging', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    await expect(
      sendOwnerAppEmail('owner@example.test', 'Invite', 'Private link', 'invite-key')
    ).rejects.toThrow('Staging');
    expect(fetch).not.toHaveBeenCalled();
  });
  it('reports missing credentials and provider failure without claiming delivery', async () => {
    staging();
    vi.stubEnv('OWNER_APP_RESEND_API_KEY', '');
    expect(
      await sendOwnerAppEmail('owner@example.test', 'Invite', 'Private link', 'invite-key')
    ).toBe(false);
    vi.stubEnv('OWNER_APP_RESEND_API_KEY', 'test');
    vi.stubEnv('OWNER_APP_EMAIL_FROM', 'Clinic <clinic@example.test>');
    const fetch = vi.fn().mockResolvedValue({ ok: false });
    vi.stubGlobal('fetch', fetch);
    expect(
      await sendOwnerAppEmail('owner@example.test', 'Invite', 'Private link', 'invite-key')
    ).toBe(false);
    expect(fetch.mock.calls[0][1].headers['Idempotency-Key']).toBe('invite-key');
    expect(JSON.parse(fetch.mock.calls[0][1].body).to).toEqual(['owner@example.test']);
  });
  it('requires a configured origin and rejects the production app host', () => {
    vi.stubEnv('OWNER_APP_STAGING_ORIGIN', '');
    expect(() => ownerAppOrigin()).toThrow();
    vi.stubEnv('OWNER_APP_STAGING_ORIGIN', 'https://syncvete.opusorg.com');
    expect(() => ownerAppOrigin()).toThrow('Production');
    vi.stubEnv('OWNER_APP_STAGING_ORIGIN', 'http://localhost:3017');
    expect(ownerAppOrigin()).toBe('http://localhost:3017');
  });
});
