import { describe, expect, it } from 'vitest';
import {
  getPermissionsForRole,
  isClinicPathEntitled,
  mapWaitingRoomByAppointmentId,
  resolveAgendaCalendarRange,
  shiftAgendaDay,
  shiftAgendaMonth,
  shiftAgendaWeek,
} from '@sincvete/shared';
import type { AgendaShellData } from './agenda-types';

describe('agenda waiting-room mapping', () => {
  it('maps only appointment_id and waiting_room_status', () => {
    const map = mapWaitingRoomByAppointmentId([
      { appointment_id: 'a1', waiting_room_status: 'waiting' },
      { appointment_id: 'a2', waiting_room_status: 'called' },
    ]);
    expect(map).toEqual({
      a1: 'waiting',
      a2: 'called',
    });
  });

  it('ignores unknown statuses', () => {
    const map = mapWaitingRoomByAppointmentId([
      {
        appointment_id: 'a1',
        waiting_room_status: 'not-a-status' as 'waiting',
      },
    ]);
    expect(map).toEqual({});
  });
});

describe('agenda shell capability flags', () => {
  it('keeps UI capability fields required by Agenda', () => {
    const shell: AgendaShellData = {
      canWrite: true,
      canReadWaitingRoom: true,
      canCheckInWaitingRoom: false,
      canStartConsultation: true,
      canBilling: false,
      canVaccination: true,
      staff: [],
      branches: [],
    };

    expect(shell.canWrite).toBe(true);
    expect(shell.canCheckInWaitingRoom).toBe(false);
    expect(shell.canBilling).toBe(false);
  });
});

describe('agenda navigation ranges', () => {
  it('resolves day / week / month ranges without reloading shell metadata', () => {
    const day = resolveAgendaCalendarRange({
      date: '2026-08-27',
      week: '2026-08-24',
      month: '2026-08',
      view: 'day',
    });
    const week = resolveAgendaCalendarRange({
      date: '2026-08-27',
      week: '2026-08-24',
      month: '2026-08',
      view: 'week',
    });
    const month = resolveAgendaCalendarRange({
      date: '2026-08-27',
      week: '2026-08-24',
      month: '2026-08',
      view: 'month',
    });

    expect(day.from).toBe('2026-08-27');
    expect(day.to).toBe('2026-08-27');
    expect(week.from).toBe('2026-08-24');
    expect(month.from.startsWith('2026-08')).toBe(true);
  });

  it('shifts previous/next for day week month', () => {
    expect(shiftAgendaDay('2026-08-27', 1)).toBe('2026-08-28');
    expect(shiftAgendaDay('2026-08-27', -1)).toBe('2026-08-26');
    expect(shiftAgendaWeek('2026-08-24', 1)).toBe('2026-08-31');
    expect(shiftAgendaMonth('2026-08', 1)).toBe('2026-09');
    expect(shiftAgendaMonth('2026-08', -1)).toBe('2026-07');
  });
});

describe('session permission derivation', () => {
  it('derives receptionist permissions without write clinical', () => {
    const permissions = getPermissionsForRole('receptionist');
    expect(permissions).toContain('appointments:read');
    expect(permissions).not.toContain('clinical:write');
  });

  it('derives veterinarian clinical write', () => {
    const permissions = getPermissionsForRole('veterinarian');
    expect(permissions).toContain('clinical:write');
    expect(permissions).toContain('patients:read');
  });
});

describe('entitlement path gating', () => {
  it('allows path when entitled hrefs include module', () => {
    expect(isClinicPathEntitled('/agenda', ['/agenda', '/pacientes'])).toBe(true);
  });

  it('blocks path when entitled hrefs omit module', () => {
    expect(isClinicPathEntitled('/farmacia', ['/agenda', '/pacientes'])).toBe(false);
  });

  it('fails open when entitled hrefs are null (schema unavailable)', () => {
    expect(isClinicPathEntitled('/agenda', null)).toBe(true);
  });
});
