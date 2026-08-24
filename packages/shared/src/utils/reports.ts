import { APP_TIMEZONE } from '../constants';
import {
  REPORT_MAX_RANGE_DAYS,
  type ReportPeriodPreset,
} from '../constants/reports';
import { WAITING_ROOM_STATUS_LABELS, isWaitingRoomStatus } from '../constants/waiting-room';
import { csvEscape } from '../entitlements/plan-recommendations';
import type { ReportWaitingRoom, ReportWaitingRoomEntry } from '../types/reports';
import { formatWaitMinutes } from './waiting-room';

export function formatIsoDateInTimeZone(
  date: Date,
  timeZone = APP_TIMEZONE
): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function addDaysIso(isoDate: string, days: number): string {
  const [year, month, day] = isoDate.split('-').map(Number);
  const utc = Date.UTC(year, month - 1, day + days);
  const next = new Date(utc);
  const y = next.getUTCFullYear();
  const m = String(next.getUTCMonth() + 1).padStart(2, '0');
  const d = String(next.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function startOfIsoWeek(isoDate: string): string {
  const [year, month, day] = isoDate.split('-').map(Number);
  const utc = new Date(Date.UTC(year, month - 1, day));
  const weekday = utc.getUTCDay(); // 0 Sun .. 6 Sat
  const offset = weekday === 0 ? -6 : 1 - weekday;
  return addDaysIso(isoDate, offset);
}

export function getReportPeriod(
  preset: ReportPeriodPreset,
  now: Date = new Date()
): { from: string; to: string } {
  const today = formatIsoDateInTimeZone(now);

  if (preset === 'today') {
    return { from: today, to: today };
  }

  if (preset === 'week') {
    return { from: startOfIsoWeek(today), to: today };
  }

  if (preset === 'month') {
    return { from: `${today.slice(0, 7)}-01`, to: today };
  }

  return { from: addDaysIso(today, -29), to: today };
}

export function daysBetweenIso(from: string, to: string): number {
  const [fy, fm, fd] = from.split('-').map(Number);
  const [ty, tm, td] = to.split('-').map(Number);
  const start = Date.UTC(fy, fm - 1, fd);
  const end = Date.UTC(ty, tm - 1, td);
  return Math.round((end - start) / 86_400_000);
}

export function isValidReportRange(from: string, to: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    return false;
  }
  const days = daysBetweenIso(from, to);
  return days >= 0 && days <= REPORT_MAX_RANGE_DAYS;
}

/** CSV export for the waiting-room section of clinic reports. */
export function buildWaitingRoomReportCsv(
  from: string,
  to: string,
  waitingRoom: ReportWaitingRoom
): string {
  const lines: string[] = [];
  lines.push('Sección,Campo,Valor');
  lines.push(`Resumen,Período,${csvEscape(`${from} a ${to}`)}`);
  lines.push(`Resumen,Check-ins,${waitingRoom.checkIns}`);
  lines.push(`Resumen,Llamados,${waitingRoom.called}`);
  lines.push(`Resumen,Completados,${waitingRoom.completed}`);
  lines.push(`Resumen,Quitados,${waitingRoom.removed}`);
  lines.push(
    `Resumen,Promedio hasta llamado,${csvEscape(
      waitingRoom.avgMinutesToCall != null
        ? formatWaitMinutes(waitingRoom.avgMinutesToCall)
        : '—'
    )}`
  );
  lines.push(
    `Resumen,Promedio hasta completar,${csvEscape(
      waitingRoom.avgMinutesToComplete != null
        ? formatWaitMinutes(waitingRoom.avgMinutesToComplete)
        : '—'
    )}`
  );

  for (const item of waitingRoom.byStatus) {
    const label = isWaitingRoomStatus(item.status)
      ? WAITING_ROOM_STATUS_LABELS[item.status]
      : item.status;
    lines.push(`Por estado,${csvEscape(label)},${item.count}`);
  }

  lines.push('');
  lines.push('Día,Check-ins,Completados');
  for (const row of waitingRoom.daily) {
    if (row.checkIns > 0 || row.completed > 0) {
      lines.push(`${row.day},${row.checkIns},${row.completed}`);
    }
  }

  return `${lines.join('\n')}\n`;
}

function formatReportTimestamp(iso: string | null | undefined): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('es-AR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(date);
}

/** CSV rows for each waiting-room check-in in a report period. */
export function buildWaitingRoomReportEntriesCsv(entries: ReportWaitingRoomEntry[]): string {
  const lines: string[] = [
    'Check-in,Paciente,Propietario,Profesional,Turno,Estado,Consultorio,Llamado,Completado,Min hasta llamado,Min total,Quitado',
  ];

  for (const row of entries) {
    const statusLabel = isWaitingRoomStatus(row.status)
      ? WAITING_ROOM_STATUS_LABELS[row.status]
      : row.status;
    lines.push(
      [
        csvEscape(formatReportTimestamp(row.checkedInAt)),
        csvEscape(row.patientName),
        csvEscape(row.ownerFullName),
        csvEscape(row.assignedUserName ?? ''),
        csvEscape(formatReportTimestamp(row.appointmentStartsAt)),
        csvEscape(statusLabel),
        csvEscape(row.room ?? ''),
        csvEscape(formatReportTimestamp(row.calledAt)),
        csvEscape(formatReportTimestamp(row.completedAt)),
        row.minutesToCall != null ? String(row.minutesToCall) : '',
        row.minutesDwell != null ? String(row.minutesDwell) : '',
        row.removed ? 'sí' : 'no',
      ].join(',')
    );
  }

  return `${lines.join('\n')}\n`;
}

/** Summary + detail sections for a single downloadable report. */
export function buildFullWaitingRoomReportCsv(
  from: string,
  to: string,
  waitingRoom: ReportWaitingRoom,
  entries: ReportWaitingRoomEntry[]
): string {
  const summary = buildWaitingRoomReportCsv(from, to, waitingRoom).trimEnd();
  if (entries.length === 0) return `${summary}\n`;
  return `${summary}\n\nDetalle por ingreso\n${buildWaitingRoomReportEntriesCsv(entries).trimEnd()}\n`;
}
