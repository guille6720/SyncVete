import { z } from 'zod';
import { professionalScheduleSchema } from '@sincvete/shared';

const time = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/, 'Hora inválida');
const normalizeTime = (value: string) => (value.length === 5 ? `${value}:00` : value);
const hours = professionalScheduleSchema
  .pick({ weekday: true, startTime: true, endTime: true, slotDurationMinutes: true })
  .extend({ startTime: time, endTime: time })
  .refine(
    (row) => normalizeTime(row.endTime) > normalizeTime(row.startTime),
    'La hora de fin debe ser posterior al inicio'
  );

const schedules = z
  .array(hours)
  .max(100)
  .superRefine((rows, ctx) => {
    for (let i = 0; i < rows.length; i++) {
      for (let j = i + 1; j < rows.length; j++) {
        if (
          rows[i].weekday === rows[j].weekday &&
          normalizeTime(rows[i].startTime) < normalizeTime(rows[j].endTime) &&
          normalizeTime(rows[i].endTime) > normalizeTime(rows[j].startTime)
        ) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Los horarios del mismo día no deben superponerse',
          });
        }
      }
    }
  });

export type ProfessionalHoursInput = z.infer<typeof hours>;

/** Absent means unchanged; [] explicitly removes the current weekly hours. */
export function parseProfessionalScheduleInput(
  raw: FormDataEntryValue | null
): { success: true; schedules?: ProfessionalHoursInput[] } | { success: false; error: string } {
  if (raw === null) return { success: true };
  if (typeof raw !== 'string') return { success: false, error: 'Formato de horarios inválido' };
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return { success: false, error: 'Formato de horarios inválido' };
  }
  const parsed = schedules.safeParse(value);
  if (!parsed.success)
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Horarios inválidos' };
  return { success: true, schedules: parsed.data };
}
