/**
 * Explicit PostgREST column lists for hot-path detail reads.
 * Prefer these over `.select('*')` on critical clinical routes.
 */

export const PATIENT_COLUMNS =
  'id, organization_id, branch_id, owner_id, name, species, breed, sex, birth_date, color, microchip, is_neutered, is_deceased, deceased_at, notes, photo_url, is_active, created_at, updated_at, deleted_at';

export const ORGANIZATION_COLUMNS =
  'id, name, slug, plan, settings, created_at, updated_at, deleted_at';

export const OWNER_COLUMNS =
  'id, organization_id, branch_id, full_name, email, phone, phone_whatsapp, document_type, document_number, address, city, province, postal_code, notes, is_active, portal_user_id, created_at, updated_at, deleted_at';

export const CLINICAL_ENTRY_COLUMNS =
  'id, organization_id, branch_id, patient_id, owner_id, appointment_id, recorded_by, entry_date, entry_type, title, anamnesis, physical_exam, diagnosis, treatment, plan, weight_kg, temperature_c, notes, import_batch_id, source_system, source_record_id, original_created_at, original_professional_name, imported_at, imported_by, created_at, updated_at, deleted_at';

export const PRESCRIPTION_COLUMNS =
  'id, organization_id, branch_id, patient_id, owner_id, consultation_id, clinical_entry_id, prescribed_by, dispensed_by, voided_by, status, number, notes, void_reason, prescribed_at, dispensed_at, voided_at, created_at, updated_at, deleted_at';

export const PRESCRIPTION_ITEM_COLUMNS =
  'id, organization_id, prescription_id, inventory_product_id, medication_name, dose, frequency, duration, route, quantity, instructions, sort_order, created_at, updated_at, deleted_at';

export const APPOINTMENT_COLUMNS =
  'id, organization_id, branch_id, patient_id, owner_id, assigned_user_id, starts_at, ends_at, status, appointment_type, title, notes, cancellation_reason, created_at, updated_at, deleted_at';

export const CONSULTATION_COLUMNS =
  'id, organization_id, branch_id, patient_id, owner_id, appointment_id, clinical_entry_id, veterinarian_id, status, started_at, completed_at, title, anamnesis, physical_exam, diagnosis, treatment, plan, weight_kg, temperature_c, notes, created_at, updated_at, deleted_at';

export const LAB_ORDER_COLUMNS =
  'id, organization_id, branch_id, patient_id, owner_id, consultation_id, clinical_entry_id, ordered_by, completed_by, status, priority, sample_type, title, ordered_at, collected_at, completed_at, interpretation, notes, created_at, updated_at, deleted_at';

export const LAB_ORDER_ITEM_COLUMNS =
  'id, organization_id, lab_order_id, test_name, result_value, unit, reference_range, flag, sort_order, notes, created_at, updated_at, deleted_at';

export const HOSPITALIZATION_COLUMNS =
  'id, organization_id, branch_id, patient_id, owner_id, consultation_id, clinical_entry_id, veterinarian_id, status, admitted_at, discharged_at, cage, reason, diagnosis, treatment_plan, discharge_summary, notes, created_at, updated_at, deleted_at';

export const HOSPITALIZATION_NOTE_COLUMNS =
  'id, organization_id, hospitalization_id, recorded_by, recorded_at, note_type, content, weight_kg, temperature_c, created_at, updated_at, deleted_at';

export const VACCINATION_COLUMNS =
  'id, organization_id, branch_id, patient_id, owner_id, consultation_id, clinical_entry_id, veterinarian_id, vaccine_name, manufacturer, lot_number, administered_at, next_due_at, route, notes, created_at, updated_at, deleted_at';

export const SURGERY_COLUMNS =
  'id, organization_id, branch_id, patient_id, owner_id, appointment_id, consultation_id, clinical_entry_id, surgeon_id, status, scheduled_at, started_at, completed_at, procedure_name, diagnosis, anesthesia, asa, preop_notes, intraop_notes, postop_notes, complications, notes, created_at, updated_at, deleted_at';
