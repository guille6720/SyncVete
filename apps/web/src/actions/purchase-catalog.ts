'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import {
  buildPaginatedResult,
  INVENTORY_PRODUCT_CATEGORIES,
  inventoryProductListSchema,
  purchasePartyListSchema,
  purchasePartySchema,
  type ActionResult,
  type CatalogProductRow,
  type InventoryProductCategory,
  type PaginatedResult,
  type PurchaseParty,
  type PurchasePartyKind,
  type PurchasePartyScope,
} from '@sincvete/shared';
import { createServerClient } from '@/lib/supabase/server';
import { getSessionContext } from '@/actions/auth';
import { FEATURES, planRestrictionResult } from '@/lib/entitlements';
import { PermissionError, requirePermissionAndFeature } from '@/lib/permissions';

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

function ilikeFilter(columns: string[], search: string | undefined): string | null {
  const safe = (search ?? '').replace(/[%_"\\,()]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!safe) return null;
  const pattern = `"%${safe}%"`;
  return columns.map((column) => `${column}.ilike.${pattern}`).join(',');
}

function partyListHref(kind: PurchasePartyKind, scope: PurchasePartyScope): string {
  if (scope === 'vacunas') return '/compras?seccion=vacunas';
  if (kind === 'prestador') return '/compras?seccion=prestadores';
  return '/compras?seccion=proveedores';
}

function toParty(row: PurchaseParty): PurchaseParty {
  return {
    ...row,
    contact_name: row.contact_name ?? null,
    phone: row.phone ?? null,
    email: row.email ?? null,
    notes: row.notes ?? null,
    is_active: Boolean(row.is_active),
  };
}

export async function listPurchaseParties(input: {
  page?: number;
  pageSize?: number;
  search?: string;
  kind?: PurchasePartyKind;
  scope?: PurchasePartyScope;
} = {}): Promise<PaginatedResult<PurchaseParty>> {
  await requirePermissionAndFeature('inventory:read', FEATURES.INVENTORY);
  const parsed = purchasePartyListSchema.parse(input);
  const supabase = await createServerClient();
  const from = (parsed.page - 1) * parsed.pageSize;
  const to = from + parsed.pageSize - 1;

  let query = supabase
    .from('purchase_parties')
    .select(
      'id, organization_id, kind, scope, name, contact_name, phone, email, notes, is_active, created_at, updated_at',
      { count: 'exact' }
    )
    .is('deleted_at', null)
    .order('is_active', { ascending: false })
    .order('name', { ascending: true });

  if (parsed.kind) query = query.eq('kind', parsed.kind);
  if (parsed.scope) query = query.eq('scope', parsed.scope);

  const filter = ilikeFilter(['name', 'contact_name', 'phone', 'email'], parsed.search);
  if (filter) query = query.or(filter);

  const { data, error, count } = await query.range(from, to);
  if (error) throw error;

  return buildPaginatedResult(
    (data ?? []).map((row) => toParty(row as PurchaseParty)),
    count ?? 0,
    parsed.page,
    parsed.pageSize
  );
}

export async function listPurchasePartyOptions(): Promise<
  Array<Pick<PurchaseParty, 'id' | 'name' | 'kind' | 'scope' | 'is_active'>>
> {
  await requirePermissionAndFeature('inventory:read', FEATURES.INVENTORY);
  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from('purchase_parties')
    .select('id, name, kind, scope, is_active')
    .is('deleted_at', null)
    .order('name', { ascending: true })
    .limit(300);

  if (error) throw error;
  return data ?? [];
}

export async function getPurchaseParty(id: string): Promise<PurchaseParty | null> {
  await requirePermissionAndFeature('inventory:read', FEATURES.INVENTORY);
  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from('purchase_parties')
    .select(
      'id, organization_id, kind, scope, name, contact_name, phone, email, notes, is_active, created_at, updated_at'
    )
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();

  if (error) throw error;
  return data ? toParty(data as PurchaseParty) : null;
}

export async function listCatalogProducts(input: {
  page?: number;
  pageSize?: number;
  search?: string;
  category?: string;
  excludeCategory?: string;
  pricedOnly?: boolean;
} = {}): Promise<PaginatedResult<CatalogProductRow>> {
  await requirePermissionAndFeature('inventory:read', FEATURES.INVENTORY);
  const parsed = inventoryProductListSchema.parse({
    page: input.page,
    pageSize: input.pageSize,
    search: input.search,
    category: input.category,
  });
  const session = await getSessionContext();
  const supabase = await createServerClient();
  const from = (parsed.page - 1) * parsed.pageSize;
  const to = from + parsed.pageSize - 1;

  let query = supabase
    .from('inventory_products')
    .select(
      'id, name, sku, category, unit, quantity, unit_cost, unit_price, cost_currency, margin_percent, manufacturer, supplier_party_id',
      { count: 'exact' }
    )
    .is('deleted_at', null)
    .eq('is_active', true)
    .order('name', { ascending: true });

  if (session?.branchId) query = query.eq('branch_id', session.branchId);
  if (parsed.category) query = query.eq('category', parsed.category);
  else if (
    input.excludeCategory &&
    INVENTORY_PRODUCT_CATEGORIES.includes(input.excludeCategory as InventoryProductCategory)
  ) {
    query = query.neq('category', input.excludeCategory as InventoryProductCategory);
  }
  if (input.pricedOnly) query = query.not('unit_price', 'is', null);

  const filter = ilikeFilter(['name', 'sku', 'manufacturer'], parsed.search);
  if (filter) query = query.or(filter);

  const { data, error, count } = await query.range(from, to);
  if (error) throw error;

  const rows = data ?? [];
  const supplierIds = [
    ...new Set(rows.map((row) => row.supplier_party_id).filter((id): id is string => Boolean(id))),
  ];
  const supplierNames = new Map<string, string>();
  if (supplierIds.length > 0) {
    const { data: parties } = await supabase
      .from('purchase_parties')
      .select('id, name')
      .in('id', supplierIds);
    for (const party of parties ?? []) supplierNames.set(party.id, party.name);
  }

  const products: CatalogProductRow[] = rows.map((row) => ({
    id: row.id,
    name: row.name,
    sku: row.sku,
    category: row.category,
    unit: row.unit,
    quantity: Number(row.quantity ?? 0),
    unit_cost: row.unit_cost == null ? null : Number(row.unit_cost),
    unit_price: row.unit_price == null ? null : Number(row.unit_price),
    cost_currency: row.cost_currency === 'USD' ? 'USD' : 'ARS',
    margin_percent: row.margin_percent == null ? null : Number(row.margin_percent),
    manufacturer: row.manufacturer,
    supplier_party_id: row.supplier_party_id,
    supplier_name: row.supplier_party_id ? (supplierNames.get(row.supplier_party_id) ?? null) : null,
  }));

  return buildPaginatedResult(products, count ?? 0, parsed.page, parsed.pageSize);
}

export async function createPurchaseParty(
  _prev: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  try {
    const session = await requirePermissionAndFeature('inventory:write', FEATURES.INVENTORY);
    const parsed = purchasePartySchema.safeParse({
      name: formData.get('name'),
      kind: formData.get('kind'),
      scope: formData.get('scope') || 'general',
      contactName: formData.get('contactName'),
      phone: formData.get('phone'),
      email: formData.get('email'),
      notes: formData.get('notes'),
      isActive: true,
    });

    if (!parsed.success) {
      return {
        success: false,
        error: 'Datos inválidos',
        fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
      };
    }

    if (parsed.data.scope === 'vacunas' && parsed.data.kind !== 'proveedor') {
      return { success: false, error: 'Las vacunas se cargan con un proveedor' };
    }

    const supabase = await createServerClient();
    const { error } = await supabase.from('purchase_parties').insert({
      organization_id: session.organizationId,
      kind: parsed.data.kind,
      scope: parsed.data.scope,
      name: parsed.data.name,
      contact_name: parsed.data.contactName ?? null,
      phone: parsed.data.phone ?? null,
      email: parsed.data.email ?? null,
      notes: parsed.data.notes ?? null,
      is_active: true,
    });

    if (error) {
      if (error.code === '23505') {
        return { success: false, error: 'Ya existe un registro con ese nombre' };
      }
      return { success: false, error: error.message || 'No se pudo guardar' };
    }

    revalidatePath('/compras');
    redirect(partyListHref(parsed.data.kind, parsed.data.scope));
  } catch (error) {
    return actionError(error);
  }
}

export async function updatePurchaseParty(
  partyId: string,
  _prev: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  try {
    await requirePermissionAndFeature('inventory:write', FEATURES.INVENTORY);
    const parsed = purchasePartySchema.safeParse({
      name: formData.get('name'),
      kind: formData.get('kind'),
      scope: formData.get('scope') || 'general',
      contactName: formData.get('contactName'),
      phone: formData.get('phone'),
      email: formData.get('email'),
      notes: formData.get('notes'),
      isActive: formData.get('isActive') === 'on' || formData.get('isActive') === 'true',
    });

    if (!parsed.success) {
      return {
        success: false,
        error: 'Datos inválidos',
        fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
      };
    }

    if (parsed.data.scope === 'vacunas' && parsed.data.kind !== 'proveedor') {
      return { success: false, error: 'Las vacunas se cargan con un proveedor' };
    }

    const supabase = await createServerClient();
    const { error } = await supabase
      .from('purchase_parties')
      .update({
        name: parsed.data.name,
        contact_name: parsed.data.contactName ?? null,
        phone: parsed.data.phone ?? null,
        email: parsed.data.email ?? null,
        notes: parsed.data.notes ?? null,
        is_active: parsed.data.isActive,
      })
      .eq('id', partyId);

    if (error) {
      if (error.code === '23505') {
        return { success: false, error: 'Ya existe un registro con ese nombre' };
      }
      return { success: false, error: error.message || 'No se pudo actualizar' };
    }

    revalidatePath('/compras');
    revalidatePath(`/compras/partes/${partyId}`);
    return { success: true };
  } catch (error) {
    return actionError(error);
  }
}
