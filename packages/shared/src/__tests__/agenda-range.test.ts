import { describe, expect, it } from 'vitest';
import {
  agendaMonthBounds,
  parseAgendaViewMode,
  resolveAgendaCalendarRange,
  shiftAgendaDay,
  shiftAgendaMonth,
  shiftAgendaWeek,
} from '../utils/appointments';

describe('agenda calendar range helpers', () => {
  it('parses view modes with day default', () => {
    expect(parseAgendaViewMode('week')).toBe('week');
    expect(parseAgendaViewMode('month')).toBe('month');
    expect(parseAgendaViewMode('day')).toBe('day');
    expect(parseAgendaViewMode('nope')).toBe('day');
    expect(parseAgendaViewMode(undefined)).toBe('day');
  });

  it('shifts day/week/month anchors', () => {
    expect(shiftAgendaDay('2026-08-27', 1)).toBe('2026-08-28');
    expect(shiftAgendaDay('2026-08-27', -1)).toBe('2026-08-26');
    expect(shiftAgendaWeek('2026-08-24', 1)).toBe('2026-08-31');
    expect(shiftAgendaMonth('2026-08', 1)).toBe('2026-09');
    expect(shiftAgendaMonth('2026-01', -1)).toBe('2025-12');
  });

  it('computes inclusive month bounds', () => {
    expect(agendaMonthBounds('2026-02')).toEqual({ from: '2026-02-01', to: '2026-02-28' });
    expect(agendaMonthBounds('2024-02')).toEqual({ from: '2024-02-01', to: '2024-02-29' });
  });

  it('resolves day range to a single date', () => {
    const range = resolveAgendaCalendarRange({
      date: '2026-08-27',
      view: 'day',
    });
    expect(range).toMatchObject({
      from: '2026-08-27',
      to: '2026-08-27',
      view: 'day',
      selectedDate: '2026-08-27',
      month: '2026-08',
    });
  });

  it('resolves week range to seven days from week start', () => {
    const range = resolveAgendaCalendarRange({
      date: '2026-08-27',
      week: '2026-08-24',
      view: 'week',
    });
    expect(range.from).toBe('2026-08-24');
    expect(range.to).toBe('2026-08-30');
    expect(range.view).toBe('week');
  });

  it('resolves month range to month bounds', () => {
    const range = resolveAgendaCalendarRange({
      date: '2026-08-15',
      month: '2026-08',
      view: 'month',
    });
    expect(range.from).toBe('2026-08-01');
    expect(range.to).toBe('2026-08-31');
    expect(range.view).toBe('month');
  });
});
