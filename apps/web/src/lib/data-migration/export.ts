import 'server-only';

import {
  DATA_MIGRATION_FORMAT,
  DATA_MIGRATION_FORMAT_VERSION,
  FOCUSED_EXPORT_ZIP_COMPANIONS,
  buildAttachmentMetaExportCsv,
  buildFocusedExportJsonPayload,
  isSpecialtyExportType,
  normalizeExportDateRange,
  toCsv,
  type ExportFormat,
  type ExportType,
} from '@sincvete/shared';
import JSZip from 'jszip';
import { createServerClient } from '@/lib/supabase/server';
import { requirePermission } from '@/lib/permissions';
import { migrationDb } from '@/lib/data-migration/db';

const EXPORT_RETENTION_DAYS = 7;

type DateBounds = { dateFrom: string | null; dateTo: string | null };

function withExternalBranch(row: Record<string, unknown>) {
  return { ...row, external_branch_id: row.branch_id ?? '' };
}

function withExternalStaff(row: Record<string, unknown>, staffKey: string) {
  return { ...row, external_assigned_user_id: row[staffKey] ?? '' };
}

function withExternalBranchAndStaff(row: Record<string, unknown>, staffKey: string) {
  return withExternalStaff(withExternalBranch(row), staffKey);
}

/** Loose CSV for focused ZIP primary entity (union of keys across rows). */
function rowsToLooseCsv(rows: Array<Record<string, unknown>>): string {
  const keys = Array.from(
    rows.reduce((set, row) => {
      for (const key of Object.keys(row)) set.add(key);
      return set;
    }, new Set<string>())
  );
  return toCsv(keys, rows);
}

function applyDateFilter(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- MigrationDb chain
  query: any,
  column: string,
  bounds: DateBounds
) {
  let next = query;
  if (bounds.dateFrom) next = next.gte(column, `${bounds.dateFrom}T00:00:00.000Z`);
  if (bounds.dateTo) next = next.lte(column, `${bounds.dateTo}T23:59:59.999Z`);
  return next;
}

export async function createExportJob(input: {
  exportType: ExportType;
  format: ExportFormat;
  patientId?: string | null;
  dateFrom?: string | null;
  dateTo?: string | null;
  queueOnly?: boolean;
}) {
  const session = await requirePermission('data:export');
  const supabase = await migrationDb();

  if (input.queueOnly) {
    const { count: activeCount } = await supabase
      .from('data_export_jobs')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', session.organizationId)
      .in('status', ['queued', 'running']);
    if ((activeCount ?? 0) > 0) {
      throw new Error('Ya hay una exportación en cola o en curso para esta clínica');
    }
  }

  const expires = new Date();
  expires.setDate(expires.getDate() + EXPORT_RETENTION_DAYS);
  const bounds = normalizeExportDateRange({
    dateFrom: input.dateFrom,
    dateTo: input.dateTo,
  });

  const { data, error } = await supabase
    .from('data_export_jobs')
    .insert({
      organization_id: session.organizationId,
      export_type: input.exportType,
      format: input.format,
      status: 'queued',
      created_by: session.userId,
      patient_id: input.patientId ?? null,
      date_from: bounds.dateFrom,
      date_to: bounds.dateTo,
      queued_at: input.queueOnly ? new Date().toISOString() : null,
      expires_at: expires.toISOString(),
      progress_message: input.queueOnly ? 'En cola para exportación' : null,
    })
    .select('*')
    .single();
  if (error || !data) throw new Error(error.message);
  if (input.queueOnly) {
    const { logDataMigrationAudit } = await import('@/lib/data-migration/audit');
    await logDataMigrationAudit({
      organizationId: session.organizationId,
      userId: session.userId,
      action: 'data_export.queued',
      entityType: 'data_export_jobs',
      entityId: String(data.id),
      newData: { exportType: input.exportType, format: input.format },
    });
  }
  return data;
}

export async function listExportJobs(limit = 30) {
  const session = await requirePermission('data:export');
  const supabase = await migrationDb();
  const { data, error } = await supabase
    .from('data_export_jobs')
    .select('*')
    .eq('organization_id', session.organizationId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return data ?? [];
}

async function fetchInventoryProducts(
  organizationId: string,
  db?: Awaited<ReturnType<typeof migrationDb>>
) {
  const supabase = db ?? (await migrationDb());
  const { data, error } = await supabase
    .from('inventory_products')
    .select(
      'id, branch_id, name, sku, category, unit, quantity, min_quantity, unit_cost, unit_price, manufacturer, notes, is_active, created_at'
    )
    .eq('organization_id', organizationId)
    .is('deleted_at', null)
    .order('name', { ascending: true })
    .limit(20000);
  if (error) throw new Error(error.message);
  return data ?? [];
}

async function fetchInvoices(
  organizationId: string,
  patientId?: string | null,
  bounds?: DateBounds,
  db?: Awaited<ReturnType<typeof migrationDb>>
) {
  const supabase = db ?? (await migrationDb());
  let query = supabase
    .from('invoices')
    .select(
      'id, branch_id, owner_id, patient_id, created_by, status, number, currency, issued_at, due_at, paid_at, voided_at, subtotal, tax_amount, total, paid_amount, balance, notes, created_at'
    )
    .eq('organization_id', organizationId)
    .is('deleted_at', null)
    .order('created_at', { ascending: true })
    .limit(10000);
  if (patientId) query = query.eq('patient_id', patientId);
  if (bounds) query = applyDateFilter(query, 'created_at', bounds);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data ?? [];
}

async function fetchInvoiceItems(
  organizationId: string,
  invoiceIds: string[],
  db?: Awaited<ReturnType<typeof migrationDb>>
) {
  if (invoiceIds.length === 0) return [];
  const supabase = db ?? (await migrationDb());
  const { data, error } = await supabase
    .from('invoice_items')
    .select(
      'id, invoice_id, inventory_product_id, description, quantity, unit_price, line_total, sort_order, created_at'
    )
    .eq('organization_id', organizationId)
    .is('deleted_at', null)
    .in('invoice_id', invoiceIds.slice(0, 2000))
    .order('sort_order', { ascending: true })
    .limit(20000);
  if (error) throw new Error(error.message);
  return data ?? [];
}

async function fetchInvoicePayments(
  organizationId: string,
  invoiceIds: string[],
  db?: Awaited<ReturnType<typeof migrationDb>>
) {
  if (invoiceIds.length === 0) return [];
  const supabase = db ?? (await migrationDb());
  const { data, error } = await supabase
    .from('payments')
    .select(
      'id, invoice_id, recorded_by, method, amount, paid_at, reference, notes, created_at'
    )
    .eq('organization_id', organizationId)
    .is('deleted_at', null)
    .in('invoice_id', invoiceIds.slice(0, 2000))
    .order('paid_at', { ascending: true })
    .limit(20000);
  if (error) throw new Error(error.message);
  return data ?? [];
}

async function fetchCashSessions(
  organizationId: string,
  bounds?: DateBounds,
  db?: Awaited<ReturnType<typeof migrationDb>>
) {
  const supabase = db ?? (await migrationDb());
  let query = supabase
    .from('cash_sessions')
    .select(
      'id, branch_id, opened_by, closed_by, status, opening_amount, expected_cash, counted_cash, difference, notes, close_notes, opened_at, closed_at, created_at'
    )
    .eq('organization_id', organizationId)
    .is('deleted_at', null)
    .order('opened_at', { ascending: true })
    .limit(5000);
  if (bounds) query = applyDateFilter(query, 'opened_at', bounds);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data ?? [];
}

async function fetchInventoryMovements(
  organizationId: string,
  bounds?: DateBounds,
  db?: Awaited<ReturnType<typeof migrationDb>>
) {
  const supabase = db ?? (await migrationDb());
  let query = supabase
    .from('inventory_movements')
    .select(
      'id, branch_id, product_id, movement_type, quantity, quantity_before, quantity_after, lot_number, expires_at, reason, performed_by, created_at'
    )
    .eq('organization_id', organizationId)
    .is('deleted_at', null)
    .order('created_at', { ascending: true })
    .limit(20000);
  if (bounds) query = applyDateFilter(query, 'created_at', bounds);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data ?? [];
}

async function fetchCashMovements(
  organizationId: string,
  sessionIds: string[],
  db?: Awaited<ReturnType<typeof migrationDb>>
) {
  if (sessionIds.length === 0) return [];
  const supabase = db ?? (await migrationDb());
  const { data, error } = await supabase
    .from('cash_movements')
    .select(
      'id, cash_session_id, payment_id, recorded_by, kind, method, amount, notes, created_at'
    )
    .eq('organization_id', organizationId)
    .is('deleted_at', null)
    .in('cash_session_id', sessionIds.slice(0, 2000))
    .order('created_at', { ascending: true })
    .limit(20000);
  if (error) throw new Error(error.message);
  return data ?? [];
}

async function fetchStaffProfiles(
  organizationId: string,
  db?: Awaited<ReturnType<typeof migrationDb>>
) {
  const supabase = db ?? (await migrationDb());
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, phone, active_branch_id, is_active, created_at')
    .eq('organization_id', organizationId)
    .is('deleted_at', null)
    .order('full_name', { ascending: true })
    .limit(5000);
  if (error) throw new Error(error.message);
  return data ?? [];
}

async function fetchStaffMemberships(
  organizationId: string,
  db?: Awaited<ReturnType<typeof migrationDb>>
) {
  const supabase = db ?? (await migrationDb());
  const { data, error } = await supabase
    .from('branch_members')
    .select('id, branch_id, user_id, role, is_active, created_at')
    .eq('organization_id', organizationId)
    .is('deleted_at', null)
    .order('user_id', { ascending: true })
    .limit(10000);
  if (error) throw new Error(error.message);
  return data ?? [];
}

async function fetchReminderLogs(
  organizationId: string,
  bounds?: DateBounds,
  db?: Awaited<ReturnType<typeof migrationDb>>
) {
  const supabase = db ?? (await migrationDb());
  let query = supabase
    .from('reminder_logs')
    .select(
      'id, branch_id, reminder_type, related_id, owner_id, patient_id, channel, status, due_on, whatsapp_message_id, sent_by, sent_at, created_at'
    )
    .eq('organization_id', organizationId)
    .is('deleted_at', null)
    .order('sent_at', { ascending: true })
    .limit(20000);
  if (bounds) query = applyDateFilter(query, 'sent_at', bounds);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data ?? [];
}

async function fetchWhatsAppMessages(
  organizationId: string,
  bounds?: DateBounds,
  db?: Awaited<ReturnType<typeof migrationDb>>
) {
  const supabase = db ?? (await migrationDb());
  let query = supabase
    .from('whatsapp_messages')
    .select(
      'id, branch_id, owner_id, patient_id, related_type, related_id, template_key, phone_e164, body, sent_by, created_at'
    )
    .eq('organization_id', organizationId)
    .is('deleted_at', null)
    .order('created_at', { ascending: true })
    .limit(20000);
  if (bounds) query = applyDateFilter(query, 'created_at', bounds);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data ?? [];
}

const AUDIT_LOG_CSV_HEADERS = [
  'id',
  'branch_id',
  'user_id',
  'action',
  'entity_type',
  'entity_id',
  'old_data',
  'new_data',
  'ip_address',
  'user_agent',
  'created_at',
] as const;

function auditLogsForCsv(rows: Array<Record<string, unknown>>) {
  return rows.map((row) => ({
    ...row,
    old_data:
      row.old_data != null && typeof row.old_data === 'object'
        ? JSON.stringify(row.old_data)
        : (row.old_data ?? ''),
    new_data:
      row.new_data != null && typeof row.new_data === 'object'
        ? JSON.stringify(row.new_data)
        : (row.new_data ?? ''),
  }));
}

async function fetchAuditLogs(
  organizationId: string,
  bounds?: DateBounds,
  db?: Awaited<ReturnType<typeof migrationDb>>
) {
  const supabase = db ?? (await migrationDb());
  let query = supabase
    .from('audit_logs')
    .select(
      'id, branch_id, user_id, action, entity_type, entity_id, old_data, new_data, ip_address, user_agent, created_at'
    )
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: true })
    .limit(20000);
  if (bounds) query = applyDateFilter(query, 'created_at', bounds);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data ?? [];
}

async function fetchNotifications(
  organizationId: string,
  bounds?: DateBounds,
  db?: Awaited<ReturnType<typeof migrationDb>>
) {
  const supabase = db ?? (await migrationDb());
  let query = supabase
    .from('notifications')
    .select(
      'id, branch_id, kind, title, body, href, related_type, related_id, created_at'
    )
    .eq('organization_id', organizationId)
    .is('deleted_at', null)
    .order('created_at', { ascending: true })
    .limit(20000);
  if (bounds) query = applyDateFilter(query, 'created_at', bounds);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data ?? [];
}

async function fetchAppointments(
  organizationId: string,
  patientId?: string | null,
  bounds?: DateBounds,
  db?: Awaited<ReturnType<typeof migrationDb>>
) {
  const supabase = db ?? (await migrationDb());
  let query = supabase
    .from('appointments')
    .select(
      'id, branch_id, patient_id, owner_id, assigned_user_id, starts_at, ends_at, status, appointment_type, title, notes, cancellation_reason, created_at'
    )
    .eq('organization_id', organizationId)
    .is('deleted_at', null)
    .order('starts_at', { ascending: true })
    .limit(20000);
  if (patientId) query = query.eq('patient_id', patientId);
  if (bounds) query = applyDateFilter(query, 'starts_at', bounds);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data ?? [];
}

async function fetchConsultations(
  organizationId: string,
  patientId?: string | null,
  bounds?: DateBounds,
  db?: Awaited<ReturnType<typeof migrationDb>>
) {
  const supabase = db ?? (await migrationDb());
  let query = supabase
    .from('consultations')
    .select(
      'id, branch_id, patient_id, owner_id, appointment_id, veterinarian_id, status, started_at, completed_at, title, anamnesis, physical_exam, diagnosis, treatment, plan, weight_kg, temperature_c, notes, source_system, source_record_id, imported_at, created_at'
    )
    .eq('organization_id', organizationId)
    .is('deleted_at', null)
    .order('started_at', { ascending: true })
    .limit(20000);
  if (patientId) query = query.eq('patient_id', patientId);
  if (bounds) query = applyDateFilter(query, 'started_at', bounds);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data ?? [];
}

async function fetchBranches(organizationId: string, db?: Awaited<ReturnType<typeof migrationDb>>) {
  const supabase = db ?? (await migrationDb());
  const { data, error } = await supabase
    .from('branches')
    .select(
      'id, name, code, address, phone, email, timezone, is_active, is_main, source_system, source_record_id, created_at'
    )
    .eq('organization_id', organizationId)
    .is('deleted_at', null)
    .order('name', { ascending: true })
    .limit(1000);
  if (error) throw new Error(error.message);
  return data ?? [];
}

async function fetchOwners(organizationId: string, db?: Awaited<ReturnType<typeof migrationDb>>) {
  const supabase = db ?? (await migrationDb());
  const { data, error } = await supabase
    .from('owners')
    .select(
      'id, branch_id, full_name, email, phone, document_type, document_number, address, city, province, postal_code, notes, is_active, source_system, source_record_id, imported_at, created_at'
    )
    .eq('organization_id', organizationId)
    .is('deleted_at', null)
    .order('full_name', { ascending: true })
    .limit(10000);
  if (error) throw new Error(error.message);
  return data ?? [];
}

async function fetchPatients(organizationId: string, db?: Awaited<ReturnType<typeof migrationDb>>) {
  const supabase = db ?? (await migrationDb());
  const { data, error } = await supabase
    .from('patients')
    .select(
      'id, branch_id, owner_id, name, species, breed, sex, birth_date, microchip, color, notes, is_active, is_deceased, source_system, source_record_id, imported_at, created_at'
    )
    .eq('organization_id', organizationId)
    .is('deleted_at', null)
    .order('name', { ascending: true })
    .limit(10000);
  if (error) throw new Error(error.message);
  return data ?? [];
}

async function fetchClinicalEntries(
  organizationId: string,
  patientId?: string | null,
  bounds?: DateBounds,
  db?: Awaited<ReturnType<typeof migrationDb>>
) {
  const supabase = db ?? (await migrationDb());
  let query = supabase
    .from('clinical_entries')
    .select(
      'id, branch_id, patient_id, owner_id, recorded_by, entry_date, entry_type, title, anamnesis, physical_exam, diagnosis, treatment, plan, weight_kg, temperature_c, notes, source_system, source_record_id, original_created_at, original_professional_name, imported_at, created_at'
    )
    .eq('organization_id', organizationId)
    .is('deleted_at', null)
    .order('entry_date', { ascending: true })
    .limit(20000);
  if (patientId) query = query.eq('patient_id', patientId);
  if (bounds) query = applyDateFilter(query, 'entry_date', bounds);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data ?? [];
}

async function fetchVaccinations(
  organizationId: string,
  patientId?: string | null,
  bounds?: DateBounds,
  db?: Awaited<ReturnType<typeof migrationDb>>
) {
  const supabase = db ?? (await migrationDb());
  let query = supabase
    .from('vaccinations')
    .select(
      'id, branch_id, patient_id, owner_id, veterinarian_id, vaccine_name, manufacturer, lot_number, administered_at, next_due_at, notes, source_system, source_record_id, original_created_at, original_professional_name, imported_at, created_at'
    )
    .eq('organization_id', organizationId)
    .is('deleted_at', null)
    .order('administered_at', { ascending: true })
    .limit(10000);
  if (patientId) query = query.eq('patient_id', patientId);
  if (bounds) query = applyDateFilter(query, 'administered_at', bounds);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data ?? [];
}

async function fetchLabOrders(
  organizationId: string,
  patientId?: string | null,
  bounds?: DateBounds,
  db?: Awaited<ReturnType<typeof migrationDb>>
) {
  const supabase = db ?? (await migrationDb());
  let query = supabase
    .from('lab_orders')
    .select(
      'id, branch_id, patient_id, owner_id, ordered_by, title, status, priority, sample_type, ordered_at, completed_at, interpretation, notes, source_system, source_record_id, original_professional_name, imported_at, created_at'
    )
    .eq('organization_id', organizationId)
    .is('deleted_at', null)
    .order('ordered_at', { ascending: true })
    .limit(10000);
  if (patientId) query = query.eq('patient_id', patientId);
  if (bounds) query = applyDateFilter(query, 'ordered_at', bounds);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data ?? [];
}

async function fetchLabOrderItems(
  organizationId: string,
  labOrderIds: string[],
  db?: Awaited<ReturnType<typeof migrationDb>>
) {
  if (labOrderIds.length === 0) return [];
  const supabase = db ?? (await migrationDb());
  const { data, error } = await supabase
    .from('lab_order_items')
    .select(
      'id, lab_order_id, test_name, result_value, unit, reference_range, flag, sort_order, created_at'
    )
    .eq('organization_id', organizationId)
    .is('deleted_at', null)
    .in('lab_order_id', labOrderIds.slice(0, 2000))
    .order('sort_order', { ascending: true })
    .limit(20000);
  if (error) throw new Error(error.message);
  return data ?? [];
}

async function fetchSurgeries(
  organizationId: string,
  patientId?: string | null,
  bounds?: DateBounds,
  db?: Awaited<ReturnType<typeof migrationDb>>
) {
  const supabase = db ?? (await migrationDb());
  let query = supabase
    .from('surgeries')
    .select(
      'id, branch_id, patient_id, owner_id, surgeon_id, procedure_name, status, scheduled_at, started_at, completed_at, notes, source_system, source_record_id, original_professional_name, imported_at, created_at'
    )
    .eq('organization_id', organizationId)
    .is('deleted_at', null)
    .order('scheduled_at', { ascending: true })
    .limit(10000);
  if (patientId) query = query.eq('patient_id', patientId);
  if (bounds) query = applyDateFilter(query, 'scheduled_at', bounds);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data ?? [];
}

async function fetchPrescriptions(
  organizationId: string,
  patientId?: string | null,
  bounds?: DateBounds,
  db?: Awaited<ReturnType<typeof migrationDb>>
) {
  const supabase = db ?? (await migrationDb());
  let query = supabase
    .from('prescriptions')
    .select(
      'id, branch_id, patient_id, owner_id, prescribed_by, status, notes, prescribed_at, source_system, source_record_id, original_professional_name, imported_at, created_at'
    )
    .eq('organization_id', organizationId)
    .is('deleted_at', null)
    .order('prescribed_at', { ascending: true })
    .limit(10000);
  if (patientId) query = query.eq('patient_id', patientId);
  if (bounds) query = applyDateFilter(query, 'prescribed_at', bounds);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data ?? [];
}

async function fetchPrescriptionItems(
  organizationId: string,
  prescriptionIds: string[],
  db?: Awaited<ReturnType<typeof migrationDb>>
) {
  if (prescriptionIds.length === 0) return [];
  const supabase = db ?? (await migrationDb());
  const { data, error } = await supabase
    .from('prescription_items')
    .select(
      'id, prescription_id, medication_name, dose, frequency, duration, route, quantity, instructions, sort_order, created_at'
    )
    .eq('organization_id', organizationId)
    .is('deleted_at', null)
    .in('prescription_id', prescriptionIds.slice(0, 2000))
    .order('sort_order', { ascending: true })
    .limit(20000);
  if (error) throw new Error(error.message);
  return data ?? [];
}

async function fetchHospitalizations(
  organizationId: string,
  patientId?: string | null,
  bounds?: DateBounds,
  db?: Awaited<ReturnType<typeof migrationDb>>
) {
  const supabase = db ?? (await migrationDb());
  let query = supabase
    .from('hospitalizations')
    .select(
      'id, branch_id, patient_id, owner_id, veterinarian_id, status, admitted_at, discharged_at, cage, reason, diagnosis, treatment_plan, notes, source_system, source_record_id, original_professional_name, imported_at, created_at'
    )
    .eq('organization_id', organizationId)
    .is('deleted_at', null)
    .order('admitted_at', { ascending: true })
    .limit(10000);
  if (patientId) query = query.eq('patient_id', patientId);
  if (bounds) query = applyDateFilter(query, 'admitted_at', bounds);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data ?? [];
}

async function fetchHospitalizationNotes(
  organizationId: string,
  hospitalizationIds: string[],
  db?: Awaited<ReturnType<typeof migrationDb>>
) {
  if (hospitalizationIds.length === 0) return [];
  const supabase = db ?? (await migrationDb());
  const { data, error } = await supabase
    .from('hospitalization_notes')
    .select(
      'id, hospitalization_id, recorded_by, recorded_at, note_type, content, weight_kg, temperature_c, created_at'
    )
    .eq('organization_id', organizationId)
    .is('deleted_at', null)
    .in('hospitalization_id', hospitalizationIds.slice(0, 2000))
    .order('recorded_at', { ascending: true })
    .limit(20000);
  if (error) throw new Error(error.message);
  return data ?? [];
}

async function fetchClinicalImagesCatalog(
  organizationId: string,
  patientId?: string | null,
  bounds?: DateBounds,
  db?: Awaited<ReturnType<typeof migrationDb>>
) {
  const supabase = db ?? (await migrationDb());
  let query = supabase
    .from('clinical_images')
    .select(
      'id, branch_id, patient_id, owner_id, consultation_id, clinical_entry_id, uploaded_by, kind, title, notes, storage_path, mime_type, file_size, original_name, taken_at, created_at'
    )
    .eq('organization_id', organizationId)
    .is('deleted_at', null)
    .order('taken_at', { ascending: true })
    .limit(10000);
  if (patientId) query = query.eq('patient_id', patientId);
  if (bounds) query = applyDateFilter(query, 'taken_at', bounds);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data ?? [];
}

async function fetchClinicalImages(
  organizationId: string,
  patientIds: string[],
  db?: Awaited<ReturnType<typeof migrationDb>>
) {
  if (patientIds.length === 0) return [];
  const supabase = db ?? (await migrationDb());
  const { data, error } = await supabase
    .from('clinical_images')
    .select(
      'id, branch_id, patient_id, uploaded_by, kind, title, notes, storage_path, mime_type, file_size, original_name, taken_at, created_at'
    )
    .eq('organization_id', organizationId)
    .is('deleted_at', null)
    .in('patient_id', patientIds.slice(0, 200))
    .order('taken_at', { ascending: true })
    .limit(100);
  if (error) throw new Error(error.message);
  return data ?? [];
}

export function buildClinicalPdfHtml(input: {
  clinicName: string;
  patient: Record<string, unknown>;
  owner: Record<string, unknown> | null;
  entries: Array<Record<string, unknown>>;
  vaccinations: Array<Record<string, unknown>>;
  labOrders?: Array<Record<string, unknown>>;
  surgeries?: Array<Record<string, unknown>>;
  prescriptions?: Array<Record<string, unknown>>;
  prescriptionItems?: Array<Record<string, unknown>>;
  hospitalizations?: Array<Record<string, unknown>>;
  exportedAt: string;
}) {
  const entriesHtml = input.entries
    .map((entry) => {
      const provenance =
        entry.source_system || entry.original_professional_name
          ? `<p><em>Registro importado${
              entry.source_system ? ` · Origen: ${String(entry.source_system)}` : ''
            }${
              entry.original_professional_name
                ? ` · Profesional original: ${String(entry.original_professional_name)}`
                : ''
            }${
              entry.original_created_at
                ? ` · Fecha original: ${String(entry.original_created_at)}`
                : ''
            }</em></p>`
          : '';
      return `<section style="margin-bottom:16px;padding-bottom:12px;border-bottom:1px solid #ddd">
        <h3>${String(entry.entry_date ?? '')} · ${String(entry.entry_type ?? '')}</h3>
        <p><strong>${String(entry.title ?? 'Evolución')}</strong></p>
        ${entry.anamnesis ? `<p><strong>Anamnesis:</strong> ${String(entry.anamnesis)}</p>` : ''}
        ${entry.physical_exam ? `<p><strong>Examen:</strong> ${String(entry.physical_exam)}</p>` : ''}
        ${entry.diagnosis ? `<p><strong>Diagnóstico:</strong> ${String(entry.diagnosis)}</p>` : ''}
        ${entry.treatment ? `<p><strong>Tratamiento:</strong> ${String(entry.treatment)}</p>` : ''}
        ${entry.plan ? `<p><strong>Plan:</strong> ${String(entry.plan)}</p>` : ''}
        ${provenance}
      </section>`;
    })
    .join('\n');

  const itemsByRx = new Map<string, Array<Record<string, unknown>>>();
  for (const item of input.prescriptionItems ?? []) {
    const key = String(item.prescription_id ?? '');
    if (!key) continue;
    const list = itemsByRx.get(key) ?? [];
    list.push(item);
    itemsByRx.set(key, list);
  }

  const labHtml = (input.labOrders ?? [])
    .map(
      (row) =>
        `<li>${String(row.ordered_at ?? '')} — ${String(row.title ?? '')} (${String(row.status ?? '')})${
          row.interpretation ? `: ${String(row.interpretation)}` : ''
        }</li>`
    )
    .join('');
  const surgeryHtml = (input.surgeries ?? [])
    .map(
      (row) =>
        `<li>${String(row.scheduled_at ?? '')} — ${String(row.procedure_name ?? '')} (${String(row.status ?? '')})</li>`
    )
    .join('');
  const rxHtml = (input.prescriptions ?? [])
    .map((row) => {
      const items = itemsByRx.get(String(row.id ?? '')) ?? [];
      const itemsHtml = items
        .map(
          (item) =>
            `<li>${String(item.medication_name ?? '')} · ${String(item.dose ?? '')} · ${String(item.frequency ?? '')}${
              item.duration ? ` · ${String(item.duration)}` : ''
            }</li>`
        )
        .join('');
      return `<section style="margin-bottom:12px">
        <p><strong>${String(row.prescribed_at ?? '')}</strong> · ${String(row.status ?? '')}</p>
        ${itemsHtml ? `<ul>${itemsHtml}</ul>` : '<p class="meta">Sin ítems</p>'}
        ${row.notes ? `<p>${String(row.notes)}</p>` : ''}
      </section>`;
    })
    .join('');
  const hospHtml = (input.hospitalizations ?? [])
    .map(
      (row) =>
        `<li>${String(row.admitted_at ?? '')} → ${String(row.discharged_at ?? '—')} · ${String(row.reason ?? '')}${
          row.diagnosis ? ` · ${String(row.diagnosis)}` : ''
        }</li>`
    )
    .join('');

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <title>Historia clínica — ${String(input.patient.name ?? '')}</title>
  <style>
    body { font-family: Georgia, serif; color: #111; margin: 32px; }
    h1,h2,h3 { font-family: Arial, sans-serif; }
    .meta { color: #444; font-size: 14px; }
  </style>
</head>
<body>
  <h1>${input.clinicName}</h1>
  <p class="meta">Exportado: ${input.exportedAt}</p>
  <h2>Paciente: ${String(input.patient.name ?? '')}</h2>
  <p class="meta">
    Especie: ${String(input.patient.species ?? '')}
    · Sexo: ${String(input.patient.sex ?? '')}
    · Nacimiento: ${String(input.patient.birth_date ?? '—')}
    · Microchip: ${String(input.patient.microchip ?? '—')}
  </p>
  <h2>Propietario</h2>
  <p class="meta">${String(input.owner?.full_name ?? '—')} · ${String(input.owner?.phone ?? '')} · ${String(input.owner?.email ?? '')}</p>
  <h2>Historia clínica</h2>
  ${entriesHtml || '<p>Sin evoluciones.</p>'}
  <h2>Vacunaciones</h2>
  <ul>
    ${input.vaccinations
      .map(
        (v) =>
          `<li>${String(v.administered_at ?? '')} — ${String(v.vaccine_name ?? '')}${
            v.next_due_at ? ` (próxima: ${String(v.next_due_at)})` : ''
          }</li>`
      )
      .join('')}
  </ul>
  <h2>Laboratorio</h2>
  <ul>${labHtml || '<li>Sin órdenes.</li>'}</ul>
  <h2>Cirugías</h2>
  <ul>${surgeryHtml || '<li>Sin cirugías.</li>'}</ul>
  <h2>Recetas</h2>
  ${rxHtml || '<p>Sin recetas.</p>'}
  <h2>Internaciones</h2>
  <ul>${hospHtml || '<li>Sin internaciones.</li>'}</ul>
</body>
</html>`;
}

export async function runExportJob(
  jobId: string,
  options?: { asService?: boolean }
): Promise<{
  jobId: string;
  filename: string;
  contentType: string;
  body: string | Uint8Array;
  recordCounts: Record<string, number>;
  storagePath?: string | null;
}> {
  let organizationId: string;
  let userId: string | null;
  let supabase: Awaited<ReturnType<typeof migrationDb>>;

  if (options?.asService) {
    const { createServiceClient } = await import('@/lib/supabase/server');
    supabase = (await createServiceClient()) as unknown as Awaited<ReturnType<typeof migrationDb>>;
    const { data: jobRow, error: jobErr } = await supabase
      .from('data_export_jobs')
      .select('*')
      .eq('id', jobId)
      .single();
    if (jobErr || !jobRow) throw new Error(jobErr?.message ?? 'Export no encontrado');
    organizationId = String(jobRow.organization_id);
    userId = (jobRow.created_by as string | null) ?? null;
  } else {
    const session = await requirePermission('data:export');
    organizationId = session.organizationId;
    userId = session.userId;
    supabase = await migrationDb();
  }

  const { data: job, error } = await supabase
    .from('data_export_jobs')
    .select('*')
    .eq('id', jobId)
    .eq('organization_id', organizationId)
    .single();
  if (error || !job) throw new Error(error?.message ?? 'Export no encontrado');

  await supabase
    .from('data_export_jobs')
    .update({ status: 'running', started_at: new Date().toISOString() })
    .eq('id', jobId);

  try {
    const { data: org } = await supabase
      .from('organizations')
      .select('name')
      .eq('id', organizationId)
      .single();

    const bounds = normalizeExportDateRange({
      dateFrom: job.date_from,
      dateTo: job.date_to,
    });
    const exportType = String(job.export_type) as ExportType;
    const specialtyOnly = isSpecialtyExportType(exportType);
    const writeFullBundle =
      exportType === 'full_clinic' || exportType === 'patient_clinical';

    await supabase
      .from('data_export_jobs')
      .update({ progress_message: 'Leyendo registros del tenant…' })
      .eq('id', jobId);

    const needBranches = exportType === 'branches' || exportType === 'full_clinic';
    const needCash = exportType === 'cash_sessions' || exportType === 'full_clinic';
    const needInventoryMovements =
      exportType === 'inventory_movements' || exportType === 'full_clinic';
    const needClinicalImagesMeta =
      exportType === 'clinical_images' ||
      exportType === 'full_clinic' ||
      exportType === 'patient_clinical';
    const needStaff = exportType === 'staff_profiles' || exportType === 'full_clinic';
    const needReminders = exportType === 'reminder_logs' || exportType === 'full_clinic';
    const needWhatsApp = exportType === 'whatsapp_messages' || exportType === 'full_clinic';
    const needAudit = exportType === 'audit_logs' || exportType === 'full_clinic';
    const needNotifications =
      exportType === 'notifications' || exportType === 'full_clinic';
    const needPatients =
      exportType !== 'owners' &&
      exportType !== 'branches' &&
      exportType !== 'cash_sessions' &&
      exportType !== 'inventory_movements' &&
      exportType !== 'clinical_images' &&
      exportType !== 'staff_profiles' &&
      exportType !== 'reminder_logs' &&
      exportType !== 'whatsapp_messages' &&
      exportType !== 'audit_logs' &&
      exportType !== 'notifications' &&
      exportType !== 'invoices' &&
      exportType !== 'payments' &&
      (exportType === 'patients' ||
        exportType === 'full_clinic' ||
        exportType === 'patient_clinical' ||
        exportType === 'clinical_entries' ||
        exportType === 'vaccinations' ||
        exportType === 'appointments' ||
        exportType === 'consultations' ||
        specialtyOnly);
    const needOwners =
      exportType === 'owners' ||
      exportType === 'full_clinic' ||
      exportType === 'patient_clinical' ||
      exportType === 'patients' ||
      exportType === 'appointments' ||
      exportType === 'consultations';
    const needClinical =
      exportType === 'clinical_entries' ||
      exportType === 'patient_clinical' ||
      exportType === 'full_clinic';
    const needVaccinations =
      exportType === 'vaccinations' ||
      exportType === 'patient_clinical' ||
      exportType === 'full_clinic';
    const needLab =
      exportType === 'lab_orders' || exportType === 'full_clinic' || exportType === 'patient_clinical';
    const needSurgeries =
      exportType === 'surgeries' || exportType === 'full_clinic' || exportType === 'patient_clinical';
    const needRx =
      exportType === 'prescriptions' ||
      exportType === 'full_clinic' ||
      exportType === 'patient_clinical';
    const needHosp =
      exportType === 'hospitalizations' ||
      exportType === 'full_clinic' ||
      exportType === 'patient_clinical';
    const needAppointments =
      exportType === 'appointments' ||
      exportType === 'full_clinic' ||
      exportType === 'patient_clinical';
    const needConsultations =
      exportType === 'consultations' ||
      exportType === 'full_clinic' ||
      exportType === 'patient_clinical';
    const needInventory =
      exportType === 'inventory_products' || exportType === 'full_clinic';
    const needInvoices =
      exportType === 'invoices' ||
      exportType === 'payments' ||
      exportType === 'full_clinic' ||
      exportType === 'patient_clinical';

    const branches = needBranches ? await fetchBranches(organizationId, supabase) : [];
    const owners = needOwners ? await fetchOwners(organizationId, supabase) : [];
    const patients = needPatients ? await fetchPatients(organizationId, supabase) : [];
    const clinical = needClinical
      ? await fetchClinicalEntries(organizationId, job.patient_id, bounds, supabase)
      : [];
    const vaccinations = needVaccinations
      ? await fetchVaccinations(organizationId, job.patient_id, bounds, supabase)
      : [];
    const labOrders = needLab
      ? await fetchLabOrders(organizationId, job.patient_id, bounds, supabase)
      : [];
    const labOrderItems = needLab
      ? await fetchLabOrderItems(
          organizationId,
          labOrders.map((row: { id: string }) => row.id),
          supabase
        )
      : [];
    const surgeries = needSurgeries
      ? await fetchSurgeries(organizationId, job.patient_id, bounds, supabase)
      : [];
    const prescriptions = needRx
      ? await fetchPrescriptions(organizationId, job.patient_id, bounds, supabase)
      : [];
    const prescriptionItems = needRx
      ? await fetchPrescriptionItems(
          organizationId,
          prescriptions.map((row: { id: string }) => row.id),
          supabase
        )
      : [];
    const hospitalizations = needHosp
      ? await fetchHospitalizations(organizationId, job.patient_id, bounds, supabase)
      : [];
    const hospitalizationNotes = needHosp
      ? await fetchHospitalizationNotes(
          organizationId,
          hospitalizations.map((row: { id: string }) => row.id),
          supabase
        )
      : [];
    const appointments = needAppointments
      ? await fetchAppointments(organizationId, job.patient_id, bounds, supabase)
      : [];
    const consultations = needConsultations
      ? await fetchConsultations(organizationId, job.patient_id, bounds, supabase)
      : [];
    const inventoryProducts = needInventory
      ? await fetchInventoryProducts(organizationId, supabase)
      : [];
    const invoices = needInvoices
      ? await fetchInvoices(organizationId, job.patient_id, bounds, supabase)
      : [];
    const invoiceItems = needInvoices
      ? await fetchInvoiceItems(
          organizationId,
          invoices.map((row: { id: string }) => row.id),
          supabase
        )
      : [];
    const invoicePayments = needInvoices
      ? await fetchInvoicePayments(
          organizationId,
          invoices.map((row: { id: string }) => row.id),
          supabase
        )
      : [];
    const cashSessions = needCash
      ? await fetchCashSessions(organizationId, bounds, supabase)
      : [];
    const cashMovements = needCash
      ? await fetchCashMovements(
          organizationId,
          cashSessions.map((row: { id: string }) => row.id),
          supabase
        )
      : [];
    const inventoryMovements = needInventoryMovements
      ? await fetchInventoryMovements(organizationId, bounds, supabase)
      : [];
    const clinicalImagesMeta = needClinicalImagesMeta
      ? await fetchClinicalImagesCatalog(organizationId, job.patient_id, bounds, supabase)
      : [];
    const reminderLogs = needReminders
      ? await fetchReminderLogs(organizationId, bounds, supabase)
      : [];
    const whatsappMessages = needWhatsApp
      ? await fetchWhatsAppMessages(organizationId, bounds, supabase)
      : [];
    const auditLogs = needAudit ? await fetchAuditLogs(organizationId, bounds, supabase) : [];
    const notifications = needNotifications
      ? await fetchNotifications(organizationId, bounds, supabase)
      : [];
    const staffProfiles = needStaff ? await fetchStaffProfiles(organizationId, supabase) : [];
    const staffMemberships = needStaff
      ? await fetchStaffMemberships(organizationId, supabase)
      : [];

    const filteredPatients = job.patient_id
      ? patients.filter((p: { id: string }) => p.id === job.patient_id)
      : patients;
    const filteredOwners =
      job.patient_id && filteredPatients[0]
        ? owners.filter((o: { id: string }) => o.id === filteredPatients[0]!.owner_id)
        : owners;

    const recordCounts: Record<string, number> = {
      branches: branches.length,
      owners: filteredOwners.length,
      patients: filteredPatients.length,
      clinicalEntries: clinical.length,
      vaccinations: vaccinations.length,
      labOrders: labOrders.length,
      labOrderItems: labOrderItems.length,
      surgeries: surgeries.length,
      prescriptions: prescriptions.length,
      prescriptionItems: prescriptionItems.length,
      hospitalizations: hospitalizations.length,
      hospitalizationNotes: hospitalizationNotes.length,
      appointments: appointments.length,
      consultations: consultations.length,
      inventoryProducts: inventoryProducts.length,
      invoices: invoices.length,
      invoiceItems: invoiceItems.length,
      invoicePayments: invoicePayments.length,
      cashSessions: cashSessions.length,
      cashMovements: cashMovements.length,
      inventoryMovements: inventoryMovements.length,
      clinicalImages: clinicalImagesMeta.length,
      reminderLogs: reminderLogs.length,
      whatsappMessages: whatsappMessages.length,
      auditLogs: auditLogs.length,
      notifications: notifications.length,
      staffProfiles: staffProfiles.length,
      staffMemberships: staffMemberships.length,
    };

    const manifest = {
      format: DATA_MIGRATION_FORMAT,
      version: DATA_MIGRATION_FORMAT_VERSION,
      createdAt: new Date().toISOString(),
      organizationId: organizationId,
      organizationName: org?.name ?? null,
      exportType: job.export_type,
      dateFrom: bounds.dateFrom,
      dateTo: bounds.dateTo,
      generatedBy: userId,
      entities: recordCounts,
    };

    let body: string | Uint8Array;
    let filename: string;
    let contentType: string;

    const specialtyRows =
      exportType === 'branches'
        ? branches
        : exportType === 'owners'
          ? filteredOwners
          : exportType === 'patients'
            ? filteredPatients
            : exportType === 'clinical_entries'
              ? clinical
              : exportType === 'lab_orders'
        ? labOrders
        : exportType === 'surgeries'
          ? surgeries
          : exportType === 'prescriptions'
            ? prescriptions
            : exportType === 'hospitalizations'
              ? hospitalizations
              : exportType === 'vaccinations'
                ? vaccinations
                : exportType === 'appointments'
                  ? appointments
                  : exportType === 'consultations'
                    ? consultations
                    : exportType === 'inventory_products'
                    ? inventoryProducts
                    : exportType === 'invoices'
                      ? invoices
                      : exportType === 'payments'
                        ? invoicePayments
                        : exportType === 'cash_sessions'
                          ? cashSessions
                          : exportType === 'inventory_movements'
                            ? inventoryMovements
                          : exportType === 'clinical_images'
                            ? clinicalImagesMeta
                          : exportType === 'staff_profiles'
                            ? staffProfiles
                            : exportType === 'reminder_logs'
                            ? reminderLogs
                            : exportType === 'whatsapp_messages'
                              ? whatsappMessages
                              : exportType === 'audit_logs'
                                ? auditLogs
                                : exportType === 'notifications'
                                  ? notifications
                                  : null;

    if (job.format === 'json') {
      const companionRowsByBasename: Record<string, unknown> = {
        cash_movements: cashMovements,
        invoice_items: invoiceItems,
        invoice_payments: invoicePayments,
        staff_memberships: staffMemberships,
        lab_order_items: labOrderItems,
        prescription_items: prescriptionItems,
        hospitalization_notes: hospitalizationNotes,
      };
      const payload =
        writeFullBundle || !specialtyRows
          ? {
              manifest,
              branches,
              owners: filteredOwners,
              patients: filteredPatients,
              clinicalEntries: clinical,
              vaccinations,
              labOrders,
              labOrderItems,
              surgeries,
              prescriptions,
              prescriptionItems,
              hospitalizations,
              hospitalizationNotes,
              appointments,
              consultations,
              inventoryProducts,
              invoices,
              invoiceItems,
              invoicePayments,
              cashSessions,
              cashMovements,
              inventoryMovements,
              clinicalImages: clinicalImagesMeta,
              staffProfiles,
              staffMemberships,
              reminderLogs,
              whatsappMessages,
              auditLogs,
              notifications,
            }
          : buildFocusedExportJsonPayload({
              exportType,
              manifest,
              primaryRows: specialtyRows,
              companionRowsByBasename,
            });
      body = JSON.stringify(payload, null, 2);
      filename = `syncvete-export-${job.export_type}-${Date.now()}.json`;
      contentType = 'application/json;charset=utf-8';
    } else if (job.format === 'csv' || job.format === 'xlsx') {
      let csv: string;
      if (exportType === 'branches') {
        csv = toCsv(
          [
            'id',
            'name',
            'code',
            'address',
            'phone',
            'email',
            'timezone',
            'is_active',
            'is_main',
            'source_system',
            'source_record_id',
          ],
          branches
        );
      } else if (exportType === 'owners') {
        csv = toCsv(
          [
            'id',
            'full_name',
            'document_type',
            'document_number',
            'phone',
            'email',
            'city',
            'source_record_id',
            'external_branch_id',
          ],
          filteredOwners.map((row: Record<string, unknown>) => withExternalBranch(row))
        );
      } else if (exportType === 'patients') {
        csv = toCsv(
          [
            'id',
            'owner_id',
            'name',
            'species',
            'breed',
            'sex',
            'birth_date',
            'microchip',
            'source_record_id',
            'external_branch_id',
          ],
          filteredPatients.map((row: Record<string, unknown>) => withExternalBranch(row))
        );
      } else if (exportType === 'vaccinations') {
        csv = toCsv(
          [
            'id',
            'patient_id',
            'vaccine_name',
            'administered_at',
            'next_due_at',
            'manufacturer',
            'lot_number',
            'source_record_id',
            'external_branch_id',
            'external_assigned_user_id',
          ],
          vaccinations.map((row: Record<string, unknown>) =>
            withExternalBranchAndStaff(row, 'veterinarian_id')
          )
        );
      } else if (exportType === 'lab_orders') {
        const labById = new Map(
          labOrders.map((row: { id: string }) => [row.id, row] as const)
        );
        csv = toCsv(
          [
            'lab_order_id',
            'patient_id',
            'ordered_at',
            'title',
            'status',
            'test_name',
            'result_value',
            'result_unit',
            'reference_range',
            'flag',
            'source_record_id',
            'external_branch_id',
            'external_assigned_user_id',
          ],
          labOrderItems.length > 0
            ? labOrderItems.map((item: Record<string, unknown>) => {
                const order = labById.get(String(item.lab_order_id)) as
                  | Record<string, unknown>
                  | undefined;
                return {
                  lab_order_id: item.lab_order_id,
                  patient_id: order?.patient_id ?? '',
                  ordered_at: order?.ordered_at ?? '',
                  title: order?.title ?? '',
                  status: order?.status ?? '',
                  test_name: item.test_name,
                  result_value: item.result_value ?? '',
                  result_unit: item.unit ?? '',
                  reference_range: item.reference_range ?? '',
                  flag: item.flag ?? '',
                  source_record_id: order?.source_record_id ?? '',
                  external_branch_id: order?.branch_id ?? '',
                  external_assigned_user_id: order?.ordered_by ?? '',
                };
              })
            : labOrders.map((order: Record<string, unknown>) => ({
                lab_order_id: order.id,
                patient_id: order.patient_id,
                ordered_at: order.ordered_at,
                title: order.title,
                status: order.status,
                test_name: '',
                result_value: '',
                result_unit: '',
                reference_range: '',
                flag: '',
                source_record_id: order.source_record_id ?? '',
                external_branch_id: order.branch_id ?? '',
                external_assigned_user_id: order.ordered_by ?? '',
              }))
        );
      } else if (exportType === 'surgeries') {
        csv = toCsv(
          [
            'id',
            'patient_id',
            'procedure_name',
            'status',
            'scheduled_at',
            'notes',
            'source_record_id',
            'external_branch_id',
            'external_assigned_user_id',
          ],
          surgeries.map((row: Record<string, unknown>) =>
            withExternalBranchAndStaff(row, 'surgeon_id')
          )
        );
      } else if (exportType === 'prescriptions') {
        const rxById = new Map(
          prescriptions.map((row: { id: string }) => [row.id, row] as const)
        );
        csv = toCsv(
          [
            'prescription_id',
            'patient_id',
            'prescribed_at',
            'status',
            'medication_name',
            'dose',
            'frequency',
            'duration',
            'route',
            'quantity',
            'instructions',
            'source_record_id',
            'external_branch_id',
            'external_assigned_user_id',
          ],
          prescriptionItems.length > 0
            ? prescriptionItems.map((item: Record<string, unknown>) => {
                const rx = rxById.get(String(item.prescription_id)) as
                  | Record<string, unknown>
                  | undefined;
                return {
                  prescription_id: item.prescription_id,
                  patient_id: rx?.patient_id ?? '',
                  prescribed_at: rx?.prescribed_at ?? '',
                  status: rx?.status ?? '',
                  medication_name: item.medication_name,
                  dose: item.dose,
                  frequency: item.frequency,
                  duration: item.duration ?? '',
                  route: item.route ?? '',
                  quantity: item.quantity ?? '',
                  instructions: item.instructions ?? '',
                  source_record_id: rx?.source_record_id ?? '',
                  external_branch_id: rx?.branch_id ?? '',
                  external_assigned_user_id: rx?.prescribed_by ?? '',
                };
              })
            : prescriptions.map((rx: Record<string, unknown>) => ({
                prescription_id: rx.id,
                patient_id: rx.patient_id,
                prescribed_at: rx.prescribed_at,
                status: rx.status,
                medication_name: '',
                dose: '',
                frequency: '',
                duration: '',
                route: '',
                quantity: '',
                instructions: '',
                source_record_id: rx.source_record_id ?? '',
                external_branch_id: rx.branch_id ?? '',
                external_assigned_user_id: rx.prescribed_by ?? '',
              }))
        );
      } else if (exportType === 'hospitalizations') {
        const hospById = new Map(
          hospitalizations.map((row: { id: string }) => [row.id, row] as const)
        );
        csv = toCsv(
          [
            'hospitalization_id',
            'patient_id',
            'status',
            'admitted_at',
            'discharged_at',
            'reason',
            'diagnosis',
            'cage',
            'note_id',
            'note_type',
            'note_content',
            'weight_kg',
            'temperature_c',
            'note_recorded_at',
            'note_recorded_by',
            'source_record_id',
            'external_branch_id',
            'external_assigned_user_id',
          ],
          hospitalizationNotes.length > 0
            ? hospitalizationNotes.map((note: Record<string, unknown>) => {
                const hosp = hospById.get(String(note.hospitalization_id)) as
                  | Record<string, unknown>
                  | undefined;
                const withIds = (
                  hosp
                    ? withExternalBranchAndStaff(hosp, 'veterinarian_id')
                    : {
                        external_branch_id: '',
                        external_assigned_user_id: '',
                      }
                ) as Record<string, unknown>;
                return {
                  hospitalization_id: note.hospitalization_id,
                  patient_id: hosp?.patient_id ?? '',
                  status: hosp?.status ?? '',
                  admitted_at: hosp?.admitted_at ?? '',
                  discharged_at: hosp?.discharged_at ?? '',
                  reason: hosp?.reason ?? '',
                  diagnosis: hosp?.diagnosis ?? '',
                  cage: hosp?.cage ?? '',
                  note_id: note.id ?? '',
                  note_type: note.note_type ?? '',
                  note_content: note.content ?? '',
                  weight_kg: note.weight_kg ?? '',
                  temperature_c: note.temperature_c ?? '',
                  note_recorded_at: note.recorded_at ?? '',
                  note_recorded_by: note.recorded_by ?? '',
                  source_record_id: hosp?.source_record_id ?? '',
                  external_branch_id: withIds.external_branch_id ?? '',
                  external_assigned_user_id: withIds.external_assigned_user_id ?? '',
                };
              })
            : hospitalizations.map((row: Record<string, unknown>) => {
                const withIds = withExternalBranchAndStaff(row, 'veterinarian_id') as Record<
                  string,
                  unknown
                >;
                return {
                  hospitalization_id: row.id,
                  patient_id: row.patient_id,
                  status: row.status,
                  admitted_at: row.admitted_at,
                  discharged_at: row.discharged_at ?? '',
                  reason: row.reason ?? '',
                  diagnosis: row.diagnosis ?? '',
                  cage: row.cage ?? '',
                  note_id: '',
                  note_type: '',
                  note_content: '',
                  weight_kg: '',
                  temperature_c: '',
                  note_recorded_at: '',
                  note_recorded_by: '',
                  source_record_id: row.source_record_id ?? '',
                  external_branch_id: withIds.external_branch_id ?? '',
                  external_assigned_user_id: withIds.external_assigned_user_id ?? '',
                };
              })
        );
      } else if (exportType === 'appointments') {
        csv = toCsv(
          [
            'id',
            'patient_id',
            'owner_id',
            'starts_at',
            'ends_at',
            'status',
            'appointment_type',
            'title',
            'notes',
            'cancellation_reason',
            'external_branch_id',
            'external_assigned_user_id',
          ],
          appointments.map((row: Record<string, unknown>) =>
            withExternalStaff(withExternalBranch(row), 'assigned_user_id')
          )
        );
      } else if (exportType === 'consultations') {
        csv = toCsv(
          [
            'id',
            'patient_id',
            'owner_id',
            'appointment_id',
            'started_at',
            'completed_at',
            'status',
            'title',
            'anamnesis',
            'physical_exam',
            'diagnosis',
            'treatment',
            'plan',
            'weight_kg',
            'temperature_c',
            'notes',
            'source_system',
            'source_record_id',
            'external_branch_id',
            'external_assigned_user_id',
          ],
          consultations.map((row: Record<string, unknown>) =>
            withExternalBranchAndStaff(row, 'veterinarian_id')
          )
        );
      } else if (exportType === 'inventory_products') {
        csv = toCsv(
          [
            'id',
            'branch_id',
            'name',
            'sku',
            'category',
            'unit',
            'quantity',
            'min_quantity',
            'unit_cost',
            'unit_price',
            'manufacturer',
            'is_active',
            'notes',
          ],
          inventoryProducts
        );
      } else if (exportType === 'invoices') {
        const invById = new Map(invoices.map((row: { id: string }) => [row.id, row] as const));
        csv = toCsv(
          [
            'invoice_id',
            'number',
            'status',
            'owner_id',
            'patient_id',
            'issued_at',
            'currency',
            'total',
            'paid_amount',
            'balance',
            'description',
            'quantity',
            'unit_price',
            'line_total',
            'inventory_product_id',
            'external_branch_id',
            'external_assigned_user_id',
          ],
          invoiceItems.length > 0
            ? invoiceItems.map((item: Record<string, unknown>) => {
                const inv = invById.get(String(item.invoice_id)) as
                  | Record<string, unknown>
                  | undefined;
                return {
                  invoice_id: item.invoice_id,
                  number: inv?.number ?? '',
                  status: inv?.status ?? '',
                  owner_id: inv?.owner_id ?? '',
                  patient_id: inv?.patient_id ?? '',
                  issued_at: inv?.issued_at ?? '',
                  currency: inv?.currency ?? '',
                  total: inv?.total ?? '',
                  paid_amount: inv?.paid_amount ?? '',
                  balance: inv?.balance ?? '',
                  description: item.description,
                  quantity: item.quantity,
                  unit_price: item.unit_price,
                  line_total: item.line_total,
                  inventory_product_id: item.inventory_product_id ?? '',
                  ...withExternalBranchAndStaff(inv ?? {}, 'created_by'),
                };
              })
            : invoices.map((inv: Record<string, unknown>) => ({
                invoice_id: inv.id,
                number: inv.number ?? '',
                status: inv.status,
                owner_id: inv.owner_id,
                patient_id: inv.patient_id ?? '',
                issued_at: inv.issued_at ?? '',
                currency: inv.currency,
                total: inv.total,
                paid_amount: inv.paid_amount,
                balance: inv.balance,
                description: '',
                quantity: '',
                unit_price: '',
                line_total: '',
                inventory_product_id: '',
                ...withExternalBranchAndStaff(inv, 'created_by'),
              }))
        );
      } else if (exportType === 'payments') {
        const invById = new Map(invoices.map((row: { id: string }) => [row.id, row] as const));
        csv = toCsv(
          [
            'payment_id',
            'invoice_id',
            'invoice_number',
            'method',
            'amount',
            'paid_at',
            'reference',
            'notes',
            'external_assigned_user_id',
          ],
          invoicePayments.map((pay: Record<string, unknown>) => {
            const inv = invById.get(String(pay.invoice_id)) as Record<string, unknown> | undefined;
            return {
              payment_id: pay.id,
              invoice_id: pay.invoice_id,
              invoice_number: inv?.number ?? '',
              method: pay.method,
              amount: pay.amount,
              paid_at: pay.paid_at,
              reference: pay.reference ?? '',
              notes: pay.notes ?? '',
              external_assigned_user_id: pay.recorded_by ?? '',
            };
          })
        );
      } else if (exportType === 'cash_sessions') {
        const sessionById = new Map(
          cashSessions.map((row: { id: string }) => [row.id, row] as const)
        );
        csv = toCsv(
          [
            'cash_session_id',
            'branch_id',
            'status',
            'opened_at',
            'closed_at',
            'opening_amount',
            'expected_cash',
            'counted_cash',
            'difference',
            'opened_by',
            'closed_by',
            'notes',
            'close_notes',
            'movement_id',
            'payment_id',
            'kind',
            'method',
            'amount',
            'movement_notes',
            'movement_created_at',
          ],
          cashMovements.length > 0
            ? cashMovements.map((mov: Record<string, unknown>) => {
                const session = sessionById.get(String(mov.cash_session_id)) as
                  | Record<string, unknown>
                  | undefined;
                return {
                  cash_session_id: mov.cash_session_id,
                  branch_id: session?.branch_id ?? '',
                  status: session?.status ?? '',
                  opened_at: session?.opened_at ?? '',
                  closed_at: session?.closed_at ?? '',
                  opening_amount: session?.opening_amount ?? '',
                  expected_cash: session?.expected_cash ?? '',
                  counted_cash: session?.counted_cash ?? '',
                  difference: session?.difference ?? '',
                  opened_by: session?.opened_by ?? '',
                  closed_by: session?.closed_by ?? '',
                  notes: session?.notes ?? '',
                  close_notes: session?.close_notes ?? '',
                  movement_id: mov.id,
                  payment_id: mov.payment_id ?? '',
                  kind: mov.kind,
                  method: mov.method,
                  amount: mov.amount,
                  movement_notes: mov.notes ?? '',
                  movement_created_at: mov.created_at,
                };
              })
            : cashSessions.map((session: Record<string, unknown>) => ({
                cash_session_id: session.id,
                branch_id: session.branch_id,
                status: session.status,
                opened_at: session.opened_at,
                closed_at: session.closed_at ?? '',
                opening_amount: session.opening_amount,
                expected_cash: session.expected_cash ?? '',
                counted_cash: session.counted_cash ?? '',
                difference: session.difference ?? '',
                opened_by: session.opened_by ?? '',
                closed_by: session.closed_by ?? '',
                notes: session.notes ?? '',
                close_notes: session.close_notes ?? '',
                movement_id: '',
                payment_id: '',
                kind: '',
                method: '',
                amount: '',
                movement_notes: '',
                movement_created_at: '',
              }))
        );
      } else if (exportType === 'inventory_movements') {
        csv = toCsv(
          [
            'id',
            'branch_id',
            'product_id',
            'movement_type',
            'quantity',
            'quantity_before',
            'quantity_after',
            'lot_number',
            'expires_at',
            'reason',
            'performed_by',
            'created_at',
          ],
          inventoryMovements
        );
      } else if (exportType === 'clinical_images') {
        csv = toCsv(
          [
            'id',
            'patient_id',
            'owner_id',
            'branch_id',
            'consultation_id',
            'clinical_entry_id',
            'uploaded_by',
            'kind',
            'title',
            'notes',
            'original_name',
            'mime_type',
            'file_size',
            'storage_path',
            'taken_at',
            'created_at',
            'external_branch_id',
            'external_assigned_user_id',
          ],
          clinicalImagesMeta.map((row: Record<string, unknown>) =>
            withExternalBranchAndStaff(row, 'uploaded_by')
          )
        );
      } else if (exportType === 'staff_profiles') {
        const profileById = new Map(
          staffProfiles.map((row: { id: string }) => [row.id, row] as const)
        );
        csv = toCsv(
          [
            'profile_id',
            'full_name',
            'phone',
            'active_branch_id',
            'profile_is_active',
            'profile_created_at',
            'membership_id',
            'branch_id',
            'user_id',
            'role',
            'membership_is_active',
            'membership_created_at',
          ],
          staffMemberships.length > 0
            ? staffMemberships.map((mem: Record<string, unknown>) => {
                const profile = profileById.get(String(mem.user_id)) as
                  | Record<string, unknown>
                  | undefined;
                return {
                  profile_id: profile?.id ?? '',
                  full_name: profile?.full_name ?? '',
                  phone: profile?.phone ?? '',
                  active_branch_id: profile?.active_branch_id ?? '',
                  profile_is_active: profile?.is_active ?? '',
                  profile_created_at: profile?.created_at ?? '',
                  membership_id: mem.id,
                  branch_id: mem.branch_id,
                  user_id: mem.user_id,
                  role: mem.role,
                  membership_is_active: mem.is_active,
                  membership_created_at: mem.created_at,
                };
              })
            : staffProfiles.map((profile: Record<string, unknown>) => ({
                profile_id: profile.id,
                full_name: profile.full_name,
                phone: profile.phone ?? '',
                active_branch_id: profile.active_branch_id ?? '',
                profile_is_active: profile.is_active,
                profile_created_at: profile.created_at,
                membership_id: '',
                branch_id: '',
                user_id: profile.id,
                role: '',
                membership_is_active: '',
                membership_created_at: '',
              }))
        );
      } else if (exportType === 'reminder_logs') {
        csv = toCsv(
          [
            'id',
            'branch_id',
            'reminder_type',
            'related_id',
            'owner_id',
            'patient_id',
            'channel',
            'status',
            'due_on',
            'whatsapp_message_id',
            'sent_by',
            'sent_at',
            'created_at',
          ],
          reminderLogs
        );
      } else if (exportType === 'whatsapp_messages') {
        csv = toCsv(
          [
            'id',
            'branch_id',
            'owner_id',
            'patient_id',
            'related_type',
            'related_id',
            'template_key',
            'phone_e164',
            'body',
            'sent_by',
            'created_at',
          ],
          whatsappMessages
        );
      } else if (exportType === 'audit_logs') {
        csv = toCsv([...AUDIT_LOG_CSV_HEADERS], auditLogsForCsv(auditLogs));
      } else if (exportType === 'notifications') {
        csv = toCsv(
          [
            'id',
            'branch_id',
            'kind',
            'title',
            'body',
            'href',
            'related_type',
            'related_id',
            'created_at',
          ],
          notifications
        );
      } else {
        csv = toCsv(
          [
            'id',
            'patient_id',
            'entry_date',
            'entry_type',
            'title',
            'diagnosis',
            'treatment',
            'original_professional_name',
            'source_system',
            'external_branch_id',
            'external_assigned_user_id',
          ],
          clinical.map((row: Record<string, unknown>) =>
            withExternalBranchAndStaff(row, 'recorded_by')
          )
        );
      }

      if (job.format === 'csv') {
        body = csv;
        filename = `syncvete-export-${job.export_type}-${Date.now()}.csv`;
        contentType = 'text/csv;charset=utf-8';
      } else {
        const { csvTextToXlsxBase64 } = await import('./xlsx');
        const xlsx = csvTextToXlsxBase64(String(job.export_type), csv);
        body = Buffer.from(xlsx.base64, 'base64');
        filename = xlsx.filename;
        contentType =
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      }
    } else if (job.format === 'pdf') {
      const patient = filteredPatients[0] ?? {};
      const owner = filteredOwners[0] ?? null;
      body = buildClinicalPdfHtml({
        clinicName: org?.name ?? 'SyncVete',
        patient,
        owner,
        entries: clinical,
        vaccinations,
        labOrders,
        surgeries,
        prescriptions,
        prescriptionItems,
        hospitalizations,
        exportedAt: new Date().toISOString(),
      });
      filename = `syncvete-clinical-${String(patient.name ?? 'patient')}-${Date.now()}.html`;
      contentType = 'text/html;charset=utf-8';
    } else {
      const zip = new JSZip();
      zip.file('manifest.json', JSON.stringify(manifest, null, 2));
      const dataFolder = zip.folder('data');
      const labByIdForZip = new Map(
        labOrders.map((row: { id: string }) => [row.id, row] as const)
      );
      if (writeFullBundle) {
        dataFolder?.file(
          'branches.csv',
          toCsv(
            [
              'id',
              'name',
              'code',
              'address',
              'phone',
              'email',
              'timezone',
              'is_active',
              'is_main',
              'source_system',
              'source_record_id',
            ],
            branches
          )
        );
        dataFolder?.file(
          'owners.csv',
          toCsv(
            [
              'id',
              'full_name',
              'document_type',
              'document_number',
              'phone',
              'email',
              'address',
              'city',
              'province',
              'postal_code',
              'notes',
              'source_system',
              'source_record_id',
              'external_branch_id',
            ],
            filteredOwners.map((row: Record<string, unknown>) => withExternalBranch(row))
          )
        );
        dataFolder?.file(
          'patients.csv',
          toCsv(
            [
              'id',
              'owner_id',
              'name',
              'species',
              'breed',
              'sex',
              'birth_date',
              'microchip',
              'color',
              'notes',
              'source_system',
              'source_record_id',
              'external_branch_id',
            ],
            filteredPatients.map((row: Record<string, unknown>) => withExternalBranch(row))
          )
        );
        dataFolder?.file(
          'clinical_records.csv',
          toCsv(
            [
              'id',
              'patient_id',
              'entry_date',
              'entry_type',
              'title',
              'anamnesis',
              'physical_exam',
              'diagnosis',
              'treatment',
              'plan',
              'original_professional_name',
              'source_system',
              'source_record_id',
              'external_branch_id',
              'external_assigned_user_id',
            ],
            clinical.map((row: Record<string, unknown>) =>
              withExternalBranchAndStaff(row, 'recorded_by')
            )
          )
        );
        dataFolder?.file(
          'vaccinations.csv',
          toCsv(
            [
              'id',
              'patient_id',
              'vaccine_name',
              'administered_at',
              'next_due_at',
              'manufacturer',
              'lot_number',
              'notes',
              'source_system',
              'source_record_id',
              'external_branch_id',
              'external_assigned_user_id',
            ],
            vaccinations.map((row: Record<string, unknown>) =>
              withExternalBranchAndStaff(row, 'veterinarian_id')
            )
          )
        );
      }

      dataFolder?.file(
        'lab_orders.csv',
        toCsv(
          [
            'id',
            'patient_id',
            'title',
            'status',
            'priority',
            'sample_type',
            'ordered_at',
            'interpretation',
            'notes',
            'source_system',
            'source_record_id',
            'external_branch_id',
            'external_assigned_user_id',
          ],
          labOrders.map((row: Record<string, unknown>) =>
            withExternalBranchAndStaff(row, 'ordered_by')
          )
        )
      );
      dataFolder?.file(
        'lab_order_items.csv',
        toCsv(
          [
            'id',
            'lab_order_id',
            'test_name',
            'result_value',
            'unit',
            'reference_range',
            'flag',
            'sort_order',
            'external_branch_id',
            'external_assigned_user_id',
          ],
          labOrderItems.map((item: Record<string, unknown>) => {
            const order = labByIdForZip.get(String(item.lab_order_id)) as
              | Record<string, unknown>
              | undefined;
            return {
              ...item,
              external_branch_id: order?.branch_id ?? '',
              external_assigned_user_id: order?.ordered_by ?? '',
            };
          })
        )
      );
      dataFolder?.file(
        'surgeries.csv',
        toCsv(
          [
            'id',
            'patient_id',
            'procedure_name',
            'status',
            'scheduled_at',
            'notes',
            'source_system',
            'source_record_id',
            'external_branch_id',
            'external_assigned_user_id',
          ],
          surgeries.map((row: Record<string, unknown>) =>
            withExternalBranchAndStaff(row, 'surgeon_id')
          )
        )
      );
      dataFolder?.file(
        'prescriptions.csv',
        toCsv(
          [
            'id',
            'patient_id',
            'status',
            'prescribed_at',
            'notes',
            'source_system',
            'source_record_id',
            'external_branch_id',
            'external_assigned_user_id',
          ],
          prescriptions.map((row: Record<string, unknown>) =>
            withExternalBranchAndStaff(row, 'prescribed_by')
          )
        )
      );
      dataFolder?.file(
        'prescription_items.csv',
        toCsv(
          [
            'id',
            'prescription_id',
            'medication_name',
            'dose',
            'frequency',
            'duration',
            'route',
            'quantity',
            'instructions',
            'sort_order',
          ],
          prescriptionItems
        )
      );
      dataFolder?.file(
        'hospitalizations.csv',
        toCsv(
          [
            'id',
            'patient_id',
            'status',
            'admitted_at',
            'discharged_at',
            'reason',
            'diagnosis',
            'treatment_plan',
            'cage',
            'notes',
            'source_system',
            'source_record_id',
            'external_branch_id',
            'external_assigned_user_id',
          ],
          hospitalizations.map((row: Record<string, unknown>) =>
            withExternalBranchAndStaff(row, 'veterinarian_id')
          )
        )
      );
      dataFolder?.file(
        'hospitalization_notes.csv',
        toCsv(
          [
            'id',
            'hospitalization_id',
            'recorded_by',
            'recorded_at',
            'note_type',
            'content',
            'weight_kg',
            'temperature_c',
            'created_at',
          ],
          hospitalizationNotes
        )
      );
      dataFolder?.file(
        'appointments.csv',
        toCsv(
          [
            'id',
            'patient_id',
            'owner_id',
            'starts_at',
            'ends_at',
            'status',
            'appointment_type',
            'title',
            'notes',
            'cancellation_reason',
            'external_branch_id',
            'external_assigned_user_id',
          ],
          appointments.map((row: Record<string, unknown>) =>
            withExternalStaff(withExternalBranch(row), 'assigned_user_id')
          )
        )
      );
      dataFolder?.file(
        'consultations.csv',
        toCsv(
          [
            'id',
            'patient_id',
            'owner_id',
            'appointment_id',
            'started_at',
            'completed_at',
            'status',
            'title',
            'anamnesis',
            'physical_exam',
            'diagnosis',
            'treatment',
            'plan',
            'weight_kg',
            'temperature_c',
            'notes',
            'source_system',
            'source_record_id',
            'external_branch_id',
            'external_assigned_user_id',
          ],
          consultations.map((row: Record<string, unknown>) =>
            withExternalBranchAndStaff(row, 'veterinarian_id')
          )
        )
      );
      dataFolder?.file(
        'inventory_products.csv',
        toCsv(
          [
            'id',
            'branch_id',
            'name',
            'sku',
            'category',
            'unit',
            'quantity',
            'min_quantity',
            'unit_cost',
            'unit_price',
            'manufacturer',
            'is_active',
            'notes',
          ],
          inventoryProducts
        )
      );
      dataFolder?.file(
        'inventory_movements.csv',
        toCsv(
          [
            'id',
            'branch_id',
            'product_id',
            'movement_type',
            'quantity',
            'quantity_before',
            'quantity_after',
            'lot_number',
            'expires_at',
            'reason',
            'performed_by',
            'created_at',
          ],
          inventoryMovements
        )
      );
      dataFolder?.file(
        'clinical_images.csv',
        toCsv(
          [
            'id',
            'patient_id',
            'owner_id',
            'branch_id',
            'consultation_id',
            'clinical_entry_id',
            'uploaded_by',
            'kind',
            'title',
            'notes',
            'original_name',
            'mime_type',
            'file_size',
            'storage_path',
            'taken_at',
            'created_at',
            'external_branch_id',
            'external_assigned_user_id',
          ],
          clinicalImagesMeta.map((row: Record<string, unknown>) =>
            withExternalBranchAndStaff(row, 'uploaded_by')
          )
        )
      );
      dataFolder?.file(
        'invoices.csv',
        toCsv(
          [
            'id',
            'branch_id',
            'owner_id',
            'patient_id',
            'status',
            'number',
            'currency',
            'issued_at',
            'due_at',
            'paid_at',
            'voided_at',
            'subtotal',
            'tax_amount',
            'total',
            'paid_amount',
            'balance',
            'notes',
            'external_branch_id',
            'external_assigned_user_id',
          ],
          invoices.map((row: Record<string, unknown>) =>
            withExternalBranchAndStaff(row, 'created_by')
          )
        )
      );
      dataFolder?.file(
        'invoice_items.csv',
        toCsv(
          [
            'id',
            'invoice_id',
            'inventory_product_id',
            'description',
            'quantity',
            'unit_price',
            'line_total',
            'sort_order',
          ],
          invoiceItems
        )
      );
      dataFolder?.file(
        'invoice_payments.csv',
        toCsv(
          [
            'id',
            'invoice_id',
            'method',
            'amount',
            'paid_at',
            'reference',
            'notes',
            'external_assigned_user_id',
          ],
          invoicePayments.map((pay: Record<string, unknown>) =>
            withExternalStaff(pay, 'recorded_by')
          )
        )
      );
      dataFolder?.file(
        'cash_sessions.csv',
        toCsv(
          [
            'id',
            'branch_id',
            'opened_by',
            'closed_by',
            'status',
            'opening_amount',
            'expected_cash',
            'counted_cash',
            'difference',
            'notes',
            'close_notes',
            'opened_at',
            'closed_at',
            'created_at',
          ],
          cashSessions
        )
      );
      dataFolder?.file(
        'cash_movements.csv',
        toCsv(
          [
            'id',
            'cash_session_id',
            'payment_id',
            'recorded_by',
            'kind',
            'method',
            'amount',
            'notes',
            'created_at',
          ],
          cashMovements
        )
      );
      dataFolder?.file(
        'staff_profiles.csv',
        toCsv(
          [
            'id',
            'full_name',
            'phone',
            'active_branch_id',
            'is_active',
            'created_at',
          ],
          staffProfiles
        )
      );
      dataFolder?.file(
        'staff_memberships.csv',
        toCsv(
          ['id', 'branch_id', 'user_id', 'role', 'is_active', 'created_at'],
          staffMemberships
        )
      );
      dataFolder?.file(
        'reminder_logs.csv',
        toCsv(
          [
            'id',
            'branch_id',
            'reminder_type',
            'related_id',
            'owner_id',
            'patient_id',
            'channel',
            'status',
            'due_on',
            'whatsapp_message_id',
            'sent_by',
            'sent_at',
            'created_at',
          ],
          reminderLogs
        )
      );
      dataFolder?.file(
        'whatsapp_messages.csv',
        toCsv(
          [
            'id',
            'branch_id',
            'owner_id',
            'patient_id',
            'related_type',
            'related_id',
            'template_key',
            'phone_e164',
            'body',
            'sent_by',
            'created_at',
          ],
          whatsappMessages
        )
      );
      dataFolder?.file(
        'audit_logs.csv',
        toCsv([...AUDIT_LOG_CSV_HEADERS], auditLogsForCsv(auditLogs))
      );
      dataFolder?.file(
        'notifications.csv',
        toCsv(
          [
            'id',
            'branch_id',
            'kind',
            'title',
            'body',
            'href',
            'related_type',
            'related_id',
            'created_at',
          ],
          notifications
        )
      );

      if (specialtyRows && specialtyOnly) {
        dataFolder?.file(`${exportType}.json`, JSON.stringify(specialtyRows, null, 2));
        if (exportType === 'lab_orders') {
          dataFolder?.file(
            'lab_orders.csv',
            toCsv(
              [
                'id',
                'patient_id',
                'title',
                'status',
                'priority',
                'sample_type',
                'ordered_at',
                'interpretation',
                'notes',
                'source_system',
                'source_record_id',
                'external_branch_id',
                'external_assigned_user_id',
              ],
              labOrders.map((row: Record<string, unknown>) =>
                withExternalBranchAndStaff(row, 'ordered_by')
              )
            )
          );
          dataFolder?.file(
            'lab_order_items.csv',
            toCsv(
              [
                'id',
                'lab_order_id',
                'test_name',
                'result_value',
                'unit',
                'reference_range',
                'flag',
                'sort_order',
                'external_branch_id',
                'external_assigned_user_id',
              ],
              labOrderItems.map((item: Record<string, unknown>) => {
                const order = labByIdForZip.get(String(item.lab_order_id)) as
                  | Record<string, unknown>
                  | undefined;
                return {
                  ...item,
                  external_branch_id: order?.branch_id ?? '',
                  external_assigned_user_id: order?.ordered_by ?? '',
                };
              })
            )
          );
          dataFolder?.file('lab_order_items.json', JSON.stringify(labOrderItems, null, 2));
        } else if (exportType === 'prescriptions') {
          dataFolder?.file(
            'prescriptions.csv',
            toCsv(
              [
                'id',
                'patient_id',
                'status',
                'prescribed_at',
                'notes',
                'source_system',
                'source_record_id',
                'external_branch_id',
                'external_assigned_user_id',
              ],
              prescriptions.map((row: Record<string, unknown>) =>
                withExternalBranchAndStaff(row, 'prescribed_by')
              )
            )
          );
          dataFolder?.file(
            'prescription_items.csv',
            toCsv(
              [
                'id',
                'prescription_id',
                'medication_name',
                'dose',
                'frequency',
                'duration',
                'route',
                'quantity',
                'instructions',
                'sort_order',
              ],
              prescriptionItems
            )
          );
          dataFolder?.file('prescription_items.json', JSON.stringify(prescriptionItems, null, 2));
        } else if (exportType === 'surgeries') {
          dataFolder?.file(
            'surgeries.csv',
            toCsv(
              [
                'id',
                'patient_id',
                'procedure_name',
                'status',
                'scheduled_at',
                'notes',
                'source_system',
                'source_record_id',
                'external_branch_id',
                'external_assigned_user_id',
              ],
              surgeries.map((row: Record<string, unknown>) =>
                withExternalBranchAndStaff(row, 'surgeon_id')
              )
            )
          );
        } else if (exportType === 'hospitalizations') {
          dataFolder?.file(
            'hospitalizations.csv',
            toCsv(
              [
                'id',
                'patient_id',
                'status',
                'admitted_at',
                'discharged_at',
                'reason',
                'diagnosis',
                'treatment_plan',
                'cage',
                'notes',
                'source_system',
                'source_record_id',
                'external_branch_id',
                'external_assigned_user_id',
              ],
              hospitalizations.map((row: Record<string, unknown>) =>
                withExternalBranchAndStaff(row, 'veterinarian_id')
              )
            )
          );
          dataFolder?.file(
            'hospitalization_notes.csv',
            toCsv(
              [
                'id',
                'hospitalization_id',
                'recorded_by',
                'recorded_at',
                'note_type',
                'content',
                'weight_kg',
                'temperature_c',
                'created_at',
              ],
              hospitalizationNotes
            )
          );
          dataFolder?.file(
            'hospitalization_notes.json',
            JSON.stringify(hospitalizationNotes, null, 2)
          );
        }
      } else if (writeFullBundle) {
        dataFolder?.file('branches.json', JSON.stringify(branches, null, 2));
        dataFolder?.file('owners.json', JSON.stringify(filteredOwners, null, 2));
        dataFolder?.file('patients.json', JSON.stringify(filteredPatients, null, 2));
        dataFolder?.file('clinical-records.json', JSON.stringify(clinical, null, 2));
        dataFolder?.file('vaccinations.json', JSON.stringify(vaccinations, null, 2));
        dataFolder?.file('lab_orders.json', JSON.stringify(labOrders, null, 2));
        dataFolder?.file('lab_order_items.json', JSON.stringify(labOrderItems, null, 2));
        dataFolder?.file('surgeries.json', JSON.stringify(surgeries, null, 2));
        dataFolder?.file('prescriptions.json', JSON.stringify(prescriptions, null, 2));
        dataFolder?.file('prescription_items.json', JSON.stringify(prescriptionItems, null, 2));
        dataFolder?.file('hospitalizations.json', JSON.stringify(hospitalizations, null, 2));
        dataFolder?.file('hospitalization_notes.json', JSON.stringify(hospitalizationNotes, null, 2));
        dataFolder?.file('appointments.json', JSON.stringify(appointments, null, 2));
        dataFolder?.file('consultations.json', JSON.stringify(consultations, null, 2));
        dataFolder?.file('inventory_products.json', JSON.stringify(inventoryProducts, null, 2));
        dataFolder?.file('inventory_movements.json', JSON.stringify(inventoryMovements, null, 2));
        dataFolder?.file('clinical_images.json', JSON.stringify(clinicalImagesMeta, null, 2));
        dataFolder?.file('invoices.json', JSON.stringify(invoices, null, 2));
        dataFolder?.file('invoice_items.json', JSON.stringify(invoiceItems, null, 2));
        dataFolder?.file('invoice_payments.json', JSON.stringify(invoicePayments, null, 2));
        dataFolder?.file('cash_sessions.json', JSON.stringify(cashSessions, null, 2));
        dataFolder?.file('cash_movements.json', JSON.stringify(cashMovements, null, 2));
        dataFolder?.file('staff_profiles.json', JSON.stringify(staffProfiles, null, 2));
        dataFolder?.file('staff_memberships.json', JSON.stringify(staffMemberships, null, 2));
        dataFolder?.file('reminder_logs.json', JSON.stringify(reminderLogs, null, 2));
        dataFolder?.file('whatsapp_messages.json', JSON.stringify(whatsappMessages, null, 2));
        dataFolder?.file('audit_logs.json', JSON.stringify(auditLogs, null, 2));
        dataFolder?.file('notifications.json', JSON.stringify(notifications, null, 2));
      } else if (specialtyRows) {
        // Phase 48: focused single-entity ZIP — primary + companions only.
        dataFolder?.file(`${exportType}.json`, JSON.stringify(specialtyRows, null, 2));
        dataFolder?.file(
          `${exportType}.csv`,
          rowsToLooseCsv(specialtyRows as Array<Record<string, unknown>>)
        );
        const companions = FOCUSED_EXPORT_ZIP_COMPANIONS[exportType] ?? [];
        if (companions.includes('cash_movements')) {
          dataFolder?.file('cash_movements.json', JSON.stringify(cashMovements, null, 2));
          dataFolder?.file(
            'cash_movements.csv',
            toCsv(
              [
                'id',
                'cash_session_id',
                'payment_id',
                'recorded_by',
                'kind',
                'method',
                'amount',
                'notes',
                'created_at',
              ],
              cashMovements
            )
          );
        }
        if (companions.includes('invoice_items')) {
          dataFolder?.file('invoice_items.json', JSON.stringify(invoiceItems, null, 2));
          dataFolder?.file(
            'invoice_items.csv',
            toCsv(
              [
                'id',
                'invoice_id',
                'description',
                'quantity',
                'unit_price',
                'line_total',
                'inventory_product_id',
                'sort_order',
              ],
              invoiceItems
            )
          );
        }
        if (companions.includes('invoice_payments')) {
          dataFolder?.file('invoice_payments.json', JSON.stringify(invoicePayments, null, 2));
          dataFolder?.file(
            'invoice_payments.csv',
            toCsv(
              [
                'id',
                'invoice_id',
                'method',
                'amount',
                'paid_at',
                'reference',
                'notes',
                'recorded_by',
                'created_at',
              ],
              invoicePayments
            )
          );
        }
        if (companions.includes('staff_memberships')) {
          dataFolder?.file('staff_memberships.json', JSON.stringify(staffMemberships, null, 2));
          dataFolder?.file(
            'staff_memberships.csv',
            toCsv(
              [
                'id',
                'branch_id',
                'user_id',
                'role',
                'is_active',
                'created_at',
              ],
              staffMemberships
            )
          );
        }
      }

      const patientIds = filteredPatients.map((p: { id: string }) => p.id);
      const images =
        exportType === 'full_clinic' || exportType === 'patient_clinical'
          ? await fetchClinicalImages(organizationId, patientIds, supabase)
          : [];
      const storageResolved = options?.asService
        ? await (await import('@/lib/supabase/server')).createServiceClient()
        : await createServerClient();
      let attachmentCount = 0;
      let attachmentBytes = 0;
      const MAX_ATTACHMENTS = 40;
      const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;
      const packedAttachmentMeta: Array<{
        externalPatientId: string;
        filename: string;
        externalBranchId: string | null;
        externalAssignedUserId: string | null;
      }> = [];
      for (const image of images) {
        if (attachmentCount >= MAX_ATTACHMENTS || attachmentBytes >= MAX_ATTACHMENT_BYTES) break;
        const { data: blob, error: downloadError } = await storageResolved.storage
          .from('clinical-images')
          .download(image.storage_path);
        if (downloadError || !blob) continue;
        const bytes = new Uint8Array(await blob.arrayBuffer());
        if (attachmentBytes + bytes.byteLength > MAX_ATTACHMENT_BYTES) break;
        const safeName = String(image.original_name || `${image.id}.bin`).replace(
          /[\\/:*?"<>|]+/g,
          '_'
        );
        zip
          .folder('attachments')
          ?.folder(String(image.patient_id))
          ?.file(safeName, bytes);
        packedAttachmentMeta.push({
          externalPatientId: String(image.patient_id),
          filename: safeName,
          externalBranchId: image.branch_id ? String(image.branch_id) : null,
          externalAssignedUserId: image.uploaded_by ? String(image.uploaded_by) : null,
        });
        attachmentCount += 1;
        attachmentBytes += bytes.byteLength;
      }
      recordCounts.attachments = attachmentCount;
      if (packedAttachmentMeta.length > 0) {
        const metaCsv = buildAttachmentMetaExportCsv(packedAttachmentMeta);
        zip.file('attachments_meta.csv', metaCsv);
        dataFolder?.file('attachments_meta.csv', metaCsv);
      } else if (exportType === 'clinical_images' && clinicalImagesMeta.length > 0) {
        // Focused clinical_images ZIP: meta catalog without binaries (phase 50).
        const catalogMeta = clinicalImagesMeta.map((row: Record<string, unknown>) => ({
          externalPatientId: String(row.patient_id ?? ''),
          filename: String(row.original_name || `${row.id ?? 'file'}.bin`).replace(
            /[\\/:*?"<>|]+/g,
            '_'
          ),
          externalBranchId: row.branch_id ? String(row.branch_id) : null,
          externalAssignedUserId: row.uploaded_by ? String(row.uploaded_by) : null,
        }));
        const metaCsv = buildAttachmentMetaExportCsv(catalogMeta);
        zip.file('attachments_meta.csv', metaCsv);
        dataFolder?.file('attachments_meta.csv', metaCsv);
      }

      zip
        .folder('reports')
        ?.file(
          'export-summary.txt',
          `SyncVete export\nType: ${job.export_type}\nRange: ${bounds.dateFrom ?? '—'} → ${bounds.dateTo ?? '—'}\nBranches: ${recordCounts.branches ?? 0}\nOwners: ${recordCounts.owners}\nPatients: ${recordCounts.patients}\nClinical: ${recordCounts.clinicalEntries}\nVaccinations: ${recordCounts.vaccinations}\nLab: ${recordCounts.labOrders}\nLab items: ${recordCounts.labOrderItems}\nSurgeries: ${recordCounts.surgeries}\nPrescriptions: ${recordCounts.prescriptions}\nPrescription items: ${recordCounts.prescriptionItems}\nHospitalizations: ${recordCounts.hospitalizations}\nHospitalization notes: ${recordCounts.hospitalizationNotes}\nAppointments: ${recordCounts.appointments ?? 0}\nConsultations: ${recordCounts.consultations ?? 0}\nInventory: ${recordCounts.inventoryProducts ?? 0}\nInventory movements: ${recordCounts.inventoryMovements ?? 0}\nClinical images (meta): ${recordCounts.clinicalImages ?? 0}\nInvoices: ${recordCounts.invoices ?? 0}\nInvoice items: ${recordCounts.invoiceItems ?? 0}\nInvoice payments: ${recordCounts.invoicePayments ?? 0}\nCash sessions: ${recordCounts.cashSessions ?? 0}\nCash movements: ${recordCounts.cashMovements ?? 0}\nStaff profiles: ${recordCounts.staffProfiles ?? 0}\nStaff memberships: ${recordCounts.staffMemberships ?? 0}\nReminder logs: ${recordCounts.reminderLogs ?? 0}\nWhatsApp messages: ${recordCounts.whatsappMessages ?? 0}\nAudit logs: ${recordCounts.auditLogs ?? 0}\nNotifications: ${recordCounts.notifications ?? 0}\nAttachments: ${attachmentCount}\n`
        );
      body = await zip.generateAsync({ type: 'uint8array' });
      filename = `SyncVete-Clinic-Export-${new Date().toISOString().slice(0, 10)}.zip`;
      contentType = 'application/zip';
    }

    // Persist artifact for later download / background jobs
    const storagePath = `${organizationId}/exports/${jobId}/${filename}`;
    const storageClient = options?.asService
      ? await (await import('@/lib/supabase/server')).createServiceClient()
      : await createServerClient();
    const uploadBytes =
      typeof body === 'string' ? Buffer.from(body, 'utf8') : Buffer.from(body);
    const { error: uploadError } = await storageClient.storage
      .from('data-migration')
      .upload(storagePath, uploadBytes, { contentType, upsert: true });
    if (uploadError) {
      // Non-fatal for interactive download; still return body
      console.warn('[export] artifact upload failed', uploadError.message);
    }

    await supabase
      .from('data_export_jobs')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        record_counts: recordCounts,
        download_filename: filename,
        storage_path: uploadError ? null : storagePath,
        progress_message: 'Completado',
        metadata: { contentType, formatVersion: DATA_MIGRATION_FORMAT_VERSION },
      })
      .eq('id', jobId);

    const { logDataMigrationAudit } = await import('@/lib/data-migration/audit');
    await logDataMigrationAudit({
      organizationId,
      userId,
      action: 'data_export.completed',
      entityType: 'data_export_jobs',
      entityId: jobId,
      newData: { recordCounts, filename, format: job.format },
    });

    const { notifyDataMigrationEvent } = await import('@/lib/data-migration/notify');
    await notifyDataMigrationEvent({
      organizationId,
      title: 'Exportación lista',
      body: `${String(job.export_type)} · ${filename}`,
      relatedType: 'data_export_job',
      relatedId: jobId,
    });

    return { jobId, filename, contentType, body, recordCounts, storagePath: uploadError ? null : storagePath };
  } catch (err) {
    await supabase
      .from('data_export_jobs')
      .update({
        status: 'failed',
        error_message: err instanceof Error ? err.message : 'Export failed',
        completed_at: new Date().toISOString(),
        progress_message: 'Falló',
      })
      .eq('id', jobId);
    const { notifyDataMigrationEvent } = await import('@/lib/data-migration/notify');
    await notifyDataMigrationEvent({
      organizationId,
      title: 'Exportación fallida',
      body: err instanceof Error ? err.message : 'Export failed',
      relatedType: 'data_export_job',
      relatedId: jobId,
    });
    throw err;
  }
}

export async function getExportDownloadUrl(jobId: string) {
  const session = await requirePermission('data:export');
  const supabase = await migrationDb();
  const storage = await createServerClient();
  const { data: job, error } = await supabase
    .from('data_export_jobs')
    .select('id, storage_path, download_filename, status, organization_id')
    .eq('id', jobId)
    .eq('organization_id', session.organizationId)
    .single();
  if (error || !job) throw new Error(error?.message ?? 'Export no encontrado');
  if (job.status !== 'completed' || !job.storage_path) {
    throw new Error('El archivo aún no está disponible');
  }
  const { data, error: signedError } = await storage.storage
    .from('data-migration')
    .createSignedUrl(job.storage_path, 60 * 15);
  if (signedError || !data?.signedUrl) {
    throw new Error(signedError?.message ?? 'No se pudo firmar la descarga');
  }
  const { logDataMigrationAudit } = await import('@/lib/data-migration/audit');
  await logDataMigrationAudit({
    organizationId: session.organizationId,
    userId: session.userId,
    action: 'data_export.downloaded',
    entityType: 'data_export_jobs',
    entityId: jobId,
    newData: { filename: job.download_filename },
  });
  return {
    url: data.signedUrl,
    filename: String(job.download_filename ?? 'syncvete-export.bin'),
  };
}

export async function getImportBatchProgress(batchId: string) {
  const session = await requirePermission('data:import');
  const supabase = await migrationDb();
  const { data, error } = await supabase
    .from('data_import_batches')
    .select(
      'id, status, progress_processed, progress_total, progress_message, imported_records, failed_records, linked_records, skipped_records, error_message, queued_at, completed_at'
    )
    .eq('id', batchId)
    .eq('organization_id', session.organizationId)
    .single();
  if (error || !data) throw new Error(error?.message ?? 'Lote no encontrado');
  return data;
}

export async function processNextQueuedExportJobs(options?: { maxJobs?: number }) {
  const maxJobs = options?.maxJobs ?? 2;
  const { createServiceClient } = await import('@/lib/supabase/server');
  const service = (await createServiceClient()) as unknown as Awaited<ReturnType<typeof migrationDb>>;
  const { data: jobs, error } = await service
    .from('data_export_jobs')
    .select('id')
    .eq('status', 'queued')
    .not('queued_at', 'is', null)
    .order('queued_at', { ascending: true })
    .limit(maxJobs);
  if (error) throw new Error(error.message);

  const results: Array<Record<string, unknown>> = [];
  for (const job of (jobs ?? []) as Array<{ id: string }>) {
    const { data: fullJob } = await service
      .from('data_export_jobs')
      .select('id, organization_id, status')
      .eq('id', job.id)
      .maybeSingle();
    if (!fullJob || fullJob.status !== 'queued') {
      results.push({ jobId: job.id, skipped: 'not_queued' });
      continue;
    }
    const { count: activeCount } = await service
      .from('data_export_jobs')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', fullJob.organization_id)
      .eq('status', 'running')
      .neq('id', job.id);
    if ((activeCount ?? 0) > 0) {
      results.push({ jobId: job.id, skipped: 'org_busy' });
      continue;
    }
    try {
      const result = await runExportJob(String(job.id), { asService: true });
      results.push({
        jobId: result.jobId,
        filename: result.filename,
        recordCounts: result.recordCounts,
      });
    } catch (err) {
      results.push({
        jobId: job.id,
        error: err instanceof Error ? err.message : 'export_failed',
      });
    }
  }
  return { processedJobs: results.length, results };
}
