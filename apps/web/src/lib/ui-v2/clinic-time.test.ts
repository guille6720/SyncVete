import { describe, expect, it } from 'vitest';
import { getClinicGreeting, getClinicHour, getClinicTodayLabel } from './clinic-time';

describe('clinic-time', () => {
  it('maps clinic hours to greetings', () => {
    // 2026-10-26 08:00 Argentina = 11:00 UTC
    expect(getClinicHour(new Date('2026-10-26T11:00:00.000Z'))).toBe(8);
    expect(getClinicGreeting(new Date('2026-10-26T11:00:00.000Z'))).toBe('Buenos días');
    // 15:00 AR = 18:00 UTC
    expect(getClinicGreeting(new Date('2026-10-26T18:00:00.000Z'))).toBe('Buenas tardes');
    // 21:00 AR = 00:00 UTC next day
    expect(getClinicGreeting(new Date('2026-10-27T00:00:00.000Z'))).toBe('Buenas noches');
  });

  it('formats today label in es-AR clinic timezone', () => {
    const label = getClinicTodayLabel(new Date('2026-10-26T15:00:00.000Z'));
    expect(label.toLowerCase()).toContain('octubre');
    expect(label).toMatch(/26/);
  });
});
