import { describe, expect, it } from 'vitest';
import {
  formatDashboardDate,
  formatDashboardDateTime,
  formatRelativeTime,
  getCurrentMonthLabel,
} from '../utils/dashboard';

describe('dashboard utils', () => {
  it('formats dashboard dates in natural Spanish (lowercase de)', () => {
    const formatted = formatDashboardDate('2026-08-27T15:00:00.000Z');
    expect(formatted).toMatch(/27/);
    expect(formatted).toMatch(/2026/);
    expect(formatted).toMatch(/ de /);
    expect(formatted).not.toMatch(/\bDe\b/);
  });

  it('formats dashboard date time', () => {
    const formatted = formatDashboardDateTime('2024-08-15T15:30:00.000Z');
    expect(formatted).toMatch(/15/);
    expect(formatted).toContain(':');
  });

  it('formats relative time for recent minutes', () => {
    const now = new Date('2024-08-15T12:00:00.000Z');
    const fiveMinutesAgo = new Date('2024-08-15T11:55:00.000Z');
    const result = formatRelativeTime(fiveMinutesAgo, now);
    expect(result.length).toBeGreaterThan(0);
  });

  it('returns em dash for invalid dates', () => {
    expect(formatRelativeTime('invalid')).toBe('—');
    expect(formatDashboardDate('invalid')).toBe('—');
  });

  it('returns current month label', () => {
    const label = getCurrentMonthLabel(new Date('2024-08-15T12:00:00.000Z'));
    expect(label.toLowerCase()).toContain('2024');
  });
});
