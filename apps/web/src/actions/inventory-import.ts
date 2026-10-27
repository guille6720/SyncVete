'use server';

import { revalidatePath } from 'next/cache';
import {
  DEFAULT_IMPORT_CHUNK_SIZE,
  IDEMPOTENCY_MODES,
  buildInventoryProductTemplateCsv,
  completeInventoryProductMapping,
  type ActionResult,
  type IdempotencyMode,
  type ValidationIssue,
} from '@sincvete/shared';
import {
  analyzeImportFile,
  commitImport,
  createImportBatch,
  dryRunImport,
} from '@/lib/data-migration/import';
import { createServerClient } from '@/lib/supabase/server';
import {
  PermissionError,
  canPermissionAndFeature,
  requirePermissionAndFeature,
} from '@/lib/permissions';
import { FEATURES, planRestrictionResult } from '@/lib/entitlements';
import { getSessionContext } from '@/actions/auth';

const ENTITY = 'inventory_products' as const;
const IMPORT_TYPE = 'inventory_products' as const;

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

async function requireProductImportAccess() {
  const canDataImport = await canPermissionAndFeature(
    'data:import',
    FEATURES.DATA_IMPORT_EXPORT
  );
  if (canDataImport) {
    return requirePermissionAndFeature('data:import', FEATURES.DATA_IMPORT_EXPORT);
  }
  return requirePermissionAndFeature('inventory:write', FEATURES.INVENTORY);
}

export async function canImportInventoryProducts(): Promise<boolean> {
  const [dataImport, inventoryWrite] = await Promise.all([
    canPermissionAndFeature('data:import', FEATURES.DATA_IMPORT_EXPORT),
    canPermissionAndFeature('inventory:write', FEATURES.INVENTORY),
  ]);
  return dataImport || inventoryWrite;
}

export async function downloadInventoryProductTemplateAction(): Promise<
  ActionResult<{ filename: string; csv: string }>
> {
  try {
    await requireProductImportAccess();
    return {
      success: true,
      data: {
        filename: 'SyncVete-Inventory-Template.csv',
        csv: buildInventoryProductTemplateCsv(),
      },
    };
  } catch (error) {
    return actionError(error);
  }
}

export async function analyzeInventoryProductImport(formData: FormData): Promise<
  ActionResult<{
    batchId: string;
    headers: string[];
    mapping: Record<string, string | null>;
    rowCount: number;
  }>
> {
  try {
    await requireProductImportAccess();
    const csvText = String(formData.get('csvText') ?? '');
    const sourceFilename = String(formData.get('sourceFilename') ?? 'productos.csv');
    const sourceSystem = String(formData.get('sourceSystem') ?? '').trim() || 'Catalogo';
    const idempotencyRaw = String(formData.get('idempotencyMode') ?? 'skip_existing_source');
    const idempotencyMode = (IDEMPOTENCY_MODES as readonly string[]).includes(idempotencyRaw)
      ? (idempotencyRaw as IdempotencyMode)
      : 'skip_existing_source';
    if (!csvText.trim()) return { success: false, error: 'Subí un CSV primero' };

    const batch = await createImportBatch({
      importType: IMPORT_TYPE,
      sourceFilename,
      sourceFormat: 'csv',
      sourceSystem,
      idempotencyMode,
    });
    const analyzed = await analyzeImportFile({
      batchId: batch.id,
      csvText,
      entity: ENTITY,
    });
    const mapping = completeInventoryProductMapping(analyzed.headers, analyzed.mapping);

    return {
      success: true,
      data: {
        batchId: batch.id,
        headers: analyzed.headers,
        mapping,
        rowCount: analyzed.rows.length,
      },
    };
  } catch (error) {
    return actionError(error);
  }
}

export async function validateInventoryProductImport(formData: FormData): Promise<
  ActionResult<{
    detected: number;
    ready: number;
    warnings: number;
    errors: number;
    issues: ValidationIssue[];
  }>
> {
  try {
    await requireProductImportAccess();
    const batchId = String(formData.get('batchId') ?? '');
    const csvText = String(formData.get('csvText') ?? '');
    const mapping = JSON.parse(String(formData.get('mapping') ?? '{}')) as Record<
      string,
      string | null
    >;
    if (!batchId || !csvText) return { success: false, error: 'Datos incompletos' };

    const result = await dryRunImport({
      batchId,
      csvText,
      entity: ENTITY,
      mapping: completeInventoryProductMapping(
        Object.values(mapping).filter((value): value is string => Boolean(value)),
        mapping
      ),
      branchIdByExternal: {},
      userIdByExternal: {},
    });

    const issues = result.issues as ValidationIssue[];
    const wrongEntity = issues.find(
      (issue) => issue.entityType && issue.entityType !== 'inventory_products'
    );
    if (wrongEntity) {
      return {
        success: false,
        error:
          'Se validó como otra entidad (no productos). Usá /inventario/importar y volvé a Analizar.',
      };
    }

    return {
      success: true,
      data: {
        detected: result.detected,
        ready: result.ready,
        warnings: result.warnings,
        errors: result.errors,
        issues: issues.slice(0, 200),
      },
    };
  } catch (error) {
    return actionError(error);
  }
}

export async function commitInventoryProductImport(formData: FormData): Promise<
  ActionResult<{
    imported: number;
    failed: number;
    status: string;
    done: boolean;
    nextOffset: number;
    processed: number;
    total: number;
  }>
> {
  try {
    const session = await requireProductImportAccess();
    const batchId = String(formData.get('batchId') ?? '');
    const csvText = String(formData.get('csvText') ?? '');
    const rawMapping = JSON.parse(String(formData.get('mapping') ?? '{}')) as Record<
      string,
      string | null
    >;
    const mapping = completeInventoryProductMapping(
      Object.values(rawMapping).filter((value): value is string => Boolean(value)),
      rawMapping
    );
    const sourceSystem = String(formData.get('sourceSystem') ?? '').trim() || 'Catalogo';
    const offset = Number(formData.get('offset') ?? 0) || 0;
    const chunkSize =
      Number(formData.get('chunkSize') ?? DEFAULT_IMPORT_CHUNK_SIZE) || DEFAULT_IMPORT_CHUNK_SIZE;
    if (!batchId || !csvText) return { success: false, error: 'Datos incompletos' };

    const supabase = await createServerClient();
    const ctx = await getSessionContext();
    let branchId = ctx?.branchId ?? null;
    if (!branchId) {
      const { data: branch } = await supabase
        .from('branches')
        .select('id')
        .eq('organization_id', session.organizationId)
        .is('deleted_at', null)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();
      branchId = branch?.id ?? null;
    }
    if (!branchId) return { success: false, error: 'La clínica no tiene sucursal activa' };

    const result = await commitImport({
      batchId,
      csvText,
      entity: ENTITY,
      mapping,
      sourceSystem,
      ownerIdByExternal: {},
      patientIdByExternal: {},
      productIdByExternal: {},
      invoiceIdByExternal: {},
      appointmentIdByExternal: {},
      branchIdByExternal: {},
      userIdByExternal: {},
      branchId,
      offset,
      chunkSize,
      rowDecisions: {},
    });

    revalidatePath('/inventario');
    revalidatePath('/compras');
    revalidatePath('/inventario/importar');
    revalidatePath('/dashboard');

    return { success: true, data: result };
  } catch (error) {
    return actionError(error);
  }
}
