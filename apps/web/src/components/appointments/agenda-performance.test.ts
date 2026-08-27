import { describe, expect, it } from 'vitest';
import { mapWaitingRoomByAppointmentId } from '@sincvete/shared';
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
