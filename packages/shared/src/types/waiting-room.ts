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

/** Public list row for clinic Waiting Room UI (no internal_notes). */
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
