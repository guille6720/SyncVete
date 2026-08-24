import type {
  OwnerPortalAlert,
  WaitingRoomCheckInPreview,
  WaitingRoomCheckInRedeemResult,
  WaitingRoomCheckInTokenResult,
  WaitingRoomListRow,
} from '../types/waiting-room';
import type { AppointmentType } from '../constants/appointments';
import type { PatientSpecies } from '../constants/patients';
import { isWaitingRoomStatus } from '../constants/waiting-room';

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
