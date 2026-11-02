import { describe, expect, it } from 'vitest';
import { storageSandboxQuote } from './storage-sandbox';

describe('storage billing simulation', () => {
  it.each([
    ['basic', 2990000, 2000000000],
    ['pro', 4990000, 10000000000],
    ['premium', 7990000, 30000000000],
  ])('quotes %s without enabling a charge', (key, amountMinor, quotaBytes) => {
    expect(storageSandboxQuote(String(key), 'https://owmcrqvnfubyjxrlyhlc.supabase.co')).toMatchObject({
      amountMinor, quotaBytes, currency: 'ARS', simulated: true, checkoutEnabled: false, taxTreatment: 'pending',
    });
  });
  it('rejects another project, missing configuration and unknown plans', () => {
    expect(() => storageSandboxQuote('basic', undefined)).toThrow('staging');
    expect(() => storageSandboxQuote('basic', 'https://other.supabase.co')).toThrow('staging');
    expect(() => storageSandboxQuote('unknown', 'https://owmcrqvnfubyjxrlyhlc.supabase.co')).toThrow('inválido');
  });
});
