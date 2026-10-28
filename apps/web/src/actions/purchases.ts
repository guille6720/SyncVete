'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import {
  buildPaginatedResult,
  inventoryPurchaseListSchema,
  inventoryPurchaseSchema,
  type ActionResult,
  type InventoryPurchaseDetail,
  type InventoryPurchaseItemRow,
  type InventoryPurchaseListRow,
  type PaginatedResult,
} from '@sincvete/shared';
import { createServerClient } from '@/lib/supabase/server';
import {
  PermissionError,
  requirePermissionAndFeature,
  canPermissionAndFeature,
} from '@/lib/permissions';
import { getSessionContext } from '@/actions/auth';
import { FEATURES, planRestrictionResult } from '@/lib/entitlements';

function isNextRedirect(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'digest' in error &&
    typeof (error as { digest?: string }).digest === 'string' &&
    (error as { digest: string }).digest.startsWith('NEXT_REDIRECT')
  );
}

function actionError<T = void>(error: unknown): ActionResult<T> {
  if (isNextRedirect(error)) throw error;
  const planError = planRestrictionResult<T>(error);
  if (planError) return planError;
  if (error instanceof PermissionError) {
    return { success: false, error: error.message };
  }
  console.error(error);
  return { success: false, error: 'Ocurrió un error inesperado' };
}

type RpcClient = {
  rpc: (
    fn: string,
    args?: Record<string, unknown>
  ) => Promise<{ data: unknown; error: { message: string } | null }>;
};

function rpcClient(supabase: Awaited<ReturnType<typeof createServerClient>>): RpcClient {
  return supabase as unknown as RpcClient;
}

function toListRow(
  row: InventoryPurchaseListRow & { total_count?: number }
): InventoryPurchaseListRow {
  const { total_count: _total, ...entry } = row;
  void _total;
  return {
    ...entry,
    total_cost: Number(entry.total_cost ?? 0),
    item_count: Number(entry.item_count ?? 0),
  };
}

function toDetail(raw: Record<string, unknown>): InventoryPurchaseDetail {
  const items = Array.isArray(raw.items) ? (raw.items as Record<string, unknown>[]) : [];
  return {
    id: String(raw.id),
    organization_id: String(raw.organization_id),
    branch_id: String(raw.branch_id),
    supplier_name: String(raw.supplier_name ?? ''),
    invoice_number: (raw.invoice_number as string | null) ?? null,
    purchased_at: String(raw.purchased_at ?? ''),
    notes: (raw.notes as string | null) ?? null,
    status: (raw.status as InventoryPurchaseDetail['status']) ?? 'recibida',
    total_cost: Number(raw.total_cost ?? 0),
    received_by: (raw.received_by as string | null) ?? null,
    received_by_name: (raw.received_by_name as string | null) ?? null,
    created_at: String(raw.created_at ?? ''),
    updated_at: String(raw.updated_at ?? ''),
    items: items.map(
      (item): InventoryPurchaseItemRow => ({
        id: String(item.id),
        product_id: String(item.product_id),
        product_name: String(item.product_name ?? ''),
        product_sku: (item.product_sku as string | null) ?? null,
        product_unit: (item.product_unit as InventoryPurchaseItemRow['product_unit']) ?? 'unidad',
        quantity: Number(item.quantity ?? 0),
        unit_cost: item.unit_cost == null ? null : Number(item.unit_cost),
        line_total: Number(item.line_total ?? 0),
        lot_number: (item.lot_number as string | null) ?? null,
        expires_at: (item.expires_at as string | null) ?? null,
        movement_id: (item.movement_id as string | null) ?? null,
      })
    ),
  };
}

export async function listInventoryPurchases(
  input: {
    page?: number;
    pageSize?: number;
    search?: string;
    branchId?: string;
    status?: string;
  } = {}
): Promise<PaginatedResult<InventoryPurchaseListRow>> {
  await requirePermissionAndFeature('inventory:read', FEATURES.INVENTORY);
  const parsed = inventoryPurchaseListSchema.parse(input);
  const session = await getSessionContext();
  const supabase = await createServerClient();

  const { data, error } = await rpcClient(supabase).rpc('list_inventory_purchases', {
    p_search: parsed.search?.trim() || null,
    p_branch_id: parsed.branchId ?? session?.branchId ?? null,
    p_status: parsed.status || null,
    p_page: parsed.page,
    p_page_size: parsed.pageSize,
  });

  if (error) throw error;

  const rows = (data ?? []) as Array<InventoryPurchaseListRow & { total_count: number }>;
  const total = rows[0]?.total_count ?? 0;
  return buildPaginatedResult(
    rows.map(toListRow),
    Number(total),
    parsed.page,
    parsed.pageSize
  );
}

export async function getInventoryPurchase(
  id: string
): Promise<InventoryPurchaseDetail | null> {
  await requirePermissionAndFeature('inventory:read', FEATURES.INVENTORY);
  const supabase = await createServerClient();

  const { data, error } = await rpcClient(supabase).rpc('get_inventory_purchase', {
    p_purchase_id: id,
  });

  if (error) throw error;
  if (!data || typeof data !== 'object') return null;
  return toDetail(data as Record<string, unknown>);
}

export async function receiveInventoryPurchaseAction(
  _prev: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  try {
    await requirePermissionAndFeature('inventory:write', FEATURES.INVENTORY);

    const productIds = formData.getAll('productId').map(String);
    const quantities = formData.getAll('quantity').map(String);
    const unitCosts = formData.getAll('unitCost').map(String);
    const lotNumbers = formData.getAll('lotNumber').map(String);
    const expiresAts = formData.getAll('expiresAt').map(String);

    const items = productIds.map((productId, index) => ({
      productId,
      quantity: quantities[index],
      unitCost: unitCosts[index] || undefined,
      lotNumber: lotNumbers[index] || undefined,
      expiresAt: expiresAts[index] || undefined,
    }));

    const parsed = inventoryPurchaseSchema.safeParse({
      branchId: formData.get('branchId'),
      supplierName: formData.get('supplierName'),
      invoiceNumber: formData.get('invoiceNumber'),
      purchasedAt: formData.get('purchasedAt') || undefined,
      notes: formData.get('notes'),
      items,
    });

    if (!parsed.success) {
      return {
        success: false,
        error: 'Datos inválidos',
        fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
      };
    }

    const supabase = await createServerClient();
    const { data, error } = await rpcClient(supabase).rpc('receive_inventory_purchase', {
      p_payload: {
        branch_id: parsed.data.branchId,
        supplier_name: parsed.data.supplierName,
        invoice_number: parsed.data.invoiceNumber ?? null,
        purchased_at: parsed.data.purchasedAt ?? null,
        notes: parsed.data.notes ?? null,
        items: parsed.data.items.map((item) => ({
          product_id: item.productId,
          quantity: item.quantity,
          unit_cost: item.unitCost ?? null,
          lot_number: item.lotNumber ?? null,
          expires_at: item.expiresAt ?? null,
        })),
      },
    });

    if (error) {
      return { success: false, error: error.message || 'No se pudo registrar la compra' };
    }

    const purchaseId =
      data && typeof data === 'object' && 'purchase_id' in data
        ? String((data as { purchase_id: string }).purchase_id)
        : null;

    revalidatePath('/compras');
    revalidatePath('/inventario');
    revalidatePath('/dashboard');

    if (purchaseId) {
      redirect(`/compras/${purchaseId}`);
    }
    return { success: true };
  } catch (error) {
    return actionError(error);
  }
}

export async function cancelInventoryPurchase(purchaseId: string): Promise<ActionResult> {
  try {
    await requirePermissionAndFeature('inventory:write', FEATURES.INVENTORY);
    const supabase = await createServerClient();

    const { error } = await rpcClient(supabase).rpc('cancel_inventory_purchase', {
      p_purchase_id: purchaseId,
    });

    if (error) {
      return { success: false, error: error.message || 'No se pudo anular la compra' };
    }

    revalidatePath('/compras');
    revalidatePath(`/compras/${purchaseId}`);
    revalidatePath('/inventario');
    revalidatePath('/dashboard');
    return { success: true };
  } catch (error) {
    return actionError(error);
  }
}

export async function canReadPurchases(): Promise<boolean> {
  return canPermissionAndFeature('inventory:read', FEATURES.INVENTORY);
}

export async function canManagePurchases(): Promise<boolean> {
  return canPermissionAndFeature('inventory:write', FEATURES.INVENTORY);
}
