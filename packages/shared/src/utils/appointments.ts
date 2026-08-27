import { APP_TIMEZONE } from '../constants';
import type { AppointmentStatus } from '../constants/appointments';
import type { AppointmentDashboardMetrics } from '../types/appointments';

const DATE_PARAM_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const INACTIVE_APPOINTMENT_STATUSES = new Set<AppointmentStatus>(['cancelada', 'ausente']);

export function parseDateParam(dateStr?: string): string {
  if (dateStr && DATE_PARAM_REGEX.test(dateStr)) {
    return dateStr;
  }

  return formatDateParam(new Date());
}

export function formatDateParam(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: APP_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);

  const year = parts.find((p) => p.type === 'year')?.value ?? '1970';
  const month = parts.find((p) => p.type === 'month')?.value ?? '01';
  const day = parts.find((p) => p.type === 'day')?.value ?? '01';
  return `${year}-${month}-${day}`;
}

export function getWeekStartDate(dateStr: string): string {
  const [year, month, day] = dateStr.split('-').map(Number);
  const anchor = new Date(Date.UTC(year, month - 1, day, 12));
  const weekday = anchor.getUTCDay();
  const diff = weekday === 0 ? -6 : 1 - weekday;
  anchor.setUTCDate(anchor.getUTCDate() + diff);
  return anchor.toISOString().slice(0, 10);
}

export function getWeekDays(weekStartStr: string): string[] {
  const [year, month, day] = weekStartStr.split('-').map(Number);
  const monday = new Date(Date.UTC(year, month - 1, day, 12));

  return Array.from({ length: 7 }, (_, index) => {
    const current = new Date(monday);
    current.setUTCDate(monday.getUTCDate() + index);
    return current.toISOString().slice(0, 10);
  });
}

export function formatAppointmentTime(isoDate: string): string {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return '—';

  return new Intl.DateTimeFormat('es-AR', {
    timeZone: APP_TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export function formatAppointmentDateTime(isoDate: string): string {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return '—';

  return new Intl.DateTimeFormat('es-AR', {
    timeZone: APP_TIMEZONE,
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export function formatWeekdayLabel(dateStr: string): string {
  const date = new Date(`${dateStr}T12:00:00Z`);
  return new Intl.DateTimeFormat('es-AR', {
    timeZone: APP_TIMEZONE,
    weekday: 'short',
  }).format(date);
}

export function formatDayLabel(dateStr: string): string {
  const date = new Date(`${dateStr}T12:00:00Z`);
  return new Intl.DateTimeFormat('es-AR', {
    timeZone: APP_TIMEZONE,
    day: 'numeric',
    month: 'short',
  }).format(date);
}

export function toLocalDateTimeInput(isoDate: string): string {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return '';

  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: APP_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);

  const year = parts.find((p) => p.type === 'year')?.value ?? '';
  const month = parts.find((p) => p.type === 'month')?.value ?? '';
  const day = parts.find((p) => p.type === 'day')?.value ?? '';
  const hour = parts.find((p) => p.type === 'hour')?.value ?? '';
  const minute = parts.find((p) => p.type === 'minute')?.value ?? '';
  return `${year}-${month}-${day}T${hour}:${minute}`;
}

export function fromLocalDateTimeInput(value: string): string {
  return new Date(`${value}:00-03:00`).toISOString();
}

export function computeEndTime(startIso: string, durationMinutes: number): string {
  const start = new Date(startIso);
  return new Date(start.getTime() + durationMinutes * 60_000).toISOString();
}

export function getDurationMinutes(startIso: string, endIso: string): number {
  const start = new Date(startIso).getTime();
  const end = new Date(endIso).getTime();
  if (Number.isNaN(start) || Number.isNaN(end) || end <= start) {
    return 30;
  }
  return Math.round((end - start) / 60_000);
}

export function isActiveAppointmentStatus(status: AppointmentStatus | string): boolean {
  return !INACTIVE_APPOINTMENT_STATUSES.has(status as AppointmentStatus);
}

type AppointmentMetricEntry = {
  status: AppointmentStatus | string;
  starts_at: string;
  assigned_user_id?: string | null;
};

export function buildAppointmentDayMetrics(
  entries: AppointmentMetricEntry[]
): AppointmentDashboardMetrics {
  const metrics: AppointmentDashboardMetrics = {
    total: entries.length,
    active: 0,
    programada: 0,
    confirmada: 0,
    enCurso: 0,
    completada: 0,
    cancelada: 0,
    ausente: 0,
  };

  for (const entry of entries) {
    if (isActiveAppointmentStatus(entry.status)) {
      metrics.active += 1;
    }
    switch (entry.status) {
      case 'programada':
        metrics.programada += 1;
        break;
      case 'confirmada':
        metrics.confirmada += 1;
        break;
      case 'en_curso':
        metrics.enCurso += 1;
        break;
      case 'completada':
        metrics.completada += 1;
        break;
      case 'cancelada':
        metrics.cancelada += 1;
        break;
      case 'ausente':
        metrics.ausente += 1;
        break;
      default:
        break;
    }
  }

  return metrics;
}

export function groupAppointmentsByDay<T extends { starts_at: string }>(
  entries: T[]
): Record<string, T[]> {
  const grouped: Record<string, T[]> = {};
  for (const entry of entries) {
    const day = formatDateParam(new Date(entry.starts_at));
    if (!grouped[day]) grouped[day] = [];
    grouped[day].push(entry);
  }
  return grouped;
}

export function groupAppointmentsByAssignee<
  T extends { assigned_user_id?: string | null },
>(entries: T[]): Record<string, T[]> {
  const grouped: Record<string, T[]> = {};
  for (const entry of entries) {
    const key = entry.assigned_user_id ?? 'unassigned';
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(entry);
  }
  return grouped;
}
