import { describe, expect, it } from 'vitest';
import { reportRangeSchema } from '../schemas';
import {
  daysBetweenIso,
  getReportPeriod,
  isValidReportRange,
} from '../utils/reports';
import { formatWaitMinutes } from '../utils/waiting-room';

describe('getReportPeriod', () => {
  const now = new Date('2026-08-12T18:00:00.000Z'); // 15:00 AR

  it('returns today', () => {
    expect(getReportPeriod('today', now)).toEqual({ from: '2026-08-12', to: '2026-08-12' });
  });

  it('returns ISO week starting Monday', () => {
    const period = getReportPeriod('week', now);
    expect(period.from).toBe('2026-08-10');
    expect(period.to).toBe('2026-08-12');
  });

  it('returns the current month', () => {
    expect(getReportPeriod('month', now)).toEqual({ from: '2026-08-01', to: '2026-08-12' });
  });

  it('returns the last 30 days inclusive', () => {
    expect(getReportPeriod('last_30', now)).toEqual({ from: '2026-07-14', to: '2026-08-12' });
  });
});

describe('report range helpers', () => {
  it('counts inclusive span', () => {
    expect(daysBetweenIso('2026-08-01', '2026-08-12')).toBe(11);
  });

  it('rejects inverted or too-long ranges', () => {
    expect(isValidReportRange('2026-08-12', '2026-08-01')).toBe(false);
    expect(isValidReportRange('2026-01-01', '2026-08-01')).toBe(false);
    expect(isValidReportRange('2026-08-01', '2026-08-12')).toBe(true);
  });
});

describe('reportRangeSchema', () => {
  it('accepts a valid range', () => {
    const result = reportRangeSchema.safeParse({
      from: '2026-08-01',
      to: '2026-08-12',
    });
    expect(result.success).toBe(true);
  });

  it('rejects a range longer than 92 days', () => {
    const result = reportRangeSchema.safeParse({
      from: '2026-01-01',
      to: '2026-08-01',
    });
    expect(result.success).toBe(false);
  });
});

describe('waiting room report display helpers', () => {
  it('formats average wait minutes for report cards', () => {
    expect(formatWaitMinutes(18)).toBe('18 min');
    expect(formatWaitMinutes(75)).toBe('1 h 15 min');
  });
});

describe('buildWaitingRoomReportCsv', () => {
  it('builds summary and daily rows', async () => {
    const { buildWaitingRoomReportCsv } = await import('../utils/reports');
    const csv = buildWaitingRoomReportCsv('2026-08-01', '2026-08-03', {
      checkIns: 5,
      completed: 4,
      removed: 1,
      called: 5,
      avgMinutesToCall: 12,
      avgMinutesToComplete: 45,
      byStatus: [{ status: 'waiting', count: 1 }],
      daily: [
        { day: '2026-08-01', checkIns: 2, completed: 1 },
        { day: '2026-08-02', checkIns: 0, completed: 0 },
      ],
    });
    expect(csv).toContain('Resumen,Check-ins,5');
    expect(csv).toContain('Por estado,En espera,1');
    expect(csv).toContain('2026-08-01,2,1');
    expect(csv).not.toContain('2026-08-02');
  });
});

describe('buildWaitingRoomReportEntriesCsv', () => {
  it('builds detail rows and full export', async () => {
    const {
      buildFullWaitingRoomReportCsv,
      buildWaitingRoomReportEntriesCsv,
    } = await import('../utils/reports');
    const entries = [
      {
        entryId: '1',
        checkedInAt: '2026-08-01T15:00:00.000Z',
        patientName: 'Luna',
        ownerFullName: 'Ana',
        assignedUserName: 'Dr. Pérez',
        appointmentStartsAt: '2026-08-01T15:30:00.000Z',
        status: 'completed',
        room: '1',
        calledAt: '2026-08-01T15:10:00.000Z',
        completedAt: '2026-08-01T16:00:00.000Z',
        removed: false,
        minutesToCall: 10,
        minutesDwell: 60,
      },
    ];
    const detail = buildWaitingRoomReportEntriesCsv(entries);
    expect(detail).toContain('Check-in,Paciente,Propietario');
    expect(detail).toContain('Luna');
    expect(detail).toContain('Completado');

    const full = buildFullWaitingRoomReportCsv('2026-08-01', '2026-08-01', {
      checkIns: 1,
      completed: 1,
      removed: 0,
      called: 1,
      avgMinutesToCall: 10,
      avgMinutesToComplete: 60,
      byStatus: [{ status: 'completed', count: 1 }],
      daily: [{ day: '2026-08-01', checkIns: 1, completed: 1 }],
    }, entries);
    expect(full).toContain('Resumen,Check-ins,1');
    expect(full).toContain('Detalle por ingreso');
  });
});
