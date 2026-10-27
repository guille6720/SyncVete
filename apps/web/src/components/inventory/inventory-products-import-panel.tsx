'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Download, Upload } from 'lucide-react';
import {
  DEFAULT_IMPORT_CHUNK_SIZE,
  IDEMPOTENCY_MODE_LABELS,
  INVENTORY_PRODUCT_IMPORT_FIELDS,
  type IdempotencyMode,
  type ValidationIssue,
} from '@sincvete/shared';
import {
  commitDataImport,
  convertSpreadsheetToCsvAction,
  downloadImportTemplate,
  downloadValidationReportAction,
  startDataImport,
  validateDataImport,
} from '@/actions/data-migration';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { usePendingAction } from '@/lib/hooks/use-pending-action';

const ENTITY = 'inventory_products' as const;
const IMPORT_TYPE = 'inventory_products' as const;

function downloadText(filename: string, text: string, type = 'text/csv;charset=utf-8') {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

async function fileToBase64(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
  return btoa(binary);
}

interface InventoryProductsImportPanelProps {
  listHref?: string;
}

export function InventoryProductsImportPanel({
  listHref = '/inventario',
}: InventoryProductsImportPanelProps) {
  const router = useRouter();
  const [pending, run] = usePendingAction();
  const [message, setMessage] = useState<string | null>(null);
  const [sourceSystem, setSourceSystem] = useState('Catalogo');
  const [idempotencyMode, setIdempotencyMode] = useState<IdempotencyMode>('skip_existing_source');
  const [csvText, setCsvText] = useState('');
  const [sourceFilename, setSourceFilename] = useState('productos.csv');
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
  const [progressLabel, setProgressLabel] = useState<string | null>(null);
  const [importReport, setImportReport] = useState<string | null>(null);

  const requiredFields = useMemo(
    () => INVENTORY_PRODUCT_IMPORT_FIELDS.filter((field) => field.required),
    []
  );

  async function onDownloadTemplate() {
    setMessage(null);
    const form = new FormData();
    form.set('kind', ENTITY);
    const result = await run(() => downloadImportTemplate(form));
    if (!result?.success || !result.data) {
      setMessage(result?.error ?? 'No se pudo descargar la plantilla');
      return;
    }
    downloadText(result.data.filename, result.data.csv);
  }

  async function onFileSelected(file: File | null) {
    if (!file) return;
    setValidation(null);
    setImportReport(null);
    setBatchId(null);
    setMapping({});
    setHeaders([]);
    setSourceFilename(file.name);

    const lower = file.name.toLowerCase();
    if (lower.endsWith('.xlsx') || lower.endsWith('.xls')) {
      const form = new FormData();
      form.set('fileBase64', await fileToBase64(file));
      form.set('filename', file.name);
      const result = await run(() => convertSpreadsheetToCsvAction(form));
      if (!result?.success || !result.data) {
        setMessage(result?.error ?? 'No se pudo leer el Excel');
        return;
      }
      setCsvText(result.data.csv);
      setSourceFilename(result.data.filename);
      setMessage('Excel convertido a CSV (primera hoja)');
      return;
    }

    setCsvText(await file.text());
    setMessage(`Archivo cargado: ${file.name}`);
  }

  async function onAnalyze() {
    if (!csvText.trim()) {
      setMessage('Subí un CSV o Excel primero');
      return;
    }
    setMessage(null);
    setValidation(null);
    setImportReport(null);
    const form = new FormData();
    form.set('importType', IMPORT_TYPE);
    form.set('entity', ENTITY);
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
    setMessage(`Analizado · ${result.data.rowCount} filas · revisá el mapeo y validá`);
  }

  async function onValidate() {
    if (!batchId) return;
    setMessage(null);
    const form = new FormData();
    form.set('batchId', batchId);
    form.set('entity', ENTITY);
    form.set('csvText', csvText);
    form.set('mapping', JSON.stringify(mapping));
    form.set('knownOwnerExternalIds', '');
    form.set('knownPatientExternalIds', '');
    form.set('knownInvoiceExternalIds', '');
    form.set('invoiceIdByExternal', '{}');
    form.set('branchIdByExternal', '{}');
    form.set('userIdByExternal', '{}');
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
      setMessage('Corregí los errores antes de importar');
      return;
    }

    let offset = 0;
    let totalImported = 0;
    let totalFailed = 0;
    let done = false;
    let lastStatus = 'importing';

    while (!done) {
      setProgressLabel(`Importando productos: ${offset}…`);
      const form = new FormData();
      form.set('batchId', batchId);
      form.set('entity', ENTITY);
      form.set('csvText', csvText);
      form.set('mapping', JSON.stringify(mapping));
      form.set('ownerIdByExternal', '{}');
      form.set('branchIdByExternal', '{}');
      form.set('userIdByExternal', '{}');
      form.set('patientIdByExternal', '{}');
      form.set('productIdByExternal', '{}');
      form.set('invoiceIdByExternal', '{}');
      form.set('appointmentIdByExternal', '{}');
      form.set('sourceSystem', sourceSystem);
      form.set('offset', String(offset));
      form.set('chunkSize', String(DEFAULT_IMPORT_CHUNK_SIZE));
      form.set('rowDecisions', '{}');
      form.set('validationIssues', JSON.stringify(validation.issues));
      const result = await run(() => commitDataImport(form));
      if (!result?.success || !result.data) {
        setMessage(result?.error ?? 'Importación fallida');
        setProgressLabel(null);
        return;
      }
      totalImported += result.data.imported;
      totalFailed += result.data.failed;
      done = result.data.done;
      offset = result.data.nextOffset;
      lastStatus = result.data.status;
      setProgressLabel(
        `Progreso: ${result.data.processed}/${result.data.total} · ok ${totalImported} · fallidos ${totalFailed}`
      );
    }

    setImportReport(`Importación ${lastStatus}: ${totalImported} ok · ${totalFailed} fallidos`);
    setMessage(null);
    setProgressLabel(null);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" asChild>
        <Link href={listHref}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Volver a inventario
        </Link>
      </Button>

      <Card>
        <CardHeader>
          <CardTitle>Importar productos</CardTitle>
          <CardDescription>
            Subí un CSV o Excel con el catálogo. Descargá la plantilla si no tenés el formato.
            Campos obligatorios: {requiredFields.map((field) => field.label).join(', ')}.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {(message || progressLabel || importReport) && (
            <div className="space-y-2 text-sm">
              {message && (
                <p className="rounded-md border px-3 py-2 text-muted-foreground">{message}</p>
              )}
              {progressLabel && (
                <p className="rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-sky-900 dark:border-sky-900 dark:bg-sky-950 dark:text-sky-100">
                  {progressLabel}
                </p>
              )}
              {importReport && (
                <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-100">
                  {importReport}{' '}
                  <Link href={listHref} className="underline underline-offset-2">
                    Ver inventario
                  </Link>
                </p>
              )}
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" disabled={pending} onClick={() => void onDownloadTemplate()}>
              <Download className="mr-2 h-4 w-4" />
              Plantilla CSV
            </Button>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="sourceSystem">Sistema origen</Label>
              <Input
                id="sourceSystem"
                value={sourceSystem}
                onChange={(e) => setSourceSystem(e.target.value)}
                placeholder="Ej. Catalogo / Vetsoft"
              />
              <p className="text-xs text-muted-foreground">
                Se usa con el ID externo para no duplicar si reimportás.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="idempotencyMode">Si ya existe</Label>
              <Select
                id="idempotencyMode"
                value={idempotencyMode}
                onChange={(e) => setIdempotencyMode(e.target.value as IdempotencyMode)}
              >
                {(Object.keys(IDEMPOTENCY_MODE_LABELS) as IdempotencyMode[]).map((mode) => (
                  <option key={mode} value={mode}>
                    {IDEMPOTENCY_MODE_LABELS[mode]}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="productFile">Archivo CSV / Excel</Label>
            <Input
              id="productFile"
              type="file"
              accept=".csv,text/csv,.xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
              onChange={(e) => void onFileSelected(e.target.files?.[0] ?? null)}
            />
            {csvText && (
              <p className="text-xs text-muted-foreground">
                {sourceFilename} · {csvText.split(/\r?\n/).filter((line) => line.trim()).length} líneas
              </p>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            <Button type="button" disabled={pending || !csvText.trim()} onClick={() => void onAnalyze()}>
              <Upload className="mr-2 h-4 w-4" />
              Analizar archivo
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={pending || !batchId}
              onClick={() => void onValidate()}
            >
              Validar
            </Button>
            <Button
              type="button"
              disabled={pending || !validation || validation.errors > 0}
              onClick={() => void onCommit()}
            >
              Importar productos
            </Button>
          </div>

          {batchId && headers.length > 0 && (
            <div className="space-y-3 rounded-lg border p-4">
              <div>
                <h3 className="font-medium">Mapeo de columnas</h3>
                <p className="text-sm text-muted-foreground">
                  Ajustá si el archivo usa otros nombres de columna.
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {INVENTORY_PRODUCT_IMPORT_FIELDS.map((field) => (
                  <div key={field.key} className="space-y-1">
                    <Label htmlFor={`map_${field.key}`}>
                      {field.label}
                      {field.required ? ' *' : ''}
                    </Label>
                    <Select
                      id={`map_${field.key}`}
                      value={mapping[field.key] ?? ''}
                      onChange={(e) =>
                        setMapping((current) => ({
                          ...current,
                          [field.key]: e.target.value || null,
                        }))
                      }
                    >
                      <option value="">— no mapear —</option>
                      {headers.map((header) => (
                        <option key={header} value={header}>
                          {header}
                        </option>
                      ))}
                    </Select>
                  </div>
                ))}
              </div>
            </div>
          )}

          {validation && (
            <div className="space-y-3 rounded-lg border p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="font-medium">Resultado de validación</h3>
                  <p className="text-sm text-muted-foreground">
                    {validation.detected} detectados · {validation.ready} listos ·{' '}
                    {validation.warnings} avisos · {validation.errors} errores
                  </p>
                </div>
                {validation.issues.length > 0 && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={pending}
                    onClick={() => void onDownloadValidationReport()}
                  >
                    Descargar reporte
                  </Button>
                )}
              </div>
              {validation.issues.length > 0 && (
                <div className="max-h-56 space-y-2 overflow-auto text-sm">
                  {validation.issues.slice(0, 40).map((issue, index) => (
                    <p
                      key={`${issue.rowNumber}-${issue.code}-${index}`}
                      className={
                        issue.severity === 'error' ? 'text-destructive' : 'text-muted-foreground'
                      }
                    >
                      Fila {issue.rowNumber}: {issue.message}
                    </p>
                  ))}
                  {validation.issues.length > 40 && (
                    <p className="text-muted-foreground">
                      … y {validation.issues.length - 40} más (descargá el reporte)
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
