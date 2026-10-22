'use server';

import { cache } from 'react';
import {
  FEATURES,
  appointmentListSchema,
  canUseResolvedFeature,
  mapWaitingRoomByAppointmentId,
  type AppointmentListRow,
  type AppointmentStatus,
  type Permission,
} from '@sincvete/shared';
import { listAppointments, listAppointmentsCalendar, getAssignableStaff } from '@/actions/appointments';
import { getUserBranches } from '@/actions/settings';
import { listWaitingRoomStatusesForAgenda } from '@/actions/waiting-room';
import { getSessionContext } from '@/lib/session';
import { getOrganizationEntitlements } from '@/lib/entitlements';
import type {
  AgendaDynamicData,
  AgendaShellData,
} from '@/components/appointments/agenda-types';

export interface AgendaDynamicInput {
  from: string;
  to: string;
  weekStart: string;
  selectedDate: string;
  branchId?: string;
  status?: string;
  assignedUserId?: string;
  query?: string;
  /** When false, skip WR round-trip entirely. */
  includeWaitingRoom?: boolean;
}

/**
 * Static Agenda metadata for the current request/session.
 * Safe request-scoped cache only (no cross-tenant / cross-request PHI cache).
 */
const loadAgendaShellData = cache(async (): Promise<AgendaShellData | null> => {
  const session = await getSessionContext();
  if (!session?.permissions.includes('appointments:read')) return null;

  const entitlements = await getOrganizationEntitlements(session.organizationId);
  const hasFeature = (featureKey: string) => canUseResolvedFeature(entitlements, featureKey);
  const hasPerm = (permission: Permission) => session.permissions.includes(permission);

  const [staff, branches] = await Promise.all([getAssignableStaff(), getUserBranches()]);

  return {
    canWrite: hasPerm('appointments:write') && hasFeature(FEATURES.APPOINTMENTS),
    canReadWaitingRoom: hasPerm('waiting_room:read') && hasFeature(FEATURES.WAITING_ROOM),
    canCheckInWaitingRoom: hasPerm('waiting_room:write') && hasFeature(FEATURES.WAITING_ROOM),
    canStartConsultation: hasPerm('clinical:write') && hasFeature(FEATURES.CONSULTATIONS),
    canBilling: hasPerm('billing:read') && hasFeature(FEATURES.BILLING),
    canVaccination: hasPerm('clinical:read') && hasFeature(FEATURES.VACCINATION),
    staff,
    branches: branches.map((branch) => ({ id: branch.id, name: branch.name })),
  };
});

export async function getAgendaShellData(): Promise<AgendaShellData | null> {
  return loadAgendaShellData();
}

async function loadCalendarAppointments(input: {
  from: string;
  to: string;
  weekStart: string;
  branchId?: string;
  status?: AppointmentStatus;
  assignedUserId?: string;
  query?: string;
}): Promise<AppointmentListRow[]> {
  try {
    return await listAppointmentsCalendar({
      from: input.from,
      to: input.to,
      branchId: input.branchId,
      status: input.status,
      assignedUserId: input.assignedUserId,
      query: input.query,
    });
  } catch {
    return listAppointments({
      weekStart: input.weekStart,
      branchId: input.branchId,
      status: input.status,
      assignedUserId: input.assignedUserId,
    });
  }
}

/**
 * Dynamic Agenda payload (appointments + lightweight WR statuses).
 * Intended for client navigations so shell metadata is not reloaded.
 */
export async function getAgendaDynamicData(
  input: AgendaDynamicInput
): Promise<AgendaDynamicData> {
  const session = await getSessionContext();
  if (!session?.permissions.includes('appointments:read')) {
    return { appointments: [] };
  }

  const parsed = appointmentListSchema.parse({
    from: input.from,
    to: input.to,
    weekStart: input.weekStart,
    branchId: input.branchId,
    status: input.status || undefined,
    assignedUserId: input.assignedUserId || undefined,
    query: input.query || undefined,
  });

  const status = parsed.status;
  const includeWaitingRoom = input.includeWaitingRoom === true;

  const [appointments, waitingRoomEntries] = await Promise.all([
    loadCalendarAppointments({
      from: parsed.from!,
      to: parsed.to!,
      weekStart: input.weekStart,
      branchId: parsed.branchId,
      status,
      assignedUserId: parsed.assignedUserId,
      query: parsed.query,
    }),
    includeWaitingRoom
      ? listWaitingRoomStatusesForAgenda({
          date: input.selectedDate,
          branchId: parsed.branchId,
        })
      : Promise.resolve([]),
  ]);

  if (!includeWaitingRoom || waitingRoomEntries.length === 0) {
    return {
      appointments,
      waitingRoomByAppointment: includeWaitingRoom ? {} : undefined,
      waitingRoomWaitingCount: includeWaitingRoom ? 0 : undefined,
    };
  }

  const waitingRoomByAppointment = mapWaitingRoomByAppointmentId(waitingRoomEntries);
  const waitingRoomWaitingCount = waitingRoomEntries.filter(
    (entry) => entry.waiting_room_status === 'waiting'
  ).length;

  return {
    appointments,
    waitingRoomByAppointment,
    waitingRoomWaitingCount,
  };
}

/**
 * Initial /agenda SSR bootstrap.
 * Parallelizes staff/branches with calendar + WR after resolving capability flags
 * from session.permissions + cached entitlements (no extra can* round-trips).
 */
export async function getAgendaBootstrap(
  input: AgendaDynamicInput
): Promise<{ shell: AgendaShellData; dynamic: AgendaDynamicData } | null> {
  const session = await getSessionContext();
  if (!session?.permissions.includes('appointments:read')) return null;

  const entitlements = await getOrganizationEntitlements(session.organizationId);
  const hasFeature = (featureKey: string) => canUseResolvedFeature(entitlements, featureKey);
  const hasPerm = (permission: Permission) => session.permissions.includes(permission);

  const canReadWaitingRoom =
    hasPerm('waiting_room:read') && hasFeature(FEATURES.WAITING_ROOM);

  const [staff, branches, dynamic] = await Promise.all([
    getAssignableStaff(),
    getUserBranches(),
    getAgendaDynamicData({
      ...input,
      includeWaitingRoom: input.includeWaitingRoom ?? canReadWaitingRoom,
    }),
  ]);

  return {
    shell: {
      canWrite: hasPerm('appointments:write') && hasFeature(FEATURES.APPOINTMENTS),
      canReadWaitingRoom,
      canCheckInWaitingRoom:
        hasPerm('waiting_room:write') && hasFeature(FEATURES.WAITING_ROOM),
      canStartConsultation:
        hasPerm('clinical:write') && hasFeature(FEATURES.CONSULTATIONS),
      canBilling: hasPerm('billing:read') && hasFeature(FEATURES.BILLING),
      canVaccination: hasPerm('clinical:read') && hasFeature(FEATURES.VACCINATION),
      staff,
      branches: branches.map((branch) => ({ id: branch.id, name: branch.name })),
    },
    dynamic,
  };
}
