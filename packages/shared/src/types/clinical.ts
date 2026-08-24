import type { ClinicalEntryType } from '../constants/clinical';
import type { PatientSpecies } from '../constants/patients';

export interface ClinicalEntry {
  id: string;
  organization_id: string;
  branch_id: string;
  patient_id: string;
  owner_id: string;
  appointment_id: string | null;
  recorded_by: string | null;
  entry_date: string;
  entry_type: ClinicalEntryType;
  title: string | null;
  anamnesis: string | null;
  physical_exam: string | null;
  diagnosis: string | null;
  treatment: string | null;
  plan: string | null;
  weight_kg: number | null;
  temperature_c: number | null;
  notes: string | null;
  import_batch_id?: string | null;
  source_system?: string | null;
  source_record_id?: string | null;
  original_created_at?: string | null;
  original_professional_name?: string | null;
  imported_at?: string | null;
  imported_by?: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface ClinicalEntryListRow extends ClinicalEntry {
  patient_name: string;
  patient_species: PatientSpecies;
  owner_full_name: string;
  recorded_by_name: string | null;
}
