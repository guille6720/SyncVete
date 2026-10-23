import { describe, expect, it } from 'vitest';
import { portalActivateSchema } from '../schemas';
import { buildPortalActivatePath, normalizePortalInviteToken } from '../constants/portal';
import {
  isNonEmptyPortalPayload,
  parseOwnerPortalHome,
  parsePortalInvitePreview,
} from '../utils/portal';

describe('portalActivateSchema', () => {
  it('accepts a valid activation payload', () => {
    const result = portalActivateSchema.safeParse({
      token: 'a'.repeat(32),
      fullName: '  Ana Gómez  ',
      password: 'secreto123',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.fullName).toBe('Ana Gómez');
    }
  });

  it('rejects a short token or password', () => {
    expect(
      portalActivateSchema.safeParse({
        token: 'short',
        fullName: 'Ana',
        password: '123',
      }).success
    ).toBe(false);
  });
});

describe('buildPortalActivatePath', () => {
  it('encodes the invite token', () => {
    expect(buildPortalActivatePath('abc+def')).toBe('/portal/activar?token=abc%2Bdef');
  });
});

describe('normalizePortalInviteToken', () => {
  it('recovers hex tokens mangled by messengers', () => {
    const token = `${'ab'.repeat(32)}`;
    expect(normalizePortalInviteToken(`${token.slice(0, 3)}/${token.slice(3)}/`)).toBe(token);
  });

  it('returns empty for missing values', () => {
    expect(normalizePortalInviteToken(null)).toBe('');
    expect(normalizePortalInviteToken('***')).toBe('');
  });
});

describe('portal parsers', () => {
  it('treats empty jsonb as missing payload', () => {
    expect(isNonEmptyPortalPayload({})).toBe(false);
    expect(isNonEmptyPortalPayload({ valid: true })).toBe(true);
  });

  it('parses an invite preview', () => {
    const preview = parsePortalInvitePreview({
      valid: true,
      email: 'ana@test.com',
      owner_name: 'Ana Gómez',
      clinic_name: 'Clínica Sur',
      expires_at: '2026-08-19T00:00:00.000Z',
    });
    expect(preview).toEqual({
      valid: true,
      email: 'ana@test.com',
      ownerName: 'Ana Gómez',
      clinicName: 'Clínica Sur',
      expiresAt: '2026-08-19T00:00:00.000Z',
    });
  });

  it('parses portal home patients and invoices', () => {
    const home = parseOwnerPortalHome({
      clinic: { name: 'Clínica Sur', phone: null, email: null },
      owner: { id: 'o1', full_name: 'Ana', email: 'ana@test.com', phone: null },
      patients: [
        {
          id: 'p1',
          name: 'Luna',
          species: 'Canino',
          breed: 'Mestizo',
          sex: 'Hembra',
          birth_date: '2020-01-01',
          is_deceased: false,
        },
      ],
      upcoming_appointments: [],
      vaccines_due: [],
      invoices: [
        {
          id: 'i1',
          number: 'F-000001',
          status: 'emitida',
          currency: 'ARS',
          issued_at: '2026-08-01T00:00:00.000Z',
          due_at: null,
          total: 25000,
          paid_amount: 0,
          balance: 25000,
          patient_name: 'Luna',
        },
      ],
      recent_clinical: [],
    });
    expect(home?.patients[0]?.name).toBe('Luna');
    expect(home?.invoices[0]?.balance).toBe(25000);
  });
});
