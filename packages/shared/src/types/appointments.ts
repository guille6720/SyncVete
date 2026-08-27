import type {
  AppointmentReminderJobKind,
  AppointmentReminderJobStatus,
  AppointmentStatus,
  AppointmentType,
  ConsultationMode,
  TimeBlockKind,
  WaitlistStatus,
} from '../constants/appointments';
import type { PaymentMethod } from '../constants/billing';
import type { PatientSpecies } from '../constants/patients';

export interface Appointment {
  id: string;
  organization_id: string;
  branch_id: string;
  patient_id: string;
  owner_id: string;
  assigned_user_id: string | null;
  starts_at: string;
  ends_at: string;
  status: AppointmentStatus;
  appointment_type: AppointmentType;
  title: string | null;
  notes: string | null;
  cancellation_reason: string | null;
  consultation_mode: ConsultationMode | null;
  expected_payment_method: PaymentMethod | string | null;
  room: string | null;
  remind_24h: boolean;
  remind_2h: boolean;
  remind_confirmation: boolean;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface AppointmentListRow extends Appointment {
  patient_name: string;
  patient_species: PatientSpecies;
  owner_full_name: string;
  assigned_user_name: string | null;
}

export interface AssignableStaffMember {
  userId: string;
  fullName: string;
  role: string;
}

export interface WaitlistEntry {
  id: string;
  organization_id: string;
  branch_id: string;
  owner_id: string;
  patient_id: string;
  preferred_user_id: string | null;
  appointment_type: AppointmentType;
  preferred_weekdays: number[] | null;
  preferred_time_start: string | null;
  preferred_time_end: string | null;
  priority: number;
  notes: string | null;
  status: WaitlistStatus;
  matched_appointment_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface ProfessionalSchedule {
  id: string;
  organization_id: string;
  branch_id: string;
  user_id: string;
  /** 1=Monday .. 7=Sunday (ISODOW) */
  weekday: number;
  start_time: string;
  end_time: string;
  slot_duration_minutes: number;
  allowed_appointment_types: AppointmentType[] | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface ProfessionalTimeBlock {
  id: string;
  organization_id: string;
  branch_id: string;
  user_id: string | null;
  kind: TimeBlockKind;
  starts_at: string;
  ends_at: string;
  reason: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface AppointmentStatusEvent {
  id: string;
  organization_id: string;
  appointment_id: string;
  from_status: AppointmentStatus | null;
  to_status: AppointmentStatus;
  previous_starts_at: string | null;
  previous_ends_at: string | null;
  new_starts_at: string | null;
  new_ends_at: string | null;
  changed_by: string | null;
  note: string | null;
  created_at: string;
}

export interface AppointmentReminderJob {
  id: string;
  organization_id: string;
  appointment_id: string;
  kind: AppointmentReminderJobKind;
  status: AppointmentReminderJobStatus;
  scheduled_for: string;
  sent_at: string | null;
  error: string | null;
  payload: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface AppointmentDashboardMetrics {
  total: number;
  active: number;
  programada: number;
  confirmada: number;
  enCurso: number;
  completada: number;
  cancelada: number;
  ausente: number;
}
