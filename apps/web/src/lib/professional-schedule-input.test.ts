import { describe, expect, it } from 'vitest';
import { parseProfessionalScheduleInput } from './professional-schedule-input';
const row = { weekday: 1, startTime: '14:00', endTime: '20:00', slotDurationMinutes: 15 };
describe('professional schedule form input', () => {
  it('distinguishes an absent edit from clearing the entire week', () => {
    expect(parseProfessionalScheduleInput(null)).toEqual({ success: true });
    expect(parseProfessionalScheduleInput('[]')).toEqual({ success: true, schedules: [] });
  });
  it('keeps the requested days and appointment duration', () => {
    const rows = [row, { ...row, weekday: 5 }];
    expect(parseProfessionalScheduleInput(JSON.stringify(rows))).toEqual({
      success: true,
      schedules: rows,
    });
  });
  it.each(['', 'invalid json', '{}', '[null]'])(
    'rejects malformed input without silently clearing it: %s',
    (raw) => {
      expect(parseProfessionalScheduleInput(raw).success).toBe(false);
    }
  );
  it.each([
    { ...row, weekday: 8 },
    { ...row, startTime: '29:00' },
    { ...row, endTime: '13:00' },
    { ...row, slotDurationMinutes: 0 },
  ])('rejects invalid hours: %s', (value) => {
    expect(parseProfessionalScheduleInput(JSON.stringify([value])).success).toBe(false);
  });
  it('rejects overlapping shifts but allows adjacent shifts', () => {
    expect(
      parseProfessionalScheduleInput(JSON.stringify([row, { ...row, startTime: '19:00' }])).success
    ).toBe(false);
    expect(
      parseProfessionalScheduleInput(
        JSON.stringify([row, { ...row, startTime: '20:00', endTime: '22:00' }])
      ).success
    ).toBe(true);
  });
});
