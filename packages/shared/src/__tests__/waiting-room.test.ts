import { describe, expect, it } from 'vitest';
import {
  appointmentStatusAfterWaitingRoom,
  canTransitionWaitingRoomStatus,
  compareWaitingRoomQueue,
  isWaitingRoomStatus,
  sortWaitingRoomQueue,
  waitingRoomCheckInSchema,
  waitingRoomListSchema,
  waitingRoomReorderQueueSchema,
  waitingRoomRemoveSchema,
  waitingRoomNotesSchema,
  waitingRoomReorderSchema,
  waitingRoomUpdateStatusSchema,
  FEATURES,
  getPermissionsForRole,
  isFeatureKey,
  parsePortalWaitingRoomRows,
  parsePatientWaitingRoomHistoryRows,
  getPatientWaitingRoomActiveEntry,
  parseOwnerWaitingRoomHistoryRows,
  getOwnerWaitingRoomActiveEntries,
  parseWaitingRoomCheckInPreview,
  parseWaitingRoomCheckInTokenResult,
  parseOwnerPortalAlerts,
  applyWaitingRoomQueueOrder,
  buildWaitingRoomQueueOrder,
  buildWaitingRoomDashboard,
  filterWaitingRoomCheckInCandidates,
  filterWaitingRoomEntries,
  parseWaitingRoomBoardFilters,
  parsePublicCheckInStatus,
  resolveWaitingRoomListBranchId,
  appendWaitingRoomBoardFilterParams,
  buildWaitingRoomSurfaceHref,
  resolveWaitingRoomBranchLabel,
  filterAppointmentsByWaitingRoomBranch,
  formatWaitMinutes,
  mapWaitingRoomByAppointmentId,
  estimatePortalWaitingMinutes,
  formatPortalWaitingEta,
  resolveWaitingRoomMinutesPerPatient,
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

  it('builds sequential queue positions after drag-and-drop', () => {
    expect(buildWaitingRoomQueueOrder(['a', 'b', 'c'])).toEqual([
      { entryId: 'a', queuePosition: 1, priority: 0 },
      { entryId: 'b', queuePosition: 2, priority: 0 },
      { entryId: 'c', queuePosition: 3, priority: 0 },
    ]);
  });

  it('applies optimistic queue order and normalizes priority', () => {
    const rows = [
      {
        waiting_room_entry_id: '1',
        queue_position: 1,
        priority: 5,
        checked_in_at: '2026-08-24T10:00:00.000Z',
      },
      {
        waiting_room_entry_id: '2',
        queue_position: 2,
        priority: 0,
        checked_in_at: '2026-08-24T11:00:00.000Z',
      },
    ];
    const next = applyWaitingRoomQueueOrder(rows, ['2', '1']);
    expect(next.map((r) => r.waiting_room_entry_id)).toEqual(['2', '1']);
    expect(next.map((r) => r.queue_position)).toEqual([1, 2]);
    expect(next.every((r) => r.priority === 0)).toBe(true);
  });

  it('maps appointment ids to waiting-room status', () => {
    const map = mapWaitingRoomByAppointmentId([
      {
        appointment_id: 'a1',
        waiting_room_status: 'waiting',
      },
      {
        appointment_id: 'a2',
        waiting_room_status: 'called',
      },
    ] as Parameters<typeof mapWaitingRoomByAppointmentId>[0]);
    expect(map).toEqual({ a1: 'waiting', a2: 'called' });
  });

  it('filters board entries by query, status and assigned user', () => {
    const rows = [
      {
        waiting_room_entry_id: '1',
        appointment_id: 'a1',
        patient_id: 'p1',
        patient_name: 'Luna',
        patient_species: 'Canino' as const,
        owner_id: 'o1',
        owner_full_name: 'Ana García',
        assigned_user_id: 'u1',
        assigned_user_name: 'Dr. A',
        appointment_type: 'consulta' as const,
        appointment_starts_at: '2026-08-24T11:00:00.000Z',
        waiting_room_status: 'waiting' as const,
        checked_in_at: '2026-08-24T10:00:00.000Z',
        called_at: null,
        consultation_started_at: null,
        payment_pending_at: null,
        completed_at: null,
        queue_position: 1,
        priority: 0,
        room: null,
        internal_notes: null,
      },
      {
        waiting_room_entry_id: '2',
        appointment_id: 'a2',
        patient_id: 'p2',
        patient_name: 'Michi',
        patient_species: 'Felino' as const,
        owner_id: 'o2',
        owner_full_name: 'Bob',
        assigned_user_id: 'u2',
        assigned_user_name: 'Dr. B',
        appointment_type: 'consulta' as const,
        appointment_starts_at: '2026-08-24T12:00:00.000Z',
        waiting_room_status: 'completed' as const,
        checked_in_at: '2026-08-24T09:00:00.000Z',
        called_at: '2026-08-24T09:05:00.000Z',
        consultation_started_at: null,
        payment_pending_at: null,
        completed_at: '2026-08-24T10:00:00.000Z',
        queue_position: null,
        priority: 0,
        room: null,
        internal_notes: null,
      },
    ];

    expect(filterWaitingRoomEntries(rows, { query: 'garcia' })).toHaveLength(1);
    expect(filterWaitingRoomEntries(rows, { status: 'active' })).toHaveLength(1);
    expect(filterWaitingRoomEntries(rows, { assignedUserId: 'u2' })).toHaveLength(1);
    expect(
      filterWaitingRoomCheckInCandidates(
        [
          {
            patient_name: 'Rocky',
            owner_full_name: 'Carlos',
            assigned_user_id: 'u1',
          },
        ],
        { query: 'carlos' }
      )
    ).toHaveLength(1);
  });

  it('parses and serializes board filter URL params', () => {
    expect(
      parseWaitingRoomBoardFilters({
        q: '  luna ',
        wrStatus: 'called',
        wrAssigned: 'u1',
      })
    ).toEqual({
      query: 'luna',
      status: 'called',
      assignedUserId: 'u1',
    });

    const params = appendWaitingRoomBoardFilterParams(new URLSearchParams('date=2026-08-24'), {
      query: 'ana',
      status: 'active',
      assignedUserId: 'u2',
    });
    expect(params.get('date')).toBe('2026-08-24');
    expect(params.get('q')).toBe('ana');
    expect(params.get('wrStatus')).toBe('active');
    expect(params.get('wrAssigned')).toBe('u2');

    const cleared = appendWaitingRoomBoardFilterParams(params, {
      query: '',
      status: 'all',
      assignedUserId: null,
    });
    expect(cleared.has('q')).toBe(false);
    expect(cleared.has('wrStatus')).toBe(false);
    expect(cleared.has('wrAssigned')).toBe(false);
  });
});

describe('waiting room ops dashboard metrics', () => {
  it('computes counts and wait averages', () => {
    const now = new Date('2026-08-24T12:00:00.000Z');
    const summary = buildWaitingRoomDashboard(
      [
        {
          waiting_room_entry_id: '1',
          appointment_id: 'a1',
          patient_id: 'p1',
          patient_name: 'Luna',
          patient_species: 'Canino',
          owner_id: 'o1',
          owner_full_name: 'Ana',
          assigned_user_id: null,
          assigned_user_name: null,
          appointment_type: 'consulta',
          appointment_starts_at: '2026-08-24T11:00:00.000Z',
          waiting_room_status: 'waiting',
          checked_in_at: '2026-08-24T11:30:00.000Z',
          called_at: null,
          consultation_started_at: null,
          payment_pending_at: null,
          completed_at: null,
          queue_position: 1,
          priority: 0,
          room: null,
        },
        {
          waiting_room_entry_id: '2',
          appointment_id: 'a2',
          patient_id: 'p2',
          patient_name: 'Michi',
          patient_species: 'Felino',
          owner_id: 'o2',
          owner_full_name: 'Luis',
          assigned_user_id: null,
          assigned_user_name: null,
          appointment_type: 'control',
          appointment_starts_at: '2026-08-24T10:00:00.000Z',
          waiting_room_status: 'called',
          checked_in_at: '2026-08-24T10:00:00.000Z',
          called_at: '2026-08-24T10:20:00.000Z',
          consultation_started_at: null,
          payment_pending_at: null,
          completed_at: null,
          queue_position: 2,
          priority: 0,
          room: '1',
        },
        {
          waiting_room_entry_id: '3',
          appointment_id: 'a3',
          patient_id: 'p3',
          patient_name: 'Toby',
          patient_species: 'Canino',
          owner_id: 'o3',
          owner_full_name: 'Sol',
          assigned_user_id: null,
          assigned_user_name: null,
          appointment_type: 'consulta',
          appointment_starts_at: '2026-08-24T09:00:00.000Z',
          waiting_room_status: 'completed',
          checked_in_at: '2026-08-24T09:00:00.000Z',
          called_at: '2026-08-24T09:10:00.000Z',
          consultation_started_at: '2026-08-24T09:15:00.000Z',
          payment_pending_at: '2026-08-24T09:40:00.000Z',
          completed_at: '2026-08-24T09:50:00.000Z',
          queue_position: 3,
          priority: 0,
          room: null,
        },
      ],
      { pendingCheckInCount: 2, now }
    );

    expect(summary.inFlowCount).toBe(2);
    expect(summary.completedCount).toBe(1);
    expect(summary.pendingCheckInCount).toBe(2);
    expect(summary.avgWaitMinutes).toBe(30);
    expect(summary.avgTimeToCallMinutes).toBe(15);
    expect(summary.longestWaitPatientName).toBe('Luna');
    expect(formatWaitMinutes(30)).toBe('30 min');
  });

  it('estimates portal waiting ETA from ahead_count', () => {
    expect(estimatePortalWaitingMinutes(0)).toBe(5);
    expect(estimatePortalWaitingMinutes(2)).toBe(30);
    expect(estimatePortalWaitingMinutes(2, { minutesPerPatient: 12 })).toBe(24);
    expect(formatPortalWaitingEta(5)).toMatch(/breve/i);
    expect(formatPortalWaitingEta(30)).toContain('30');
  });

  it('resolves minutes-per-patient with clinic override over measured avg', () => {
    expect(resolveWaitingRoomMinutesPerPatient()).toBe(15);
    expect(
      resolveWaitingRoomMinutesPerPatient({ measuredAvg: 18 })
    ).toBe(18);
    expect(
      resolveWaitingRoomMinutesPerPatient({ configured: 10, measuredAvg: 18 })
    ).toBe(10);
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

  it('validates batch queue reorder ids', () => {
    expect(
      waitingRoomReorderQueueSchema.safeParse({
        orderedEntryIds: [entryId, appointmentId],
      }).success
    ).toBe(true);
    expect(waitingRoomReorderQueueSchema.safeParse({ orderedEntryIds: [] }).success).toBe(false);
  });

  it('validates remove-from-queue payload', () => {
    expect(
      waitingRoomRemoveSchema.safeParse({ entryId, markAusente: true }).success
    ).toBe(true);
    expect(waitingRoomRemoveSchema.safeParse({ entryId: 'x' }).success).toBe(false);
  });

  it('validates internal notes payload', () => {
    expect(
      waitingRoomNotesSchema.safeParse({ entryId, notes: 'Trae radiografías' }).success
    ).toBe(true);
    expect(waitingRoomNotesSchema.safeParse({ entryId, notes: '' }).success).toBe(true);
    expect(
      waitingRoomNotesSchema.safeParse({ entryId, notes: 'x'.repeat(501) }).success
    ).toBe(false);
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
        minutes_per_patient: 12,
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
    expect(rows[0]?.minutes_per_patient).toBe(12);
    expect(PORTAL_WAITING_ROOM_STATUS_MESSAGES.called).toMatch(/llamando/i);
    expect(PORTAL_WAITING_ROOM_STATUS_MESSAGES.payment_pending).toMatch(/pago/i);
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

describe('patient waiting room history', () => {
  it('parses history rows and finds active entry', () => {
    const rows = parsePatientWaitingRoomHistoryRows([
      {
        waiting_room_entry_id: 'w1',
        appointment_id: 'a1',
        checked_in_at: '2026-08-24T10:00:00Z',
        waiting_room_status: 'waiting',
        called_at: null,
        completed_at: null,
        removed: false,
        room: null,
        appointment_starts_at: '2026-08-24T10:30:00Z',
        minutes_to_call: null,
        minutes_dwell: null,
      },
      {
        waiting_room_entry_id: 'w2',
        appointment_id: 'a2',
        checked_in_at: '2026-08-23T10:00:00Z',
        waiting_room_status: 'completed',
        called_at: '2026-08-23T10:15:00Z',
        completed_at: '2026-08-23T11:00:00Z',
        removed: false,
        room: '1',
        appointment_starts_at: '2026-08-23T10:30:00Z',
        minutes_to_call: 15,
        minutes_dwell: 60,
      },
      { waiting_room_entry_id: null },
    ]);

    expect(rows).toHaveLength(2);
    expect(rows[0]?.waiting_room_status).toBe('waiting');
    expect(rows[1]?.minutes_dwell).toBe(60);

    expect(getPatientWaitingRoomActiveEntry(rows)?.waiting_room_entry_id).toBe('w1');
    expect(getPatientWaitingRoomActiveEntry([rows[1]!])).toBeNull();
  });
});

describe('owner waiting room history', () => {
  it('parses owner history rows and finds active entries', () => {
    const rows = parseOwnerWaitingRoomHistoryRows([
      {
        waiting_room_entry_id: 'w1',
        appointment_id: 'a1',
        patient_id: 'p1',
        patient_name: 'Luna',
        checked_in_at: '2026-08-24T10:00:00Z',
        waiting_room_status: 'waiting',
        called_at: null,
        completed_at: null,
        removed: false,
        room: null,
        appointment_starts_at: '2026-08-24T10:30:00Z',
        minutes_to_call: null,
        minutes_dwell: null,
      },
      {
        waiting_room_entry_id: 'w2',
        appointment_id: 'a2',
        patient_id: 'p2',
        patient_name: 'Milo',
        checked_in_at: '2026-08-24T09:00:00Z',
        waiting_room_status: 'called',
        called_at: '2026-08-24T09:10:00Z',
        completed_at: null,
        removed: false,
        room: '1',
        appointment_starts_at: '2026-08-24T09:30:00Z',
        minutes_to_call: 10,
        minutes_dwell: null,
      },
    ]);

    expect(rows).toHaveLength(2);
    expect(getOwnerWaitingRoomActiveEntries(rows)).toHaveLength(2);
    expect(getOwnerWaitingRoomActiveEntries([rows[1]!]).map((r) => r.patient_name)).toEqual([
      'Milo',
    ]);
  });
});

describe('public check-in live status', () => {
  it('parses valid status payload', () => {
    const status = parsePublicCheckInStatus({
      valid: true,
      patient_name: 'Luna',
      patient_species: 'Canino',
      waiting_room_status: 'called',
      queue_position: 2,
      room: '1',
      ahead_count: 0,
      minutes_per_patient: 12,
      checked_in_at: '2026-08-24T10:00:00Z',
      terminal: false,
    });
    expect(status.valid).toBe(true);
    expect(status.waiting_room_status).toBe('called');
    expect(status.room).toBe('1');
  });
});

describe('waiting room branch filter', () => {
  it('resolves branch list arg and URL params', () => {
    expect(resolveWaitingRoomListBranchId(undefined, 'branch-a')).toBe('branch-a');
    expect(resolveWaitingRoomListBranchId('all', 'branch-a')).toBe('all');
    expect(resolveWaitingRoomListBranchId('branch-b', 'branch-a')).toBe('branch-b');

    const params = appendWaitingRoomBoardFilterParams(new URLSearchParams(), {
      branchId: 'all',
    });
    expect(params.get('wrBranch')).toBe('all');
  });

  it('builds surface hrefs with branch and date', () => {
    expect(buildWaitingRoomSurfaceHref('/sala-espera/pantalla')).toBe('/sala-espera/pantalla');
    expect(buildWaitingRoomSurfaceHref('/sala-espera/kiosco', { wrBranch: 'all' })).toBe(
      '/sala-espera/kiosco?wrBranch=all'
    );
    expect(
      buildWaitingRoomSurfaceHref('/sala-espera/tablero', {
        date: '2026-08-23',
        today: '2026-08-24',
        mine: true,
        wrBranch: 'branch-b',
      })
    ).toBe('/sala-espera/tablero?date=2026-08-23&mine=1&wrBranch=branch-b');
  });

  it('resolves branch label and filters appointments', () => {
    const branches = [
      { id: 'branch-a', name: 'Centro', is_main: true },
      { id: 'branch-b', name: 'Norte' },
    ];
    expect(resolveWaitingRoomBranchLabel('all', 'branch-a', branches)).toBe(
      'Todas las sucursales'
    );
    expect(resolveWaitingRoomBranchLabel(undefined, 'branch-b', branches)).toBe('Norte');

    const appointments = [
      { id: '1', branch_id: 'branch-a' },
      { id: '2', branch_id: 'branch-b' },
    ];
    expect(filterAppointmentsByWaitingRoomBranch(appointments, 'branch-b')).toEqual([
      { id: '2', branch_id: 'branch-b' },
    ]);
    expect(filterAppointmentsByWaitingRoomBranch(appointments, 'all')).toEqual(appointments);
  });
});
