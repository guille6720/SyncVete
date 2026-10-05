import { describe, expect, it } from 'vitest';
import {
  ownerAppEnabled,
  ownerAppBrandSchema,
  ownerAppBookingSchema,
  parseOwnerAppBrand,
  ownerAppTextColor,
} from '../lib/owner-app';

describe('staging-only owner app', () => {
  const staging = {
    SYNCVETE_ENV: 'staging',
    OWNER_APP_ENABLED: 'true',
    NEXT_PUBLIC_SUPABASE_URL: 'https://owmcrqvnfubyjxrlyhlc.supabase.co',
    OWNER_APP_STAGING_SUPABASE_URL: 'https://owmcrqvnfubyjxrlyhlc.supabase.co',
  };
  it('requires an explicit flag and pinned staging database', () => {
    expect(ownerAppEnabled({})).toBe(false);
    expect(ownerAppEnabled(staging)).toBe(true);
    expect(ownerAppEnabled({ ...staging, OWNER_APP_STAGING_SUPABASE_URL: undefined })).toBe(false);
    expect(
      ownerAppEnabled({ ...staging, NEXT_PUBLIC_SUPABASE_URL: 'https://production.supabase.co' })
    ).toBe(false);
    expect(ownerAppEnabled({ ...staging, VERCEL_ENV: 'production' })).toBe(false);
    expect(
      ownerAppEnabled({
        ...staging,
        OWNER_APP_STAGING_SUPABASE_URL: 'https://production.supabase.co',
        NEXT_PUBLIC_SUPABASE_URL: 'https://production.supabase.co',
      })
    ).toBe(false);
  });
  it('rejects unsafe image protocols and invalid colors', () => {
    const brand = {
      appName: 'app-IMILVET',
      enabled: true,
      logoUrl: '',
      welcomeText: 'Hola',
      primaryColor: '#16805c',
    };
    expect(ownerAppBrandSchema.safeParse(brand).success).toBe(true);
    for (const logoUrl of [
      'javascript:alert(1)',
      '//evil.test/logo.png',
      'http://evil.test/logo.png',
    ])
      expect(ownerAppBrandSchema.safeParse({ ...brand, logoUrl }).success).toBe(false);
    expect(
      ownerAppBrandSchema.safeParse({ ...brand, primaryColor: 'red;background:url(x)' }).success
    ).toBe(false);
    expect(parseOwnerAppBrand(null, 'IMILVET').appName).toBe('app-IMILVET');
    expect(parseOwnerAppBrand(null).enabled).toBe(false);
  });
  it('rejects forged booking identifiers', () => {
    expect(ownerAppBookingSchema.safeParse({ slotId: 'x', patientId: 'y' }).success).toBe(false);
  });
  it('keeps custom-colored controls readable', () => {
    expect(ownerAppTextColor('#ffffff')).toBe('#111827');
    expect(ownerAppTextColor('#000000')).toBe('#ffffff');
  });
});
