export const APPOINTMENT_STATUSES = [
  'programada',
  'confirmada',
  'en_curso',
  'completada',
  'cancelada',
  'ausente',
] as const;

export type AppointmentStatus = (typeof APPOINTMENT_STATUSES)[number];

export const APPOINTMENT_TYPES = [
  'consulta',
  'vacunacion',
  'cirugia',
  'control',
  'emergencia',
  'otro',
] as const;

export type AppointmentType = (typeof APPOINTMENT_TYPES)[number];

export const CONSULTATION_MODES = ['clinic', 'home_visit', 'video'] as const;

export type ConsultationMode = (typeof CONSULTATION_MODES)[number];

export const CONSULTATION_MODE_LABELS: Record<ConsultationMode, string> = {
  clinic: 'En clínica',
  home_visit: 'Domicilio',
  video: 'Videoconsulta',
};

export const APPOINTMENT_STATUS_LABELS: Record<AppointmentStatus, string> = {
  programada: 'Programada',
  confirmada: 'Confirmada',
  en_curso: 'En curso',
  completada: 'Completada',
  cancelada: 'Cancelada',
  ausente: 'Ausente',
};

/**
 * English ops mental map → Spanish DB / waiting-room statuses:
 * - Pending → programada
 * - Confirmed → confirmada
 * - Arrived / Waiting → waiting room (`waiting` / `called`)
 * - In consultation → en_curso OR waiting room `in_consultation`
 * - Completed → completada
 * - Cancelled → cancelada
 * - No-show → ausente
 */
export function appointmentStatusLabelForOps(status: AppointmentStatus): string {
  return APPOINTMENT_STATUS_LABELS[status];
}

export const APPOINTMENT_TYPE_LABELS: Record<AppointmentType, string> = {
  consulta: 'Consulta',
  vacunacion: 'Vacunación',
  cirugia: 'Cirugía',
  control: 'Control',
  emergencia: 'Emergencia',
  otro: 'Otro',
};

export const APPOINTMENT_STATUS_VARIANT: Record<
  AppointmentStatus,
  'default' | 'success' | 'destructive' | 'warning'
> = {
  programada: 'default',
  confirmada: 'success',
  en_curso: 'warning',
  completada: 'success',
  cancelada: 'destructive',
  ausente: 'destructive',
};

export const WAITLIST_STATUSES = [
  'open',
  'offered',
  'booked',
  'cancelled',
  'expired',
] as const;

export type WaitlistStatus = (typeof WAITLIST_STATUSES)[number];

export const WAITLIST_STATUS_LABELS: Record<WaitlistStatus, string> = {
  open: 'Abierta',
  offered: 'Ofrecida',
  booked: 'Reservada',
  cancelled: 'Cancelada',
  expired: 'Expirada',
};

export const TIME_BLOCK_KINDS = ['break', 'vacation', 'blocked'] as const;

export type TimeBlockKind = (typeof TIME_BLOCK_KINDS)[number];

export const TIME_BLOCK_KIND_LABELS: Record<TimeBlockKind, string> = {
  break: 'Descanso',
  vacation: 'Vacaciones',
  blocked: 'Bloqueado',
};

export const APPOINTMENT_REMINDER_JOB_KINDS = [
  'confirmation',
  'remind_24h',
  'remind_2h',
  'cancellation',
  'reschedule',
  'professional_notify',
] as const;

export type AppointmentReminderJobKind = (typeof APPOINTMENT_REMINDER_JOB_KINDS)[number];

export const APPOINTMENT_REMINDER_JOB_KIND_LABELS: Record<AppointmentReminderJobKind, string> = {
  confirmation: 'Confirmación',
  remind_24h: 'Recordatorio 24 h',
  remind_2h: 'Recordatorio 2 h',
  cancellation: 'Cancelación',
  reschedule: 'Reprogramación',
  professional_notify: 'Aviso al profesional',
};

export const APPOINTMENT_REMINDER_JOB_STATUSES = [
  'pending',
  'due',
  'sent',
  'skipped',
  'failed',
  'cancelled',
] as const;

export type AppointmentReminderJobStatus = (typeof APPOINTMENT_REMINDER_JOB_STATUSES)[number];

export const APPOINTMENT_REMINDER_JOB_STATUS_LABELS: Record<AppointmentReminderJobStatus, string> = {
  pending: 'Pendiente',
  due: 'Vencido',
  sent: 'Enviado',
  skipped: 'Omitido',
  failed: 'Fallido',
  cancelled: 'Cancelado',
};

export const DEFAULT_APPOINTMENT_DURATION_MINUTES = 30;

export const APPOINTMENT_DURATION_OPTIONS = [15, 30, 45, 60, 90, 120] as const;
