import type {
  OwnerPortalAlert,
  WaitingRoomCheckInPreview,
  WaitingRoomCheckInRedeemResult,
  WaitingRoomCheckInTokenResult,
  WaitingRoomDashboardSummary,
  WaitingRoomListRow,
  WaitingRoomStatusCount,
  PatientWaitingRoomHistoryRow,
  OwnerWaitingRoomHistoryRow,
  PublicCheckInStatus,
} from '../types/waiting-room';
import type { AppointmentType } from '../constants/appointments';
import type { PatientSpecies } from '../constants/patients';
import {
  WAITING_ROOM_STATUSES,
  isWaitingRoomStatus,
  type WaitingRoomStatus,
} from '../constants/waiting-room';

/** Map appointment_id → active waiting-room status for a day's list rows. */
export function mapWaitingRoomByAppointmentId(
  entries: Pick<WaitingRoomListRow, 'appointment_id' | 'waiting_room_status'>[]
): Record<string, WaitingRoomStatus> {
  const map: Record<string, WaitingRoomStatus> = {};
  for (const entry of entries) {
    if (isWaitingRoomStatus(entry.waiting_room_status)) {
      map[entry.appointment_id] = entry.waiting_room_status;
    }
  }
  return map;
}

export type WaitingRoomBoardStatusFilter = 'all' | 'active' | WaitingRoomStatus;

export interface WaitingRoomBoardFilters {
  query?: string;
  status?: WaitingRoomBoardStatusFilter;
  assignedUserId?: string | null;
  /** Branch UUID or `all` for every accessible branch. Omit = session branch. */
  branchId?: string | null;
}

function normalizeWaitingRoomSearch(text: string): string {
  return String(text ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

export function matchesWaitingRoomSearch(
  row: { patient_name: string; owner_full_name: string },
  query: string
): boolean {
  const trimmed = query.trim();
  if (!trimmed) return true;
  const normalized = normalizeWaitingRoomSearch(trimmed);
  return (
    normalizeWaitingRoomSearch(row.patient_name).includes(normalized) ||
    normalizeWaitingRoomSearch(row.owner_full_name).includes(normalized)
  );
}

export function filterWaitingRoomEntries<T extends WaitingRoomListRow>(
  entries: T[],
  filters: WaitingRoomBoardFilters = {}
): T[] {
  const status = filters.status ?? 'all';
  return entries.filter((row) => {
    if (!matchesWaitingRoomSearch(row, filters.query ?? '')) return false;
    if (filters.assignedUserId && row.assigned_user_id !== filters.assignedUserId) {
      return false;
    }
    if (status === 'all') return true;
    if (status === 'active') return row.waiting_room_status !== 'completed';
    return row.waiting_room_status === status;
  });
}

export function filterWaitingRoomCheckInCandidates<
  T extends Pick<WaitingRoomListRow, 'patient_name' | 'owner_full_name' | 'assigned_user_id'>,
>(candidates: T[], filters: Pick<WaitingRoomBoardFilters, 'query' | 'assignedUserId'> = {}): T[] {
  return candidates.filter((row) => {
    if (!matchesWaitingRoomSearch(row, filters.query ?? '')) return false;
    if (filters.assignedUserId && row.assigned_user_id !== filters.assignedUserId) {
      return false;
    }
    return true;
  });
}

export function collectWaitingRoomAssignedOptions(
  entries: Pick<WaitingRoomListRow, 'assigned_user_id' | 'assigned_user_name'>[],
  candidates: Pick<WaitingRoomListRow, 'assigned_user_id' | 'assigned_user_name'>[] = []
): Array<{ userId: string; name: string }> {
  const byId = new Map<string, string>();
  for (const row of [...entries, ...candidates]) {
    if (!row.assigned_user_id) continue;
    byId.set(row.assigned_user_id, row.assigned_user_name?.trim() || 'Sin nombre');
  }
  return [...byId.entries()]
    .map(([userId, name]) => ({ userId, name }))
    .sort((a, b) => a.name.localeCompare(b.name, 'es'));
}

export function parseWaitingRoomBoardFilters(input: {
  q?: string | null;
  wrStatus?: string | null;
  wrAssigned?: string | null;
  wrBranch?: string | null;
}): WaitingRoomBoardFilters {
  const statusRaw = input.wrStatus?.trim() ?? '';
  let status: WaitingRoomBoardStatusFilter = 'all';
  if (statusRaw === 'active' || isWaitingRoomStatus(statusRaw)) {
    status = statusRaw;
  }

  const branchRaw = input.wrBranch?.trim() ?? '';
  let branchId: string | null | undefined;
  if (branchRaw === 'all') {
    branchId = 'all';
  } else if (branchRaw) {
    branchId = branchRaw;
  }

  return {
    query: input.q?.trim() ?? '',
    status,
    assignedUserId: input.wrAssigned?.trim() || null,
    branchId,
  };
}

export function appendWaitingRoomBoardFilterParams(
  params: URLSearchParams,
  filters: WaitingRoomBoardFilters
): URLSearchParams {
  const next = new URLSearchParams(params.toString());
  const query = filters.query?.trim() ?? '';
  if (query) next.set('q', query);
  else next.delete('q');

  const status = filters.status ?? 'all';
  if (status !== 'all') next.set('wrStatus', status);
  else next.delete('wrStatus');

  if (filters.assignedUserId) next.set('wrAssigned', filters.assignedUserId);
  else next.delete('wrAssigned');

  const branchId = filters.branchId;
  if (branchId === 'all') next.set('wrBranch', 'all');
  else if (branchId) next.set('wrBranch', branchId);
  else next.delete('wrBranch');

  return next;
}

/** Resolve list_waiting_room branch arg from URL filters and session default. */
export function resolveWaitingRoomListBranchId(
  branchFilter: string | null | undefined,
  sessionBranchId: string | null | undefined
): string | 'all' | undefined {
  if (branchFilter === 'all') return 'all';
  if (branchFilter) return branchFilter;
  return sessionBranchId ?? undefined;
}

/** Build href for WR surfaces (tablero, pantalla, kiosco) preserving branch and date filters. */
export function buildWaitingRoomSurfaceHref(
  basePath: string,
  opts: {
    wrBranch?: string | 'all' | null;
    date?: string;
    mine?: boolean;
    today?: string;
  } = {}
): string {
  const params = new URLSearchParams();
  if (opts.date && opts.today && opts.date !== opts.today) {
    params.set('date', opts.date);
  } else if (opts.date && !opts.today) {
    params.set('date', opts.date);
  }
  if (opts.mine) params.set('mine', '1');
  if (opts.wrBranch === 'all') params.set('wrBranch', 'all');
  else if (opts.wrBranch) params.set('wrBranch', opts.wrBranch);
  const query = params.toString();
  return query ? `${basePath}?${query}` : basePath;
}

export function resolveWaitingRoomBranchLabel(
  branchFilter: string | 'all' | null | undefined,
  sessionBranchId: string | null,
  branches: Array<{ id: string; name: string; is_main?: boolean }>
): string | null {
  if (branchFilter === 'all') return 'Todas las sucursales';
  const branchId = branchFilter ?? sessionBranchId;
  return (
    branches.find((branch) => branch.id === branchId)?.name ??
    branches.find((branch) => branch.is_main)?.name ??
    null
  );
}

export function filterAppointmentsByWaitingRoomBranch<T extends { branch_id: string }>(
  appointments: T[],
  listBranchId: string | 'all' | undefined
): T[] {
  if (!listBranchId || listBranchId === 'all') return appointments;
  return appointments.filter((appointment) => appointment.branch_id === listBranchId);
}

export function parsePatientWaitingRoomHistoryRows(
  raw: unknown
): PatientWaitingRoomHistoryRow[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((item) => {
    const row = asRecord(item);
    const waitingRoomEntryId = str(row?.waiting_room_entry_id);
    if (!waitingRoomEntryId) return [];
    const status = str(row?.waiting_room_status);
    return [
      {
        waiting_room_entry_id: waitingRoomEntryId,
        appointment_id: str(row?.appointment_id),
        checked_in_at: str(row?.checked_in_at),
        waiting_room_status: isWaitingRoomStatus(status) ? status : status,
        called_at: strOrNull(row?.called_at),
        completed_at: strOrNull(row?.completed_at),
        removed: bool(row?.removed),
        room: strOrNull(row?.room),
        appointment_starts_at: str(row?.appointment_starts_at),
        minutes_to_call: numOrNull(row?.minutes_to_call),
        minutes_dwell: numOrNull(row?.minutes_dwell),
      },
    ];
  });
}

/** First non-terminal history row (patient currently in today's flow). */
export function getPatientWaitingRoomActiveEntry(
  rows: PatientWaitingRoomHistoryRow[]
): PatientWaitingRoomHistoryRow | null {
  return (
    rows.find(
      (row) =>
        !row.removed &&
        isWaitingRoomStatus(String(row.waiting_room_status)) &&
        row.waiting_room_status !== 'completed'
    ) ?? null
  );
}

export function parseOwnerWaitingRoomHistoryRows(raw: unknown): OwnerWaitingRoomHistoryRow[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((item) => {
    const row = asRecord(item);
    const waitingRoomEntryId = str(row?.waiting_room_entry_id);
    if (!waitingRoomEntryId) return [];
    const status = str(row?.waiting_room_status);
    return [
      {
        waiting_room_entry_id: waitingRoomEntryId,
        appointment_id: str(row?.appointment_id),
        patient_id: str(row?.patient_id),
        patient_name: str(row?.patient_name),
        checked_in_at: str(row?.checked_in_at),
        waiting_room_status: isWaitingRoomStatus(status) ? status : status,
        called_at: strOrNull(row?.called_at),
        completed_at: strOrNull(row?.completed_at),
        removed: bool(row?.removed),
        room: strOrNull(row?.room),
        appointment_starts_at: str(row?.appointment_starts_at),
        minutes_to_call: numOrNull(row?.minutes_to_call),
        minutes_dwell: numOrNull(row?.minutes_dwell),
      },
    ];
  });
}

/** Non-terminal WR rows for an owner (may include multiple pets). */
export function getOwnerWaitingRoomActiveEntries(
  rows: OwnerWaitingRoomHistoryRow[]
): OwnerWaitingRoomHistoryRow[] {
  return rows.filter(
    (row) =>
      !row.removed &&
      isWaitingRoomStatus(String(row.waiting_room_status)) &&
      row.waiting_room_status !== 'completed'
  );
}

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
  return String(a.checked_in_at ?? '').localeCompare(String(b.checked_in_at ?? ''));
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
 * Precedence: clinic override → measured day/branch average → default 15.
 */
export function resolveWaitingRoomMinutesPerPatient(options: {
  configured?: number | null;
  measuredAvg?: number | null;
} = {}): number {
  const configured = options.configured;
  if (
    configured != null &&
    Number.isFinite(configured) &&
    configured > 0
  ) {
    return Math.min(120, Math.round(configured));
  }
  const measured = options.measuredAvg;
  if (measured != null && Number.isFinite(measured) && measured > 0) {
    return Math.min(120, Math.max(1, Math.round(measured)));
  }
  return WAITING_ROOM_DEFAULT_MINUTES_PER_PATIENT;
}

/**
 * Rough ETA for a portal tutor waiting in queue.
 * Uses clinic override / measured avg when available; otherwise a conservative default.
 */
export function estimatePortalWaitingMinutes(
  aheadCount: number,
  options: { minutesPerPatient?: number | null } = {}
): number | null {
  if (!Number.isFinite(aheadCount) || aheadCount < 0) return null;
  const per = resolveWaitingRoomMinutesPerPatient({
    configured: options.minutesPerPatient,
  });
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

export function parsePublicCheckInStatus(raw: unknown): PublicCheckInStatus {
  const data = asRecord(raw);
  if (!data) return { valid: false, reason: 'invalid_response' };
  if (!bool(data.valid)) {
    return { valid: false, reason: strOrNull(data.reason) ?? 'invalid' };
  }
  const status = strOrNull(data.waiting_room_status);
  return {
    valid: true,
    patient_name: strOrNull(data.patient_name) ?? undefined,
    patient_species: (strOrNull(data.patient_species) as PatientSpecies | null) ?? undefined,
    waiting_room_status:
      status && isWaitingRoomStatus(status) ? status : (status ?? undefined),
    queue_position: numOrNull(data.queue_position),
    room: strOrNull(data.room),
    ahead_count: numOrNull(data.ahead_count) ?? 0,
    minutes_per_patient: numOrNull(data.minutes_per_patient),
    checked_in_at: strOrNull(data.checked_in_at) ?? undefined,
    terminal: bool(data.terminal),
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
