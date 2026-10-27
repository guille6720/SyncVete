'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import {
  buildPaginatedResult,
  inventoryMovementSchema,
  inventoryProductListSchema,
  inventoryProductSchema,
  inventoryProductUpdateSchema,
  resolveProductSalePrice,
  type ActionResult,
  type InventoryMovementListRow,
  type InventoryProduct,
  type InventoryProductListRow,
  type PaginatedResult,
} from '@sincvete/shared';
import { createServerClient } from '@/lib/supabase/server';
import {
  PermissionError,
  requirePermission,
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

async function assertProductSupplier(
  supabase: Awaited<ReturnType<typeof createServerClient>>,
  supplierId: string | undefined,
  category: string
): Promise<string | null> {
  if (!supplierId) return null;
  const { data, error } = await supabase
    .from('purchase_parties')
    .select('id, kind, scope, is_active')
    .eq('id', supplierId)
    .is('deleted_at', null)
    .maybeSingle();

  if (error || !data || !data.is_active) return 'El proveedor no está disponible';
  if (category === 'vacuna') {
    if (data.kind !== 'proveedor' || data.scope !== 'vacunas') {
      return 'Las vacunas usan un proveedor del apartado de vacunas';
    }
  } else if (data.kind !== 'proveedor' || data.scope !== 'general') {
    return 'Elegí un proveedor de productos';
  }
  return null;
}

function pricingFromParsed(data: {
  unitCost?: number;
  unitPrice?: number;
  marginPercent?: number;
  costCurrency: 'ARS' | 'USD';
  supplierPartyId?: string;
}): { error?: string; unitPrice: number | null; marginPercent: number | null } {
  if (data.marginPercent != null && data.unitCost == null) {
    return {
      error: 'Para calcular la ganancia indicá el costo',
      unitPrice: null,
      marginPercent: null,
    };
  }
  return {
    unitPrice: resolveProductSalePrice({
      unitCost: data.unitCost,
      unitPrice: data.unitPrice,
      marginPercent: data.marginPercent,
    }),
    marginPercent: data.marginPercent ?? null,
  };
}

function comprasRedirect(formData: FormData, category: string): string | null {
  if (formData.get('next') !== 'compras') return null;
  const requested = String(formData.get('seccion') ?? '');
  const seccion =
    category === 'vacuna'
      ? 'vacunas'
      : requested === 'vacunas' || requested === 'precios'
        ? requested
        : 'productos';
  const params = new URLSearchParams({ seccion });
  const categoria = String(formData.get('categoria') ?? '');
  if (
    seccion === 'productos' &&
    categoria &&
    categoria !== 'vacuna' &&
    ['medicamento', 'insumo', 'alimento', 'laboratorio', 'otro'].includes(categoria)
  ) {
    params.set('categoria', categoria);
  }
  return `/compras?${params.toString()}`;
}

function toProductRow(
  row: InventoryProductListRow & { total_count?: number }
): InventoryProductListRow {
  const { total_count: _total, ...entry } = row;
  void _total;
  return {
    ...entry,
    quantity: Number(entry.quantity ?? 0),
    min_quantity: Number(entry.min_quantity ?? 0),
    unit_cost: entry.unit_cost == null ? null : Number(entry.unit_cost),
    unit_price: entry.unit_price == null ? null : Number(entry.unit_price),
    cost_currency: entry.cost_currency === 'USD' ? 'USD' : 'ARS',
    margin_percent: entry.margin_percent == null ? null : Number(entry.margin_percent),
    supplier_party_id: entry.supplier_party_id ?? null,
    is_low_stock: Boolean(entry.is_low_stock),
    deleted_at: entry.deleted_at ?? null,
  };
}

export async function listLowStock(): Promise<InventoryProductListRow[]> {
  await requirePermission('inventory:read');
  const session = await getSessionContext();
  const supabase = await createServerClient();

  const { data, error } = await supabase.rpc('list_low_stock', {
    p_branch_id: session?.branchId ?? null,
  });

  if (error) throw error;
  return (data ?? []).map((row) => toProductRow(row as InventoryProductListRow));
}

export async function listInventoryProducts(
  input: {
    page?: number;
    pageSize?: number;
    search?: string;
    branchId?: string;
    category?: string;
    lowStock?: boolean;
    activeOnly?: boolean;
  } = {}
): Promise<PaginatedResult<InventoryProductListRow>> {
  await requirePermission('inventory:read');
  const parsed = inventoryProductListSchema.parse(input);
  const session = await getSessionContext();
  const supabase = await createServerClient();

  const { data, error } = await supabase.rpc('search_inventory_products', {
    p_search: parsed.search?.trim() || null,
    p_branch_id: parsed.branchId ?? session?.branchId ?? null,
    p_category: parsed.category || null,
    p_low_stock: parsed.lowStock ?? false,
    p_active_only: parsed.activeOnly ?? true,
    p_page: parsed.page,
    p_page_size: parsed.pageSize,
  });

  if (error) throw error;

  const rows = data ?? [];
  const total = rows[0]?.total_count ?? 0;
  const { data: pricing, error: pricingError } = rows.length
    ? await supabase
        .from('inventory_products')
        .select('id, cost_currency, margin_percent, supplier_party_id, catalog_category_id')
        .in(
          'id',
          rows.map((row) => row.id)
        )
    : { data: [], error: null };
  if (pricingError) throw pricingError;
  const pricingById = new Map((pricing ?? []).map((row) => [row.id, row]));
  const products = rows.map((row) =>
    toProductRow({ ...row, ...pricingById.get(row.id) } as InventoryProductListRow & {
      total_count: number;
    })
  );

  return buildPaginatedResult(products, Number(total), parsed.page, parsed.pageSize);
}

export async function getInventoryProduct(id: string): Promise<{
  product: InventoryProductListRow;
  movements: InventoryMovementListRow[];
} | null> {
  await requirePermission('inventory:read');
  const supabase = await createServerClient();

  const { data: product, error } = await supabase
    .from('inventory_products')
    .select('*')
    .eq('id', id)
    .is('deleted_at', null)
    .single();

  if (error || !product) return null;

  const { data: movements } = await supabase
    .from('inventory_movements')
    .select('*')
    .eq('product_id', id)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(50);

  const performerIds = [
    ...new Set(
      (movements ?? [])
        .map((m) => m.performed_by)
        .filter((value): value is string => Boolean(value))
    ),
  ];

  const profiles =
    performerIds.length > 0
      ? await supabase.from('profiles').select('id, full_name').in('id', performerIds)
      : { data: [] as Array<{ id: string; full_name: string }> };

  const nameById = new Map((profiles.data ?? []).map((p) => [p.id, p.full_name]));

  const typed = product as InventoryProduct;

  return {
    product: {
      ...typed,
      quantity: Number(typed.quantity ?? 0),
      min_quantity: Number(typed.min_quantity ?? 0),
      unit_cost: typed.unit_cost == null ? null : Number(typed.unit_cost),
      unit_price: typed.unit_price == null ? null : Number(typed.unit_price),
      cost_currency: typed.cost_currency === 'USD' ? 'USD' : 'ARS',
      margin_percent: typed.margin_percent == null ? null : Number(typed.margin_percent),
      supplier_party_id: typed.supplier_party_id ?? null,
      is_low_stock: typed.is_active && Number(typed.quantity) <= Number(typed.min_quantity),
    },
    movements: (movements ?? []).map((m) => ({
      ...m,
      quantity: Number(m.quantity),
      quantity_before: Number(m.quantity_before),
      quantity_after: Number(m.quantity_after),
      performed_by_name: m.performed_by ? (nameById.get(m.performed_by) ?? null) : null,
    })) as InventoryMovementListRow[],
  };
}

export async function createInventoryProduct(
  _prev: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  try {
    const session = await requirePermissionAndFeature('inventory:write', FEATURES.INVENTORY);
    const parsed = inventoryProductSchema.safeParse({
      name: formData.get('name'),
      sku: formData.get('sku'),
      category: formData.get('category') || 'medicamento',
      unit: formData.get('unit') || 'unidad',
      quantity: formData.get('quantity') || 0,
      minQuantity: formData.get('minQuantity') || 0,
      unitCost: formData.get('unitCost'),
      unitPrice: formData.get('unitPrice'),
      costCurrency: formData.get('costCurrency') || 'ARS',
      marginPercent: formData.get('marginPercent'),
      supplierPartyId: formData.get('supplierPartyId') || '',
      catalogCategoryId: formData.get('catalogCategoryId'),
      manufacturer: formData.get('manufacturer'),
      notes: formData.get('notes'),
      branchId: formData.get('branchId'),
      isActive: formData.get('isActive') !== 'false',
    });

    if (!parsed.success) {
      return {
        success: false,
        error: 'Datos inválidos',
        fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
      };
    }

    const branchId = parsed.data.branchId ?? session.branchId;
    if (!branchId) {
      return { success: false, error: 'Seleccioná una sucursal activa' };
    }

    const pricing = pricingFromParsed(parsed.data);
    if (pricing.error) return { success: false, error: pricing.error };

    const supabase = await createServerClient();
    const supplierError = await assertProductSupplier(
      supabase,
      parsed.data.supplierPartyId,
      parsed.data.category
    );
    if (supplierError) return { success: false, error: supplierError };

    const { data, error } = await supabase
      .from('inventory_products')
      .insert({
        organization_id: session.organizationId,
        branch_id: branchId,
        name: parsed.data.name,
        sku: parsed.data.sku ?? null,
        category: parsed.data.category,
        unit: parsed.data.unit,
        quantity: 0,
        min_quantity: parsed.data.minQuantity,
        unit_cost: parsed.data.unitCost ?? null,
        unit_price: pricing.unitPrice,
        cost_currency: parsed.data.costCurrency,
        margin_percent: pricing.marginPercent,
        supplier_party_id: parsed.data.supplierPartyId ?? null,
        catalog_category_id: parsed.data.catalogCategoryId ?? null,
        manufacturer: parsed.data.manufacturer ?? null,
        notes: parsed.data.notes ?? null,
        is_active: parsed.data.isActive,
      })
      .select('id')
      .single();

    if (error || !data) {
      return { success: false, error: error?.message || 'No se pudo crear el producto' };
    }

    if (parsed.data.quantity > 0) {
      const { error: movementError } = await supabase.rpc('record_inventory_movement', {
        p_product_id: data.id,
        p_movement_type: 'entrada',
        p_quantity: parsed.data.quantity,
        p_reason: 'Stock inicial',
      });
      if (movementError) {
        return {
          success: false,
          error: movementError.message || 'No se pudo registrar el stock inicial',
        };
      }
    }

    revalidatePath('/inventario');
    revalidatePath('/compras');
    revalidatePath('/dashboard');
    redirect(comprasRedirect(formData, parsed.data.category) ?? `/inventario/${data.id}`);
  } catch (error) {
    return actionError(error);
  }
}

export async function updateInventoryProduct(
  productId: string,
  _prev: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  try {
    await requirePermissionAndFeature('inventory:write', FEATURES.INVENTORY);
    const parsed = inventoryProductUpdateSchema.safeParse({
      name: formData.get('name'),
      sku: formData.get('sku'),
      category: formData.get('category') || 'medicamento',
      unit: formData.get('unit') || 'unidad',
      minQuantity: formData.get('minQuantity') || 0,
      unitCost: formData.get('unitCost'),
      unitPrice: formData.get('unitPrice'),
      costCurrency: formData.get('costCurrency') || 'ARS',
      marginPercent: formData.get('marginPercent'),
      supplierPartyId: formData.get('supplierPartyId') || '',
      catalogCategoryId: formData.get('catalogCategoryId'),
      manufacturer: formData.get('manufacturer'),
      notes: formData.get('notes'),
      branchId: formData.get('branchId'),
      isActive: formData.get('isActive') === 'on' || formData.get('isActive') === 'true',
    });

    if (!parsed.success) {
      return {
        success: false,
        error: 'Datos inválidos',
        fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
      };
    }

    const pricing = pricingFromParsed(parsed.data);
    if (pricing.error) return { success: false, error: pricing.error };

    const supabase = await createServerClient();
    const supplierError = await assertProductSupplier(
      supabase,
      parsed.data.supplierPartyId,
      parsed.data.category
    );
    if (supplierError) return { success: false, error: supplierError };

    const { data: updated, error } = await supabase
      .from('inventory_products')
      .update({
        name: parsed.data.name,
        sku: parsed.data.sku ?? null,
        category: parsed.data.category,
        unit: parsed.data.unit,
        min_quantity: parsed.data.minQuantity,
        unit_cost: parsed.data.unitCost ?? null,
        unit_price: pricing.unitPrice,
        cost_currency: parsed.data.costCurrency,
        margin_percent: pricing.marginPercent,
        supplier_party_id: parsed.data.supplierPartyId ?? null,
        catalog_category_id: parsed.data.catalogCategoryId ?? null,
        manufacturer: parsed.data.manufacturer ?? null,
        notes: parsed.data.notes ?? null,
        is_active: parsed.data.isActive,
      })
      .eq('id', productId)
      .is('deleted_at', null)
      .select('id')
      .maybeSingle();

    if (error) {
      return { success: false, error: error.message || 'No se pudo actualizar el producto' };
    }

    revalidatePath('/inventario');
    if (!updated) return { success: false, error: 'El producto no está disponible' };
    revalidatePath(`/inventario/${productId}`);
    revalidatePath('/compras');
    revalidatePath('/dashboard');
    return { success: true };
  } catch (error) {
    return actionError(error);
  }
}

export async function recordInventoryMovementAction(
  productId: string,
  _prev: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  try {
    await requirePermissionAndFeature('inventory:write', FEATURES.INVENTORY);
    const parsed = inventoryMovementSchema.safeParse({
      movementType: formData.get('movementType'),
      quantity: formData.get('quantity'),
      reason: formData.get('reason'),
      lotNumber: formData.get('lotNumber'),
      expiresAt: formData.get('expiresAt'),
    });

    if (!parsed.success) {
      return {
        success: false,
        error: 'Datos inválidos',
        fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
      };
    }

    const supabase = await createServerClient();
    const { error } = await supabase.rpc('record_inventory_movement', {
      p_product_id: productId,
      p_movement_type: parsed.data.movementType,
      p_quantity: parsed.data.quantity,
      p_reason: parsed.data.reason ?? null,
      p_lot_number: parsed.data.lotNumber ?? null,
      p_expires_at: parsed.data.expiresAt ?? null,
    });

    if (error) {
      return { success: false, error: error.message || 'No se pudo registrar el movimiento' };
    }

    revalidatePath('/inventario');
    revalidatePath(`/inventario/${productId}`);
    revalidatePath('/dashboard');
    return { success: true };
  } catch (error) {
    return actionError(error);
  }
}

export async function softDeleteInventoryProduct(productId: string): Promise<ActionResult> {
  try {
    await requirePermissionAndFeature('inventory:write', FEATURES.INVENTORY);
    const supabase = await createServerClient();

    const { data, error } = await supabase
      .from('inventory_products')
      .update({ deleted_at: new Date().toISOString(), is_active: false })
      .eq('id', productId)
      .is('deleted_at', null)
      .select('id')
      .maybeSingle();

    if (error) {
      return { success: false, error: 'No se pudo eliminar el producto' };
    }

    revalidatePath('/inventario');
    if (!data) return { success: false, error: 'El producto no está disponible' };
    revalidatePath('/compras');
    revalidatePath('/dashboard');
    return { success: true };
  } catch (error) {
    return actionError(error);
  }
}

export async function canManageInventory(): Promise<boolean> {
  return canPermissionAndFeature('inventory:write', FEATURES.INVENTORY);
}

export async function canReadInventory(): Promise<boolean> {
  return canPermissionAndFeature('inventory:read', FEATURES.INVENTORY);
}
