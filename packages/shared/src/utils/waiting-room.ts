import type {
  OwnerPortalAlert,
  WaitingRoomCheckInPreview,
  WaitingRoomCheckInRedeemResult,
  WaitingRoomCheckInTokenResult,
  WaitingRoomDashboardSummary,
  WaitingRoomListRow,
  WaitingRoomStatusCount,
} from '../types/waiting-room';
import type { AppointmentType } from '../constants/appointments';
import type { PatientSpecies } from '../constants/patients';
import {
  WAITING_ROOM_STATUSES,
  isWaitingRoomStatus,
  type WaitingRoomStatus,
} from '../constants/waiting-room';

/**
 * Default Waiting Room ordering:
 * 1. highest priority
 * 2. lowest queue_position (nulls last)
 * 3. oldest checked_in_at
 */
export function compareWaitingRoomQueue(
  a: Pick<WaitingRoomListRow, 'priority' | 'queue_position' | 'checked_in_at'>,
  b: Pick<WaitingRoomListRow, 'priority' | 'queue_position' | 'checked_in_at'>
): number {
  if (a.priority !== b.priority) return b.priority - a.priority;
  const posA = a.queue_position;
  const posB = b.queue_position;
  if (posA == null && posB != null) return 1;
  if (posA != null && posB == null) return -1;
  if (posA != null && posB != null && posA !== posB) return posA - posB;
  return a.checked_in_at.localeCompare(b.checked_in_at);
}

export function sortWaitingRoomQueue<T extends Pick<WaitingRoomListRow, 'priority' | 'queue_position' | 'checked_in_at'>>(
  rows: T[]
): T[] {
  return [...rows].sort(compareWaitingRoomQueue);
}

/** Positions after a drag-and-drop reorder (priority normalized to 0). */
export function buildWaitingRoomQueueOrder(
  orderedEntryIds: readonly string[]
): { entryId: string; queuePosition: number; priority: number }[] {
  return orderedEntryIds.map((entryId, index) => ({
    entryId,
    queuePosition: index + 1,
    priority: 0,
  }));
}

/**
 * Apply a visual reorder of IDs onto existing rows (optimistic UI).
 * Unknown IDs are ignored; missing IDs keep prior relative order at the end.
 */
export function applyWaitingRoomQueueOrder<
  T extends { waiting_room_entry_id: string; queue_position: number | null; priority: number },
>(rows: T[], orderedEntryIds: readonly string[]): T[] {
  const byId = new Map(rows.map((row) => [row.waiting_room_entry_id, row]));
  const ordered: T[] = [];
  for (const id of orderedEntryIds) {
    const row = byId.get(id);
    if (!row) continue;
    ordered.push(row);
    byId.delete(id);
  }
  for (const row of rows) {
    if (byId.has(row.waiting_room_entry_id)) ordered.push(row);
  }
  return ordered.map((row, index) => ({
    ...row,
    queue_position: index + 1,
    priority: 0,
  }));
}

export function minutesBetween(fromIso: string, to: Date | string): number {
  const from = new Date(fromIso).getTime();
  const toMs = typeof to === 'string' ? new Date(to).getTime() : to.getTime();
  if (!Number.isFinite(from) || !Number.isFinite(toMs)) return 0;
  return Math.max(0, Math.round((toMs - from) / 60_000));
}

export function formatWaitMinutes(minutes: number | null | undefined): string {
  if (minutes == null || !Number.isFinite(minutes)) return '—';
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rem = minutes % 60;
  return rem === 0 ? `${hours} h` : `${hours} h ${rem} min`;
}

/** Default minutes per patient ahead when clinic has no measured average yet. */
export const WAITING_ROOM_DEFAULT_MINUTES_PER_PATIENT = 15;

/**
 * Rough ETA for a portal tutor waiting in queue.
 * Uses measured avg time-to-call when available; otherwise a conservative default.
 */
export function estimatePortalWaitingMinutes(
  aheadCount: number,
  options: { minutesPerPatient?: number | null } = {}
): number | null {
  if (!Number.isFinite(aheadCount) || aheadCount < 0) return null;
  const per =
    options.minutesPerPatient != null &&
    Number.isFinite(options.minutesPerPatient) &&
    options.minutesPerPatient > 0
      ? Math.round(options.minutesPerPatient)
      : WAITING_ROOM_DEFAULT_MINUTES_PER_PATIENT;
  if (aheadCount === 0) return Math.min(per, 5);
  return aheadCount * per;
}

export function formatPortalWaitingEta(minutes: number | null | undefined): string {
  if (minutes == null) return '';
  if (minutes <= 5) return 'Te llamamos en breve';
  if (minutes < 60) return `Espera estimada ~${minutes} min`;
  return `Espera estimada ~${formatWaitMinutes(minutes)}`;
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

export function buildWaitingRoomDashboard(
  entries: WaitingRoomListRow[],
  options: { pendingCheckInCount?: number; now?: Date } = {}
): WaitingRoomDashboardSummary {
  const now = options.now ?? new Date();
  const counts = Object.fromEntries(
    WAITING_ROOM_STATUSES.map((status) => [status, 0])
  ) as Record<WaitingRoomStatus, number>;

  for (const entry of entries) {
    if (isWaitingRoomStatus(entry.waiting_room_status)) {
      counts[entry.waiting_room_status] += 1;
    }
  }

  const countsByStatus: WaitingRoomStatusCount[] = WAITING_ROOM_STATUSES.map((status) => ({
    status,
    count: counts[status],
  }));

  const waitingRows = entries.filter((row) => row.waiting_room_status === 'waiting');
  const waitMinutes = waitingRows.map((row) => minutesBetween(row.checked_in_at, now));
  const timeToCall = entries
    .filter((row) => row.called_at)
    .map((row) => minutesBetween(row.checked_in_at, row.called_at as string));

  let longestWaitMinutes: number | null = null;
  let longestWaitPatientName: string | null = null;
  for (const row of waitingRows) {
    const minutes = minutesBetween(row.checked_in_at, now);
    if (longestWaitMinutes == null || minutes > longestWaitMinutes) {
      longestWaitMinutes = minutes;
      longestWaitPatientName = row.patient_name;
    }
  }

  const completedCount = counts.completed;
  const calledCount = counts.called;
  const inFlowCount =
    counts.waiting + counts.called + counts.in_consultation + counts.payment_pending;

  return {
    totalToday: entries.length,
    activeCount: inFlowCount,
    pendingCheckInCount: Math.max(0, options.pendingCheckInCount ?? 0),
    countsByStatus,
    avgWaitMinutes: average(waitMinutes),
    avgTimeToCallMinutes: average(timeToCall),
    longestWaitMinutes,
    longestWaitPatientName,
    completedCount,
    calledCount,
    inFlowCount,
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : String(value ?? '');
}

function strOrNull(value: unknown): string | null {
  if (value == null) return null;
  const text = String(value);
  return text.length > 0 ? text : null;
}

function num(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function numOrNull(value: unknown): number | null {
  if (value == null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function bool(value: unknown): boolean {
  return value === true || value === 'true';
}

export function parseWaitingRoomCheckInTokenResult(
  raw: unknown,
  baseUrl: string
): WaitingRoomCheckInTokenResult | null {
  const data = asRecord(raw);
  if (!data?.token || !data.path || !data.appointment_id) return null;
  const path = str(data.path);
  const origin = baseUrl.replace(/\/$/, '');
  return {
    token: str(data.token),
    expires_at: str(data.expires_at),
    appointment_id: str(data.appointment_id),
    path,
    url: `${origin}${path.startsWith('/') ? path : `/${path}`}`,
  };
}

export function parseWaitingRoomCheckInPreview(raw: unknown): WaitingRoomCheckInPreview {
  const data = asRecord(raw);
  if (!data) return { valid: false, reason: 'invalid_response' };
  if (!bool(data.valid)) {
    return { valid: false, reason: strOrNull(data.reason) ?? 'invalid' };
  }
  return {
    valid: true,
    patient_name: strOrNull(data.patient_name) ?? undefined,
    patient_species: (strOrNull(data.patient_species) as PatientSpecies | null) ?? undefined,
    appointment_starts_at: strOrNull(data.appointment_starts_at) ?? undefined,
    appointment_type: (strOrNull(data.appointment_type) as AppointmentType | null) ?? undefined,
    organization_name: strOrNull(data.organization_name) ?? undefined,
    expires_at: strOrNull(data.expires_at) ?? undefined,
  };
}

export function parseWaitingRoomCheckInRedeemResult(
  raw: unknown
): WaitingRoomCheckInRedeemResult | null {
  const data = asRecord(raw);
  if (!data?.id || !data.appointment_id) return null;
  const status = str(data.status);
  if (!isWaitingRoomStatus(status)) return null;
  return {
    id: str(data.id),
    organization_id: str(data.organization_id),
    branch_id: str(data.branch_id),
    appointment_id: str(data.appointment_id),
    status,
    checked_in_at: str(data.checked_in_at),
    queue_position: numOrNull(data.queue_position),
    priority: num(data.priority),
    patient_name: strOrNull(data.patient_name),
  };
}

export function parseOwnerPortalAlerts(raw: unknown): OwnerPortalAlert[] {
  if (!Array.isArray(raw)) return [];
  const out: OwnerPortalAlert[] = [];
  for (const item of raw) {
    const data = asRecord(item);
    if (!data?.id || !data.title) continue;
    out.push({
      id: str(data.id),
      title: str(data.title),
      body: strOrNull(data.body),
      href: str(data.href) || '/portal/sala-espera',
      related_type: strOrNull(data.related_type),
      related_id: strOrNull(data.related_id),
      read_at: strOrNull(data.read_at),
      created_at: str(data.created_at),
    });
  }
  return out;
}
