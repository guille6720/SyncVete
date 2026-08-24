import { describe, expect, it } from 'vitest';
import {
  appointmentStatusAfterWaitingRoom,
  canTransitionWaitingRoomStatus,
  compareWaitingRoomQueue,
  isWaitingRoomStatus,
  sortWaitingRoomQueue,
  waitingRoomCheckInSchema,
  waitingRoomListSchema,
  waitingRoomReorderSchema,
  waitingRoomUpdateStatusSchema,
  FEATURES,
  getPermissionsForRole,
  isFeatureKey,
  parsePortalWaitingRoomRows,
  parseWaitingRoomCheckInPreview,
  parseWaitingRoomCheckInTokenResult,
  parseOwnerPortalAlerts,
  PORTAL_WAITING_ROOM_STATUS_MESSAGES,
} from '../index';

describe('waiting room permissions & entitlements registry', () => {
  it('registers waiting_room permissions on operational roles', () => {
    expect(getPermissionsForRole('receptionist')).toContain('waiting_room:write');
    expect(getPermissionsForRole('cashier')).toContain('waiting_room:write');
    expect(getPermissionsForRole('lab_tech')).toContain('waiting_room:read');
    expect(getPermissionsForRole('lab_tech')).not.toContain('waiting_room:write');
    expect(getPermissionsForRole('readonly')).toContain('waiting_room:read');
    expect(getPermissionsForRole('readonly')).not.toContain('waiting_room:write');
  });

  it('registers waiting_room.enabled feature key', () => {
    expect(FEATURES.WAITING_ROOM).toBe('waiting_room.enabled');
    expect(isFeatureKey('waiting_room.enabled')).toBe(true);
  });
});

describe('waiting room status transitions', () => {
  it('allows the sequential happy path', () => {
    expect(canTransitionWaitingRoomStatus('waiting', 'called')).toBe(true);
    expect(canTransitionWaitingRoomStatus('called', 'in_consultation')).toBe(true);
    expect(canTransitionWaitingRoomStatus('in_consultation', 'payment_pending')).toBe(true);
    expect(canTransitionWaitingRoomStatus('payment_pending', 'completed')).toBe(true);
  });

  it('rejects invalid transitions', () => {
    expect(canTransitionWaitingRoomStatus('waiting', 'in_consultation')).toBe(false);
    expect(canTransitionWaitingRoomStatus('waiting', 'completed')).toBe(false);
    expect(canTransitionWaitingRoomStatus('called', 'waiting')).toBe(false);
    expect(canTransitionWaitingRoomStatus('completed', 'waiting')).toBe(false);
    expect(canTransitionWaitingRoomStatus('payment_pending', 'in_consultation')).toBe(false);
  });

  it('maps appointment sync statuses correctly', () => {
    expect(appointmentStatusAfterWaitingRoom('in_consultation')).toBe('en_curso');
    expect(appointmentStatusAfterWaitingRoom('completed')).toBe('completada');
    expect(appointmentStatusAfterWaitingRoom('payment_pending')).toBeNull();
    expect(appointmentStatusAfterWaitingRoom('waiting')).toBeNull();
    expect(appointmentStatusAfterWaitingRoom('called')).toBeNull();
  });

  it('validates status strings', () => {
    expect(isWaitingRoomStatus('waiting')).toBe(true);
    expect(isWaitingRoomStatus('en_curso')).toBe(false);
  });
});

describe('waiting room queue ordering', () => {
  it('orders by priority, then queue_position, then checked_in_at', () => {
    const sorted = sortWaitingRoomQueue([
      { priority: 0, queue_position: 2, checked_in_at: '2026-08-24T10:00:00.000Z' },
      { priority: 5, queue_position: 9, checked_in_at: '2026-08-24T11:00:00.000Z' },
      { priority: 0, queue_position: 1, checked_in_at: '2026-08-24T09:00:00.000Z' },
      { priority: 0, queue_position: null, checked_in_at: '2026-08-24T08:00:00.000Z' },
    ]);

    expect(sorted.map((r) => r.priority)).toEqual([5, 0, 0, 0]);
    expect(sorted[0]?.queue_position).toBe(9);
    expect(sorted[1]?.queue_position).toBe(1);
    expect(sorted[2]?.queue_position).toBe(2);
    expect(sorted[3]?.queue_position).toBeNull();
  });

  it('lets emergency priority jump ahead without changing check-in order among equals', () => {
    const emergency = { priority: 100, queue_position: 3, checked_in_at: '2026-08-24T12:00:00.000Z' };
    const regular = { priority: 0, queue_position: 1, checked_in_at: '2026-08-24T10:00:00.000Z' };
    expect(compareWaitingRoomQueue(emergency, regular)).toBeLessThan(0);
  });
});

describe('waiting room schemas', () => {
  const entryId = '550e8400-e29b-41d4-a716-446655440010';
  const appointmentId = '550e8400-e29b-41d4-a716-446655440011';

  it('validates check-in input', () => {
    expect(waitingRoomCheckInSchema.safeParse({ appointmentId }).success).toBe(true);
    expect(waitingRoomCheckInSchema.safeParse({ appointmentId: 'x' }).success).toBe(false);
  });

  it('validates list filters', () => {
    expect(waitingRoomListSchema.safeParse({ date: '2026-08-24' }).success).toBe(true);
    expect(waitingRoomListSchema.safeParse({ date: '24-08-2026' }).success).toBe(false);
  });

  it('validates status updates', () => {
    const ok = waitingRoomUpdateStatusSchema.safeParse({
      entryId,
      newStatus: 'called',
      room: 'Consultorio 1',
    });
    expect(ok.success).toBe(true);

    const bad = waitingRoomUpdateStatusSchema.safeParse({
      entryId,
      newStatus: 'en_curso',
    });
    expect(bad.success).toBe(false);
  });

  it('requires queue_position or priority for reorder', () => {
    expect(
      waitingRoomReorderSchema.safeParse({ entryId, queuePosition: 2 }).success
    ).toBe(true);
    expect(waitingRoomReorderSchema.safeParse({ entryId, priority: 10 }).success).toBe(true);
    expect(waitingRoomReorderSchema.safeParse({ entryId }).success).toBe(false);
  });
});

describe('portal waiting room rows', () => {
  it('parses tutor-facing rows and drops invalid status', () => {
    const rows = parsePortalWaitingRoomRows([
      {
        waiting_room_entry_id: '550e8400-e29b-41d4-a716-446655440010',
        appointment_id: '550e8400-e29b-41d4-a716-446655440011',
        patient_id: '550e8400-e29b-41d4-a716-446655440012',
        patient_name: 'Luna',
        patient_species: 'Canino',
        appointment_type: 'consulta',
        appointment_starts_at: '2026-08-24T12:00:00.000Z',
        waiting_room_status: 'called',
        checked_in_at: '2026-08-24T11:00:00.000Z',
        called_at: '2026-08-24T11:30:00.000Z',
        consultation_started_at: null,
        payment_pending_at: null,
        completed_at: null,
        queue_position: 1,
        priority: 0,
        room: '1',
        ahead_count: 0,
      },
      {
        waiting_room_entry_id: 'x',
        appointment_id: 'y',
        patient_id: 'z',
        waiting_room_status: 'en_curso',
      },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.patient_name).toBe('Luna');
    expect(PORTAL_WAITING_ROOM_STATUS_MESSAGES.called).toMatch(/llamando/i);
  });
});

describe('waiting room QR check-in parsers', () => {
  it('parses token result with absolute URL', () => {
    const token = parseWaitingRoomCheckInTokenResult(
      {
        token: 'abc123',
        expires_at: '2026-08-24T20:00:00Z',
        appointment_id: '11111111-1111-1111-1111-111111111111',
        path: '/check-in/abc123',
      },
      'https://syncvete.example'
    );
    expect(token?.url).toBe('https://syncvete.example/check-in/abc123');
  });

  it('parses preview valid and invalid payloads', () => {
    expect(parseWaitingRoomCheckInPreview({ valid: false, reason: 'expired' })).toEqual({
      valid: false,
      reason: 'expired',
    });
    expect(
      parseWaitingRoomCheckInPreview({
        valid: true,
        patient_name: 'Luna',
        patient_species: 'Canino',
        appointment_type: 'consulta',
        organization_name: 'Clínica Demo',
      }).patient_name
    ).toBe('Luna');
  });

  it('parses portal alerts', () => {
    const alerts = parseOwnerPortalAlerts([
      {
        id: 'a1',
        title: '¡Te están llamando!',
        body: 'Luna · Consultorio 2',
        href: '/portal/sala-espera',
        related_type: 'waiting_room_entry',
        related_id: 'w1',
        read_at: null,
        created_at: '2026-08-24T12:00:00Z',
      },
      { id: null, title: 'bad' },
    ]);
    expect(alerts).toHaveLength(1);
    expect(alerts[0]?.title).toMatch(/llamando/i);
  });
});
