import type { AppointmentType } from '../constants/appointments';
import type { PatientSpecies } from '../constants/patients';
import type { WaitingRoomStatus } from '../constants/waiting-room';

export interface WaitingRoomEntry {
  id: string;
  organization_id: string;
  branch_id: string;
  appointment_id: string;
  status: WaitingRoomStatus;
  checked_in_at: string;
  called_at: string | null;
  consultation_started_at: string | null;
  payment_pending_at: string | null;
  completed_at: string | null;
  queue_position: number | null;
  priority: number;
  room: string | null;
  internal_notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

/** Clinic staff waiting-room list row (may include internal_notes; never send to portal). */
export interface WaitingRoomListRow {
  waiting_room_entry_id: string;
  appointment_id: string;
  patient_id: string;
  patient_name: string;
  patient_species: PatientSpecies;
  owner_id: string;
  owner_full_name: string;
  assigned_user_id: string | null;
  assigned_user_name: string | null;
  appointment_type: AppointmentType;
  appointment_starts_at: string;
  waiting_room_status: WaitingRoomStatus;
  checked_in_at: string;
  called_at: string | null;
  consultation_started_at: string | null;
  payment_pending_at: string | null;
  completed_at: string | null;
  queue_position: number | null;
  priority: number;
  room: string | null;
  /** Staff-only operational note; omitted/null-safe on older payloads. */
  internal_notes?: string | null;
}

/** Historical waiting-room visits for a patient ficha (staff-only). */
export interface PatientWaitingRoomHistoryRow {
  waiting_room_entry_id: string;
  appointment_id: string;
  checked_in_at: string;
  waiting_room_status: WaitingRoomStatus | string;
  called_at: string | null;
  completed_at: string | null;
  removed: boolean;
  room: string | null;
  appointment_starts_at: string;
  minutes_to_call: number | null;
  minutes_dwell: number | null;
}

/** Historical waiting-room visits for an owner ficha (staff-only). */
export interface OwnerWaitingRoomHistoryRow extends PatientWaitingRoomHistoryRow {
  patient_id: string;
  patient_name: string;
}

export interface WaitingRoomCheckInResult {
  id: string;
  organization_id: string;
  branch_id: string;
  appointment_id: string;
  status: WaitingRoomStatus;
  checked_in_at: string;
  called_at: string | null;
  consultation_started_at: string | null;
  payment_pending_at: string | null;
  completed_at: string | null;
  queue_position: number | null;
  priority: number;
  room: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface WaitingRoomMutationResult {
  id: string;
  appointment_id: string;
  status: WaitingRoomStatus;
  called_at?: string | null;
  consultation_started_at?: string | null;
  payment_pending_at?: string | null;
  completed_at?: string | null;
  queue_position: number | null;
  priority: number;
  room: string | null;
}

/** Slim row for owner portal (own pets only; no owner/staff PII beyond the tutor session). */
export interface PortalWaitingRoomRow {
  waiting_room_entry_id: string;
  appointment_id: string;
  patient_id: string;
  patient_name: string;
  patient_species: PatientSpecies;
  appointment_type: AppointmentType;
  appointment_starts_at: string;
  waiting_room_status: WaitingRoomStatus;
  checked_in_at: string;
  called_at: string | null;
  consultation_started_at: string | null;
  payment_pending_at: string | null;
  completed_at: string | null;
  queue_position: number | null;
  priority: number;
  room: string | null;
  ahead_count: number;
  /** Minutes per patient ahead used for ETA (clinic override or measured avg). */
  minutes_per_patient: number | null;
}

export interface WaitingRoomCheckInTokenResult {
  token: string;
  expires_at: string;
  appointment_id: string;
  path: string;
  url: string;
}

export interface WaitingRoomCheckInPreview {
  valid: boolean;
  reason?: string;
  patient_name?: string;
  patient_species?: PatientSpecies;
  appointment_starts_at?: string;
  appointment_type?: AppointmentType;
  organization_name?: string;
  expires_at?: string;
}

/** Live status for public QR check-in page (token-scoped, no PII beyond pet name). */
export interface PublicCheckInStatus {
  valid: boolean;
  reason?: string;
  patient_name?: string;
  patient_species?: PatientSpecies;
  waiting_room_status?: WaitingRoomStatus | string;
  queue_position?: number | null;
  room?: string | null;
  ahead_count?: number;
  minutes_per_patient?: number | null;
  checked_in_at?: string;
  terminal?: boolean;
}

export interface WaitingRoomCheckInRedeemResult {
  id: string;
  organization_id: string;
  branch_id: string;
  appointment_id: string;
  status: WaitingRoomStatus;
  checked_in_at: string;
  queue_position: number | null;
  priority: number;
  patient_name: string | null;
}

export interface OwnerPortalAlert {
  id: string;
  title: string;
  body: string | null;
  href: string;
  related_type: string | null;
  related_id: string | null;
  read_at: string | null;
  created_at: string;
}

export interface WaitingRoomReorderQueueResult {
  updated: number;
  ordered_ids: string[];
}

export interface WaitingRoomRemoveResult {
  id: string;
  appointment_id: string;
  deleted_at: string;
  marked_ausente: boolean;
}

export interface WaitingRoomStatusCount {
  status: WaitingRoomStatus;
  count: number;
}

export interface WaitingRoomDashboardSummary {
  totalToday: number;
  activeCount: number;
  pendingCheckInCount: number;
  countsByStatus: WaitingRoomStatusCount[];
  avgWaitMinutes: number | null;
  avgTimeToCallMinutes: number | null;
  longestWaitMinutes: number | null;
  longestWaitPatientName: string | null;
  completedCount: number;
  calledCount: number;
  inFlowCount: number;
}
