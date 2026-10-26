import type { AppointmentType } from '../constants/appointments';
import type { ProfessionalSchedule } from '../types/appointments';

/** 1=Monday .. 7=Sunday (ISODOW), matching professional_schedules.weekday */
export const SCHEDULE_WEEKDAY_LABELS: Record<number, string> = {
  1: 'Lunes',
  2: 'Martes',
  3: 'Miércoles',
  4: 'Jueves',
  5: 'Viernes',
  6: 'Sábado',
  7: 'Domingo',
};

export function getIsoWeekdayFromDateParam(dateStr: string): number {
  const [year, month, day] = dateStr.split('-').map(Number);
  const anchor = new Date(Date.UTC(year, month - 1, day, 12));
  const utcDay = anchor.getUTCDay(); // 0=Sun .. 6=Sat
  return utcDay === 0 ? 7 : utcDay;
}

/** Accepts "HH:MM", "HH:MM:SS" → minutes from midnight. */
export function scheduleTimeToMinutes(value: string): number {
  const [h, m] = value.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

export function minutesToTimeInput(total: number): string {
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function formatScheduleTimeLabel(value: string): string {
  return minutesToTimeInput(scheduleTimeToMinutes(value));
}

export type ScheduleWindowSummary = {
  weekday: number;
  label: string;
  startTime: string;
  endTime: string;
  slotDurationMinutes: number;
};

export function summarizeProfessionalSchedules(
  schedules: readonly Pick<
    ProfessionalSchedule,
    'weekday' | 'start_time' | 'end_time' | 'slot_duration_minutes' | 'is_active' | 'deleted_at'
  >[]
): ScheduleWindowSummary[] {
  return schedules
    .filter((row) => row.is_active && !row.deleted_at)
    .map((row) => ({
      weekday: row.weekday,
      label: SCHEDULE_WEEKDAY_LABELS[row.weekday] ?? `Día ${row.weekday}`,
      startTime: formatScheduleTimeLabel(row.start_time),
      endTime: formatScheduleTimeLabel(row.end_time),
      slotDurationMinutes: row.slot_duration_minutes || 30,
    }))
    .sort((a, b) => a.weekday - b.weekday || a.startTime.localeCompare(b.startTime));
}

export function schedulesForDate(
  schedules: readonly ProfessionalSchedule[],
  dateStr: string,
  appointmentType?: AppointmentType | string | null
): ProfessionalSchedule[] {
  const weekday = getIsoWeekdayFromDateParam(dateStr);
  return schedules.filter((row) => {
    if (!row.is_active || row.deleted_at) return false;
    if (row.weekday !== weekday) return false;
    if (
      appointmentType &&
      row.allowed_appointment_types &&
      row.allowed_appointment_types.length > 0 &&
      !row.allowed_appointment_types.includes(appointmentType as AppointmentType)
    ) {
      return false;
    }
    return true;
  });
}

export type LocalScheduleSlot = {
  /** datetime-local value `YYYY-MM-DDTHH:mm` (clinic local) */
  startsAtLocal: string;
  label: string;
  durationMinutes: number;
};

/**
 * Build bookable slots for a calendar day from active professional schedules.
 * Times are clinic-local (Argentina), matching datetime-local inputs.
 */
export function buildLocalSlotsForDate(input: {
  dateStr: string;
  schedules: readonly ProfessionalSchedule[];
  durationMinutes?: number;
  appointmentType?: AppointmentType | string | null;
}): LocalScheduleSlot[] {
  const daySchedules = schedulesForDate(input.schedules, input.dateStr, input.appointmentType);
  const slots: LocalScheduleSlot[] = [];

  for (const schedule of daySchedules) {
    const step = input.durationMinutes ?? schedule.slot_duration_minutes ?? 30;
    const start = scheduleTimeToMinutes(schedule.start_time);
    const end = scheduleTimeToMinutes(schedule.end_time);
    for (let cursor = start; cursor + step <= end; cursor += step) {
      const time = minutesToTimeInput(cursor);
      slots.push({
        startsAtLocal: `${input.dateStr}T${time}`,
        label: time,
        durationMinutes: step,
      });
    }
  }

  return slots.sort((a, b) => a.startsAtLocal.localeCompare(b.startsAtLocal));
}

/**
 * Whether a local datetime-local start + duration fits an active schedule window.
 * When there are no active schedules, returns `{ ok: true, enforced: false }` (DB opt-in).
 */
/** Prefer the shortest active slot length from the ficha (e.g. 20 min). */
export function getPreferredSlotDurationMinutes(
  schedules: readonly ProfessionalSchedule[]
): number | null {
  const durations = schedules
    .filter((row) => row.is_active && !row.deleted_at)
    .map((row) => row.slot_duration_minutes)
    .filter((value): value is number => Number.isFinite(value) && value > 0);
  if (durations.length === 0) return null;
  return Math.min(...durations);
}

/**
 * Pick the first valid local slot on/after `preferredDateStr` (YYYY-MM-DD),
 * searching up to `searchDays` days ahead.
 */
export function findNextLocalSlot(input: {
  preferredDateStr: string;
  schedules: readonly ProfessionalSchedule[];
  durationMinutes?: number;
  appointmentType?: AppointmentType | string | null;
  searchDays?: number;
}): LocalScheduleSlot | null {
  const active = input.schedules.filter((row) => row.is_active && !row.deleted_at);
  if (active.length === 0) return null;

  const duration =
    input.durationMinutes ?? getPreferredSlotDurationMinutes(active) ?? 30;
  const days = input.searchDays ?? 14;
  const [y, m, d] = input.preferredDateStr.split('-').map(Number);
  const anchor = new Date(Date.UTC(y, m - 1, d, 12));

  for (let offset = 0; offset < days; offset += 1) {
    const cursor = new Date(anchor);
    cursor.setUTCDate(anchor.getUTCDate() + offset);
    const dateStr = cursor.toISOString().slice(0, 10);
    const slots = buildLocalSlotsForDate({
      dateStr,
      schedules: active,
      durationMinutes: duration,
      appointmentType: input.appointmentType,
    });
    if (slots[0]) return slots[0];
  }
  return null;
}

export function validateLocalStartAgainstSchedules(input: {
  startsAtLocal: string;
  durationMinutes: number;
  schedules: readonly ProfessionalSchedule[];
  appointmentType?: AppointmentType | string | null;
}): { ok: boolean; enforced: boolean; reason?: string } {
  const active = input.schedules.filter((row) => row.is_active && !row.deleted_at);
  if (active.length === 0) {
    return { ok: true, enforced: false };
  }

  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/.exec(input.startsAtLocal);
  if (!match) {
    return { ok: false, enforced: true, reason: 'Fecha y hora inválidas' };
  }

  const dateStr = match[1]!;
  const startMinutes = Number(match[2]) * 60 + Number(match[3]);
  const endMinutes = startMinutes + input.durationMinutes;
  const daySchedules = schedulesForDate(active, dateStr, input.appointmentType);

  if (daySchedules.length === 0) {
    return {
      ok: false,
      enforced: true,
      reason: 'El profesional no atiende ese día según su ficha',
    };
  }

  const fits = daySchedules.some((row) => {
    const windowStart = scheduleTimeToMinutes(row.start_time);
    const windowEnd = scheduleTimeToMinutes(row.end_time);
    return startMinutes >= windowStart && endMinutes <= windowEnd;
  });

  if (!fits) {
    return {
      ok: false,
      enforced: true,
      reason: 'Horario fuera de la agenda configurada del profesional',
    };
  }

  return { ok: true, enforced: true };
}
