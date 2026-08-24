import { describe, expect, it } from 'vitest';
import { branchSchema, organizationSettingsSchema } from '../schemas';

describe('organizationSettingsSchema', () => {
  it('validates clinic settings', () => {
    const result = organizationSettingsSchema.safeParse({
      name: 'Clínica San Roque',
      timezone: 'America/Argentina/Buenos_Aires',
      currency: 'ARS',
      phone: '',
      email: '',
      taxId: '',
      waitingRoomRoomsText: 'Consultorio 1\nBox A',
      waitingRoomMinutesPerPatient: '12',
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid currency', () => {
    const result = organizationSettingsSchema.safeParse({
      name: 'Clínica',
      timezone: 'America/Argentina/Buenos_Aires',
      currency: 'EUR',
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid waiting-room minutes', () => {
    const result = organizationSettingsSchema.safeParse({
      name: 'Clínica',
      timezone: 'America/Argentina/Buenos_Aires',
      currency: 'ARS',
      waitingRoomMinutesPerPatient: '999',
    });
    expect(result.success).toBe(false);
  });
});

describe('branchSchema', () => {
  it('validates branch code format', () => {
    const result = branchSchema.safeParse({
      name: 'Norte',
      code: 'NORTE_1',
      timezone: 'America/Argentina/Buenos_Aires',
      isActive: true,
    });
    expect(result.success).toBe(true);
  });

  it('rejects lowercase branch codes', () => {
    const result = branchSchema.safeParse({
      name: 'Norte',
      code: 'norte',
      timezone: 'America/Argentina/Buenos_Aires',
    });
    expect(result.success).toBe(false);
  });
});
