import { describe, expect, it } from 'vitest';
import {
  buildAppointmentDayMetrics,
  computeEndTime,
  formatDateParam,
  fromLocalDateTimeInput,
  getDurationMinutes,
  getWeekDays,
  getWeekStartDate,
  groupAppointmentsByAssignee,
  groupAppointmentsByDay,
  filterAssignableStaffByBranch,
  isActiveAppointmentStatus,
  parseDateParam,
} from '../utils/appointments';
import { appointmentStatusLabelForOps } from '../constants/appointments';

describe('appointment utils', () => {
  it('parses date param with fallback', () => {
    expect(parseDateParam('2024-08-15')).toBe('2024-08-15');
    expect(parseDateParam('invalid')).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('computes week start on monday', () => {
    expect(getWeekStartDate('2024-08-15')).toBe('2024-08-12');
  });

  it('returns seven week days', () => {
    expect(getWeekDays('2024-08-12')).toHaveLength(7);
    expect(getWeekDays('2024-08-12')[0]).toBe('2024-08-12');
    expect(getWeekDays('2024-08-12')[6]).toBe('2024-08-18');
  });

  it('computes end time from duration', () => {
    const end = computeEndTime('2024-08-15T12:00:00.000Z', 30);
    expect(getDurationMinutes('2024-08-15T12:00:00.000Z', end)).toBe(30);
  });

  it('converts local datetime input to iso', () => {
    const iso = fromLocalDateTimeInput('2024-08-15T09:00');
    expect(iso).toContain('2024-08-15');
  });

  it('formats date param', () => {
    expect(formatDateParam(new Date('2024-08-15T15:00:00.000Z'))).toMatch(/2024/);
  });

  it('detects active appointment statuses', () => {
    expect(isActiveAppointmentStatus('programada')).toBe(true);
    expect(isActiveAppointmentStatus('confirmada')).toBe(true);
    expect(isActiveAppointmentStatus('en_curso')).toBe(true);
    expect(isActiveAppointmentStatus('completada')).toBe(true);
    expect(isActiveAppointmentStatus('cancelada')).toBe(false);
    expect(isActiveAppointmentStatus('ausente')).toBe(false);
  });

  it('builds day metrics', () => {
    const metrics = buildAppointmentDayMetrics([
      { status: 'programada', starts_at: '2024-08-15T12:00:00.000Z' },
      { status: 'confirmada', starts_at: '2024-08-15T13:00:00.000Z' },
      { status: 'en_curso', starts_at: '2024-08-15T14:00:00.000Z' },
      { status: 'completada', starts_at: '2024-08-15T15:00:00.000Z' },
      { status: 'cancelada', starts_at: '2024-08-15T16:00:00.000Z' },
      { status: 'ausente', starts_at: '2024-08-15T17:00:00.000Z' },
    ]);
    expect(metrics).toEqual({
      total: 6,
      active: 4,
      programada: 1,
      confirmada: 1,
      enCurso: 1,
      completada: 1,
      cancelada: 1,
      ausente: 1,
    });
  });

  it('groups appointments by day and assignee', () => {
    const entries = [
      {
        id: '1',
        status: 'programada' as const,
        starts_at: '2024-08-15T12:00:00.000Z',
        assigned_user_id: 'u1',
      },
      {
        id: '2',
        status: 'confirmada' as const,
        starts_at: '2024-08-16T12:00:00.000Z',
        assigned_user_id: null,
      },
      {
        id: '3',
        status: 'en_curso' as const,
        starts_at: '2024-08-15T15:00:00.000Z',
        assigned_user_id: 'u1',
      },
    ];

    const byDay = groupAppointmentsByDay(entries);
    expect(Object.keys(byDay).length).toBeGreaterThanOrEqual(2);
    expect(byDay[formatDateParam(new Date(entries[0].starts_at))]).toHaveLength(2);

    const byAssignee = groupAppointmentsByAssignee(entries);
    expect(byAssignee.u1).toHaveLength(2);
    expect(byAssignee.unassigned).toHaveLength(1);
  });

  it('maps ops status labels', () => {
    expect(appointmentStatusLabelForOps('programada')).toBe('Programada');
    expect(appointmentStatusLabelForOps('ausente')).toBe('Ausente');
  });

  it('filters assignable staff by branch', () => {
    const staff = [
      { userId: 'u1', fullName: 'Ana', role: 'veterinarian', branchIds: ['b1'] },
      { userId: 'u2', fullName: 'Bruno', role: 'veterinarian', branchIds: ['b2'] },
      { userId: 'u3', fullName: 'Carla', role: 'veterinarian', branchIds: [] },
    ];
    expect(filterAssignableStaffByBranch(staff, 'b1').map((m) => m.userId)).toEqual(['u1', 'u3']);
    expect(filterAssignableStaffByBranch(staff, null)).toHaveLength(3);
  });
});
