'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  CONFLICT_DECISION_LABELS,
  DEFAULT_IMPORT_CHUNK_SIZE,
  EXPORT_TYPE_LABELS,
  FULL_MIGRATION_STEP_LABELS,
  FULL_MIGRATION_STEP_MAP_USAGE,
  FULL_MIGRATION_STEPS,
  IDEMPOTENCY_MODE_LABELS,
  IMPORT_TYPE_LABELS,
  nextFullMigrationStep,
  type ConflictPolicy,
  type ExportFormat,
  type ExportType,
  type FullMigrationStep,
  type IdempotencyMode,
  type ImportType,
  type RowConflictDecision,
  type ValidationIssue,
} from '@sincvete/shared';
import {
  commitDataImport,
  convertSpreadsheetToCsvAction,
  cancelDataExportJobAction,
  cancelDataImportBatchAction,
  downloadExportArtifactAction,
  downloadImportBatchErrorsAction,
  downloadImportIdMapAction,
  downloadImportTemplate,
  downloadIntegrityReportAction,
  downloadMigrationChecklistAction,
  downloadBillingReconcileAction,
  downloadCutoverPackAction,
  downloadOrgIdMapAction,
  downloadSampleMigrationZipAction,
  downloadValidationReportAction,
  getDataMigrationChecklistAction,
  getDataMigrationIntegrityAction,
  importZipAttachmentsAction,
  inspectMigrationZipAction,
  listDataExportJobsAction,
  listDataImportBatchesAction,
  pollImportBatchProgressAction,
  parseStaffMapAction,
  parseBranchMapAction,
  pruneOrphanMigrationMapsAction,
  queueClinicExportAction,
  queueDataImportAction,
  releaseStaleMigrationLocksAction,
  retryDataImportBatchAction,
  rollbackDataImportAction,
  runClinicExportAction,
  startDataImport,
  validateDataImport,
} from '@/actions/data-migration';
import type { DataMigrationChecklist, DataMigrationIntegrity } from '@/actions/data-migration';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { usePendingAction } from '@/lib/hooks/use-pending-action';

type Section = 'import' | 'export' | 'history-import' | 'history-export';

function downloadBase64(filename: string, contentType: string, base64: string) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const blob = new Blob([bytes], { type: contentType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function downloadText(filename: string, text: string, type = 'text/csv;charset=utf-8') {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function DataMigrationPanel({
  canImport,
  canExport,
}: {
  canImport: boolean;
  canExport: boolean;
}) {
  const [pending, run] = usePendingAction();
  const [section, setSection] = useState<Section>(canImport ? 'import' : 'export');
  const [message, setMessage] = useState<string | null>(null);

  const [importType, setImportType] = useState<ImportType>('owners');
  const [sourceSystem, setSourceSystem] = useState('VetLegacy');
  const [idempotencyMode, setIdempotencyMode] = useState<IdempotencyMode>('off');
  const [csvText, setCsvText] = useState('');
  const [sourceFilename, setSourceFilename] = useState('upload.csv');
  const [batchId, setBatchId] = useState<string | null>(null);
  const [mapping, setMapping] = useState<Record<string, string | null>>({});
  const [headers, setHeaders] = useState<string[]>([]);
  const [validation, setValidation] = useState<{
    detected: number;
    ready: number;
    warnings: number;
    errors: number;
    issues: ValidationIssue[];
  } | null>(null);
  const [ownerIdByExternal, setOwnerIdByExternal] = useState<Record<string, string>>({});
  const [branchIdByExternal, setBranchIdByExternal] = useState<Record<string, string>>({});
  const [userIdByExternal, setUserIdByExternal] = useState<Record<string, string>>({});
  const [patientIdByExternal, setPatientIdByExternal] = useState<Record<string, string>>({});
  const [productIdByExternal, setProductIdByExternal] = useState<Record<string, string>>({});
  const [invoiceIdByExternal, setInvoiceIdByExternal] = useState<Record<string, string>>({});
  const [appointmentIdByExternal, setAppointmentIdByExternal] = useState<Record<string, string>>({});
  const [importReport, setImportReport] = useState<string | null>(null);
  const [zipPack, setZipPack] = useState<{
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
  } | null>(null);
  const [zipBase64, setZipBase64] = useState<string | null>(null);
  const [progressLabel, setProgressLabel] = useState<string | null>(null);
  const [rowDecisions, setRowDecisions] = useState<Record<number, RowConflictDecision>>({});

  const [exportType, setExportType] = useState<ExportType>('owners');
  const [exportFormat, setExportFormat] = useState<ExportFormat>('csv');
  const [patientId, setPatientId] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [queuedBatchId, setQueuedBatchId] = useState<string | null>(null);
  const [guideStep, setGuideStep] = useState<FullMigrationStep>('branches');

  const [importHistory, setImportHistory] = useState<Array<Record<string, unknown>>>([]);
  const [exportHistory, setExportHistory] = useState<Array<Record<string, unknown>>>([]);
  const [integrity, setIntegrity] = useState<DataMigrationIntegrity | null>(null);
  const [checklist, setChecklist] = useState<DataMigrationChecklist | null>(null);

  const entity = useMemo(() => {
    if (importType === 'full_migration' || importType === 'migration_zip') {
      if (guideStep === 'attachments') return 'owners' as const;
      return guideStep;
    }
    if (importType === 'branches') return 'branches' as const;
    if (importType === 'patients') return 'patients' as const;
    if (importType === 'clinical_entries') return 'clinical_entries' as const;
    if (importType === 'vaccinations') return 'vaccinations' as const;
    if (importType === 'lab_orders') return 'lab_orders' as const;
    if (importType === 'surgeries') return 'surgeries' as const;
    if (importType === 'prescriptions') return 'prescriptions' as const;
    if (importType === 'hospitalizations') return 'hospitalizations' as const;
    if (importType === 'appointments') return 'appointments' as const;
    if (importType === 'consultations') return 'consultations' as const;
    if (importType === 'inventory_products') return 'inventory_products' as const;
    if (importType === 'invoices') return 'invoices' as const;
    if (importType === 'payments') return 'payments' as const;
    if (importType === 'attachments') return 'owners' as const;
    return 'owners' as const;
  }, [importType, guideStep]);

  const guideStepMapHints = useMemo(() => {
    const usage = FULL_MIGRATION_STEP_MAP_USAGE[guideStep];
    const branchCount = Object.keys(branchIdByExternal).length;
    const staffCount = Object.keys(userIdByExternal).length;
    const hints: Array<{ kind: 'warn' | 'ok'; text: string }> = [];
    if (usage.branch) {
      if (branchCount === 0) {
        hints.push({
          kind: 'warn',
          text: 'Este paso admite external_branch_id — sin mapa cargado, vacío usará la sede de sesión; IDs desconocidos fallarán.',
        });
      } else {
        hints.push({
          kind: 'ok',
          text: `Mapa sucursal cargado (${branchCount} entradas).`,
        });
      }
    }
    if (usage.staff) {
      if (staffCount === 0) {
        hints.push({
          kind: 'warn',
          text: 'Este paso admite external_assigned_user_id — sin mapa cargado, vacío usará el usuario importador; IDs desconocidos fallarán.',
        });
      } else {
        hints.push({
          kind: 'ok',
          text: `Mapa staff cargado (${staffCount} entradas).`,
        });
      }
    }
    return hints;
  }, [guideStep, branchIdByExternal, userIdByExternal]);

  async function onDownloadTemplate(
    kind:
      | 'branches'
      | 'owners'
      | 'patients'
      | 'clinical_entries'
      | 'vaccinations'
      | 'lab_orders'
      | 'surgeries'
      | 'prescriptions'
      | 'hospitalizations'
      | 'appointments'
      | 'consultations'
      | 'inventory_products'
      | 'invoices'
      | 'payments'
      | 'staff_map'
      | 'branch_map'
      | 'attachment_meta'
  ) {
    setMessage(null);
    const form = new FormData();
    form.set('kind', kind);
    const result = await run(() => downloadImportTemplate(form));
    if (!result?.success || !result.data) {
      setMessage(result?.error ?? 'No se pudo descargar la plantilla');
      return;
    }
    downloadText(result.data.filename, result.data.csv);
  }

  async function onDownloadSampleZip() {
    setMessage(null);
    const result = await run(() => downloadSampleMigrationZipAction());
    if (!result?.success || !result.data) {
      setMessage(result?.error ?? 'No se pudo generar el ZIP de ejemplo');
      return;
    }
    downloadBase64(result.data.filename, result.data.contentType, result.data.base64);
  }

  async function onLoadStaffMapCsv(text: string) {
    setMessage(null);
    const form = new FormData();
    form.set('csvText', text);
    const result = await run(() => parseStaffMapAction(form));
    if (!result?.success || !result.data) {
      setMessage(result?.error ?? 'No se pudo leer el mapa staff');
      return;
    }
    if (result.data.issues.length > 0) {
      setMessage(
        `Mapa staff: ${Object.keys(result.data.map).length} entradas · ${result.data.issues.length} avisos en filas`
      );
    } else {
      setMessage(`Mapa staff cargado: ${Object.keys(result.data.map).length} entradas`);
    }
    setUserIdByExternal((prev) => ({ ...prev, ...result.data!.map }));
  }

  async function onLoadBranchMapCsv(text: string) {
    setMessage(null);
    const form = new FormData();
    form.set('csvText', text);
    const result = await run(() => parseBranchMapAction(form));
    if (!result?.success || !result.data) {
      setMessage(result?.error ?? 'No se pudo leer el mapa sucursales');
      return;
    }
    if (result.data.issues.length > 0) {
      setMessage(
        `Mapa sucursales: ${Object.keys(result.data.map).length} entradas · ${result.data.issues.length} avisos en filas`
      );
    } else {
      setMessage(`Mapa sucursales cargado: ${Object.keys(result.data.map).length} entradas`);
    }
    setBranchIdByExternal((prev) => ({ ...prev, ...result.data!.map }));
  }

  async function onBranchMapFileSelected(file: File | null) {
    if (!file) return;
    const text = await file.text();
    await onLoadBranchMapCsv(text);
  }

  async function onStaffMapFileSelected(file: File | null) {
    if (!file) return;
    const text = await file.text();
    await onLoadStaffMapCsv(text);
  }

  async function fileToBase64(file: File): Promise<string> {
    const buffer = await file.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
    return btoa(binary);
  }

  async function onFileSelected(file: File | null) {
    if (!file) return;
    setSourceFilename(file.name);
    setValidation(null);
    setImportReport(null);

    const lower = file.name.toLowerCase();
    if (lower.endsWith('.xlsx') || lower.endsWith('.xls')) {
      const form = new FormData();
      form.set('fileBase64', await fileToBase64(file));
      form.set('filename', file.name);
      const result = await run(() => convertSpreadsheetToCsvAction(form));
      if (!result?.success || !result.data) {
        setMessage(result?.error ?? 'No se pudo leer el XLSX');
        return;
      }
      setCsvText(result.data.csv);
      setSourceFilename(result.data.filename);
      setMessage('XLSX convertido a CSV (primera hoja)');
      return;
    }

    if (lower.endsWith('.zip') || importType === 'migration_zip') {
      const base64 = await fileToBase64(file);
      setZipBase64(base64);
      const form = new FormData();
      form.set('zipBase64', base64);
      const result = await run(() => inspectMigrationZipAction(form));
      if (!result?.success || !result.data) {
        setMessage(result?.error ?? 'ZIP inválido');
        return;
      }
      setZipPack({
        branchesCsv: result.data.branchesCsv,
        ownersCsv: result.data.ownersCsv,
        patientsCsv: result.data.patientsCsv,
        clinicalCsv: result.data.clinicalCsv,
        vaccinationsCsv: result.data.vaccinationsCsv,
        labOrdersCsv: result.data.labOrdersCsv,
        surgeriesCsv: result.data.surgeriesCsv,
        prescriptionsCsv: result.data.prescriptionsCsv,
        hospitalizationsCsv: result.data.hospitalizationsCsv,
        appointmentsCsv: result.data.appointmentsCsv,
        consultationsCsv: result.data.consultationsCsv,
        inventoryProductsCsv: result.data.inventoryProductsCsv,
        invoicesCsv: result.data.invoicesCsv,
        paymentsCsv: result.data.paymentsCsv,
      });
      const summary = result.data.summary;
      setMessage(
        `ZIP SyncVete · sucursales ${summary.branches ?? 0} · owners ${summary.owners} · patients ${summary.patients} · clinical ${summary.clinicalRecords} · vacunas ${summary.vaccinations} · lab ${summary.labOrders} · cirugías ${summary.surgeries} · recetas ${summary.prescriptions} · internaciones ${summary.hospitalizations} · agenda ${summary.appointments} · consultas ${summary.consultations} · inventario ${summary.inventoryProducts} · facturas ${summary.invoices} · pagos ${summary.payments} · adjuntos ${summary.attachments}`
      );
      if (result.data.branchesCsv) {
        setImportType('full_migration');
        setGuideStep('branches');
        setCsvText(result.data.branchesCsv);
        setSourceFilename('branches.csv');
      } else if (result.data.ownersCsv) {
        setImportType('owners');
        setCsvText(result.data.ownersCsv);
        setSourceFilename('owners.csv');
      } else if (result.data.patientsCsv) {
        setImportType('patients');
        setCsvText(result.data.patientsCsv);
        setSourceFilename('patients.csv');
      } else if (result.data.clinicalCsv) {
        setImportType('clinical_entries');
        setCsvText(result.data.clinicalCsv);
        setSourceFilename('clinical_records.csv');
      } else if (result.data.vaccinationsCsv) {
        setImportType('vaccinations');
        setCsvText(result.data.vaccinationsCsv);
        setSourceFilename('vaccinations.csv');
      }
      return;
    }

    setZipPack(null);
    setZipBase64(null);
    const text = await file.text();
    setCsvText(text);
  }

  async function onAnalyze() {
    setMessage(null);
    const form = new FormData();
    form.set('importType', importType);
    form.set('entity', entity);
    form.set('csvText', csvText);
    form.set('sourceFilename', sourceFilename);
    form.set('sourceSystem', sourceSystem);
    form.set('idempotencyMode', idempotencyMode);
    const result = await run(() => startDataImport(form));
    if (!result?.success || !result.data) {
      setMessage(result?.error ?? 'No se pudo analizar el archivo');
      return;
    }
    setBatchId(result.data.batchId);
    setMapping(result.data.mapping);
    setHeaders(result.data.headers);
    setMessage(`Archivo analizado · ${result.data.rowCount} filas · mapeá columnas y validá`);
  }

  async function onValidate() {
    if (!batchId) return;
    setMessage(null);
    const form = new FormData();
    form.set('batchId', batchId);
    form.set('entity', entity);
    form.set('csvText', csvText);
    form.set('mapping', JSON.stringify(mapping));
    form.set('knownOwnerExternalIds', Object.keys(ownerIdByExternal).join(','));
    form.set('knownPatientExternalIds', Object.keys(patientIdByExternal).join(','));
    form.set('knownInvoiceExternalIds', Object.keys(invoiceIdByExternal).join(','));
    form.set('invoiceIdByExternal', JSON.stringify(invoiceIdByExternal));
    form.set('branchIdByExternal', JSON.stringify(branchIdByExternal));
    form.set('userIdByExternal', JSON.stringify(userIdByExternal));
    const result = await run(() => validateDataImport(form));
    if (!result?.success || !result.data) {
      setMessage(result?.error ?? 'Validación fallida');
      return;
    }
    setValidation({
      detected: result.data.detected,
      ready: result.data.ready,
      warnings: result.data.warnings,
      errors: result.data.errors,
      issues: result.data.issues as ValidationIssue[],
    });
    const nextDecisions: Record<number, RowConflictDecision> = { ...rowDecisions };
    for (const issue of result.data.issues as ValidationIssue[]) {
      if (issue.code !== 'possible_duplicate') continue;
      if (nextDecisions[issue.rowNumber]) continue;
      nextDecisions[issue.rowNumber] = {
        rowNumber: issue.rowNumber,
        decision: 'review',
        linkInternalId: issue.matchInternalId ?? null,
      };
    }
    setRowDecisions(nextDecisions);
    setMessage(
      `${result.data.detected} detectados · ${result.data.ready} listos · ${result.data.warnings} avisos · ${result.data.errors} errores`
    );
  }

  async function onDownloadValidationReport() {
    if (!validation?.issues.length) return;
    const form = new FormData();
    form.set('validationIssues', JSON.stringify(validation.issues));
    const result = await run(() => downloadValidationReportAction(form));
    if (!result?.success || !result.data) {
      setMessage(result?.error ?? 'No se pudo generar el reporte');
      return;
    }
    downloadText(result.data.filename, result.data.csv);
  }

  async function onCommit() {
    if (!batchId || !validation || validation.errors > 0) {
      setMessage('Corregí errores bloqueantes antes de importar');
      return;
    }
    let offset = 0;
    let totalImported = 0;
    let totalFailed = 0;
    let mergedIdMap: Record<string, string> = {};
    let done = false;
    let lastStatus = 'importing';

    while (!done) {
      setProgressLabel(`Importando ${entity}: ${offset}…`);
      const form = new FormData();
      form.set('batchId', batchId);
      form.set('entity', entity);
      form.set('csvText', csvText);
      form.set('mapping', JSON.stringify(mapping));
      form.set('ownerIdByExternal', JSON.stringify(ownerIdByExternal));
      form.set('branchIdByExternal', JSON.stringify(branchIdByExternal));
      form.set('userIdByExternal', JSON.stringify(userIdByExternal));
      form.set('patientIdByExternal', JSON.stringify(patientIdByExternal));
      form.set('productIdByExternal', JSON.stringify(productIdByExternal));
      form.set('invoiceIdByExternal', JSON.stringify(invoiceIdByExternal));
      form.set('appointmentIdByExternal', JSON.stringify(appointmentIdByExternal));
      form.set('sourceSystem', sourceSystem);
      form.set('offset', String(offset));
      form.set('chunkSize', String(DEFAULT_IMPORT_CHUNK_SIZE));
      form.set('rowDecisions', JSON.stringify(rowDecisions));
      form.set('validationIssues', JSON.stringify(validation.issues));
      const result = await run(() => commitDataImport(form));
      if (!result?.success || !result.data) {
        setMessage(result?.error ?? 'Importación fallida');
        setProgressLabel(null);
        return;
      }
      totalImported += result.data.imported;
      totalFailed += result.data.failed;
      mergedIdMap = { ...mergedIdMap, ...result.data.idMap };
      done = result.data.done;
      offset = result.data.nextOffset;
      lastStatus = result.data.status;
      setProgressLabel(
        `Progreso real: ${result.data.processed}/${result.data.total} · ok ${totalImported} · fallidos ${totalFailed}`
      );
    }

    if (entity === 'branches') {
      setBranchIdByExternal((prev) => ({ ...prev, ...mergedIdMap }));
    }
    if (entity === 'owners') {
      setOwnerIdByExternal((prev) => ({ ...prev, ...mergedIdMap }));
    }
    if (entity === 'patients') {
      setPatientIdByExternal((prev) => ({ ...prev, ...mergedIdMap }));
    }
    if (entity === 'inventory_products') {
      setProductIdByExternal((prev) => ({ ...prev, ...mergedIdMap }));
    }
    if (entity === 'invoices') {
      setInvoiceIdByExternal((prev) => ({ ...prev, ...mergedIdMap }));
    }
    if (entity === 'appointments') {
      setAppointmentIdByExternal((prev) => ({ ...prev, ...mergedIdMap }));
    }
    setImportReport(`Import ${lastStatus}: ${totalImported} ok · ${totalFailed} fallidos`);
    setMessage(null);
    setProgressLabel(null);
  }

  async function onQueueImport() {
    if (!batchId || !validation || validation.errors > 0) {
      setMessage('Corregí errores bloqueantes antes de encolar');
      return;
    }
    const form = new FormData();
    form.set('batchId', batchId);
    form.set('entity', entity);
    form.set('csvText', csvText);
    form.set('mapping', JSON.stringify(mapping));
    form.set('ownerIdByExternal', JSON.stringify(ownerIdByExternal));
    form.set('branchIdByExternal', JSON.stringify(branchIdByExternal));
    form.set('userIdByExternal', JSON.stringify(userIdByExternal));
    form.set('patientIdByExternal', JSON.stringify(patientIdByExternal));
    form.set('productIdByExternal', JSON.stringify(productIdByExternal));
    form.set('invoiceIdByExternal', JSON.stringify(invoiceIdByExternal));
    form.set('appointmentIdByExternal', JSON.stringify(appointmentIdByExternal));
    form.set('sourceSystem', sourceSystem);
    form.set('rowDecisions', JSON.stringify(rowDecisions));
    form.set('validationIssues', JSON.stringify(validation.issues));
    const result = await run(() => queueDataImportAction(form));
    if (!result?.success || !result.data) {
      setMessage(result?.error ?? 'No se pudo encolar');
      return;
    }
    setQueuedBatchId(batchId);
    setImportReport(`Lote encolado (${result.data.status}). El cron /api/cron/data-import avanza por chunks.`);
    setMessage(null);
    void refreshImportHistory();
  }

  useEffect(() => {
    if (!queuedBatchId) return;
    let cancelled = false;
    const tick = async () => {
      const form = new FormData();
      form.set('batchId', queuedBatchId);
      const result = await pollImportBatchProgressAction(form);
      if (cancelled || !result.success || !result.data) return;
      setProgressLabel(
        result.data.progress_message ??
          `${result.data.status}: ${result.data.progress_processed ?? 0}/${result.data.progress_total ?? 0}`
      );
      if (['completed', 'completed_with_warnings', 'failed', 'rolled_back', 'cancelled'].includes(result.data.status)) {
        setQueuedBatchId(null);
        setImportReport(
          `Import ${result.data.status}: ok ${result.data.imported_records ?? 0} · fallidos ${result.data.failed_records ?? 0}`
        );
        void refreshImportHistory();
      }
    };
    void tick();
    const id = window.setInterval(() => void tick(), 4000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
    // Intentional: poll only while a queued batch is tracked.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refreshImportHistory is stable enough for this poller
  }, [queuedBatchId]);

  async function onImportAttachments() {
    if (!zipBase64) {
      setMessage('Subí un ZIP SyncVete primero');
      return;
    }
    if (Object.keys(patientIdByExternal).length === 0) {
      setMessage('Importá pacientes primero para mapear IDs externos → SyncVete');
      return;
    }
    // Reuse current batch or start a lightweight owners analyze to get a batch id for provenance
    let activeBatchId = batchId;
    if (!activeBatchId) {
      const form = new FormData();
      form.set('importType', 'attachments');
      form.set('entity', 'owners');
      form.set('csvText', 'external_owner_id,full_name\nTMP,Temp\n');
      form.set('sourceFilename', 'attachments.zip');
      form.set('sourceSystem', sourceSystem);
      const started = await run(() => startDataImport(form));
      if (!started?.success || !started.data) {
        setMessage(started?.error ?? 'No se pudo crear lote de adjuntos');
        return;
      }
      activeBatchId = started.data.batchId;
      setBatchId(activeBatchId);
    }

    let offset = 0;
    let done = false;
    let totalImported = 0;
    let totalFailed = 0;
    while (!done) {
      setProgressLabel(`Adjuntos: ${offset}…`);
      const form = new FormData();
      form.set('batchId', activeBatchId);
      form.set('zipBase64', zipBase64);
      form.set('patientIdByExternal', JSON.stringify(patientIdByExternal));
      form.set('branchIdByExternal', JSON.stringify(branchIdByExternal));
      form.set('userIdByExternal', JSON.stringify(userIdByExternal));
      form.set('sourceSystem', sourceSystem);
      form.set('offset', String(offset));
      form.set('chunkSize', '10');
      const result = await run(() => importZipAttachmentsAction(form));
      if (!result?.success || !result.data) {
        setMessage(result?.error ?? 'Importación de adjuntos fallida');
        setProgressLabel(null);
        return;
      }
      totalImported += result.data.imported;
      totalFailed += result.data.failed;
      done = result.data.done;
      offset = result.data.nextOffset;
      setProgressLabel(
        `Adjuntos ${result.data.processed}/${result.data.total} · ok ${totalImported} · fallidos ${totalFailed}`
      );
    }
    setImportReport(`Adjuntos: ${totalImported} ok · ${totalFailed} fallidos`);
    setProgressLabel(null);
  }

  async function onExport() {
    setMessage(null);
    const form = new FormData();
    form.set('exportType', exportType);
    form.set('format', exportFormat);
    if (patientId) form.set('patientId', patientId);
    form.set('dateFrom', dateFrom);
    form.set('dateTo', dateTo);
    const result = await run(() => runClinicExportAction(form));
    if (!result?.success || !result.data) {
      setMessage(result?.error ?? 'Exportación fallida');
      return;
    }
    downloadBase64(result.data.filename, result.data.contentType, result.data.base64);
    setMessage(
      `Export listo · ${Object.entries(result.data.recordCounts)
        .map(([k, v]) => `${k}:${v}`)
        .join(' · ')}`
    );
    await refreshExportHistory();
  }

  async function onQueueExport() {
    setMessage(null);
    const form = new FormData();
    form.set('exportType', exportType);
    form.set('format', exportFormat);
    if (patientId) form.set('patientId', patientId);
    form.set('dateFrom', dateFrom);
    form.set('dateTo', dateTo);
    const result = await run(() => queueClinicExportAction(form));
    if (!result?.success || !result.data) {
      setMessage(result?.error ?? 'No se pudo encolar export');
      return;
    }
    setMessage(`Export encolado (${result.data.jobId.slice(0, 8)}…). Cron /api/cron/data-export.`);
    await refreshExportHistory();
  }

  async function onDownloadExport(jobId: string) {
    const form = new FormData();
    form.set('jobId', jobId);
    const result = await run(() => downloadExportArtifactAction(form));
    if (!result?.success || !result.data) {
      setMessage(result?.error ?? 'Descarga no disponible');
      return;
    }
    window.open(result.data.url, '_blank', 'noopener,noreferrer');
  }

  async function refreshImportHistory() {
    const result = await run(() => listDataImportBatchesAction());
    if (result?.success && result.data) setImportHistory(result.data as Array<Record<string, unknown>>);
  }

  async function refreshExportHistory() {
    const result = await run(() => listDataExportJobsAction());
    if (result?.success && result.data) setExportHistory(result.data as Array<Record<string, unknown>>);
  }

  async function refreshIntegrity() {
    const result = await run(() => getDataMigrationIntegrityAction());
    if (result?.success && result.data) setIntegrity(result.data);
    else setMessage(result?.error ?? 'No se pudo cargar integridad');
  }

  async function refreshChecklist() {
    const result = await run(() => getDataMigrationChecklistAction());
    if (result?.success && result.data) setChecklist(result.data);
    else setMessage(result?.error ?? 'No se pudo cargar checklist');
  }

  async function onDownloadChecklist() {
    const result = await run(() => downloadMigrationChecklistAction());
    if (!result?.success || !result.data) {
      setMessage(result?.error ?? 'No se pudo descargar checklist');
      return;
    }
    downloadText(result.data.filename, result.data.csv);
  }

  async function onDownloadBillingReconcile() {
    const result = await run(() => downloadBillingReconcileAction());
    if (!result?.success || !result.data) {
      setMessage(result?.error ?? 'No se pudo descargar conciliación');
      return;
    }
    downloadText(result.data.filename, result.data.csv);
    setMessage('Conciliación de facturación descargada');
  }

  async function onDownloadCutoverPack() {
    const result = await run(() => downloadCutoverPackAction());
    if (!result?.success || !result.data) {
      setMessage(result?.error ?? 'No se pudo descargar paquete cutover');
      return;
    }
    downloadBase64(result.data.filename, result.data.contentType, result.data.base64);
    setMessage(
      result.data.ready
        ? 'Paquete cutover descargado · listo para go-live'
        : 'Paquete cutover descargado · revisar pendientes'
    );
  }

  async function onDownloadBatchErrors(id: string) {
    const form = new FormData();
    form.set('batchId', id);
    const result = await run(() => downloadImportBatchErrorsAction(form));
    if (!result?.success || !result.data) {
      setMessage(result?.error ?? 'Sin errores para descargar');
      return;
    }
    downloadText(result.data.filename, result.data.csv);
  }

  async function onDownloadIntegrityReport() {
    const result = await run(() => downloadIntegrityReportAction());
    if (!result?.success || !result.data) {
      setMessage(result?.error ?? 'No se pudo generar el reporte');
      return;
    }
    downloadText(result.data.filename, result.data.csv);
  }

  async function onDownloadOrgIdMap() {
    const result = await run(() => downloadOrgIdMapAction());
    if (!result?.success || !result.data) {
      setMessage(result?.error ?? 'No se pudo descargar id-map org');
      return;
    }
    downloadText(result.data.filename, result.data.csv);
    setMessage(
      result.data.truncated
        ? `Id-map org descargado · ${result.data.rowCount} filas (truncado)`
        : `Id-map org descargado · ${result.data.rowCount} filas`
    );
  }

  async function onDownloadIdMap(id: string) {
    const form = new FormData();
    form.set('batchId', id);
    const result = await run(() => downloadImportIdMapAction(form));
    if (!result?.success || !result.data) {
      setMessage(result?.error ?? 'Sin id-map para descargar');
      return;
    }
    downloadText(result.data.filename, result.data.csv);
  }

  async function onReleaseStaleLocks() {
    const form = new FormData();
    form.set('staleMinutes', '30');
    const result = await run(() => releaseStaleMigrationLocksAction(form));
    if (!result?.success || !result.data) {
      setMessage(result?.error ?? 'No se pudieron liberar locks');
      return;
    }
    setMessage(
      `Locks liberados: ${result.data.importsReleased} imports · ${result.data.exportsReleased} exports`
    );
    await refreshIntegrity();
  }

  async function onPruneOrphans(dryRun: boolean) {
    const form = new FormData();
    form.set('dryRun', dryRun ? 'true' : 'false');
    const result = await run(() => pruneOrphanMigrationMapsAction(form));
    if (!result?.success || !result.data) {
      setMessage(result?.error ?? 'No se pudo podar huérfanos');
      return;
    }
    if (result.data.dryRun) {
      setMessage(
        `Simulación: ${result.data.orphanCreatedRows} created_rows · ${result.data.orphanIdMap} id-map huérfanos`
      );
    } else {
      setMessage(
        `Poda aplicada: ${result.data.deletedCreatedRows} created_rows · ${result.data.deletedIdMap} id-map`
      );
    }
    await refreshIntegrity();
  }

  async function onRollback(id: string) {
    const form = new FormData();
    form.set('batchId', id);
    const result = await run(() => rollbackDataImportAction(form));
    if (!result?.success) {
      setMessage(result?.error ?? 'No se pudo revertir');
      return;
    }
    setMessage(`Rollback: ${result.data?.rolledBack ?? 0} filas afectadas`);
    await refreshImportHistory();
  }

  async function onCancelImport(id: string) {
    const form = new FormData();
    form.set('batchId', id);
    const result = await run(() => cancelDataImportBatchAction(form));
    setMessage(result?.success ? 'Importación cancelada' : (result?.error ?? 'No se pudo cancelar'));
    await refreshImportHistory();
  }

  async function onRetryImport(id: string) {
    const form = new FormData();
    form.set('batchId', id);
    const result = await run(() => retryDataImportBatchAction(form));
    if (result?.success) {
      setQueuedBatchId(id);
      setMessage('Lote reencolado');
    } else {
      setMessage(result?.error ?? 'No se pudo reencolar');
    }
    await refreshImportHistory();
  }

  async function onCancelExport(id: string) {
    const form = new FormData();
    form.set('jobId', id);
    const result = await run(() => cancelDataExportJobAction(form));
    setMessage(result?.success ? 'Exportación cancelada' : (result?.error ?? 'No se pudo cancelar'));
    await refreshExportHistory();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {canImport ? (
          <Button
            type="button"
            size="sm"
            variant={section === 'import' ? 'default' : 'outline'}
            onClick={() => setSection('import')}
          >
            Importar datos
          </Button>
        ) : null}
        {canExport ? (
          <Button
            type="button"
            size="sm"
            variant={section === 'export' ? 'default' : 'outline'}
            onClick={() => setSection('export')}
          >
            Exportar datos
          </Button>
        ) : null}
        {canImport ? (
          <Button
            type="button"
            size="sm"
            variant={section === 'history-import' ? 'default' : 'outline'}
            onClick={() => {
              setSection('history-import');
              void refreshImportHistory();
              void refreshIntegrity();
            }}
          >
            Historial de importación
          </Button>
        ) : null}
        {canExport ? (
          <Button
            type="button"
            size="sm"
            variant={section === 'history-export' ? 'default' : 'outline'}
            onClick={() => {
              setSection('history-export');
              void refreshExportHistory();
              void refreshIntegrity();
            }}
          >
            Historial de exportación
          </Button>
        ) : null}
      </div>

      {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
      {importReport ? <p className="text-sm font-medium">{importReport}</p> : null}

      {section === 'import' && canImport ? (
        <Card>
          <CardHeader>
            <CardTitle>Importar datos</CardTitle>
            <CardDescription>
              Hito 1.3: multi-sede también en propietarios y pacientes (vía `external_branch_id` + mapa de
              sucursales; importá sucursales primero). Historias, vacunas, lab, cirugías, recetas e internaciones
              ya lo soportaban. Fase 35: Agenda: `external_assigned_user_id` + mapa staff (no crea usuarios).
              Fase 36: Consultas/cirugías/internaciones: `external_assigned_user_id` con mapa staff (vacío = usuario importador).
              Fase 37: Mapa staff completo también en historias, vacunas, lab y recetas.
              Fase 38: Export round-trip de `external_branch_id` / `external_assigned_user_id` (UUID internos) + mapa staff en pagos; formato 1.5.
              Fase 39: Mapa staff en facturas (`created_by`; vacío = importador). Paquete cutover v3 con plantillas staff/branch y notas round-trip.
              Fase 40: Mapa sucursales (upload CSV) + UUID internos de branch aceptados en re-import; formato 1.5.
              Fase 41: ZIP de ejemplo incluye staff_map.csv, branch_map.csv y roundtrip_notes.txt; asistente guiado indica si el paso admite mapa de sucursal/staff.
              Fase 42: `attachments_meta.csv` opcional en el ZIP mapea sucursal/staff por archivo adjunto (vacío = valores actuales; sin mapear = falla ese adjunto, no todo el lote).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {importType === 'full_migration' || importType === 'migration_zip' ? (
              <div className="space-y-2 rounded-md border p-3">
                <p className="text-sm font-medium">Guía de migración completa</p>
                <ol className="grid gap-1 text-xs text-muted-foreground sm:grid-cols-3">
                  {FULL_MIGRATION_STEPS.map((step) => (
                    <li key={step}>
                      <button
                        type="button"
                        className={
                          guideStep === step
                            ? 'font-medium text-foreground underline underline-offset-2'
                            : 'hover:text-foreground'
                        }
                        onClick={() => {
                          setGuideStep(step);
                          if (step !== 'attachments') {
                            // keep importType as full_migration; entity derives from guideStep
                          }
                          if (zipPack) {
                            if (step === 'branches' && zipPack.branchesCsv) {
                              setCsvText(zipPack.branchesCsv);
                              setSourceFilename('branches.csv');
                            } else if (step === 'owners' && zipPack.ownersCsv) {
                              setCsvText(zipPack.ownersCsv);
                              setSourceFilename('owners.csv');
                            } else if (step === 'patients' && zipPack.patientsCsv) {
                              setCsvText(zipPack.patientsCsv);
                              setSourceFilename('patients.csv');
                            } else if (step === 'clinical_entries' && zipPack.clinicalCsv) {
                              setCsvText(zipPack.clinicalCsv);
                              setSourceFilename('clinical_records.csv');
                            } else if (step === 'vaccinations' && zipPack.vaccinationsCsv) {
                              setCsvText(zipPack.vaccinationsCsv);
                              setSourceFilename('vaccinations.csv');
                            } else if (step === 'lab_orders' && zipPack.labOrdersCsv) {
                              setCsvText(zipPack.labOrdersCsv);
                              setSourceFilename('lab_orders.csv');
                            } else if (step === 'surgeries' && zipPack.surgeriesCsv) {
                              setCsvText(zipPack.surgeriesCsv);
                              setSourceFilename('surgeries.csv');
                            } else if (step === 'prescriptions' && zipPack.prescriptionsCsv) {
                              setCsvText(zipPack.prescriptionsCsv);
                              setSourceFilename('prescriptions.csv');
                            } else if (step === 'hospitalizations' && zipPack.hospitalizationsCsv) {
                              setCsvText(zipPack.hospitalizationsCsv);
                              setSourceFilename('hospitalizations.csv');
                            } else if (step === 'appointments' && zipPack.appointmentsCsv) {
                              setCsvText(zipPack.appointmentsCsv);
                              setSourceFilename('appointments.csv');
                            } else if (step === 'consultations' && zipPack.consultationsCsv) {
                              setCsvText(zipPack.consultationsCsv);
                              setSourceFilename('consultations.csv');
                            } else if (step === 'inventory_products' && zipPack.inventoryProductsCsv) {
                              setCsvText(zipPack.inventoryProductsCsv);
                              setSourceFilename('inventory_products.csv');
                            } else if (step === 'invoices' && zipPack.invoicesCsv) {
                              setCsvText(zipPack.invoicesCsv);
                              setSourceFilename('invoices.csv');
                            } else if (step === 'payments' && zipPack.paymentsCsv) {
                              setCsvText(zipPack.paymentsCsv);
                              setSourceFilename('payments.csv');
                            }
                          }
                        }}
                      >
                        {FULL_MIGRATION_STEP_LABELS[step]}
                      </button>
                    </li>
                  ))}
                </ol>
                {guideStepMapHints.length > 0 ? (
                  <div className="space-y-0.5">
                    {guideStepMapHints.map((hint) => (
                      <p
                        key={hint.text}
                        className={
                          hint.kind === 'ok'
                            ? 'text-xs text-emerald-600'
                            : 'text-xs text-muted-foreground'
                        }
                      >
                        {hint.text}
                      </p>
                    ))}
                  </div>
                ) : null}
                <div className="flex flex-wrap gap-2 pt-1">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={!nextFullMigrationStep(guideStep)}
                    onClick={() => {
                      const next = nextFullMigrationStep(guideStep);
                      if (!next) return;
                      setGuideStep(next);
                      if (!zipPack) return;
                      if (next === 'branches' && zipPack.branchesCsv) {
                        setCsvText(zipPack.branchesCsv);
                        setSourceFilename('branches.csv');
                      } else if (next === 'owners' && zipPack.ownersCsv) {
                        setCsvText(zipPack.ownersCsv);
                        setSourceFilename('owners.csv');
                      } else if (next === 'patients' && zipPack.patientsCsv) {
                        setCsvText(zipPack.patientsCsv);
                        setSourceFilename('patients.csv');
                      } else if (next === 'clinical_entries' && zipPack.clinicalCsv) {
                        setCsvText(zipPack.clinicalCsv);
                        setSourceFilename('clinical_records.csv');
                      } else if (next === 'vaccinations' && zipPack.vaccinationsCsv) {
                        setCsvText(zipPack.vaccinationsCsv);
                        setSourceFilename('vaccinations.csv');
                      } else if (next === 'lab_orders' && zipPack.labOrdersCsv) {
                        setCsvText(zipPack.labOrdersCsv);
                        setSourceFilename('lab_orders.csv');
                      } else if (next === 'surgeries' && zipPack.surgeriesCsv) {
                        setCsvText(zipPack.surgeriesCsv);
                        setSourceFilename('surgeries.csv');
                      } else if (next === 'prescriptions' && zipPack.prescriptionsCsv) {
                        setCsvText(zipPack.prescriptionsCsv);
                        setSourceFilename('prescriptions.csv');
                      } else if (next === 'hospitalizations' && zipPack.hospitalizationsCsv) {
                        setCsvText(zipPack.hospitalizationsCsv);
                        setSourceFilename('hospitalizations.csv');
                      } else if (next === 'appointments' && zipPack.appointmentsCsv) {
                        setCsvText(zipPack.appointmentsCsv);
                        setSourceFilename('appointments.csv');
                      } else if (next === 'consultations' && zipPack.consultationsCsv) {
                        setCsvText(zipPack.consultationsCsv);
                        setSourceFilename('consultations.csv');
                      } else if (next === 'inventory_products' && zipPack.inventoryProductsCsv) {
                        setCsvText(zipPack.inventoryProductsCsv);
                        setSourceFilename('inventory_products.csv');
                      } else if (next === 'invoices' && zipPack.invoicesCsv) {
                        setCsvText(zipPack.invoicesCsv);
                        setSourceFilename('invoices.csv');
                      } else if (next === 'payments' && zipPack.paymentsCsv) {
                        setCsvText(zipPack.paymentsCsv);
                        setSourceFilename('payments.csv');
                      }
                    }}
                  >
                    Siguiente paso
                  </Button>
                  {guideStep === 'attachments' ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={pending || !zipBase64 || Object.keys(patientIdByExternal).length === 0}
                      onClick={() => void onImportAttachments()}
                    >
                      Importar adjuntos ahora
                    </Button>
                  ) : null}
                </div>
              </div>
            ) : null}
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label>Qué importar</Label>
                <Select
                  value={importType}
                  onChange={(e) => {
                    const next = e.target.value as ImportType;
                    setImportType(next);
                    setBatchId(null);
                    setValidation(null);
                    setHeaders([]);
                    setMapping({});
                    if (!zipPack) return;
                    if (next === 'branches' && zipPack.branchesCsv) {
                      setCsvText(zipPack.branchesCsv);
                      setSourceFilename('branches.csv');
                    } else if (next === 'owners' && zipPack.ownersCsv) {
                      setCsvText(zipPack.ownersCsv);
                      setSourceFilename('owners.csv');
                    } else if (next === 'patients' && zipPack.patientsCsv) {
                      setCsvText(zipPack.patientsCsv);
                      setSourceFilename('patients.csv');
                    } else if (next === 'clinical_entries' && zipPack.clinicalCsv) {
                      setCsvText(zipPack.clinicalCsv);
                      setSourceFilename('clinical_records.csv');
                    } else if (next === 'vaccinations' && zipPack.vaccinationsCsv) {
                      setCsvText(zipPack.vaccinationsCsv);
                      setSourceFilename('vaccinations.csv');
                    } else if (next === 'lab_orders' && zipPack.labOrdersCsv) {
                      setCsvText(zipPack.labOrdersCsv);
                      setSourceFilename('lab_orders.csv');
                    } else if (next === 'surgeries' && zipPack.surgeriesCsv) {
                      setCsvText(zipPack.surgeriesCsv);
                      setSourceFilename('surgeries.csv');
                    } else if (next === 'prescriptions' && zipPack.prescriptionsCsv) {
                      setCsvText(zipPack.prescriptionsCsv);
                      setSourceFilename('prescriptions.csv');
                    } else if (next === 'hospitalizations' && zipPack.hospitalizationsCsv) {
                      setCsvText(zipPack.hospitalizationsCsv);
                      setSourceFilename('hospitalizations.csv');
                    } else if (next === 'appointments' && zipPack.appointmentsCsv) {
                      setCsvText(zipPack.appointmentsCsv);
                      setSourceFilename('appointments.csv');
                    } else if (next === 'consultations' && zipPack.consultationsCsv) {
                      setCsvText(zipPack.consultationsCsv);
                      setSourceFilename('consultations.csv');
                    } else if (next === 'inventory_products' && zipPack.inventoryProductsCsv) {
                      setCsvText(zipPack.inventoryProductsCsv);
                      setSourceFilename('inventory_products.csv');
                    } else if (next === 'invoices' && zipPack.invoicesCsv) {
                      setCsvText(zipPack.invoicesCsv);
                      setSourceFilename('invoices.csv');
                    } else if (next === 'payments' && zipPack.paymentsCsv) {
                      setCsvText(zipPack.paymentsCsv);
                      setSourceFilename('payments.csv');
                    }
                  }}
                >
                  {(Object.keys(IMPORT_TYPE_LABELS) as ImportType[]).map((key) => (
                    <option key={key} value={key}>
                      {IMPORT_TYPE_LABELS[key]}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Sistema origen</Label>
                <Input value={sourceSystem} onChange={(e) => setSourceSystem(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Idempotencia</Label>
                <Select
                  value={idempotencyMode}
                  onChange={(e) => setIdempotencyMode(e.target.value as IdempotencyMode)}
                >
                  {(Object.keys(IDEMPOTENCY_MODE_LABELS) as IdempotencyMode[]).map((key) => (
                    <option key={key} value={key}>
                      {IDEMPOTENCY_MODE_LABELS[key]}
                    </option>
                  ))}
                </Select>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => void onDownloadTemplate('branches')}>
                Plantilla sucursales
              </Button>
              <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => void onDownloadTemplate('owners')}>
                Plantilla propietarios
              </Button>
              <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => void onDownloadTemplate('patients')}>
                Plantilla pacientes
              </Button>
              <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => void onDownloadTemplate('clinical_entries')}>
                Plantilla historias
              </Button>
              <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => void onDownloadTemplate('vaccinations')}>
                Plantilla vacunas
              </Button>
              <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => void onDownloadTemplate('lab_orders')}>
                Plantilla lab
              </Button>
              <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => void onDownloadTemplate('surgeries')}>
                Plantilla cirugías
              </Button>
              <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => void onDownloadTemplate('prescriptions')}>
                Plantilla recetas
              </Button>
              <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => void onDownloadTemplate('hospitalizations')}>
                Plantilla internaciones
              </Button>
              <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => void onDownloadTemplate('appointments')}>
                Plantilla agenda
              </Button>
              <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => void onDownloadTemplate('consultations')}>
                Plantilla consultas
              </Button>
              <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => void onDownloadTemplate('inventory_products')}>
                Plantilla inventario
              </Button>
              <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => void onDownloadTemplate('invoices')}>
                Plantilla facturas
              </Button>
              <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => void onDownloadTemplate('payments')}>
                Plantilla pagos
              </Button>
              <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => void onDownloadTemplate('staff_map')}>
                Plantilla mapa staff
              </Button>
              <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => void onDownloadTemplate('branch_map')}>
                Plantilla mapa sucursales
              </Button>
              <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => void onDownloadTemplate('attachment_meta')}>
                Plantilla metadata adjuntos
              </Button>
              <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => void onDownloadSampleZip()}>
                ZIP migración de ejemplo
              </Button>
            </div>

            <div className="space-y-2 rounded-md border p-3">
              <p className="text-sm font-medium">Mapa sucursales (external → branch id)</p>
              <p className="text-xs text-muted-foreground">
                Para filas con `external_branch_id`. Exportá branches primero; también se aceptan UUID internos del
                tenant (round-trip fase 38). Entradas cargadas: {Object.keys(branchIdByExternal).length}
              </p>
              <div className="flex flex-wrap gap-2">
                <Input
                  type="file"
                  accept=".csv,text/csv"
                  onChange={(e) => void onBranchMapFileSelected(e.target.files?.[0] ?? null)}
                />
              </div>
            </div>

            <div className="space-y-2 rounded-md border p-3">
              <p className="text-sm font-medium">Mapa staff (external → profile id)</p>
              <p className="text-xs text-muted-foreground">
                Para citas con `external_assigned_user_id`. Exportá staff_profiles primero; no crea usuarios en
                auth. Entradas cargadas: {Object.keys(userIdByExternal).length}
              </p>
              <div className="flex flex-wrap gap-2">
                <Input
                  type="file"
                  accept=".csv,text/csv"
                  onChange={(e) => void onStaffMapFileSelected(e.target.files?.[0] ?? null)}
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label htmlFor="importFile">Subir CSV / XLSX / ZIP SyncVete</Label>
              <Input
                id="importFile"
                type="file"
                accept=".csv,.json,.xlsx,.xls,.zip,text/csv,application/json,application/zip"
                onChange={(e) => void onFileSelected(e.target.files?.[0] ?? null)}
              />
            </div>

            <div className="flex flex-wrap gap-2">
              <Button type="button" disabled={pending || !csvText} onClick={() => void onAnalyze()}>
                Analizar y mapear
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={pending || !batchId}
                onClick={() => void onValidate()}
              >
                Validar (dry-run)
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={pending || !validation || validation.issues.length === 0}
                onClick={() => void onDownloadValidationReport()}
              >
                Descargar reporte validación
              </Button>
              <Button
                type="button"
                disabled={pending || !validation || validation.errors > 0}
                onClick={() => void onCommit()}
              >
                Confirmar importación
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={pending || !validation || validation.errors > 0}
                onClick={() => void onQueueImport()}
              >
                Encolar (background)
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={pending || !zipBase64 || Object.keys(patientIdByExternal).length === 0}
                onClick={() => void onImportAttachments()}
              >
                Importar adjuntos del ZIP
              </Button>
            </div>

            {progressLabel ? <p className="text-sm font-medium">{progressLabel}</p> : null}

            {validation?.issues.some((i) => i.code === 'possible_duplicate') ? (
              <div className="space-y-2 rounded-md border p-3 text-sm">
                <p className="font-medium">Decisiones por fila (duplicados)</p>
                <p className="text-xs text-muted-foreground">
                  Sin decisión explícita no se crea ni se vincula. Elegí crear, vincular u omitir.
                </p>
                {validation.issues
                  .filter((i) => i.code === 'possible_duplicate')
                  .map((issue) => (
                    <div
                      key={`${issue.rowNumber}-${issue.field}`}
                      className="grid gap-2 sm:grid-cols-[1fr_180px]"
                    >
                      <p className="text-xs text-muted-foreground">
                        Fila {issue.rowNumber}: {issue.message}
                        {issue.matchInternalId ? ` · match ${issue.matchInternalId.slice(0, 8)}…` : ''}
                      </p>
                      <Select
                        value={rowDecisions[issue.rowNumber]?.decision ?? 'review'}
                        onChange={(e) => {
                          const decision = e.target.value as ConflictPolicy;
                          setRowDecisions((prev) => ({
                            ...prev,
                            [issue.rowNumber]: {
                              rowNumber: issue.rowNumber,
                              decision,
                              linkInternalId:
                                decision === 'link'
                                  ? issue.matchInternalId ?? prev[issue.rowNumber]?.linkInternalId ?? null
                                  : null,
                            },
                          }));
                        }}
                      >
                        {(Object.keys(CONFLICT_DECISION_LABELS) as ConflictPolicy[]).map((key) => (
                          <option key={key} value={key}>
                            {CONFLICT_DECISION_LABELS[key]}
                          </option>
                        ))}
                      </Select>
                    </div>
                  ))}
              </div>
            ) : null}

            {headers.length > 0 ? (
              <div className="space-y-2 rounded-md border p-3">
                <p className="text-sm font-medium">Mapeo de columnas</p>
                {Object.entries(mapping).map(([field, source]) => (
                  <div key={field} className="grid gap-2 sm:grid-cols-2">
                    <Label className="text-xs text-muted-foreground">{field}</Label>
                    <Select
                      value={source ?? ''}
                      onChange={(e) =>
                        setMapping((prev) => ({
                          ...prev,
                          [field]: e.target.value || null,
                        }))
                      }
                    >
                      <option value="">— sin mapear —</option>
                      {headers.map((header) => (
                        <option key={header} value={header}>
                          {header}
                        </option>
                      ))}
                    </Select>
                  </div>
                ))}
              </div>
            ) : null}

            {validation ? (
              <div className="space-y-2 rounded-md border p-3 text-sm">
                <p>
                  Detectados: {validation.detected} · Listos: {validation.ready} · Avisos:{' '}
                  {validation.warnings} · Errores: {validation.errors}
                </p>
                {validation.issues.length > 0 ? (
                  <ul className="max-h-48 space-y-1 overflow-auto text-xs text-muted-foreground">
                    {validation.issues.slice(0, 40).map((issue, idx) => (
                      <li key={`${issue.rowNumber}-${issue.code}-${idx}`}>
                        Fila {issue.rowNumber}: [{issue.severity}] {issue.message}
                        {issue.recommendedAction ? ` → ${issue.recommendedAction}` : ''}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : null}

            {importType === 'full_migration' || importType === 'migration_zip' || importType === 'attachments' ? (
              <p className="text-xs text-muted-foreground">
                Orden: propietarios → pacientes → clínicas/vacunas/lab/cirugías/recetas → adjuntos.
                Los adjuntos usan attachments/ID-paciente-externo/* (jpg/png/webp/gif/pdf) y
                requieren el mapa de pacientes del lote. Progreso por chunks reales (no %).
              </p>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {section === 'export' && canExport ? (
        <Card>
          <CardHeader>
            <CardTitle>Exportar datos</CardTitle>
            <CardDescription>
              Fase 24: export de caja (sesiones + movimientos). Solo lectura — no hay import de caja.
              Fase 27: export de recordatorios (historial). Solo lectura — no hay import (no reenvía
              WhatsApp).               Fase 28: export de WhatsApp (historial). Solo lectura — no hay import (no
              reenvía mensajes). Fase 29: export de auditoría (historial). Solo lectura — no hay import
              (pista inmutable). Fase 33: export de notificaciones (historial). Solo lectura — no hay import
              (no recrea inbox).               Fase 34: export de staff (perfiles + membresías). Solo lectura — no importa
              usuarios ni roles. Fase 43: export de movimientos de inventario (auditoría de stock). Solo
              lectura — no se importa (el stock se deriva de operaciones reales, no de migración). CSV/JSON/XLSX/ZIP + módulos specialty. Opcional: rango de fechas y encolar
              para background. ZIP completo incluye lab/cirugía/recetas/internación. Fase 38: CSV/ZIP emiten
              `external_branch_id` y `external_assigned_user_id` (UUID internos) para re-import con mapas conocidos; formato 1.6.
              Fase 39: facturas exportan `created_by` como `external_assigned_user_id`.
              Fase 40: re-import acepta UUID internos de branch además del mapa sucursales.
              Fase 44: ZIP completo/JSON incluye notas de internación (evolución/temperatura/peso). Solo
              lectura — no se importan (se registran en la app durante la estadía, no por migración).
              Fase 45: export individual CSV/XLSX de internaciones aplana las notas; JSON incluye
              `hospitalizationNotes` (y ítems lab/rx); ZIP specialty de internaciones trae notas CSV+JSON.
              Fase 46: export de adjuntos clínicos (metadata). Solo lectura — catálogo CSV/JSON/XLSX +
              ZIP completo; no recrea filas (los binarios siguen por ZIP de adjuntos). También amplía el
              check DB de `export_type` con `inventory_movements` + `clinical_images`.
              Fase 47: ZIP specialty de lab/recetas incluye ítems hijos (CSV+JSON); cirugías specialty
              incluye CSV padre (misma paridad que internaciones fase 45).
              Fase 48: ZIP de una sola entidad es enfocado (solo esa entidad + companions: caja→
              movimientos, facturas→ítems/pagos, staff→membresías); ya no vuelca toda la clínica vacía.
              Fase 49: JSON de una sola entidad / specialty también enfocado (formato 1.6); bundles
              `full_clinic` / `patient_clinical` siguen completos.
              Fase 50 (hito): export ZIP emite `attachments_meta.csv` para binarios empaquetados
              (round-trip con import fase 42); cutover pack v4 + plantilla attachments_meta.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label>Qué exportar</Label>
                <Select
                  value={exportType}
                  onChange={(e) => setExportType(e.target.value as ExportType)}
                >
                  {(Object.keys(EXPORT_TYPE_LABELS) as ExportType[]).map((key) => (
                    <option key={key} value={key}>
                      {EXPORT_TYPE_LABELS[key]}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Formato</Label>
                <Select
                  value={exportFormat}
                  onChange={(e) => setExportFormat(e.target.value as ExportFormat)}
                >
                  <option value="csv">CSV</option>
                  <option value="xlsx">XLSX (Excel)</option>
                  <option value="json">JSON</option>
                  <option value="zip">ZIP completo (+ adjuntos)</option>
                  <option value="pdf">PDF / HTML clínico</option>
                </Select>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label>Desde (YYYY-MM-DD)</Label>
                <Input value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} placeholder="2024-01-01" />
              </div>
              <div className="space-y-1">
                <Label>Hasta (YYYY-MM-DD)</Label>
                <Input value={dateTo} onChange={(e) => setDateTo(e.target.value)} placeholder="2024-12-31" />
              </div>
            </div>
            {(exportType === 'patient_clinical' || exportFormat === 'pdf') && (
              <div className="space-y-1">
                <Label>ID paciente (UUID SyncVete)</Label>
                <Input value={patientId} onChange={(e) => setPatientId(e.target.value)} />
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              <Button type="button" disabled={pending} onClick={() => void onExport()}>
                Generar exportación
              </Button>
              <Button type="button" variant="outline" disabled={pending} onClick={() => void onQueueExport()}>
                Encolar exportación
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {section === 'history-import' && canImport ? (
        <Card>
          <CardHeader>
            <CardTitle>Historial de importación</CardTitle>
            {integrity ? (
              <CardDescription>
                Integridad: {String(integrity.imports.total ?? 0)} lotes · creados{' '}
                {integrity.createdRowsTracked} · id-map {integrity.idMapEntries} · huérfanos creados{' '}
                {integrity.orphanCreatedTotal} · huérfanos id-map {integrity.orphanIdMapTotal}
                {integrity.stuckImports + integrity.stuckExports > 0
                  ? ` · locks trabados ${integrity.stuckImports + integrity.stuckExports}`
                  : ''}
              </CardDescription>
            ) : null}
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-xs text-muted-foreground">
              Paquete cutover v3: incluye catálogo de exports, recomendaciones de freeze, id-map org,
              plantillas staff/branch y notas round-trip (integridad + checklist + conciliación, solo lectura).
              Fase 32: export org-wide del id-map (también en paquete cutover).
              Fase 41: ZIP de ejemplo incluye staff_map.csv, branch_map.csv y roundtrip_notes.txt; asistente guiado indica si el paso admite mapa de sucursal/staff.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => void refreshIntegrity()}>
                Actualizar integridad
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={pending || !integrity}
                onClick={() => void onDownloadIntegrityReport()}
              >
                Reporte integridad CSV
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={pending}
                onClick={() => void onDownloadOrgIdMap()}
              >
                Id-map org
              </Button>
              <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => void refreshChecklist()}>
                Checklist go-live
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={pending || !checklist}
                onClick={() => void onDownloadChecklist()}
              >
                Checklist CSV
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={pending}
                onClick={() => void onDownloadBillingReconcile()}
              >
                Conciliación facturación
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={pending}
                onClick={() => void onDownloadCutoverPack()}
              >
                Paquete cutover
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={pending}
                onClick={() => void onReleaseStaleLocks()}
              >
                Liberar locks trabados
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={pending}
                onClick={() => void onPruneOrphans(true)}
              >
                Simular poda huérfanos
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={pending || !integrity || integrity.orphanCreatedTotal + integrity.orphanIdMapTotal === 0}
                onClick={() => void onPruneOrphans(false)}
              >
                Podar huérfanos
              </Button>
            </div>
            {checklist ? (
              <div className="rounded-md border p-3 text-sm">
                <p className="font-medium">
                  Checklist: {checklist.scoreOk}/{checklist.scoreTotal} OK
                  {checklist.readyForGolive ? ' · listo para go-live' : ' · revisar pendientes'}
                </p>
                <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                  {checklist.items.map((item) => (
                    <li key={item.key}>
                      [{item.status}] {item.label}: {item.count}
                      {item.detail ? ` · ${item.detail}` : ''}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}            {importHistory.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sin lotes todavía.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {importHistory.map((batch) => (
                  <li key={String(batch.id)} className="rounded-md border px-3 py-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="font-medium">
                          {String(batch.import_type)} · {String(batch.status)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {String(batch.created_at)} · archivo {String(batch.source_filename ?? '—')} ·
                          importados {String(batch.imported_records ?? 0)}
                          {batch.progress_message ? ` · ${String(batch.progress_message)}` : ''}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        {['queued', 'importing'].includes(String(batch.status)) ? (
                          <>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              disabled={pending}
                              onClick={() => setQueuedBatchId(String(batch.id))}
                            >
                              Seguir progreso
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              disabled={pending}
                              onClick={() => void onCancelImport(String(batch.id))}
                            >
                              Cancelar
                            </Button>
                          </>
                        ) : null}
                        {['failed', 'cancelled', 'completed_with_warnings'].includes(
                          String(batch.status)
                        ) || Number(batch.failed_records ?? 0) > 0 ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={pending}
                            onClick={() => void onDownloadBatchErrors(String(batch.id))}
                          >
                            Errores CSV
                          </Button>
                        ) : null}
                        {['failed', 'cancelled'].includes(String(batch.status)) &&
                        batch.storage_path ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={pending}
                            onClick={() => void onRetryImport(String(batch.id))}
                          >
                            Reintentar
                          </Button>
                        ) : null}
                        {['completed', 'completed_with_warnings', 'failed', 'cancelled', 'rolled_back'].includes(
                          String(batch.status)
                        ) ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={pending}
                            onClick={() => void onDownloadIdMap(String(batch.id))}
                          >
                            Id-map CSV
                          </Button>
                        ) : null}
                        {['completed', 'completed_with_warnings'].includes(String(batch.status)) ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={pending}
                            onClick={() => void onRollback(String(batch.id))}
                          >
                            Rollback
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      ) : null}

      {section === 'history-export' && canExport ? (
        <Card>
          <CardHeader>
            <CardTitle>Historial de exportación</CardTitle>
          </CardHeader>
          <CardContent>
            {exportHistory.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sin exportaciones todavía.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {exportHistory.map((job) => (
                  <li key={String(job.id)} className="rounded-md border px-3 py-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="font-medium">
                          {String(job.export_type)} · {String(job.format)} · {String(job.status)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {String(job.created_at)}
                          {job.progress_message ? ` · ${String(job.progress_message)}` : ''}
                        </p>
                      </div>
                      {['queued', 'running'].includes(String(job.status)) ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={pending}
                          onClick={() => void onCancelExport(String(job.id))}
                        >
                          Cancelar
                        </Button>
                      ) : null}
                      {String(job.status) === 'completed' && job.storage_path ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={pending}
                          onClick={() => void onDownloadExport(String(job.id))}
                        >
                          Descargar
                        </Button>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
