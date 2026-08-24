import 'server-only';

import {
  APPOINTMENT_IMPORT_FIELDS,
  CONSULTATION_IMPORT_FIELDS,
  HOSPITALIZATION_IMPORT_FIELDS,
  INVENTORY_PRODUCT_IMPORT_FIELDS,
  INVOICE_IMPORT_FIELDS,
  PAYMENT_IMPORT_FIELDS,
  LAB_ORDER_IMPORT_FIELDS,
  PRESCRIPTION_IMPORT_FIELDS,
  SURGERY_IMPORT_FIELDS,
  mapRow,
  parseImportDate,
  parseImportDateTime,
  resolveImportBranchId,
  resolveImportStaffUserId,
  validateAppointmentRows,
  validateConsultationRows,
  validateHospitalizationRows,
  validateInventoryProductRows,
  validateInvoiceRows,
  validatePaymentRows,
  validateLabOrderRows,
  validatePrescriptionRows,
  validateSurgeryRows,
  type AppointmentImportRow,
  type ConsultationImportRow,
  type DateLocale,
  type HospitalizationImportRow,
  type IdempotencyMode,
  type InventoryProductImportRow,
  type InvoiceImportRow,
  type PaymentImportRow,
  type LabOrderImportRow,
  type PrescriptionImportRow,
  type SurgeryImportRow,
  type ValidationIssue,
} from '@sincvete/shared';
import type { MigrationDb } from '@/lib/data-migration/db';

export type SpecialtyEntity =
  | 'lab_orders'
  | 'surgeries'
  | 'prescriptions'
  | 'hospitalizations'
  | 'appointments'
  | 'consultations'
  | 'inventory_products'
  | 'invoices'
  | 'payments';

async function findSpecialtyBySource(input: {
  supabase: MigrationDb;
  table: SpecialtyEntity;
  organizationId: string;
  sourceSystem: string;
  sourceRecordId: string;
}): Promise<string | null> {
  if (!input.sourceRecordId || !input.sourceSystem) return null;
  const { data } = await input.supabase
    .from(input.table)
    .select('id')
    .eq('organization_id', input.organizationId)
    .eq('source_system', input.sourceSystem)
    .eq('source_record_id', input.sourceRecordId)
    .is('deleted_at', null)
    .maybeSingle();
  return data?.id ? String(data.id) : null;
}
export function fieldsForSpecialty(entity: SpecialtyEntity) {
  if (entity === 'lab_orders') return LAB_ORDER_IMPORT_FIELDS;
  if (entity === 'surgeries') return SURGERY_IMPORT_FIELDS;
  if (entity === 'hospitalizations') return HOSPITALIZATION_IMPORT_FIELDS;
  if (entity === 'appointments') return APPOINTMENT_IMPORT_FIELDS;
  if (entity === 'consultations') return CONSULTATION_IMPORT_FIELDS;
  if (entity === 'inventory_products') return INVENTORY_PRODUCT_IMPORT_FIELDS;
  if (entity === 'invoices') return INVOICE_IMPORT_FIELDS;
  if (entity === 'payments') return PAYMENT_IMPORT_FIELDS;
  return PRESCRIPTION_IMPORT_FIELDS;
}

export function asLabOrderRows(
  rawRows: Record<string, string>[],
  mapping: Record<string, string | null>
): LabOrderImportRow[] {
  return rawRows.map((raw, index) => {
    const mapped = mapRow(raw, mapping);
    return {
      rowNumber: index + 2,
      externalLabOrderId: mapped.external_lab_order_id ?? '',
      externalPatientId: mapped.external_patient_id ?? '',
      externalBranchId: mapped.external_branch_id || null,
      externalAssignedUserId: mapped.external_assigned_user_id || null,
      orderedAt: mapped.ordered_at ?? '',
      title: mapped.title ?? '',
      tests: mapped.tests || null,
      priority: mapped.priority || null,
      sampleType: mapped.sample_type || null,
      interpretation: mapped.interpretation || null,
      originalVeterinarian: mapped.original_veterinarian || null,
      notes: mapped.notes || null,
      sourceSystem: mapped.source_system || null,
    };
  });
}

export function asSurgeryRows(
  rawRows: Record<string, string>[],
  mapping: Record<string, string | null>
): SurgeryImportRow[] {
  return rawRows.map((raw, index) => {
    const mapped = mapRow(raw, mapping);
    return {
      rowNumber: index + 2,
      externalSurgeryId: mapped.external_surgery_id ?? '',
      externalPatientId: mapped.external_patient_id ?? '',
      externalBranchId: mapped.external_branch_id || null,
      externalAssignedUserId: mapped.external_assigned_user_id || null,
      scheduledAt: mapped.scheduled_at ?? '',
      procedureName: mapped.procedure_name ?? '',
      diagnosis: mapped.diagnosis || null,
      anesthesia: mapped.anesthesia || null,
      asa: mapped.asa || null,
      originalVeterinarian: mapped.original_veterinarian || null,
      notes: mapped.notes || null,
      sourceSystem: mapped.source_system || null,
    };
  });
}

export function asPrescriptionRows(
  rawRows: Record<string, string>[],
  mapping: Record<string, string | null>
): PrescriptionImportRow[] {
  return rawRows.map((raw, index) => {
    const mapped = mapRow(raw, mapping);
    return {
      rowNumber: index + 2,
      externalPrescriptionId: mapped.external_prescription_id ?? '',
      externalPatientId: mapped.external_patient_id ?? '',
      externalBranchId: mapped.external_branch_id || null,
      externalAssignedUserId: mapped.external_assigned_user_id || null,
      prescribedAt: mapped.prescribed_at ?? '',
      medicationName: mapped.medication_name ?? '',
      dose: mapped.dose ?? '',
      frequency: mapped.frequency ?? '',
      duration: mapped.duration || null,
      route: mapped.route || null,
      quantity: mapped.quantity || null,
      instructions: mapped.instructions || null,
      originalVeterinarian: mapped.original_veterinarian || null,
      notes: mapped.notes || null,
      sourceSystem: mapped.source_system || null,
    };
  });
}

export function asHospitalizationRows(
  rawRows: Record<string, string>[],
  mapping: Record<string, string | null>
): HospitalizationImportRow[] {
  return rawRows.map((raw, index) => {
    const mapped = mapRow(raw, mapping);
    return {
      rowNumber: index + 2,
      externalHospitalizationId: mapped.external_hospitalization_id ?? '',
      externalPatientId: mapped.external_patient_id ?? '',
      externalBranchId: mapped.external_branch_id || null,
      externalAssignedUserId: mapped.external_assigned_user_id || null,
      admittedAt: mapped.admitted_at ?? '',
      dischargedAt: mapped.discharged_at || null,
      reason: mapped.reason ?? '',
      diagnosis: mapped.diagnosis || null,
      treatmentPlan: mapped.treatment_plan || null,
      cage: mapped.cage || null,
      status: mapped.status || null,
      originalVeterinarian: mapped.original_veterinarian || null,
      notes: mapped.notes || null,
      sourceSystem: mapped.source_system || null,
    };
  });
}

export function asAppointmentRows(
  rawRows: Record<string, string>[],
  mapping: Record<string, string | null>
): AppointmentImportRow[] {
  return rawRows.map((raw, index) => {
    const mapped = mapRow(raw, mapping);
    return {
      rowNumber: index + 2,
      externalAppointmentId: mapped.external_appointment_id ?? '',
      externalPatientId: mapped.external_patient_id ?? '',
      startsAt: mapped.starts_at ?? '',
      endsAt: mapped.ends_at || null,
      appointmentType: mapped.appointment_type || null,
      status: mapped.status || null,
      title: mapped.title || null,
      notes: mapped.notes || null,
      sourceSystem: mapped.source_system || null,
      externalBranchId: mapped.external_branch_id || null,
      externalAssignedUserId: mapped.external_assigned_user_id || null,
    };
  });
}

export function asConsultationRows(
  rawRows: Record<string, string>[],
  mapping: Record<string, string | null>
): ConsultationImportRow[] {
  return rawRows.map((raw, index) => {
    const mapped = mapRow(raw, mapping);
    return {
      rowNumber: index + 2,
      externalConsultationId: mapped.external_consultation_id ?? '',
      externalPatientId: mapped.external_patient_id ?? '',
      externalAppointmentId: mapped.external_appointment_id || null,
      startedAt: mapped.started_at ?? '',
      completedAt: mapped.completed_at || null,
      status: mapped.status || null,
      title: mapped.title || null,
      anamnesis: mapped.anamnesis || null,
      physicalExam: mapped.physical_exam || null,
      diagnosis: mapped.diagnosis || null,
      treatment: mapped.treatment || null,
      plan: mapped.plan || null,
      weightKg: mapped.weight_kg || null,
      temperatureC: mapped.temperature_c || null,
      notes: mapped.notes || null,
      sourceSystem: mapped.source_system || null,
      externalBranchId: mapped.external_branch_id || null,
      externalAssignedUserId: mapped.external_assigned_user_id || null,
    };
  });
}

export function asInventoryProductRows(
  rawRows: Record<string, string>[],
  mapping: Record<string, string | null>
): InventoryProductImportRow[] {
  return rawRows.map((raw, index) => {
    const mapped = mapRow(raw, mapping);
    return {
      rowNumber: index + 2,
      externalProductId: mapped.external_product_id ?? '',
      name: mapped.name ?? '',
      sku: mapped.sku || null,
      category: mapped.category || null,
      unit: mapped.unit || null,
      quantity: mapped.quantity || null,
      minQuantity: mapped.min_quantity || null,
      unitCost: mapped.unit_cost || null,
      unitPrice: mapped.unit_price || null,
      manufacturer: mapped.manufacturer || null,
      notes: mapped.notes || null,
      sourceSystem: mapped.source_system || null,
      externalBranchId: mapped.external_branch_id || null,
    };
  });
}

export function asInvoiceRows(
  rawRows: Record<string, string>[],
  mapping: Record<string, string | null>
): InvoiceImportRow[] {
  return rawRows.map((raw, index) => {
    const mapped = mapRow(raw, mapping);
    return {
      rowNumber: index + 2,
      externalInvoiceId: mapped.external_invoice_id ?? '',
      externalOwnerId: mapped.external_owner_id || null,
      externalPatientId: mapped.external_patient_id || null,
      number: mapped.number || null,
      status: mapped.status || null,
      issuedAt: mapped.issued_at || null,
      currency: mapped.currency || null,
      subtotal: mapped.subtotal || null,
      taxAmount: mapped.tax_amount || null,
      total: mapped.total || null,
      paidAmount: mapped.paid_amount || null,
      balance: mapped.balance || null,
      description: mapped.description || null,
      quantity: mapped.quantity || null,
      unitPrice: mapped.unit_price || null,
      lineTotal: mapped.line_total || null,
      externalProductId: mapped.external_product_id || null,
      notes: mapped.notes || null,
      sourceSystem: mapped.source_system || null,
      externalBranchId: mapped.external_branch_id || null,
      externalAssignedUserId: mapped.external_assigned_user_id || null,
    };
  });
}

export function asPaymentRows(
  rawRows: Record<string, string>[],
  mapping: Record<string, string | null>
): PaymentImportRow[] {
  return rawRows.map((raw, index) => {
    const mapped = mapRow(raw, mapping);
    return {
      rowNumber: index + 2,
      externalPaymentId: mapped.external_payment_id ?? '',
      externalInvoiceId: mapped.external_invoice_id ?? '',
      externalAssignedUserId: mapped.external_assigned_user_id || null,
      amount: mapped.amount ?? '',
      method: mapped.method || null,
      paidAt: mapped.paid_at || null,
      reference: mapped.reference || null,
      notes: mapped.notes || null,
      sourceSystem: mapped.source_system || null,
    };
  });
}

export function validateSpecialtyRows(
  entity: SpecialtyEntity,
  rawRows: Record<string, string>[],
  mapping: Record<string, string | null>,
  options: {
    knownPatientExternalIds?: string[];
    knownOwnerExternalIds?: string[];
    knownInvoiceExternalIds?: string[];
    invoicePaidAmountByExternal?: Map<string, number>;
    knownBranchExternalIds?: Set<string>;
    knownBranchInternalIds?: Set<string>;
    knownStaffExternalIds?: Set<string>;
    knownStaffInternalIds?: Set<string>;
    locale?: DateLocale;
  }
): { issues: ValidationIssue[]; readyCount: number; rows: unknown[] } {
  const known = new Set(options.knownPatientExternalIds ?? []);
  const knownOwners = new Set(options.knownOwnerExternalIds ?? []);
  const knownInvoices = new Set(options.knownInvoiceExternalIds ?? []);
  const knownBranchExternalIds = options.knownBranchExternalIds;
  const knownBranchInternalIds = options.knownBranchInternalIds;
  const locale = options.locale ?? 'es-AR';
  if (entity === 'lab_orders') {
    const rows = asLabOrderRows(rawRows, mapping);
    const issues = validateLabOrderRows(rows, {
      knownPatientExternalIds: known,
      knownBranchExternalIds,
      knownBranchInternalIds,
      knownStaffExternalIds: options.knownStaffExternalIds,
      knownStaffInternalIds: options.knownStaffInternalIds,
      locale,
    });
    const errorRows = new Set(issues.filter((i) => i.severity === 'error').map((i) => i.rowNumber));
    return {
      issues,
      readyCount: rows.filter((r) => !errorRows.has(r.rowNumber)).length,
      rows,
    };
  }
  if (entity === 'surgeries') {
    const rows = asSurgeryRows(rawRows, mapping);
    const issues = validateSurgeryRows(rows, {
      knownPatientExternalIds: known,
      knownBranchExternalIds,
      knownBranchInternalIds,
      knownStaffExternalIds: options.knownStaffExternalIds,
      knownStaffInternalIds: options.knownStaffInternalIds,
      locale,
    });
    const errorRows = new Set(issues.filter((i) => i.severity === 'error').map((i) => i.rowNumber));
    return {
      issues,
      readyCount: rows.filter((r) => !errorRows.has(r.rowNumber)).length,
      rows,
    };
  }
  if (entity === 'hospitalizations') {
    const rows = asHospitalizationRows(rawRows, mapping);
    const issues = validateHospitalizationRows(rows, {
      knownPatientExternalIds: known,
      knownBranchExternalIds,
      knownBranchInternalIds,
      knownStaffExternalIds: options.knownStaffExternalIds,
      knownStaffInternalIds: options.knownStaffInternalIds,
      locale,
    });
    const errorRows = new Set(issues.filter((i) => i.severity === 'error').map((i) => i.rowNumber));
    return {
      issues,
      readyCount: rows.filter((r) => !errorRows.has(r.rowNumber)).length,
      rows,
    };
  }
  if (entity === 'appointments') {
    const rows = asAppointmentRows(rawRows, mapping);
    const issues = validateAppointmentRows(rows, {
      knownPatientExternalIds: known,
      knownBranchExternalIds,
      knownBranchInternalIds,
      knownStaffExternalIds: options.knownStaffExternalIds,
      knownStaffInternalIds: options.knownStaffInternalIds,
      locale,
    });
    const errorRows = new Set(issues.filter((i) => i.severity === 'error').map((i) => i.rowNumber));
    return {
      issues,
      readyCount: rows.filter((r) => !errorRows.has(r.rowNumber)).length,
      rows,
    };
  }
  if (entity === 'consultations') {
    const rows = asConsultationRows(rawRows, mapping);
    const issues = validateConsultationRows(rows, {
      knownPatientExternalIds: known,
      knownBranchExternalIds,
      knownBranchInternalIds,
      knownStaffExternalIds: options.knownStaffExternalIds,
      knownStaffInternalIds: options.knownStaffInternalIds,
      locale,
    });
    const errorRows = new Set(issues.filter((i) => i.severity === 'error').map((i) => i.rowNumber));
    return {
      issues,
      readyCount: rows.filter((r) => !errorRows.has(r.rowNumber)).length,
      rows,
    };
  }
  if (entity === 'inventory_products') {
    const rows = asInventoryProductRows(rawRows, mapping);
    const issues = validateInventoryProductRows(rows, { knownBranchExternalIds, knownBranchInternalIds });
    const errorRows = new Set(issues.filter((i) => i.severity === 'error').map((i) => i.rowNumber));
    return {
      issues,
      readyCount: rows.filter((r) => !errorRows.has(r.rowNumber)).length,
      rows,
    };
  }
  if (entity === 'invoices') {
    const rows = asInvoiceRows(rawRows, mapping);
    const issues = validateInvoiceRows(rows, {
      knownOwnerExternalIds: knownOwners.size > 0 ? knownOwners : undefined,
      knownPatientExternalIds: known.size > 0 ? known : undefined,
      knownBranchExternalIds,
      knownBranchInternalIds,
      knownStaffExternalIds: options.knownStaffExternalIds,
      knownStaffInternalIds: options.knownStaffInternalIds,
    });
    const errorRows = new Set(issues.filter((i) => i.severity === 'error').map((i) => i.rowNumber));
    return {
      issues,
      readyCount: rows.filter((r) => !errorRows.has(r.rowNumber)).length,
      rows,
    };
  }
  if (entity === 'payments') {
    const rows = asPaymentRows(rawRows, mapping);
    const issues = validatePaymentRows(rows, {
      knownInvoiceExternalIds: knownInvoices.size > 0 ? knownInvoices : undefined,
      invoicePaidAmountByExternal: options.invoicePaidAmountByExternal,
      knownStaffExternalIds: options.knownStaffExternalIds,
      knownStaffInternalIds: options.knownStaffInternalIds,
    });
    const errorRows = new Set(issues.filter((i) => i.severity === 'error').map((i) => i.rowNumber));
    return {
      issues,
      readyCount: rows.filter((r) => !errorRows.has(r.rowNumber)).length,
      rows,
    };
  }
  const rows = asPrescriptionRows(rawRows, mapping);
  const issues = validatePrescriptionRows(rows, {
    knownPatientExternalIds: known,
    knownBranchExternalIds,
    knownBranchInternalIds,
    knownStaffExternalIds: options.knownStaffExternalIds,
    knownStaffInternalIds: options.knownStaffInternalIds,
    locale,
  });
  const errorRows = new Set(issues.filter((i) => i.severity === 'error').map((i) => i.rowNumber));
  return {
    issues,
    readyCount: rows.filter((r) => !errorRows.has(r.rowNumber)).length,
    rows,
  };
}

function normalizeLabPriority(value: string | null): 'rutina' | 'urgente' {
  const v = (value ?? '').trim().toLowerCase();
  return v === 'urgente' || v === 'urgent' ? 'urgente' : 'rutina';
}

function normalizeSampleType(
  value: string | null
): 'sangre' | 'orina' | 'materia_fecal' | 'hisopado' | 'otro' | null {
  if (!value) return null;
  const v = value.trim().toLowerCase();
  if (v.includes('sangre') || v === 'blood') return 'sangre';
  if (v.includes('orina') || v === 'urine') return 'orina';
  if (v.includes('fecal') || v.includes('heces')) return 'materia_fecal';
  if (v.includes('hisop')) return 'hisopado';
  return 'otro';
}

function normalizeAnesthesia(
  value: string | null
): 'general' | 'sedacion' | 'local' | 'epidural' | 'otro' | null {
  if (!value) return null;
  const v = value.trim().toLowerCase();
  if (v.startsWith('gen')) return 'general';
  if (v.startsWith('sed')) return 'sedacion';
  if (v.startsWith('loc')) return 'local';
  if (v.startsWith('epi')) return 'epidural';
  return 'otro';
}

function normalizeAsa(value: string | null): 'I' | 'II' | 'III' | 'IV' | 'V' | null {
  if (!value) return null;
  const v = value.trim().toUpperCase();
  if (v === 'I' || v === 'II' || v === 'III' || v === 'IV' || v === 'V') return v;
  return null;
}

function normalizeRxRoute(
  value: string | null
): 'oral' | 'sc' | 'im' | 'topico' | 'oftalmico' | 'otico' | 'otro' {
  const v = (value ?? '').trim().toLowerCase();
  if (v === 'oral' || v === 'po') return 'oral';
  if (v === 'sc' || v === 'subcutanea' || v === 'subcutánea') return 'sc';
  if (v === 'im' || v === 'intramuscular') return 'im';
  if (v.includes('top')) return 'topico';
  if (v.includes('oftalm')) return 'oftalmico';
  if (v.includes('ot')) return 'otico';
  return 'otro';
}

export async function commitSpecialtySlice(input: {
  supabase: MigrationDb;
  entity: SpecialtyEntity;
  rows: Record<string, string>[];
  mapping: Record<string, string | null>;
  locale: DateLocale;
  patientIdByExternal: Record<string, string>;
  ownerIdByExternal?: Record<string, string>;
  productIdByExternal?: Record<string, string>;
  invoiceIdByExternal?: Record<string, string>;
  appointmentIdByExternal?: Record<string, string>;
  branchIdByExternal?: Record<string, string>;
  userIdByExternal?: Record<string, string>;
  knownStaffInternalIds?: Set<string>;
  knownBranchInternalIds?: Set<string>;
  organizationId: string;
  branchId: string;
  batchId: string;
  userId: string;
  sourceSystem?: string | null;
  idempotencyMode?: IdempotencyMode;
  offset: number;
  limit: number;
}): Promise<{ imported: number; failed: number; skipped: number; idMap: Record<string, string> }> {
  const slice = input.rows.slice(input.offset, input.offset + input.limit);
  const nowIso = new Date().toISOString();
  let imported = 0;
  let failed = 0;
  let skipped = 0;
  const idMap: Record<string, string> = {};
  const skipExisting = input.idempotencyMode === 'skip_existing_source';

  if (input.entity === 'lab_orders') {
    const rows = asLabOrderRows(slice, input.mapping).map((row, idx) => ({
      ...row,
      rowNumber: input.offset + idx + 2,
    }));
    for (const row of rows) {
      const patientId = input.patientIdByExternal[row.externalPatientId];
      const date = parseImportDate(row.orderedAt, input.locale);
      if (!patientId || !date.ok || !row.title.trim()) {
        failed += 1;
        continue;
      }
      const sourceSystem = row.sourceSystem ?? input.sourceSystem ?? '';
      if (skipExisting) {
        const existingId = await findSpecialtyBySource({
          supabase: input.supabase,
          table: 'lab_orders',
          organizationId: input.organizationId,
          sourceSystem,
          sourceRecordId: row.externalLabOrderId,
        });
        if (existingId) {
          idMap[row.externalLabOrderId] = existingId;
          skipped += 1;
          await input.supabase.from('data_import_id_map').insert({
            batch_id: input.batchId,
            organization_id: input.organizationId,
            entity_type: 'lab_orders',
            external_id: row.externalLabOrderId,
            internal_id: existingId,
          });
          continue;
        }
      }
      const { data: patient } = await input.supabase
        .from('patients')
        .select('id, owner_id')
        .eq('id', patientId)
        .eq('organization_id', input.organizationId)
        .maybeSingle();
      if (!patient) {
        failed += 1;
        continue;
      }
      const branchResolved = resolveImportBranchId({
        externalBranchId: row.externalBranchId,
        branchIdByExternal: input.branchIdByExternal,
        knownBranchInternalIds: input.knownBranchInternalIds,
        defaultBranchId: input.branchId,
      });
      if (!branchResolved.ok) {
        failed += 1;
        continue;
      }
      const staffResolved = resolveImportStaffUserId({
        externalAssignedUserId: row.externalAssignedUserId,
        userIdByExternal: input.userIdByExternal,
        knownStaffInternalIds: input.knownStaffInternalIds,
        defaultUserId: input.userId,
      });
      if (!staffResolved.ok) {
        failed += 1;
        continue;
      }
      const hasResult = Boolean(row.interpretation?.trim());
      const { data, error } = await input.supabase
        .from('lab_orders')
        .insert({
          organization_id: input.organizationId,
          branch_id: branchResolved.branchId,
          patient_id: patient.id,
          owner_id: patient.owner_id,
          ordered_by: staffResolved.userId,
          status: hasResult ? 'completada' : 'solicitada',
          priority: normalizeLabPriority(row.priority),
          sample_type: normalizeSampleType(row.sampleType),
          title: row.title.trim(),
          ordered_at: `${date.isoDate}T12:00:00.000Z`,
          completed_at: hasResult ? `${date.isoDate}T12:00:00.000Z` : null,
          interpretation: row.interpretation,
          notes: [row.notes, row.originalVeterinarian ? `Profesional original: ${row.originalVeterinarian}` : null]
            .filter(Boolean)
            .join('\n') || null,
          import_batch_id: input.batchId,
          source_system: row.sourceSystem ?? input.sourceSystem,
          source_record_id: row.externalLabOrderId,
          original_created_at: `${date.isoDate}T12:00:00.000Z`,
          original_professional_name: row.originalVeterinarian,
          imported_at: nowIso,
          imported_by: input.userId,
        })
        .select('id')
        .single();
      if (error || !data) {
        failed += 1;
        continue;
      }
      const tests = (row.tests ?? '')
        .split('|')
        .map((t) => t.trim())
        .filter(Boolean);
      if (tests.length > 0) {
        await input.supabase.from('lab_order_items').insert(
          tests.map((testName, index) => ({
            organization_id: input.organizationId,
            lab_order_id: data.id,
            test_name: testName.slice(0, 120),
            sort_order: index,
            flag: hasResult ? 'normal' : 'pendiente',
          }))
        );
      }
      imported += 1;
      idMap[row.externalLabOrderId] = data.id;
      await input.supabase.from('data_import_created_rows').insert({
        batch_id: input.batchId,
        organization_id: input.organizationId,
        entity_type: 'lab_orders',
        entity_id: data.id,
        external_id: row.externalLabOrderId,
      });
    }
    return { imported, failed, skipped, idMap };
  }

  if (input.entity === 'surgeries') {
    const rows = asSurgeryRows(slice, input.mapping).map((row, idx) => ({
      ...row,
      rowNumber: input.offset + idx + 2,
    }));
    for (const row of rows) {
      const patientId = input.patientIdByExternal[row.externalPatientId];
      const date = parseImportDate(row.scheduledAt, input.locale);
      if (!patientId || !date.ok || !row.procedureName.trim()) {
        failed += 1;
        continue;
      }
      const sourceSystem = row.sourceSystem ?? input.sourceSystem ?? '';
      if (skipExisting) {
        const existingId = await findSpecialtyBySource({
          supabase: input.supabase,
          table: 'surgeries',
          organizationId: input.organizationId,
          sourceSystem,
          sourceRecordId: row.externalSurgeryId,
        });
        if (existingId) {
          idMap[row.externalSurgeryId] = existingId;
          skipped += 1;
          await input.supabase.from('data_import_id_map').insert({
            batch_id: input.batchId,
            organization_id: input.organizationId,
            entity_type: 'surgeries',
            external_id: row.externalSurgeryId,
            internal_id: existingId,
          });
          continue;
        }
      }
      const { data: patient } = await input.supabase
        .from('patients')
        .select('id, owner_id')
        .eq('id', patientId)
        .eq('organization_id', input.organizationId)
        .maybeSingle();
      if (!patient) {
        failed += 1;
        continue;
      }
      const branchResolved = resolveImportBranchId({
        externalBranchId: row.externalBranchId,
        branchIdByExternal: input.branchIdByExternal,
        knownBranchInternalIds: input.knownBranchInternalIds,
        defaultBranchId: input.branchId,
      });
      if (!branchResolved.ok) {
        failed += 1;
        continue;
      }
      const staffResolved = resolveImportStaffUserId({
        externalAssignedUserId: row.externalAssignedUserId,
        userIdByExternal: input.userIdByExternal,
        knownStaffInternalIds: input.knownStaffInternalIds,
        defaultUserId: input.userId,
      });
      if (!staffResolved.ok) {
        failed += 1;
        continue;
      }
      const { data, error } = await input.supabase
        .from('surgeries')
        .insert({
          organization_id: input.organizationId,
          branch_id: branchResolved.branchId,
          patient_id: patient.id,
          owner_id: patient.owner_id,
          surgeon_id: staffResolved.userId,
          status: 'completada',
          scheduled_at: `${date.isoDate}T12:00:00.000Z`,
          completed_at: `${date.isoDate}T12:00:00.000Z`,
          procedure_name: row.procedureName.trim(),
          diagnosis: row.diagnosis,
          anesthesia: normalizeAnesthesia(row.anesthesia),
          asa: normalizeAsa(row.asa),
          notes: [row.notes, row.originalVeterinarian ? `Cirujano original: ${row.originalVeterinarian}` : null]
            .filter(Boolean)
            .join('\n') || null,
          import_batch_id: input.batchId,
          source_system: row.sourceSystem ?? input.sourceSystem,
          source_record_id: row.externalSurgeryId,
          original_created_at: `${date.isoDate}T12:00:00.000Z`,
          original_professional_name: row.originalVeterinarian,
          imported_at: nowIso,
          imported_by: input.userId,
        })
        .select('id')
        .single();
      if (error || !data) {
        failed += 1;
        continue;
      }
      imported += 1;
      idMap[row.externalSurgeryId] = data.id;
      await input.supabase.from('data_import_created_rows').insert({
        batch_id: input.batchId,
        organization_id: input.organizationId,
        entity_type: 'surgeries',
        entity_id: data.id,
        external_id: row.externalSurgeryId,
      });
    }
    return { imported, failed, skipped, idMap };
  }

  if (input.entity === 'hospitalizations') {
    const rows = asHospitalizationRows(slice, input.mapping).map((row, idx) => ({
      ...row,
      rowNumber: input.offset + idx + 2,
    }));
    for (const row of rows) {
      const patientId = input.patientIdByExternal[row.externalPatientId];
      const admitted = parseImportDate(row.admittedAt, input.locale);
      const discharged = row.dischargedAt ? parseImportDate(row.dischargedAt, input.locale) : null;
      if (!patientId || !admitted.ok || !row.reason.trim() || (row.dischargedAt && (!discharged || !discharged.ok))) {
        failed += 1;
        continue;
      }
      const sourceSystem = row.sourceSystem ?? input.sourceSystem ?? '';
      if (skipExisting) {
        const existingId = await findSpecialtyBySource({
          supabase: input.supabase,
          table: 'hospitalizations',
          organizationId: input.organizationId,
          sourceSystem,
          sourceRecordId: row.externalHospitalizationId,
        });
        if (existingId) {
          idMap[row.externalHospitalizationId] = existingId;
          skipped += 1;
          await input.supabase.from('data_import_id_map').insert({
            batch_id: input.batchId,
            organization_id: input.organizationId,
            entity_type: 'hospitalizations',
            external_id: row.externalHospitalizationId,
            internal_id: existingId,
          });
          continue;
        }
      }
      const { data: patient } = await input.supabase
        .from('patients')
        .select('id, owner_id')
        .eq('id', patientId)
        .eq('organization_id', input.organizationId)
        .maybeSingle();
      if (!patient) {
        failed += 1;
        continue;
      }
      // Historical imports default to discharged ('alta') to avoid unique active-stay conflicts.
      const statusRaw = (row.status ?? '').trim().toLowerCase();
      const status =
        discharged && discharged.ok
          ? 'alta'
          : statusRaw === 'fallecido'
            ? 'fallecido'
            : statusRaw === 'observacion' || statusRaw === 'observación'
              ? 'observacion'
              : 'alta';
      const branchResolved = resolveImportBranchId({
        externalBranchId: row.externalBranchId,
        branchIdByExternal: input.branchIdByExternal,
        knownBranchInternalIds: input.knownBranchInternalIds,
        defaultBranchId: input.branchId,
      });
      if (!branchResolved.ok) {
        failed += 1;
        continue;
      }
      const staffResolved = resolveImportStaffUserId({
        externalAssignedUserId: row.externalAssignedUserId,
        userIdByExternal: input.userIdByExternal,
        knownStaffInternalIds: input.knownStaffInternalIds,
        defaultUserId: input.userId,
      });
      if (!staffResolved.ok) {
        failed += 1;
        continue;
      }
      const { data, error } = await input.supabase
        .from('hospitalizations')
        .insert({
          organization_id: input.organizationId,
          branch_id: branchResolved.branchId,
          patient_id: patient.id,
          owner_id: patient.owner_id,
          veterinarian_id: staffResolved.userId,
          status,
          admitted_at: `${admitted.isoDate}T12:00:00.000Z`,
          discharged_at:
            discharged && discharged.ok ? `${discharged.isoDate}T12:00:00.000Z` : `${admitted.isoDate}T18:00:00.000Z`,
          cage: row.cage,
          reason: row.reason.trim().slice(0, 500),
          diagnosis: row.diagnosis,
          treatment_plan: row.treatmentPlan,
          notes: [row.notes, row.originalVeterinarian ? `Profesional original: ${row.originalVeterinarian}` : null]
            .filter(Boolean)
            .join('\n') || null,
          import_batch_id: input.batchId,
          source_system: row.sourceSystem ?? input.sourceSystem,
          source_record_id: row.externalHospitalizationId,
          original_created_at: `${admitted.isoDate}T12:00:00.000Z`,
          original_professional_name: row.originalVeterinarian,
          imported_at: nowIso,
          imported_by: input.userId,
        })
        .select('id')
        .single();
      if (error || !data) {
        failed += 1;
        continue;
      }
      imported += 1;
      idMap[row.externalHospitalizationId] = data.id;
      await input.supabase.from('data_import_created_rows').insert({
        batch_id: input.batchId,
        organization_id: input.organizationId,
        entity_type: 'hospitalizations',
        entity_id: data.id,
        external_id: row.externalHospitalizationId,
      });
    }
    return { imported, failed, skipped, idMap };
  }

  if (input.entity === 'appointments') {
    const appointmentRows = asAppointmentRows(slice, input.mapping).map((row, idx) => ({
      ...row,
      rowNumber: input.offset + idx + 2,
    }));
    for (const row of appointmentRows) {
      const patientId = input.patientIdByExternal[row.externalPatientId];
      const starts = parseImportDateTime(row.startsAt, input.locale);
      const ends = row.endsAt ? parseImportDateTime(row.endsAt, input.locale) : null;
      if (!patientId || !starts.ok || (row.endsAt && (!ends || !ends.ok))) {
        failed += 1;
        continue;
      }
      const endsIso =
        ends && ends.ok
          ? ends.iso
          : new Date(new Date(starts.iso).getTime() + 30 * 60 * 1000).toISOString();
      if (endsIso <= starts.iso) {
        failed += 1;
        continue;
      }
      const sourceSystem = row.sourceSystem ?? input.sourceSystem ?? '';
      if (skipExisting) {
        const existingId = await findSpecialtyBySource({
          supabase: input.supabase,
          table: 'appointments',
          organizationId: input.organizationId,
          sourceSystem,
          sourceRecordId: row.externalAppointmentId,
        });
        if (existingId) {
          idMap[row.externalAppointmentId] = existingId;
          skipped += 1;
          await input.supabase.from('data_import_id_map').insert({
            batch_id: input.batchId,
            organization_id: input.organizationId,
            entity_type: 'appointments',
            external_id: row.externalAppointmentId,
            internal_id: existingId,
          });
          continue;
        }
      }
      const { data: patient } = await input.supabase
        .from('patients')
        .select('id, owner_id')
        .eq('id', patientId)
        .eq('organization_id', input.organizationId)
        .maybeSingle();
      if (!patient) {
        failed += 1;
        continue;
      }
      const branchResolved = resolveImportBranchId({
        externalBranchId: row.externalBranchId,
        branchIdByExternal: input.branchIdByExternal,
        knownBranchInternalIds: input.knownBranchInternalIds,
        defaultBranchId: input.branchId,
      });
      if (!branchResolved.ok) {
        failed += 1;
        continue;
      }
      const staffResolved = resolveImportStaffUserId({
        externalAssignedUserId: row.externalAssignedUserId,
        userIdByExternal: input.userIdByExternal,
        knownStaffInternalIds: input.knownStaffInternalIds,
      });
      if (!staffResolved.ok) {
        failed += 1;
        continue;
      }
      const typeRaw = (row.appointmentType ?? '').trim().toLowerCase();
      const appointmentType =
        typeRaw === 'vacunacion' || typeRaw === 'vacunación'
          ? 'vacunacion'
          : typeRaw === 'cirugia' || typeRaw === 'cirugía'
            ? 'cirugia'
            : typeRaw === 'control'
              ? 'control'
              : typeRaw === 'emergencia'
                ? 'emergencia'
                : typeRaw === 'otro'
                  ? 'otro'
                  : 'consulta';
      const statusRaw = (row.status ?? '').trim().toLowerCase();
      const status =
        statusRaw === 'confirmada'
          ? 'confirmada'
          : statusRaw === 'en_curso' || statusRaw === 'en curso'
            ? 'en_curso'
            : statusRaw === 'completada'
              ? 'completada'
              : statusRaw === 'cancelada'
                ? 'cancelada'
                : statusRaw === 'ausente'
                  ? 'ausente'
                  : 'programada';
      const { data, error } = await input.supabase
        .from('appointments')
        .insert({
          organization_id: input.organizationId,
          branch_id: branchResolved.branchId,
          patient_id: patient.id,
          owner_id: patient.owner_id,
          assigned_user_id: staffResolved.userId,
          starts_at: starts.iso,
          ends_at: endsIso,
          status,
          appointment_type: appointmentType,
          title: row.title?.trim() || null,
          notes: row.notes?.trim() || null,
          import_batch_id: input.batchId,
          source_system: row.sourceSystem ?? input.sourceSystem,
          source_record_id: row.externalAppointmentId,
          imported_at: nowIso,
          imported_by: input.userId,
        })
        .select('id')
        .single();
      if (error || !data) {
        failed += 1;
        continue;
      }
      imported += 1;
      idMap[row.externalAppointmentId] = data.id;
      await input.supabase.from('data_import_created_rows').insert({
        batch_id: input.batchId,
        organization_id: input.organizationId,
        entity_type: 'appointments',
        entity_id: data.id,
        external_id: row.externalAppointmentId,
      });
      await input.supabase.from('data_import_id_map').insert({
        batch_id: input.batchId,
        organization_id: input.organizationId,
        entity_type: 'appointments',
        external_id: row.externalAppointmentId,
        internal_id: data.id,
      });
    }
    return { imported, failed, skipped, idMap };
  }

  if (input.entity === 'consultations') {
    const consultationRows = asConsultationRows(slice, input.mapping).map((row, idx) => ({
      ...row,
      rowNumber: input.offset + idx + 2,
    }));
    const appointmentMap = input.appointmentIdByExternal ?? {};
    for (const row of consultationRows) {
      const patientId = input.patientIdByExternal[row.externalPatientId];
      const started = parseImportDateTime(row.startedAt, input.locale);
      const completed = row.completedAt ? parseImportDateTime(row.completedAt, input.locale) : null;
      if (!patientId || !started.ok || (row.completedAt && (!completed || !completed.ok))) {
        failed += 1;
        continue;
      }
      const sourceSystem = row.sourceSystem ?? input.sourceSystem ?? '';
      if (skipExisting) {
        const existingId = await findSpecialtyBySource({
          supabase: input.supabase,
          table: 'consultations',
          organizationId: input.organizationId,
          sourceSystem,
          sourceRecordId: row.externalConsultationId,
        });
        if (existingId) {
          idMap[row.externalConsultationId] = existingId;
          skipped += 1;
          await input.supabase.from('data_import_id_map').insert({
            batch_id: input.batchId,
            organization_id: input.organizationId,
            entity_type: 'consultations',
            external_id: row.externalConsultationId,
            internal_id: existingId,
          });
          continue;
        }
      }
      const { data: patient } = await input.supabase
        .from('patients')
        .select('id, owner_id')
        .eq('id', patientId)
        .eq('organization_id', input.organizationId)
        .maybeSingle();
      if (!patient) {
        failed += 1;
        continue;
      }
      const branchResolved = resolveImportBranchId({
        externalBranchId: row.externalBranchId,
        branchIdByExternal: input.branchIdByExternal,
        knownBranchInternalIds: input.knownBranchInternalIds,
        defaultBranchId: input.branchId,
      });
      if (!branchResolved.ok) {
        failed += 1;
        continue;
      }
      const staffResolved = resolveImportStaffUserId({
        externalAssignedUserId: row.externalAssignedUserId,
        userIdByExternal: input.userIdByExternal,
        knownStaffInternalIds: input.knownStaffInternalIds,
        defaultUserId: input.userId,
      });
      if (!staffResolved.ok) {
        failed += 1;
        continue;
      }
      const appointmentId = row.externalAppointmentId
        ? appointmentMap[row.externalAppointmentId] ?? null
        : null;
      const statusRaw = (row.status ?? '').trim().toLowerCase();
      const status =
        statusRaw === 'en_curso' || statusRaw === 'en curso'
          ? 'en_curso'
          : statusRaw === 'completada'
            ? 'completada'
            : statusRaw === 'cancelada'
              ? 'cancelada'
              : statusRaw === 'en_espera' || statusRaw === 'en espera'
                ? 'en_espera'
                : completed && completed.ok
                  ? 'completada'
                  : 'en_espera';
      const weightKg =
        row.weightKg != null && row.weightKg !== '' && !Number.isNaN(Number(String(row.weightKg).replace(',', '.')))
          ? Number(String(row.weightKg).replace(',', '.'))
          : null;
      const temperatureC =
        row.temperatureC != null &&
        row.temperatureC !== '' &&
        !Number.isNaN(Number(String(row.temperatureC).replace(',', '.')))
          ? Number(String(row.temperatureC).replace(',', '.'))
          : null;
      const { data, error } = await input.supabase
        .from('consultations')
        .insert({
          organization_id: input.organizationId,
          branch_id: branchResolved.branchId,
          patient_id: patient.id,
          owner_id: patient.owner_id,
          appointment_id: appointmentId,
          veterinarian_id: staffResolved.userId,
          status,
          started_at: started.iso,
          completed_at: completed && completed.ok ? completed.iso : null,
          title: row.title?.trim() || null,
          anamnesis: row.anamnesis?.trim() || null,
          physical_exam: row.physicalExam?.trim() || null,
          diagnosis: row.diagnosis?.trim() || null,
          treatment: row.treatment?.trim() || null,
          plan: row.plan?.trim() || null,
          weight_kg: weightKg,
          temperature_c: temperatureC,
          notes: row.notes?.trim() || null,
          import_batch_id: input.batchId,
          source_system: row.sourceSystem ?? input.sourceSystem,
          source_record_id: row.externalConsultationId,
          imported_at: nowIso,
          imported_by: input.userId,
        })
        .select('id')
        .single();
      if (error || !data) {
        failed += 1;
        continue;
      }
      imported += 1;
      idMap[row.externalConsultationId] = data.id;
      await input.supabase.from('data_import_created_rows').insert({
        batch_id: input.batchId,
        organization_id: input.organizationId,
        entity_type: 'consultations',
        entity_id: data.id,
        external_id: row.externalConsultationId,
      });
      await input.supabase.from('data_import_id_map').insert({
        batch_id: input.batchId,
        organization_id: input.organizationId,
        entity_type: 'consultations',
        external_id: row.externalConsultationId,
        internal_id: data.id,
      });
    }
    return { imported, failed, skipped, idMap };
  }

  if (input.entity === 'inventory_products') {
    const productRows = asInventoryProductRows(slice, input.mapping).map((row, idx) => ({
      ...row,
      rowNumber: input.offset + idx + 2,
    }));
    for (const row of productRows) {
      if (!row.name.trim() || !row.externalProductId.trim()) {
        failed += 1;
        continue;
      }
      const quantity = row.quantity != null && row.quantity !== '' ? Number(row.quantity) : 0;
      const minQuantity =
        row.minQuantity != null && row.minQuantity !== '' ? Number(row.minQuantity) : 0;
      if (Number.isNaN(quantity) || Number.isNaN(minQuantity)) {
        failed += 1;
        continue;
      }
      const sourceSystem = row.sourceSystem ?? input.sourceSystem ?? '';
      if (skipExisting) {
        const existingId = await findSpecialtyBySource({
          supabase: input.supabase,
          table: 'inventory_products',
          organizationId: input.organizationId,
          sourceSystem,
          sourceRecordId: row.externalProductId,
        });
        if (existingId) {
          idMap[row.externalProductId] = existingId;
          skipped += 1;
          await input.supabase.from('data_import_id_map').insert({
            batch_id: input.batchId,
            organization_id: input.organizationId,
            entity_type: 'inventory_products',
            external_id: row.externalProductId,
            internal_id: existingId,
          });
          continue;
        }
      }
      const branchResolved = resolveImportBranchId({
        externalBranchId: row.externalBranchId,
        branchIdByExternal: input.branchIdByExternal,
        knownBranchInternalIds: input.knownBranchInternalIds,
        defaultBranchId: input.branchId,
      });
      if (!branchResolved.ok) {
        failed += 1;
        continue;
      }
      const catRaw = (row.category ?? '').trim().toLowerCase();
      const category =
        catRaw === 'vacuna'
          ? 'vacuna'
          : catRaw === 'insumo'
            ? 'insumo'
            : catRaw === 'alimento'
              ? 'alimento'
              : catRaw === 'laboratorio'
                ? 'laboratorio'
                : catRaw === 'otro'
                  ? 'otro'
                  : 'medicamento';
      const unitRaw = (row.unit ?? '').trim().toLowerCase();
      const unit =
        unitRaw === 'caja'
          ? 'caja'
          : unitRaw === 'frasco'
            ? 'frasco'
            : unitRaw === 'ml'
              ? 'ml'
              : unitRaw === 'mg'
                ? 'mg'
                : unitRaw === 'g'
                  ? 'g'
                  : unitRaw === 'kg'
                    ? 'kg'
                    : unitRaw === 'dosis'
                      ? 'dosis'
                      : unitRaw === 'otro'
                        ? 'otro'
                        : 'unidad';
      const unitCost =
        row.unitCost != null && row.unitCost !== '' && !Number.isNaN(Number(row.unitCost))
          ? Number(row.unitCost)
          : null;
      const unitPrice =
        row.unitPrice != null && row.unitPrice !== '' && !Number.isNaN(Number(row.unitPrice))
          ? Number(row.unitPrice)
          : null;
      const { data, error } = await input.supabase
        .from('inventory_products')
        .insert({
          organization_id: input.organizationId,
          branch_id: branchResolved.branchId,
          name: row.name.trim(),
          sku: row.sku?.trim() || null,
          category,
          unit,
          quantity,
          min_quantity: minQuantity,
          unit_cost: unitCost,
          unit_price: unitPrice,
          manufacturer: row.manufacturer?.trim() || null,
          notes: row.notes?.trim() || null,
          is_active: true,
          import_batch_id: input.batchId,
          source_system: row.sourceSystem ?? input.sourceSystem,
          source_record_id: row.externalProductId,
          imported_at: nowIso,
          imported_by: input.userId,
        })
        .select('id')
        .single();
      if (error || !data) {
        failed += 1;
        continue;
      }
      imported += 1;
      idMap[row.externalProductId] = data.id;
      await input.supabase.from('data_import_created_rows').insert({
        batch_id: input.batchId,
        organization_id: input.organizationId,
        entity_type: 'inventory_products',
        entity_id: data.id,
        external_id: row.externalProductId,
      });
      await input.supabase.from('data_import_id_map').insert({
        batch_id: input.batchId,
        organization_id: input.organizationId,
        entity_type: 'inventory_products',
        external_id: row.externalProductId,
        internal_id: data.id,
      });
    }
    return { imported, failed, skipped, idMap };
  }

  if (input.entity === 'invoices') {
    const invoiceRows = asInvoiceRows(slice, input.mapping).map((row, idx) => ({
      ...row,
      rowNumber: input.offset + idx + 2,
    }));
    const ownerMap = input.ownerIdByExternal ?? {};
    const productMap = input.productIdByExternal ?? {};
    const parseMoney = (value: string | null | undefined): number | null => {
      if (value == null || value === '') return null;
      const n = Number(String(value).replace(',', '.'));
      return Number.isNaN(n) ? null : n;
    };
    for (const row of invoiceRows) {
      if (!row.externalInvoiceId.trim()) {
        failed += 1;
        continue;
      }
      let ownerId = row.externalOwnerId ? ownerMap[row.externalOwnerId] : undefined;
      let patientId = row.externalPatientId
        ? input.patientIdByExternal[row.externalPatientId]
        : undefined;
      if (patientId && !ownerId) {
        const { data: patient } = await input.supabase
          .from('patients')
          .select('id, owner_id')
          .eq('id', patientId)
          .eq('organization_id', input.organizationId)
          .maybeSingle();
        if (!patient) {
          failed += 1;
          continue;
        }
        ownerId = patient.owner_id;
        patientId = patient.id;
      }
      if (!ownerId) {
        failed += 1;
        continue;
      }
      const sourceSystem = row.sourceSystem ?? input.sourceSystem ?? '';
      let invoiceId = idMap[row.externalInvoiceId];
      if (!invoiceId) {
        const existingId = await findSpecialtyBySource({
          supabase: input.supabase,
          table: 'invoices',
          organizationId: input.organizationId,
          sourceSystem,
          sourceRecordId: row.externalInvoiceId,
        });
        if (existingId) {
          const { data: existingInv } = await input.supabase
            .from('invoices')
            .select('id, import_batch_id')
            .eq('id', existingId)
            .eq('organization_id', input.organizationId)
            .maybeSingle();
          if (existingInv?.import_batch_id === input.batchId) {
            invoiceId = existingId;
            idMap[row.externalInvoiceId] = existingId;
          } else if (skipExisting) {
            idMap[row.externalInvoiceId] = existingId;
            skipped += 1;
            await input.supabase.from('data_import_id_map').insert({
              batch_id: input.batchId,
              organization_id: input.organizationId,
              entity_type: 'invoices',
              external_id: row.externalInvoiceId,
              internal_id: existingId,
            });
            continue;
          } else {
            // No silent mutation of invoices from other batches/sources.
            failed += 1;
            continue;
          }
        }
        if (!invoiceId) {
        const branchResolved = resolveImportBranchId({
          externalBranchId: row.externalBranchId,
          branchIdByExternal: input.branchIdByExternal,
          knownBranchInternalIds: input.knownBranchInternalIds,
          defaultBranchId: input.branchId,
        });
        if (!branchResolved.ok) {
          failed += 1;
          continue;
        }
        const staffResolved = resolveImportStaffUserId({
          externalAssignedUserId: row.externalAssignedUserId,
          userIdByExternal: input.userIdByExternal,
          knownStaffInternalIds: input.knownStaffInternalIds,
          defaultUserId: input.userId,
        });
        if (!staffResolved.ok) {
          failed += 1;
          continue;
        }
        const issued = row.issuedAt ? parseImportDate(row.issuedAt, input.locale) : null;
        const statusRaw = (row.status ?? '').trim().toLowerCase();
        const status =
          statusRaw === 'pagada'
            ? 'pagada'
            : statusRaw === 'anulada'
              ? 'anulada'
              : statusRaw === 'borrador'
                ? 'borrador'
                : 'emitida';
        const total = parseMoney(row.total) ?? parseMoney(row.lineTotal) ?? 0;
        const subtotal = parseMoney(row.subtotal) ?? total;
        const taxAmount = parseMoney(row.taxAmount) ?? 0;
        const paidAmount = parseMoney(row.paidAmount) ?? 0;
        const balance = parseMoney(row.balance) ?? Math.max(total - paidAmount, 0);
        const { data, error } = await input.supabase
          .from('invoices')
          .insert({
            organization_id: input.organizationId,
            branch_id: branchResolved.branchId,
            owner_id: ownerId,
            patient_id: patientId ?? null,
            created_by: staffResolved.userId,
            status,
            number: row.number?.trim() || null,
            currency: (row.currency?.trim() || 'ARS').slice(0, 8),
            issued_at: issued?.ok ? `${issued.isoDate}T12:00:00.000Z` : nowIso,
            subtotal,
            tax_amount: taxAmount,
            total,
            paid_amount: paidAmount,
            balance,
            notes: row.notes?.trim() || null,
            import_batch_id: input.batchId,
            source_system: row.sourceSystem ?? input.sourceSystem,
            source_record_id: row.externalInvoiceId,
            imported_at: nowIso,
            imported_by: input.userId,
          })
          .select('id')
          .single();
        if (error || !data) {
          failed += 1;
          continue;
        }
        invoiceId = data.id;
        idMap[row.externalInvoiceId] = invoiceId;
        imported += 1;
        await input.supabase.from('data_import_created_rows').insert({
          batch_id: input.batchId,
          organization_id: input.organizationId,
          entity_type: 'invoices',
          entity_id: invoiceId,
          external_id: row.externalInvoiceId,
        });
        await input.supabase.from('data_import_id_map').insert({
          batch_id: input.batchId,
          organization_id: input.organizationId,
          entity_type: 'invoices',
          external_id: row.externalInvoiceId,
          internal_id: invoiceId,
        });
        }
      }
      const description = row.description?.trim();
      if (description) {
        const qty = parseMoney(row.quantity) ?? 1;
        const unitPrice = parseMoney(row.unitPrice) ?? 0;
        const lineTotal = parseMoney(row.lineTotal) ?? qty * unitPrice;
        const productId = row.externalProductId
          ? productMap[row.externalProductId] ?? null
          : null;
        const { error: itemError } = await input.supabase.from('invoice_items').insert({
          organization_id: input.organizationId,
          invoice_id: invoiceId,
          inventory_product_id: productId,
          description: description.slice(0, 240),
          quantity: qty,
          unit_price: unitPrice,
          line_total: lineTotal,
          sort_order: 0,
        });
        if (itemError) {
          failed += 1;
        }
      }
    }
    return { imported, failed, skipped, idMap };
  }

  if (input.entity === 'payments') {
    const paymentRows = asPaymentRows(slice, input.mapping).map((row, idx) => ({
      ...row,
      rowNumber: input.offset + idx + 2,
    }));
    const invoiceMap = input.invoiceIdByExternal ?? {};
    for (const row of paymentRows) {
      const invoiceId = invoiceMap[row.externalInvoiceId];
      const amount = Number(String(row.amount).replace(',', '.'));
      if (!invoiceId || !row.externalPaymentId.trim() || Number.isNaN(amount) || amount <= 0) {
        failed += 1;
        continue;
      }
      const { data: invoice } = await input.supabase
        .from('invoices')
        .select('id')
        .eq('id', invoiceId)
        .eq('organization_id', input.organizationId)
        .is('deleted_at', null)
        .maybeSingle();
      if (!invoice) {
        failed += 1;
        continue;
      }
      const sourceSystem = row.sourceSystem ?? input.sourceSystem ?? '';
      if (skipExisting) {
        const existingId = await findSpecialtyBySource({
          supabase: input.supabase,
          table: 'payments',
          organizationId: input.organizationId,
          sourceSystem,
          sourceRecordId: row.externalPaymentId,
        });
        if (existingId) {
          idMap[row.externalPaymentId] = existingId;
          skipped += 1;
          await input.supabase.from('data_import_id_map').insert({
            batch_id: input.batchId,
            organization_id: input.organizationId,
            entity_type: 'payments',
            external_id: row.externalPaymentId,
            internal_id: existingId,
          });
          continue;
        }
      }
      const methodRaw = (row.method ?? '').trim().toLowerCase();
      const method =
        methodRaw === 'transferencia'
          ? 'transferencia'
          : methodRaw === 'tarjeta'
            ? 'tarjeta'
            : methodRaw === 'mercadopago' || methodRaw === 'mp'
              ? 'mercadopago'
              : methodRaw === 'otro'
                ? 'otro'
                : 'efectivo';
      const paid = row.paidAt ? parseImportDate(row.paidAt, input.locale) : null;
      const paidAt = paid?.ok ? `${paid.isoDate}T12:00:00.000Z` : nowIso;
      const staffResolved = resolveImportStaffUserId({
        externalAssignedUserId: row.externalAssignedUserId,
        userIdByExternal: input.userIdByExternal,
        knownStaffInternalIds: input.knownStaffInternalIds,
        defaultUserId: input.userId,
      });
      if (!staffResolved.ok) {
        failed += 1;
        continue;
      }
      const { data, error } = await input.supabase
        .from('payments')
        .insert({
          organization_id: input.organizationId,
          invoice_id: invoiceId,
          recorded_by: staffResolved.userId,
          method,
          amount,
          paid_at: paidAt,
          reference: row.reference?.trim() || null,
          notes: row.notes?.trim() || null,
          import_batch_id: input.batchId,
          source_system: row.sourceSystem ?? input.sourceSystem,
          source_record_id: row.externalPaymentId,
          imported_at: nowIso,
          imported_by: input.userId,
        })
        .select('id')
        .single();
      if (error || !data) {
        failed += 1;
        continue;
      }
      imported += 1;
      idMap[row.externalPaymentId] = data.id;
      await input.supabase.from('data_import_created_rows').insert({
        batch_id: input.batchId,
        organization_id: input.organizationId,
        entity_type: 'payments',
        entity_id: data.id,
        external_id: row.externalPaymentId,
      });
      await input.supabase.from('data_import_id_map').insert({
        batch_id: input.batchId,
        organization_id: input.organizationId,
        entity_type: 'payments',
        external_id: row.externalPaymentId,
        internal_id: data.id,
      });
    }
    return { imported, failed, skipped, idMap };
  }

  const rows = asPrescriptionRows(slice, input.mapping).map((row, idx) => ({
    ...row,
    rowNumber: input.offset + idx + 2,
  }));
  for (const row of rows) {
    const patientId = input.patientIdByExternal[row.externalPatientId];
    const date = parseImportDate(row.prescribedAt, input.locale);
    if (!patientId || !date.ok || !row.medicationName || !row.dose || !row.frequency) {
      failed += 1;
      continue;
    }
    const sourceSystem = row.sourceSystem ?? input.sourceSystem ?? '';
    if (skipExisting) {
      const existingId = await findSpecialtyBySource({
        supabase: input.supabase,
        table: 'prescriptions',
        organizationId: input.organizationId,
        sourceSystem,
        sourceRecordId: row.externalPrescriptionId,
      });
      if (existingId) {
        idMap[row.externalPrescriptionId] = existingId;
        skipped += 1;
        await input.supabase.from('data_import_id_map').insert({
          batch_id: input.batchId,
          organization_id: input.organizationId,
          entity_type: 'prescriptions',
          external_id: row.externalPrescriptionId,
          internal_id: existingId,
        });
        continue;
      }
    }
    const { data: patient } = await input.supabase
      .from('patients')
      .select('id, owner_id')
      .eq('id', patientId)
      .eq('organization_id', input.organizationId)
      .maybeSingle();
    if (!patient) {
      failed += 1;
      continue;
    }
    const branchResolved = resolveImportBranchId({
      externalBranchId: row.externalBranchId,
      branchIdByExternal: input.branchIdByExternal,
      knownBranchInternalIds: input.knownBranchInternalIds,
      defaultBranchId: input.branchId,
    });
    if (!branchResolved.ok) {
      failed += 1;
      continue;
    }
    const staffResolved = resolveImportStaffUserId({
      externalAssignedUserId: row.externalAssignedUserId,
      userIdByExternal: input.userIdByExternal,
      knownStaffInternalIds: input.knownStaffInternalIds,
      defaultUserId: input.userId,
    });
    if (!staffResolved.ok) {
      failed += 1;
      continue;
    }
    const { data, error } = await input.supabase
      .from('prescriptions')
      .insert({
        organization_id: input.organizationId,
        branch_id: branchResolved.branchId,
        patient_id: patient.id,
        owner_id: patient.owner_id,
        prescribed_by: staffResolved.userId,
        status: 'activa',
        notes: [row.notes, row.originalVeterinarian ? `Profesional original: ${row.originalVeterinarian}` : null]
          .filter(Boolean)
          .join('\n') || null,
        prescribed_at: `${date.isoDate}T12:00:00.000Z`,
        import_batch_id: input.batchId,
        source_system: row.sourceSystem ?? input.sourceSystem,
        source_record_id: row.externalPrescriptionId,
        original_created_at: `${date.isoDate}T12:00:00.000Z`,
        original_professional_name: row.originalVeterinarian,
        imported_at: nowIso,
        imported_by: input.userId,
      })
      .select('id')
      .single();
    if (error || !data) {
      failed += 1;
      continue;
    }
    const qty = row.quantity ? Number(row.quantity.replace(',', '.')) : 0;
    await input.supabase.from('prescription_items').insert({
      organization_id: input.organizationId,
      prescription_id: data.id,
      medication_name: row.medicationName.slice(0, 160),
      dose: row.dose.slice(0, 80),
      frequency: row.frequency.slice(0, 80),
      duration: row.duration?.slice(0, 80) ?? null,
      route: normalizeRxRoute(row.route),
      quantity: Number.isFinite(qty) ? qty : 0,
      instructions: row.instructions?.slice(0, 1000) ?? null,
      sort_order: 0,
    });
    imported += 1;
    idMap[row.externalPrescriptionId] = data.id;
    await input.supabase.from('data_import_created_rows').insert({
      batch_id: input.batchId,
      organization_id: input.organizationId,
      entity_type: 'prescriptions',
      entity_id: data.id,
      external_id: row.externalPrescriptionId,
    });
  }
  return { imported, failed, skipped, idMap };
}
