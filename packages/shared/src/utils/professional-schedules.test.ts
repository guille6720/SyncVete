import { describe, expect, it } from 'vitest';
import type { ProfessionalSchedule } from '../types/appointments';
import {
  buildLocalSlotsForDate,
  findNextLocalSlot,
  getIsoWeekdayFromDateParam,
  getPreferredSlotDurationMinutes,
  validateLocalStartAgainstSchedules,
} from './professional-schedules';

function schedule(
  partial: Partial<ProfessionalSchedule> & Pick<ProfessionalSchedule, 'weekday' | 'start_time' | 'end_time'>
): ProfessionalSchedule {
  return {
    id: 's1',
    organization_id: 'o1',
    branch_id: 'b1',
    user_id: 'u1',
    slot_duration_minutes: 30,
    allowed_appointment_types: null,
    is_active: true,
    created_at: '',
    updated_at: '',
    deleted_at: null,
    ...partial,
  };
}

describe('professional-schedules', () => {
  it('maps date params to ISO weekdays', () => {
    // 2026-10-26 is a Monday
    expect(getIsoWeekdayFromDateParam('2026-10-26')).toBe(1);
    expect(getIsoWeekdayFromDateParam('2026-10-31')).toBe(6);
    expect(getIsoWeekdayFromDateParam('2026-11-01')).toBe(7);
  });

  it('builds slots inside the schedule window', () => {
    const slots = buildLocalSlotsForDate({
      dateStr: '2026-10-26',
      schedules: [schedule({ weekday: 1, start_time: '09:00:00', end_time: '10:30:00' })],
    });
    expect(slots.map((s) => s.label)).toEqual(['09:00', '09:30', '10:00']);
  });

  it('rejects starts outside configured hours when schedules exist', () => {
    const schedules = [schedule({ weekday: 1, start_time: '09:00:00', end_time: '12:00:00' })];
    expect(
      validateLocalStartAgainstSchedules({
        startsAtLocal: '2026-10-26T08:30',
        durationMinutes: 30,
        schedules,
      }).ok
    ).toBe(false);
    expect(
      validateLocalStartAgainstSchedules({
        startsAtLocal: '2026-10-26T11:45',
        durationMinutes: 30,
        schedules,
      }).ok
    ).toBe(false);
    expect(
      validateLocalStartAgainstSchedules({
        startsAtLocal: '2026-10-26T09:00',
        durationMinutes: 30,
        schedules,
      }).ok
    ).toBe(true);
  });

  it('does not enforce when the professional has no schedules', () => {
    const result = validateLocalStartAgainstSchedules({
      startsAtLocal: '2026-10-26T22:00',
      durationMinutes: 30,
      schedules: [],
    });
    expect(result).toEqual({ ok: true, enforced: false });
  });

  it('prefers the ficha slot duration and next open slot', () => {
    const schedules = [
      schedule({
        weekday: 5,
        start_time: '14:00:00',
        end_time: '20:00:00',
        slot_duration_minutes: 20,
      }),
    ];
    expect(getPreferredSlotDurationMinutes(schedules)).toBe(20);
    // 2026-10-26 is Monday — next Friday is 2026-10-30
    const next = findNextLocalSlot({
      preferredDateStr: '2026-10-26',
      schedules,
    });
    expect(next?.startsAtLocal).toBe('2026-10-30T14:00');
    expect(next?.durationMinutes).toBe(20);
  });
});
