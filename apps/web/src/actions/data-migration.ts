'use server';

import { revalidatePath } from 'next/cache';
import {
  DEFAULT_IMPORT_CHUNK_SIZE,
  IDEMPOTENCY_MODES,
  buildAppointmentTemplateCsv,
  buildConsultationTemplateCsv,
  buildStaffMapTemplateCsv,
  parseStaffMapCsv,
  parseBranchMapCsv,
  buildBatchErrorsReportCsv,
  buildBranchTemplateCsv,
  buildClinicalTemplateCsv,
  buildHospitalizationTemplateCsv,
  buildIdMapReportCsv,
  buildOrgIdMapCsv,
  buildIntegrityReportCsv,
  buildInventoryProductTemplateCsv,
  buildInvoiceTemplateCsv,
  buildPaymentTemplateCsv,
  buildMigrationChecklistCsv,
  buildBillingReconcileCsv,
  buildExportCatalogCsv,
  buildFreezeRecommendationsCsv,
  buildCutoverPackReadme,
  buildBranchMapTemplateCsv,
  buildAttachmentMetaTemplateCsv,
  buildCutoverRoundtripNotes,
  CUTOVER_PACK_VERSION,
  DATA_MIGRATION_AUDIT_ACTIONS,
  isCutoverPackReady,
  summarizeMigrationChecklist,
  buildLabOrderTemplateCsv,
  buildOwnerTemplateCsv,
  buildPatientTemplateCsv,
  buildPrescriptionTemplateCsv,
  buildSurgeryTemplateCsv,
  buildVaccinationTemplateCsv,
  buildValidationReportCsv,
  sumOrphanCounts,
  unresolvedConflictRows,
  IMPORT_TYPES,
  EXPORT_FORMATS,
  EXPORT_TYPES,
  type ActionResult,
  type ExportFormat,
  type ExportType,
  type IdempotencyMode,
  type ImportType,
  type RowConflictDecision,
  type ValidationIssue,
} from '@sincvete/shared';
import { PermissionError, requirePermissionAndFeature, canPermissionAndFeature, requireSuperadmin } from '@/lib/permissions';
import { FEATURES, planRestrictionResult } from '@/lib/entitlements';
import { logDataMigrationAudit } from '@/lib/data-migration/audit';
import {
  analyzeImportFile,
  commitImport,
  createImportBatch,
  dryRunImport,
  getImportBatch,
  listImportBatches,
  queueImportBatch,
  rollbackImportBatch,
  saveRowDecisions,
} from '@/lib/data-migration/import';
import { createExportJob, getExportDownloadUrl, getImportBatchProgress, listExportJobs, runExportJob } from '@/lib/data-migration/export';
import { buildSampleMigrationZip, parseSyncveteMigrationZip, summarizeZipContents } from '@/lib/data-migration/zip';
import { workbookFirstSheetToCsv } from '@/lib/data-migration/xlsx';
import { importZipAttachmentsChunk } from '@/lib/data-migration/attachments';
import { createServerClient } from '@/lib/supabase/server';
import JSZip from 'jszip';

const ORG_ID_MAP_EXPORT_LIMIT = 50000;

const IMPORT_ENTITIES = [
  'branches',
  'owners',
  'patients',
  'clinical_entries',
  'vaccinations',
  'lab_orders',
  'surgeries',
  'prescriptions',
  'hospitalizations',
  'appointments',
  'consultations',
  'inventory_products',
  'invoices',
  'payments',
] as const;
type ImportEntityArg = (typeof IMPORT_ENTITIES)[number];

function asImportEntity(value: string): ImportEntityArg | null {
  return (IMPORT_ENTITIES as readonly string[]).includes(value)
    ? (value as ImportEntityArg)
    : null;
}

function actionError<T = void>(error: unknown): ActionResult<T> {
  const planError = planRestrictionResult<T>(error);
  if (planError) return planError;
  if (error instanceof PermissionError) {
    return { success: false, error: error.message };
  }
  console.error(error);
  return {
    success: false,
    error: error instanceof Error ? error.message : 'Ocurrió un error inesperado',
  };
}

async function requireImportAccess() {
  return requirePermissionAndFeature('data:import', FEATURES.DATA_IMPORT_EXPORT);
}

async function requireExportAccess() {
  return requirePermissionAndFeature('data:export', FEATURES.DATA_IMPORT_EXPORT);
}

function asImportType(value: string): ImportType | null {
  return (IMPORT_TYPES as readonly string[]).includes(value) ? (value as ImportType) : null;
}

function asExportType(value: string): ExportType | null {
  return (EXPORT_TYPES as readonly string[]).includes(value) ? (value as ExportType) : null;
}

function asExportFormat(value: string): ExportFormat | null {
  return (EXPORT_FORMATS as readonly string[]).includes(value) ? (value as ExportFormat) : null;
}

export async function downloadImportTemplate(
  formData: FormData
): Promise<ActionResult<{ filename: string; csv: string }>> {
  try {
    await requireImportAccess();
    const kind = String(formData.get('kind') ?? '');
    if (kind === 'branches') {
      return {
        success: true,
        data: { filename: 'SyncVete-Branches-Template.csv', csv: buildBranchTemplateCsv() },
      };
    }
    if (kind === 'owners') {
      return {
        success: true,
        data: { filename: 'SyncVete-Owners-Template.csv', csv: buildOwnerTemplateCsv() },
      };
    }
    if (kind === 'patients') {
      return {
        success: true,
        data: { filename: 'SyncVete-Patients-Template.csv', csv: buildPatientTemplateCsv() },
      };
    }
    if (kind === 'clinical_entries') {
      return {
        success: true,
        data: {
          filename: 'SyncVete-Clinical-History-Template.csv',
          csv: buildClinicalTemplateCsv(),
        },
      };
    }
    if (kind === 'vaccinations') {
      return {
        success: true,
        data: {
          filename: 'SyncVete-Vaccinations-Template.csv',
          csv: buildVaccinationTemplateCsv(),
        },
      };
    }
    if (kind === 'lab_orders') {
      return {
        success: true,
        data: { filename: 'SyncVete-Lab-Orders-Template.csv', csv: buildLabOrderTemplateCsv() },
      };
    }
    if (kind === 'surgeries') {
      return {
        success: true,
        data: { filename: 'SyncVete-Surgeries-Template.csv', csv: buildSurgeryTemplateCsv() },
      };
    }
    if (kind === 'prescriptions') {
      return {
        success: true,
        data: {
          filename: 'SyncVete-Prescriptions-Template.csv',
          csv: buildPrescriptionTemplateCsv(),
        },
      };
    }
    if (kind === 'hospitalizations') {
      return {
        success: true,
        data: {
          filename: 'SyncVete-Hospitalizations-Template.csv',
          csv: buildHospitalizationTemplateCsv(),
        },
      };
    }
    if (kind === 'appointments') {
      return {
        success: true,
        data: {
          filename: 'SyncVete-Appointments-Template.csv',
          csv: buildAppointmentTemplateCsv(),
        },
      };
    }
    if (kind === 'consultations') {
      return {
        success: true,
        data: {
          filename: 'SyncVete-Consultations-Template.csv',
          csv: buildConsultationTemplateCsv(),
        },
      };
    }
    if (kind === 'inventory_products') {
      return {
        success: true,
        data: {
          filename: 'SyncVete-Inventory-Template.csv',
          csv: buildInventoryProductTemplateCsv(),
        },
      };
    }
    if (kind === 'invoices') {
      return {
        success: true,
        data: {
          filename: 'SyncVete-Invoices-Template.csv',
          csv: buildInvoiceTemplateCsv(),
        },
      };
    }
    if (kind === 'payments') {
      return {
        success: true,
        data: {
          filename: 'SyncVete-Payments-Template.csv',
          csv: buildPaymentTemplateCsv(),
        },
      };
    }
    if (kind === 'staff_map') {
      return {
        success: true,
        data: {
          filename: 'SyncVete-Staff-Map-Template.csv',
          csv: buildStaffMapTemplateCsv(),
        },
      };
    }
    if (kind === 'branch_map') {
      return {
        success: true,
        data: {
          filename: 'SyncVete-Branch-Map-Template.csv',
          csv: buildBranchMapTemplateCsv(),
        },
      };
    }
    if (kind === 'attachment_meta') {
      return {
        success: true,
        data: {
          filename: 'SyncVete-Attachment-Meta-Template.csv',
          csv: buildAttachmentMetaTemplateCsv(),
        },
      };
    }
    return { success: false, error: 'Plantilla inválida' };
  } catch (error) {
    return actionError(error);
  }
}

export async function parseStaffMapAction(formData: FormData): Promise<
  ActionResult<{ map: Record<string, string>; issues: Array<{ rowNumber: number; message: string }> }>
> {
  try {
    await requireImportAccess();
    const csvText = String(formData.get('csvText') ?? '');
    if (!csvText.trim()) return { success: false, error: 'CSV vacío' };
    const parsed = parseStaffMapCsv(csvText);
    return { success: true, data: parsed };
  } catch (error) {
    return actionError(error);
  }
}

export async function parseBranchMapAction(formData: FormData): Promise<
  ActionResult<{ map: Record<string, string>; issues: Array<{ rowNumber: number; message: string }> }>
> {
  try {
    await requireImportAccess();
    const csvText = String(formData.get('csvText') ?? '');
    if (!csvText.trim()) return { success: false, error: 'CSV vacío' };
    const parsed = parseBranchMapCsv(csvText);
    return { success: true, data: parsed };
  } catch (error) {
    return actionError(error);
  }
}

export async function startDataImport(formData: FormData): Promise<
  ActionResult<{
    batchId: string;
    headers: string[];
    mapping: Record<string, string | null>;
    rowCount: number;
  }>
> {
  try {
    const session = await requireImportAccess();
    const importType = asImportType(String(formData.get('importType') ?? ''));
    const entity = asImportEntity(String(formData.get('entity') ?? ''));
    const csvText = String(formData.get('csvText') ?? '');
    const sourceFilename = String(formData.get('sourceFilename') ?? 'upload.csv');
    const sourceSystem = String(formData.get('sourceSystem') ?? '').trim() || null;
    const idempotencyRaw = String(formData.get('idempotencyMode') ?? 'off');
    const idempotencyMode = (IDEMPOTENCY_MODES as readonly string[]).includes(idempotencyRaw)
      ? (idempotencyRaw as IdempotencyMode)
      : 'off';
    if (!importType || !csvText) return { success: false, error: 'Datos de importación incompletos' };
    if (!entity) return { success: false, error: 'Entidad inválida' };

    const batch = await createImportBatch({
      importType,
      sourceFilename,
      sourceFormat: 'csv',
      sourceSystem,
      idempotencyMode,
    });
    const analyzed = await analyzeImportFile({
      batchId: batch.id,
      csvText,
      entity,
    });

    // Ensure a default branch exists for inserts
    const supabase = await createServerClient();
    const { data: branch } = await supabase
      .from('branches')
      .select('id')
      .eq('organization_id', session.organizationId)
      .is('deleted_at', null)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();
    if (!branch) return { success: false, error: 'La clínica no tiene sucursal activa' };

    return {
      success: true,
      data: {
        batchId: batch.id,
        headers: analyzed.headers,
        mapping: analyzed.mapping,
        rowCount: analyzed.rows.length,
      },
    };
  } catch (error) {
    return actionError(error);
  }
}

export async function validateDataImport(formData: FormData): Promise<
  ActionResult<{
    detected: number;
    ready: number;
    warnings: number;
    errors: number;
    issues: unknown[];
  }>
> {
  try {
    await requireImportAccess();
    const batchId = String(formData.get('batchId') ?? '');
    const entity = asImportEntity(String(formData.get('entity') ?? ''));
    const csvText = String(formData.get('csvText') ?? '');
    const mappingJson = String(formData.get('mapping') ?? '{}');
    const knownOwners = String(formData.get('knownOwnerExternalIds') ?? '')
      .split(',')
      .map((v) => v.trim())
      .filter(Boolean);
    const knownPatients = String(formData.get('knownPatientExternalIds') ?? '')
      .split(',')
      .map((v) => v.trim())
      .filter(Boolean);
    const knownInvoices = String(formData.get('knownInvoiceExternalIds') ?? '')
      .split(',')
      .map((v) => v.trim())
      .filter(Boolean);
    const invoiceIdByExternal = JSON.parse(
      String(formData.get('invoiceIdByExternal') ?? '{}')
    ) as Record<string, string>;
    const branchIdByExternal = JSON.parse(
      String(formData.get('branchIdByExternal') ?? '{}')
    ) as Record<string, string>;
    const userIdByExternal = JSON.parse(
      String(formData.get('userIdByExternal') ?? '{}')
    ) as Record<string, string>;
    const mapping = JSON.parse(mappingJson) as Record<string, string | null>;
    if (!entity) return { success: false, error: 'Entidad inválida' };
    const result = await dryRunImport({
      batchId,
      csvText,
      entity,
      mapping,
      knownOwnerExternalIds: knownOwners,
      knownPatientExternalIds: knownPatients,
      knownInvoiceExternalIds: knownInvoices,
      invoiceIdByExternal,
      branchIdByExternal,
      userIdByExternal,
    });
    return { success: true, data: result };
  } catch (error) {
    return actionError(error);
  }
}

export async function commitDataImport(formData: FormData): Promise<
  ActionResult<{
    imported: number;
    failed: number;
    status: string;
    idMap: Record<string, string>;
    done: boolean;
    nextOffset: number;
    processed: number;
    total: number;
  }>
> {
  try {
    const session = await requireImportAccess();
    const batchId = String(formData.get('batchId') ?? '');
    const entity = asImportEntity(String(formData.get('entity') ?? ''));
    const csvText = String(formData.get('csvText') ?? '');
    const mapping = JSON.parse(String(formData.get('mapping') ?? '{}')) as Record<
      string,
      string | null
    >;
    if (!entity) return { success: false, error: 'Entidad inválida' };
    const ownerIdByExternal = JSON.parse(
      String(formData.get('ownerIdByExternal') ?? '{}')
    ) as Record<string, string>;
    const patientIdByExternal = JSON.parse(
      String(formData.get('patientIdByExternal') ?? '{}')
    ) as Record<string, string>;
    const productIdByExternal = JSON.parse(
      String(formData.get('productIdByExternal') ?? '{}')
    ) as Record<string, string>;
    const invoiceIdByExternal = JSON.parse(
      String(formData.get('invoiceIdByExternal') ?? '{}')
    ) as Record<string, string>;
    const appointmentIdByExternal = JSON.parse(
      String(formData.get('appointmentIdByExternal') ?? '{}')
    ) as Record<string, string>;
    const branchIdByExternal = JSON.parse(
      String(formData.get('branchIdByExternal') ?? '{}')
    ) as Record<string, string>;
    const userIdByExternal = JSON.parse(
      String(formData.get('userIdByExternal') ?? '{}')
    ) as Record<string, string>;
    const sourceSystem = String(formData.get('sourceSystem') ?? '').trim() || null;
    const offset = Number(formData.get('offset') ?? 0) || 0;
    const chunkSize =
      Number(formData.get('chunkSize') ?? DEFAULT_IMPORT_CHUNK_SIZE) || DEFAULT_IMPORT_CHUNK_SIZE;
    const rowDecisions = JSON.parse(
      String(formData.get('rowDecisions') ?? '{}')
    ) as Record<number, RowConflictDecision>;
    const validationIssues = JSON.parse(
      String(formData.get('validationIssues') ?? '[]')
    ) as ValidationIssue[];

    const unresolved = unresolvedConflictRows(validationIssues, rowDecisions);
    if (unresolved.length > 0) {
      return {
        success: false,
        error: `Hay ${unresolved.length} filas con duplicados sin decisión (crear/vincular/omitir)`,
      };
    }

    if (Object.keys(rowDecisions).length > 0) {
      await saveRowDecisions({
        batchId,
        entityType: entity,
        decisions: Object.values(rowDecisions),
      });
    }

    const supabase = await createServerClient();
    const { data: branch } = await supabase
      .from('branches')
      .select('id')
      .eq('organization_id', session.organizationId)
      .is('deleted_at', null)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();
    if (!branch) return { success: false, error: 'La clínica no tiene sucursal activa' };

    const result = await commitImport({
      batchId,
      csvText,
      entity,
      mapping,
      sourceSystem,
      ownerIdByExternal,
      patientIdByExternal,
      productIdByExternal,
      invoiceIdByExternal,
      appointmentIdByExternal,
      branchIdByExternal,
      userIdByExternal,
      branchId: branch.id,
      offset,
      chunkSize,
      rowDecisions,
    });
    revalidatePath('/configuracion');
    revalidatePath('/propietarios');
    revalidatePath('/pacientes');
    revalidatePath('/historia-clinica');
    revalidatePath('/vacunacion');
    revalidatePath('/laboratorio');
    revalidatePath('/cirugias');
    revalidatePath('/farmacia');
    revalidatePath('/internacion');
    revalidatePath('/agenda');
    revalidatePath('/consultas');
    revalidatePath('/facturacion');
    return { success: true, data: result };
  } catch (error) {
    return actionError(error);
  }
}

export async function queueDataImportAction(formData: FormData): Promise<
  ActionResult<{ batchId: string; storagePath: string; status: string }>
> {
  try {
    const session = await requireImportAccess();
    const batchId = String(formData.get('batchId') ?? '');
    const entity = asImportEntity(String(formData.get('entity') ?? ''));
    const csvText = String(formData.get('csvText') ?? '');
    const mapping = JSON.parse(String(formData.get('mapping') ?? '{}')) as Record<
      string,
      string | null
    >;
    if (!entity || !batchId || !csvText) {
      return { success: false, error: 'Datos incompletos para encolar' };
    }
    const ownerIdByExternal = JSON.parse(
      String(formData.get('ownerIdByExternal') ?? '{}')
    ) as Record<string, string>;
    const patientIdByExternal = JSON.parse(
      String(formData.get('patientIdByExternal') ?? '{}')
    ) as Record<string, string>;
    const productIdByExternal = JSON.parse(
      String(formData.get('productIdByExternal') ?? '{}')
    ) as Record<string, string>;
    const invoiceIdByExternal = JSON.parse(
      String(formData.get('invoiceIdByExternal') ?? '{}')
    ) as Record<string, string>;
    const appointmentIdByExternal = JSON.parse(
      String(formData.get('appointmentIdByExternal') ?? '{}')
    ) as Record<string, string>;
    const branchIdByExternal = JSON.parse(
      String(formData.get('branchIdByExternal') ?? '{}')
    ) as Record<string, string>;
    const userIdByExternal = JSON.parse(
      String(formData.get('userIdByExternal') ?? '{}')
    ) as Record<string, string>;
    const sourceSystem = String(formData.get('sourceSystem') ?? '').trim() || null;
    const rowDecisions = JSON.parse(
      String(formData.get('rowDecisions') ?? '{}')
    ) as Record<number, RowConflictDecision>;
    const validationIssues = JSON.parse(
      String(formData.get('validationIssues') ?? '[]')
    ) as ValidationIssue[];
    const unresolved = unresolvedConflictRows(validationIssues, rowDecisions);
    if (unresolved.length > 0) {
      return {
        success: false,
        error: `Hay ${unresolved.length} filas con duplicados sin decisión`,
      };
    }

    const supabase = await createServerClient();
    const { data: branch } = await supabase
      .from('branches')
      .select('id')
      .eq('organization_id', session.organizationId)
      .is('deleted_at', null)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();
    if (!branch) return { success: false, error: 'La clínica no tiene sucursal activa' };

    const result = await queueImportBatch({
      batchId,
      csvText,
      entity,
      mapping,
      sourceSystem,
      ownerIdByExternal,
      patientIdByExternal,
      productIdByExternal,
      invoiceIdByExternal,
      appointmentIdByExternal,
      branchIdByExternal,
      userIdByExternal,
      branchId: branch.id,
      rowDecisions,
    });
    revalidatePath('/configuracion');
    return { success: true, data: result };
  } catch (error) {
    return actionError(error);
  }
}

export async function saveImportRowDecisionsAction(formData: FormData): Promise<
  ActionResult<{ saved: number }>
> {
  try {
    await requireImportAccess();
    const batchId = String(formData.get('batchId') ?? '');
    const entity = asImportEntity(String(formData.get('entity') ?? ''));
    const decisions = JSON.parse(String(formData.get('rowDecisions') ?? '{}')) as Record<
      number,
      RowConflictDecision
    >;
    if (!batchId || !entity) return { success: false, error: 'Lote inválido' };
    const result = await saveRowDecisions({
      batchId,
      entityType: entity,
      decisions: Object.values(decisions),
    });
    return { success: true, data: result };
  } catch (error) {
    return actionError(error);
  }
}

export async function importZipAttachmentsAction(formData: FormData): Promise<
  ActionResult<{
    imported: number;
    failed: number;
    total: number;
    processed: number;
    done: boolean;
    nextOffset: number;
    status: string;
  }>
> {
  try {
    const session = await requireImportAccess();
    const batchId = String(formData.get('batchId') ?? '');
    const zipBase64 = String(formData.get('zipBase64') ?? '');
    const sourceSystem = String(formData.get('sourceSystem') ?? '').trim() || null;
    const patientIdByExternal = JSON.parse(
      String(formData.get('patientIdByExternal') ?? '{}')
    ) as Record<string, string>;
    const branchIdByExternal = JSON.parse(
      String(formData.get('branchIdByExternal') ?? '{}')
    ) as Record<string, string>;
    const userIdByExternal = JSON.parse(
      String(formData.get('userIdByExternal') ?? '{}')
    ) as Record<string, string>;
    const offset = Number(formData.get('offset') ?? 0) || 0;
    const chunkSize = Number(formData.get('chunkSize') ?? 10) || 10;
    if (!batchId || !zipBase64) return { success: false, error: 'Datos de adjuntos incompletos' };

    const supabase = await createServerClient();
    const { data: branch } = await supabase
      .from('branches')
      .select('id')
      .eq('organization_id', session.organizationId)
      .is('deleted_at', null)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();
    if (!branch) return { success: false, error: 'La clínica no tiene sucursal activa' };

    const buffer = Buffer.from(zipBase64, 'base64');
    const result = await importZipAttachmentsChunk({
      batchId,
      zipBuffer: buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength),
      patientIdByExternal,
      branchId: branch.id,
      branchIdByExternal,
      userIdByExternal,
      sourceSystem,
      offset,
      chunkSize,
    });
    revalidatePath('/configuracion');
    revalidatePath('/imagenes');
    return { success: true, data: result };
  } catch (error) {
    return actionError(error);
  }
}

export async function downloadSampleMigrationZipAction(): Promise<
  ActionResult<{ filename: string; contentType: string; base64: string }>
> {
  try {
    await requireImportAccess();
    const bytes = await buildSampleMigrationZip('VetLegacy');
    return {
      success: true,
      data: {
        filename: 'SyncVete-Migration-Package-Sample.zip',
        contentType: 'application/zip',
        base64: Buffer.from(bytes).toString('base64'),
      },
    };
  } catch (error) {
    return actionError(error);
  }
}

export async function inspectMigrationZipAction(formData: FormData): Promise<
  ActionResult<{
    summary: Record<string, number | string | null>;
    branchesCsv: string | null;
    ownersCsv: string | null;
    patientsCsv: string | null;
    clinicalCsv: string | null;
    vaccinationsCsv: string | null;
    labOrdersCsv: string | null;
    surgeriesCsv: string | null;
    prescriptionsCsv: string | null;
    hospitalizationsCsv: string | null;
    appointmentsCsv: string | null;
    consultationsCsv: string | null;
    inventoryProductsCsv: string | null;
    invoicesCsv: string | null;
    paymentsCsv: string | null;
  }>
> {
  try {
    await requireImportAccess();
    const base64 = String(formData.get('zipBase64') ?? '');
    if (!base64) return { success: false, error: 'ZIP vacío' };
    const buffer = Buffer.from(base64, 'base64');
    const parsed = await parseSyncveteMigrationZip(
      buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
    );
    return {
      success: true,
      data: {
        summary: summarizeZipContents(parsed),
        branchesCsv: parsed.branchesCsv,
        ownersCsv: parsed.ownersCsv,
        patientsCsv: parsed.patientsCsv,
        clinicalCsv: parsed.clinicalCsv,
        vaccinationsCsv: parsed.vaccinationsCsv,
        labOrdersCsv: parsed.labOrdersCsv,
        surgeriesCsv: parsed.surgeriesCsv,
        prescriptionsCsv: parsed.prescriptionsCsv,
        hospitalizationsCsv: parsed.hospitalizationsCsv,
        appointmentsCsv: parsed.appointmentsCsv,
        consultationsCsv: parsed.consultationsCsv,
        inventoryProductsCsv: parsed.inventoryProductsCsv,
        invoicesCsv: parsed.invoicesCsv,
        paymentsCsv: parsed.paymentsCsv,
      },
    };
  } catch (error) {
    return actionError(error);
  }
}

export async function convertSpreadsheetToCsvAction(formData: FormData): Promise<
  ActionResult<{ csv: string; filename: string }>
> {
  try {
    await requireImportAccess();
    const base64 = String(formData.get('fileBase64') ?? '');
    const filename = String(formData.get('filename') ?? 'upload.xlsx');
    if (!base64) return { success: false, error: 'Archivo vacío' };
    const buffer = Buffer.from(base64, 'base64');
    const csv = workbookFirstSheetToCsv(
      buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
    );
    return {
      success: true,
      data: {
        csv,
        filename: filename.replace(/\.(xlsx|xls)$/i, '.csv'),
      },
    };
  } catch (error) {
    return actionError(error);
  }
}

export async function listDataImportBatchesAction() {
  try {
    await requireImportAccess();
    return { success: true as const, data: await listImportBatches() };
  } catch (error) {
    return actionError(error);
  }
}

export async function getDataImportBatchAction(batchId: string) {
  try {
    await requireImportAccess();
    return { success: true as const, data: await getImportBatch(batchId) };
  } catch (error) {
    return actionError(error);
  }
}

export async function rollbackDataImportAction(
  formData: FormData
): Promise<ActionResult<{ rolledBack: number }>> {
  try {
    await requireImportAccess();
    const batchId = String(formData.get('batchId') ?? '');
    if (!batchId) return { success: false, error: 'Lote inválido' };
    const result = await rollbackImportBatch(batchId);
    revalidatePath('/configuracion');
    return { success: true, data: result };
  } catch (error) {
    return actionError(error);
  }
}

export async function listDataExportJobsAction() {
  try {
    await requireExportAccess();
    return { success: true as const, data: await listExportJobs() };
  } catch (error) {
    return actionError(error);
  }
}

export async function runClinicExportAction(formData: FormData): Promise<
  ActionResult<{
    filename: string;
    contentType: string;
    base64: string;
    recordCounts: Record<string, number>;
    jobId: string;
  }>
> {
  try {
    await requireExportAccess();
    const exportType = asExportType(String(formData.get('exportType') ?? ''));
    const format = asExportFormat(String(formData.get('format') ?? ''));
    const patientId = String(formData.get('patientId') ?? '').trim() || null;
    const dateFrom = String(formData.get('dateFrom') ?? '').trim() || null;
    const dateTo = String(formData.get('dateTo') ?? '').trim() || null;
    if (!exportType || !format) return { success: false, error: 'Exportación inválida' };

    const job = await createExportJob({
      exportType,
      format,
      patientId,
      dateFrom,
      dateTo,
    });
    const result = await runExportJob(job.id);
    const base64 =
      typeof result.body === 'string'
        ? Buffer.from(result.body, 'utf8').toString('base64')
        : Buffer.from(result.body).toString('base64');

    revalidatePath('/configuracion');
    return {
      success: true,
      data: {
        filename: result.filename,
        contentType: result.contentType,
        base64,
        recordCounts: result.recordCounts,
        jobId: result.jobId,
      },
    };
  } catch (error) {
    return actionError(error);
  }
}

export async function queueClinicExportAction(formData: FormData): Promise<
  ActionResult<{ jobId: string; status: string }>
> {
  try {
    await requireExportAccess();
    const exportType = asExportType(String(formData.get('exportType') ?? ''));
    const format = asExportFormat(String(formData.get('format') ?? ''));
    const patientId = String(formData.get('patientId') ?? '').trim() || null;
    const dateFrom = String(formData.get('dateFrom') ?? '').trim() || null;
    const dateTo = String(formData.get('dateTo') ?? '').trim() || null;
    if (!exportType || !format) return { success: false, error: 'Exportación inválida' };

    const job = await createExportJob({
      exportType,
      format,
      patientId,
      dateFrom,
      dateTo,
      queueOnly: true,
    });
    revalidatePath('/configuracion');
    return { success: true, data: { jobId: String(job.id), status: 'queued' } };
  } catch (error) {
    return actionError(error);
  }
}

export async function downloadExportArtifactAction(formData: FormData): Promise<
  ActionResult<{ url: string; filename: string }>
> {
  try {
    await requireExportAccess();
    const jobId = String(formData.get('jobId') ?? '');
    if (!jobId) return { success: false, error: 'Job inválido' };
    const data = await getExportDownloadUrl(jobId);
    return { success: true, data };
  } catch (error) {
    return actionError(error);
  }
}

export async function pollImportBatchProgressAction(formData: FormData): Promise<
  ActionResult<{
    id: string;
    status: string;
    progress_processed: number | null;
    progress_total: number | null;
    progress_message: string | null;
    imported_records: number | null;
    failed_records: number | null;
  }>
> {
  try {
    await requireImportAccess();
    const batchId = String(formData.get('batchId') ?? '');
    if (!batchId) return { success: false, error: 'Lote inválido' };
    const data = await getImportBatchProgress(batchId);
    return {
      success: true,
      data: {
        id: String(data.id),
        status: String(data.status),
        progress_processed: data.progress_processed ?? null,
        progress_total: data.progress_total ?? null,
        progress_message: data.progress_message ?? null,
        imported_records: data.imported_records ?? null,
        failed_records: data.failed_records ?? null,
      },
    };
  } catch (error) {
    return actionError(error);
  }
}

export async function downloadValidationReportAction(formData: FormData): Promise<
  ActionResult<{ filename: string; csv: string }>
> {
  try {
    await requireImportAccess();
    const issues = JSON.parse(String(formData.get('validationIssues') ?? '[]')) as ValidationIssue[];
    return {
      success: true,
      data: {
        filename: `SyncVete-validation-report-${Date.now()}.csv`,
        csv: buildValidationReportCsv(issues),
      },
    };
  } catch (error) {
    return actionError(error);
  }
}

export type SuperadminOrgMigrationStats = {
  organizationId: string;
  imports: Array<Record<string, unknown>>;
  exports: Array<Record<string, unknown>>;
  importTotals: Record<string, unknown>;
  exportTotals: Record<string, unknown>;
};

export async function getSuperadminOrgDataMigrationStats(
  organizationId: string
): Promise<ActionResult<SuperadminOrgMigrationStats>> {
  try {
    await requireSuperadmin();
    const supabase = await createServerClient();
    const { data, error } = await supabase.rpc('superadmin_org_data_migration_stats', {
      p_organization_id: organizationId,
    });
    if (error) return { success: false, error: error.message };
    const payload = (data ?? {}) as Record<string, unknown>;
    return {
      success: true,
      data: {
        organizationId,
        imports: Array.isArray(payload.imports)
          ? (payload.imports as Array<Record<string, unknown>>)
          : [],
        exports: Array.isArray(payload.exports)
          ? (payload.exports as Array<Record<string, unknown>>)
          : [],
        importTotals:
          typeof payload.import_totals === 'object' && payload.import_totals
            ? (payload.import_totals as Record<string, unknown>)
            : {},
        exportTotals:
          typeof payload.export_totals === 'object' && payload.export_totals
            ? (payload.export_totals as Record<string, unknown>)
            : {},
      },
    };
  } catch (error) {
    return actionError(error);
  }
}

export type SuperadminMigrationOpsQueue = {
  imports: Array<Record<string, unknown>>;
  exports: Array<Record<string, unknown>>;
  generatedAt: string | null;
};

export async function getSuperadminDataMigrationOpsQueue(
  limit = 40
): Promise<ActionResult<SuperadminMigrationOpsQueue>> {
  try {
    await requireSuperadmin();
    const supabase = await createServerClient();
    const { data, error } = await supabase.rpc('superadmin_data_migration_ops_queue', {
      p_limit: limit,
    });
    if (error) return { success: false, error: error.message };
    const payload = (data ?? {}) as Record<string, unknown>;
    return {
      success: true,
      data: {
        imports: Array.isArray(payload.imports)
          ? (payload.imports as Array<Record<string, unknown>>)
          : [],
        exports: Array.isArray(payload.exports)
          ? (payload.exports as Array<Record<string, unknown>>)
          : [],
        generatedAt: payload.generated_at ? String(payload.generated_at) : null,
      },
    };
  } catch (error) {
    return actionError(error);
  }
}

export async function cancelDataImportBatchAction(formData: FormData): Promise<ActionResult<{ id: string }>> {
  try {
    const session = await requireImportAccess();
    const batchId = String(formData.get('batchId') ?? '');
    if (!batchId) return { success: false, error: 'Lote inválido' };
    const supabase = await createServerClient();
    const { data, error } = await supabase.rpc('cancel_own_data_import_batch', {
      p_batch_id: batchId,
    });
    if (error) return { success: false, error: error.message };
    await logDataMigrationAudit({
      organizationId: session.organizationId,
      userId: session.userId,
      action: 'data_import.cancelled',
      entityType: 'data_import_batches',
      entityId: batchId,
    });
    revalidatePath('/configuracion');
    return { success: true, data: { id: String((data as { id?: string } | null)?.id ?? batchId) } };
  } catch (error) {
    return actionError(error);
  }
}

export async function retryDataImportBatchAction(formData: FormData): Promise<ActionResult<{ id: string }>> {
  try {
    const session = await requireImportAccess();
    const batchId = String(formData.get('batchId') ?? '');
    if (!batchId) return { success: false, error: 'Lote inválido' };
    const supabase = await createServerClient();
    const { data, error } = await supabase.rpc('retry_own_data_import_batch', {
      p_batch_id: batchId,
    });
    if (error) return { success: false, error: error.message };
    await logDataMigrationAudit({
      organizationId: session.organizationId,
      userId: session.userId,
      action: 'data_import.retried',
      entityType: 'data_import_batches',
      entityId: batchId,
      newData: data as Record<string, unknown>,
    });
    revalidatePath('/configuracion');
    return { success: true, data: { id: String((data as { id?: string } | null)?.id ?? batchId) } };
  } catch (error) {
    return actionError(error);
  }
}

export async function cancelDataExportJobAction(formData: FormData): Promise<ActionResult<{ id: string }>> {
  try {
    const session = await requireExportAccess();
    const jobId = String(formData.get('jobId') ?? '');
    if (!jobId) return { success: false, error: 'Job inválido' };
    const supabase = await createServerClient();
    const { data, error } = await supabase.rpc('cancel_own_data_export_job', {
      p_job_id: jobId,
    });
    if (error) return { success: false, error: error.message };
    await logDataMigrationAudit({
      organizationId: session.organizationId,
      userId: session.userId,
      action: 'data_export.cancelled',
      entityType: 'data_export_jobs',
      entityId: jobId,
    });
    revalidatePath('/configuracion');
    return { success: true, data: { id: String((data as { id?: string } | null)?.id ?? jobId) } };
  } catch (error) {
    return actionError(error);
  }
}

export async function downloadImportBatchErrorsAction(formData: FormData): Promise<
  ActionResult<{ filename: string; csv: string }>
> {
  try {
    await requireImportAccess();
    const batchId = String(formData.get('batchId') ?? '');
    if (!batchId) return { success: false, error: 'Lote inválido' };
    const supabase = await createServerClient();
    const { data, error } = await supabase
      .from('data_import_batch_errors')
      .select(
        'row_number, entity_type, error_code, error_message, field_name, source_reference, severity, recommended_action'
      )
      .eq('batch_id', batchId)
      .order('row_number', { ascending: true })
      .limit(5000);
    if (error) return { success: false, error: error.message };
    const csv = buildBatchErrorsReportCsv(
      (data ?? []).map((row) => ({
        rowNumber: row.row_number,
        entityType: row.entity_type,
        errorCode: row.error_code,
        errorMessage: row.error_message,
        fieldName: row.field_name,
        sourceReference: row.source_reference,
        severity: row.severity,
        recommendedAction: row.recommended_action,
      }))
    );
    return {
      success: true,
      data: {
        filename: `SyncVete-import-errors-${batchId.slice(0, 8)}.csv`,
        csv,
      },
    };
  } catch (error) {
    return actionError(error);
  }
}

export type DataMigrationIntegrity = {
  organizationId: string;
  generatedAt: string | null;
  imports: Record<string, unknown>;
  exports: Record<string, unknown>;
  createdRowsTracked: number;
  idMapEntries: number;
  orphansCreated: Record<string, number>;
  orphansIdMap: Record<string, number>;
  orphanCreatedTotal: number;
  orphanIdMapTotal: number;
  stuckImports: number;
  stuckExports: number;
};

function asNumberRecord(value: unknown): Record<string, number> {
  if (!value || typeof value !== 'object') return {};
  const out: Record<string, number> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    out[key] = Number(raw ?? 0);
  }
  return out;
}

export async function getDataMigrationIntegrityAction(): Promise<ActionResult<DataMigrationIntegrity>> {
  try {
    const canImport = await canPermissionAndFeature('data:import', FEATURES.DATA_IMPORT_EXPORT);
    const canExport = await canPermissionAndFeature('data:export', FEATURES.DATA_IMPORT_EXPORT);
    if (!canImport && !canExport) {
      return { success: false, error: 'No tenés permisos para esta acción' };
    }
    if (canImport) await requireImportAccess();
    else await requireExportAccess();
    const supabase = await createServerClient();
    const { data, error } = await supabase.rpc('own_data_migration_integrity');
    if (error) return { success: false, error: error.message };
    const payload = (data ?? {}) as Record<string, unknown>;
    const orphans =
      typeof payload.orphans === 'object' && payload.orphans
        ? (payload.orphans as Record<string, unknown>)
        : {};
    const stuck =
      typeof payload.stuck_locks === 'object' && payload.stuck_locks
        ? (payload.stuck_locks as Record<string, unknown>)
        : {};
    const orphansCreated = asNumberRecord(orphans.created_rows);
    const orphansIdMap = asNumberRecord(orphans.id_map);
    return {
      success: true,
      data: {
        organizationId: String(payload.organization_id ?? ''),
        generatedAt: payload.generated_at ? String(payload.generated_at) : null,
        imports:
          typeof payload.imports === 'object' && payload.imports
            ? (payload.imports as Record<string, unknown>)
            : {},
        exports:
          typeof payload.exports === 'object' && payload.exports
            ? (payload.exports as Record<string, unknown>)
            : {},
        createdRowsTracked: Number(payload.created_rows_tracked ?? 0),
        idMapEntries: Number(payload.id_map_entries ?? 0),
        orphansCreated,
        orphansIdMap,
        orphanCreatedTotal: sumOrphanCounts(orphansCreated),
        orphanIdMapTotal: sumOrphanCounts(orphansIdMap),
        stuckImports: Number(stuck.imports ?? 0),
        stuckExports: Number(stuck.exports ?? 0),
      },
    };
  } catch (error) {
    return actionError(error);
  }
}

export async function downloadIntegrityReportAction(): Promise<ActionResult<{ csv: string; filename: string }>> {
  try {
    const result = await getDataMigrationIntegrityAction();
    if (!result.success || !result.data) {
      return { success: false, error: result.error ?? 'No se pudo leer integridad' };
    }
    const csv = buildIntegrityReportCsv({
      organizationId: result.data.organizationId,
      generatedAt: result.data.generatedAt,
      imports: result.data.imports,
      exports: result.data.exports,
      createdRowsTracked: result.data.createdRowsTracked,
      idMapEntries: result.data.idMapEntries,
      orphansCreated: result.data.orphansCreated,
      orphansIdMap: result.data.orphansIdMap,
      stuckImports: result.data.stuckImports,
      stuckExports: result.data.stuckExports,
    });
    return {
      success: true,
      data: {
        csv,
        filename: `integridad-migracion-${new Date().toISOString().slice(0, 10)}.csv`,
      },
    };
  } catch (error) {
    return actionError(error);
  }
}

async function buildOrgIdMapExportCsv(
  organizationId: string,
  generatedAt: string
): Promise<{ csv: string; rowCount: number; truncated: boolean }> {
  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc('own_data_migration_id_map_export', {
    p_limit: ORG_ID_MAP_EXPORT_LIMIT,
  });
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as Array<{
    batch_id: string;
    entity_type: string;
    external_id: string;
    internal_id: string;
    created_at: string;
  }>;
  const truncated = rows.length >= ORG_ID_MAP_EXPORT_LIMIT;
  const csv = buildOrgIdMapCsv(
    rows.map((row) => ({
      batchId: row.batch_id,
      entityType: row.entity_type,
      externalId: row.external_id,
      internalId: row.internal_id,
      createdAt: row.created_at,
    })),
    { organizationId, generatedAt, truncated }
  );
  return { csv, rowCount: rows.length, truncated };
}

export async function downloadOrgIdMapAction(): Promise<
  ActionResult<{ csv: string; filename: string; rowCount: number; truncated: boolean }>
> {
  try {
    const canImport = await canPermissionAndFeature('data:import', FEATURES.DATA_IMPORT_EXPORT);
    const canExport = await canPermissionAndFeature('data:export', FEATURES.DATA_IMPORT_EXPORT);
    if (!canImport && !canExport) {
      return { success: false, error: 'No tenés permisos para esta acción' };
    }
    const session = canImport ? await requireImportAccess() : await requireExportAccess();
    const generatedAt = new Date().toISOString();
    const { csv, rowCount, truncated } = await buildOrgIdMapExportCsv(
      session.organizationId,
      generatedAt
    );
    return {
      success: true,
      data: {
        csv,
        filename: `id-map-org-${generatedAt.slice(0, 10)}.csv`,
        rowCount,
        truncated,
      },
    };
  } catch (error) {
    return actionError(error);
  }
}

export async function downloadImportIdMapAction(
  formData: FormData
): Promise<ActionResult<{ csv: string; filename: string }>> {
  try {
    await requireImportAccess();
    const batchId = String(formData.get('batchId') ?? '');
    if (!batchId) return { success: false, error: 'Lote inválido' };
    const supabase = await createServerClient();
    const { data, error } = await supabase.rpc('own_data_import_id_map', {
      p_batch_id: batchId,
    });
    if (error) return { success: false, error: error.message };
    const rows = (data ?? []) as Array<{
      entity_type: string;
      external_id: string;
      internal_id: string;
      created_at: string | null;
    }>;
    const csv = buildIdMapReportCsv(
      rows.map((row) => ({
        entityType: row.entity_type,
        externalId: row.external_id,
        internalId: row.internal_id,
        createdAt: row.created_at,
      }))
    );
    return {
      success: true,
      data: { csv, filename: `id-map-${batchId.slice(0, 8)}.csv` },
    };
  } catch (error) {
    return actionError(error);
  }
}

export type SuperadminMigrationWorkerStatus = {
  generatedAt: string | null;
  workers: Array<Record<string, unknown>>;
};

export async function getSuperadminDataMigrationWorkerStatus(): Promise<SuperadminMigrationWorkerStatus | null> {
  try {
    await requireSuperadmin();
    const supabase = await createServerClient();
    const { data, error } = await supabase.rpc('superadmin_data_migration_worker_status');
    if (error) {
      console.error(error);
      return null;
    }
    const payload = (data ?? {}) as Record<string, unknown>;
    return {
      generatedAt: payload.generated_at ? String(payload.generated_at) : null,
      workers: Array.isArray(payload.workers)
        ? (payload.workers as Array<Record<string, unknown>>)
        : [],
    };
  } catch {
    return null;
  }
}

export async function forceCancelDataImportBatchAction(
  formData: FormData
): Promise<ActionResult<{ id: string }>> {
  try {
    await requireSuperadmin();
    const batchId = String(formData.get('batchId') ?? '');
    if (!batchId) return { success: false, error: 'Lote inválido' };
    const supabase = await createServerClient();
    const { data, error } = await supabase.rpc('superadmin_force_cancel_data_import_batch', {
      p_batch_id: batchId,
    });
    if (error) return { success: false, error: error.message };
    revalidatePath('/superadmin');
    return {
      success: true,
      data: { id: String((data as { id?: string } | null)?.id ?? batchId) },
    };
  } catch (error) {
    return actionError(error);
  }
}

export async function forceCancelDataExportJobAction(
  formData: FormData
): Promise<ActionResult<{ id: string }>> {
  try {
    await requireSuperadmin();
    const jobId = String(formData.get('jobId') ?? '');
    if (!jobId) return { success: false, error: 'Job inválido' };
    const supabase = await createServerClient();
    const { data, error } = await supabase.rpc('superadmin_force_cancel_data_export_job', {
      p_job_id: jobId,
    });
    if (error) return { success: false, error: error.message };
    revalidatePath('/superadmin');
    return {
      success: true,
      data: { id: String((data as { id?: string } | null)?.id ?? jobId) },
    };
  } catch (error) {
    return actionError(error);
  }
}

export async function forceRetryDataImportBatchAction(
  formData: FormData
): Promise<ActionResult<{ id: string }>> {
  try {
    await requireSuperadmin();
    const batchId = String(formData.get('batchId') ?? '');
    if (!batchId) return { success: false, error: 'Lote inválido' };
    const supabase = await createServerClient();
    const { data, error } = await supabase.rpc('superadmin_force_retry_data_import_batch', {
      p_batch_id: batchId,
    });
    if (error) return { success: false, error: error.message };
    revalidatePath('/superadmin');
    return {
      success: true,
      data: { id: String((data as { id?: string } | null)?.id ?? batchId) },
    };
  } catch (error) {
    return actionError(error);
  }
}

export type MigrationLocksReleaseResult = {
  importsReleased: number;
  exportsReleased: number;
  staleMinutes: number;
};

export async function releaseStaleMigrationLocksAction(
  formData: FormData
): Promise<ActionResult<MigrationLocksReleaseResult>> {
  try {
    const canImport = await canPermissionAndFeature('data:import', FEATURES.DATA_IMPORT_EXPORT);
    const canExport = await canPermissionAndFeature('data:export', FEATURES.DATA_IMPORT_EXPORT);
    if (!canImport && !canExport) {
      return { success: false, error: 'No tenés permisos para esta acción' };
    }
    const session = canImport ? await requireImportAccess() : await requireExportAccess();
    const minutesRaw = Number(formData.get('staleMinutes') ?? 30);
    const supabase = await createServerClient();
    const { data, error } = await supabase.rpc('own_release_stale_migration_locks', {
      p_stale_minutes: Number.isFinite(minutesRaw) ? minutesRaw : 30,
    });
    if (error) return { success: false, error: error.message };
    const payload = (data ?? {}) as Record<string, unknown>;
    await logDataMigrationAudit({
      organizationId: session.organizationId,
      userId: session.userId,
      action: 'data_migration.locks_released',
      entityType: 'data_migration',
      entityId: session.organizationId,
      newData: payload,
    });
    revalidatePath('/configuracion');
    return {
      success: true,
      data: {
        importsReleased: Number(payload.imports_released ?? 0),
        exportsReleased: Number(payload.exports_released ?? 0),
        staleMinutes: Number(payload.stale_minutes ?? 30),
      },
    };
  } catch (error) {
    return actionError(error);
  }
}

export type MigrationOrphanPruneResult = {
  dryRun: boolean;
  orphanCreatedRows: number;
  orphanIdMap: number;
  deletedCreatedRows: number;
  deletedIdMap: number;
};

export async function pruneOrphanMigrationMapsAction(
  formData: FormData
): Promise<ActionResult<MigrationOrphanPruneResult>> {
  try {
    await requireImportAccess();
    const dryRun = String(formData.get('dryRun') ?? 'true') !== 'false';
    const supabase = await createServerClient();
    const { data, error } = await supabase.rpc('own_prune_orphan_migration_maps', {
      p_dry_run: dryRun,
    });
    if (error) return { success: false, error: error.message };
    const payload = (data ?? {}) as Record<string, unknown>;
    const session = await requireImportAccess();
    if (!dryRun) {
      await logDataMigrationAudit({
        organizationId: session.organizationId,
        userId: session.userId,
        action: 'data_migration.orphans_pruned',
        entityType: 'data_migration',
        entityId: session.organizationId,
        newData: payload,
      });
    }
    revalidatePath('/configuracion');
    return {
      success: true,
      data: {
        dryRun: Boolean(payload.dry_run ?? dryRun),
        orphanCreatedRows: Number(payload.orphan_created_rows ?? 0),
        orphanIdMap: Number(payload.orphan_id_map ?? 0),
        deletedCreatedRows: Number(payload.deleted_created_rows ?? 0),
        deletedIdMap: Number(payload.deleted_id_map ?? 0),
      },
    };
  } catch (error) {
    return actionError(error);
  }
}

export type DataMigrationChecklistItem = {
  key: string;
  label: string;
  status: string;
  count: number;
  detail: string | null;
};

export type DataMigrationChecklist = {
  organizationId: string;
  generatedAt: string | null;
  scoreOk: number;
  scoreTotal: number;
  readyForGolive: boolean;
  items: DataMigrationChecklistItem[];
};

export async function getDataMigrationChecklistAction(): Promise<
  ActionResult<DataMigrationChecklist>
> {
  try {
    const canImport = await canPermissionAndFeature('data:import', FEATURES.DATA_IMPORT_EXPORT);
    const canExport = await canPermissionAndFeature('data:export', FEATURES.DATA_IMPORT_EXPORT);
    if (!canImport && !canExport) {
      return { success: false, error: 'No tenés permisos para esta acción' };
    }
    if (canImport) await requireImportAccess();
    else await requireExportAccess();
    const supabase = await createServerClient();
    const { data, error } = await supabase.rpc('own_data_migration_checklist');
    if (error) return { success: false, error: error.message };
    const payload = (data ?? {}) as Record<string, unknown>;
    const rawItems = Array.isArray(payload.items) ? payload.items : [];
    const items: DataMigrationChecklistItem[] = rawItems.map((row) => {
      const item = row as Record<string, unknown>;
      return {
        key: String(item.key ?? ''),
        label: String(item.label ?? item.key ?? ''),
        status: String(item.status ?? 'warn'),
        count: Number(item.count ?? 0),
        detail: item.detail != null ? String(item.detail) : null,
      };
    });
    return {
      success: true,
      data: {
        organizationId: String(payload.organization_id ?? ''),
        generatedAt: payload.generated_at ? String(payload.generated_at) : null,
        scoreOk: Number(payload.score_ok ?? summarizeMigrationChecklist(items).ok),
        scoreTotal: Number(payload.score_total ?? items.length),
        readyForGolive: Boolean(payload.ready_for_golive),
        items,
      },
    };
  } catch (error) {
    return actionError(error);
  }
}

export async function downloadMigrationChecklistAction(): Promise<
  ActionResult<{ csv: string; filename: string }>
> {
  try {
    const result = await getDataMigrationChecklistAction();
    if (!result.success || !result.data) {
      return { success: false, error: result.error ?? 'No se pudo armar el checklist' };
    }
    const csv = buildMigrationChecklistCsv(result.data.items, {
      organizationId: result.data.organizationId,
      generatedAt: result.data.generatedAt,
      readyForGolive: result.data.readyForGolive,
    });
    return {
      success: true,
      data: {
        csv,
        filename: `checklist-migracion-${new Date().toISOString().slice(0, 10)}.csv`,
      },
    };
  } catch (error) {
    return actionError(error);
  }
}

export type BillingReconcileSummary = {
  invoices: number;
  payments: number;
  paidWithoutPaymentRows: number;
  paymentsWithoutInvoice: number;
  paidAmountVsPaymentsMismatch: number;
};

export type BillingReconcileResult = {
  organizationId: string;
  generatedAt: string | null;
  summary: BillingReconcileSummary;
  rows: Array<{
    invoiceId: string;
    invoiceNumber: string | null;
    status: string | null;
    total: number;
    paidAmount: number;
    balance: number;
    paymentsSum: number;
    paymentsCount: number;
    delta: number;
  }>;
};

export async function getBillingReconcileAction(): Promise<ActionResult<BillingReconcileResult>> {
  try {
    const canImport = await canPermissionAndFeature('data:import', FEATURES.DATA_IMPORT_EXPORT);
    const canExport = await canPermissionAndFeature('data:export', FEATURES.DATA_IMPORT_EXPORT);
    if (!canImport && !canExport) {
      return { success: false, error: 'No tenés permisos para esta acción' };
    }
    if (canImport) await requireImportAccess();
    else await requireExportAccess();
    const supabase = await createServerClient();
    const { data, error } = await supabase.rpc('own_data_migration_billing_reconcile');
    if (error) return { success: false, error: error.message };
    const payload = (data ?? {}) as Record<string, unknown>;
    const summaryRaw = (payload.summary ?? {}) as Record<string, unknown>;
    const rawRows = Array.isArray(payload.rows) ? payload.rows : [];
    return {
      success: true,
      data: {
        organizationId: String(payload.organization_id ?? ''),
        generatedAt: payload.generated_at ? String(payload.generated_at) : null,
        summary: {
          invoices: Number(summaryRaw.invoices ?? 0),
          payments: Number(summaryRaw.payments ?? 0),
          paidWithoutPaymentRows: Number(summaryRaw.paid_without_payment_rows ?? 0),
          paymentsWithoutInvoice: Number(summaryRaw.payments_without_invoice ?? 0),
          paidAmountVsPaymentsMismatch: Number(
            summaryRaw.paid_amount_vs_payments_mismatch ?? 0
          ),
        },
        rows: rawRows.map((row) => {
          const item = row as Record<string, unknown>;
          return {
            invoiceId: String(item.invoice_id ?? ''),
            invoiceNumber: item.invoice_number != null ? String(item.invoice_number) : null,
            status: item.status != null ? String(item.status) : null,
            total: Number(item.total ?? 0),
            paidAmount: Number(item.paid_amount ?? 0),
            balance: Number(item.balance ?? 0),
            paymentsSum: Number(item.payments_sum ?? 0),
            paymentsCount: Number(item.payments_count ?? 0),
            delta: Number(item.delta ?? 0),
          };
        }),
      },
    };
  } catch (error) {
    return actionError(error);
  }
}

export async function downloadBillingReconcileAction(): Promise<
  ActionResult<{ csv: string; filename: string }>
> {
  try {
    const result = await getBillingReconcileAction();
    if (!result.success || !result.data) {
      return { success: false, error: result.error ?? 'No se pudo armar la conciliación' };
    }
    const csv = buildBillingReconcileCsv(
      result.data.rows.map((row) => ({
        invoiceId: row.invoiceId,
        invoiceNumber: row.invoiceNumber,
        status: row.status,
        total: row.total,
        paidAmount: row.paidAmount,
        balance: row.balance,
        paymentsSum: row.paymentsSum,
        paymentsCount: row.paymentsCount,
        delta: row.delta,
      })),
      {
        organizationId: result.data.organizationId,
        generatedAt: result.data.generatedAt,
        summary: {
          invoices: result.data.summary.invoices,
          payments: result.data.summary.payments,
          paid_without_payment_rows: result.data.summary.paidWithoutPaymentRows,
          payments_without_invoice: result.data.summary.paymentsWithoutInvoice,
          paid_amount_vs_payments_mismatch: result.data.summary.paidAmountVsPaymentsMismatch,
        },
      }
    );
    return {
      success: true,
      data: {
        csv,
        filename: `conciliacion-facturacion-${new Date().toISOString().slice(0, 10)}.csv`,
      },
    };
  } catch (error) {
    return actionError(error);
  }
}

export async function downloadCutoverPackAction(): Promise<
  ActionResult<{ filename: string; contentType: string; base64: string; ready: boolean }>
> {
  try {
    const canImport = await canPermissionAndFeature('data:import', FEATURES.DATA_IMPORT_EXPORT);
    const canExport = await canPermissionAndFeature('data:export', FEATURES.DATA_IMPORT_EXPORT);
    if (!canImport && !canExport) {
      return { success: false, error: 'No tenés permisos para esta acción' };
    }
    const session = canImport ? await requireImportAccess() : await requireExportAccess();
    const generatedAt = new Date().toISOString();

    const [integrityResult, checklistResult, billingResult, idMapExport] = await Promise.all([
      getDataMigrationIntegrityAction(),
      getDataMigrationChecklistAction(),
      getBillingReconcileAction(),
      buildOrgIdMapExportCsv(session.organizationId, generatedAt),
    ]);

    if (!integrityResult.success || !integrityResult.data) {
      return { success: false, error: integrityResult.error ?? 'No se pudo leer integridad' };
    }
    if (!checklistResult.success || !checklistResult.data) {
      return { success: false, error: checklistResult.error ?? 'No se pudo leer checklist' };
    }
    if (!billingResult.success || !billingResult.data) {
      return { success: false, error: billingResult.error ?? 'No se pudo leer conciliación' };
    }

    const integrity = integrityResult.data;
    const checklist = checklistResult.data;
    const billing = billingResult.data;
    const organizationId =
      integrity.organizationId || checklist.organizationId || billing.organizationId;

    const integrityCsv = buildIntegrityReportCsv({
      organizationId: integrity.organizationId,
      generatedAt: integrity.generatedAt,
      imports: integrity.imports,
      exports: integrity.exports,
      createdRowsTracked: integrity.createdRowsTracked,
      idMapEntries: integrity.idMapEntries,
      orphansCreated: integrity.orphansCreated,
      orphansIdMap: integrity.orphansIdMap,
      stuckImports: integrity.stuckImports,
      stuckExports: integrity.stuckExports,
    });
    const checklistCsv = buildMigrationChecklistCsv(checklist.items, {
      organizationId: checklist.organizationId,
      generatedAt: checklist.generatedAt,
      readyForGolive: checklist.readyForGolive,
    });
    const billingCsv = buildBillingReconcileCsv(
      billing.rows.map((row) => ({
        invoiceId: row.invoiceId,
        invoiceNumber: row.invoiceNumber,
        status: row.status,
        total: row.total,
        paidAmount: row.paidAmount,
        balance: row.balance,
        paymentsSum: row.paymentsSum,
        paymentsCount: row.paymentsCount,
        delta: row.delta,
      })),
      {
        organizationId: billing.organizationId,
        generatedAt: billing.generatedAt,
        summary: {
          invoices: billing.summary.invoices,
          payments: billing.summary.payments,
          paid_without_payment_rows: billing.summary.paidWithoutPaymentRows,
          payments_without_invoice: billing.summary.paymentsWithoutInvoice,
          paid_amount_vs_payments_mismatch: billing.summary.paidAmountVsPaymentsMismatch,
        },
      }
    );

    const ready = isCutoverPackReady({
      readyForGolive: checklist.readyForGolive,
      orphanCreatedTotal: integrity.orphanCreatedTotal,
      orphanIdMapTotal: integrity.orphanIdMapTotal,
      stuckImports: integrity.stuckImports,
      stuckExports: integrity.stuckExports,
      billingMismatch: billing.summary.paidAmountVsPaymentsMismatch,
    });

    const readme = buildCutoverPackReadme({
      organizationId,
      generatedAt,
      readyForGolive: checklist.readyForGolive,
      checklistScoreOk: checklist.scoreOk,
      checklistScoreTotal: checklist.scoreTotal,
      orphanCreatedTotal: integrity.orphanCreatedTotal,
      orphanIdMapTotal: integrity.orphanIdMapTotal,
      stuckImports: integrity.stuckImports,
      stuckExports: integrity.stuckExports,
      billingMismatch: billing.summary.paidAmountVsPaymentsMismatch,
      billingPaidWithoutPayments: billing.summary.paidWithoutPaymentRows,
    });

    const zip = new JSZip();
    zip.file('README.txt', readme);
    zip.file('integrity.csv', integrityCsv);
    zip.file('checklist.csv', checklistCsv);
    zip.file('billing_reconcile.csv', billingCsv);
    zip.file('export_catalog.csv', buildExportCatalogCsv());
    zip.file('freeze_recommendations.csv', buildFreezeRecommendationsCsv());
    zip.file('id_map.csv', idMapExport.csv);
    zip.file('staff_map_template.csv', buildStaffMapTemplateCsv());
    zip.file('branch_map_template.csv', buildBranchMapTemplateCsv());
    zip.file('attachments_meta_template.csv', buildAttachmentMetaTemplateCsv());
    zip.file('roundtrip_notes.txt', buildCutoverRoundtripNotes());
    const zipBytes = await zip.generateAsync({ type: 'nodebuffer' });
    const filename = `cutover-pack-${generatedAt.slice(0, 10)}.zip`;

    await logDataMigrationAudit({
      organizationId: session.organizationId,
      userId: session.userId,
      action: DATA_MIGRATION_AUDIT_ACTIONS.cutoverPackDownloaded,
      entityType: 'data_migration',
      entityId: session.organizationId,
      newData: {
        ready,
        filename,
        packVersion: CUTOVER_PACK_VERSION,
        includesIdMap: true,
        idMapRowCount: idMapExport.rowCount,
        idMapTruncated: idMapExport.truncated,
      },
    });

    return {
      success: true,
      data: {
        filename,
        contentType: 'application/zip',
        base64: Buffer.from(zipBytes).toString('base64'),
        ready,
      },
    };
  } catch (error) {
    return actionError(error);
  }
}
