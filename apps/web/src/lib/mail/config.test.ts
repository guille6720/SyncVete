import { describe, expect, it } from 'vitest';
import { getMailFrom, recipientDomain, resolveAppOrigin } from '@/lib/mail/config';

describe('mail config', () => {
  it('defaults sender to SyncVete <soporte@opusorg.com>', () => {
    const from = getMailFrom();
    expect(from.email).toBe('soporte@opusorg.com');
    expect(from.name).toBe('SyncVete');
  });

  it('extracts recipient domain without logging full address in helpers', () => {
    expect(recipientDomain('vet@Clinic.Example.com')).toBe('clinic.example.com');
  });

  it('prefers NEXT_PUBLIC_APP_URL for staging CTAs', () => {
    const prev = process.env.NEXT_PUBLIC_APP_URL;
    process.env.NEXT_PUBLIC_APP_URL = 'https://sync-vete-staging-example.vercel.app/';
    expect(resolveAppOrigin()).toBe('https://sync-vete-staging-example.vercel.app');
    process.env.NEXT_PUBLIC_APP_URL = prev;
  });
});
