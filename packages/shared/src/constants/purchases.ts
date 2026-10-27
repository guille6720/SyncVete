export const PURCHASE_PARTY_KINDS = ['proveedor', 'prestador'] as const;

export type PurchasePartyKind = (typeof PURCHASE_PARTY_KINDS)[number];

export const PURCHASE_PARTY_KIND_LABELS: Record<PurchasePartyKind, string> = {
  proveedor: 'Proveedor',
  prestador: 'Prestador',
};

export const PURCHASE_PARTY_SCOPES = ['general', 'vacunas'] as const;

export type PurchasePartyScope = (typeof PURCHASE_PARTY_SCOPES)[number];

export const PURCHASE_PARTY_SCOPE_LABELS: Record<PurchasePartyScope, string> = {
  general: 'General',
  vacunas: 'Vacunas',
};

export const COMPRAS_SECTIONS = [
  'compras',
  'proveedores',
  'prestadores',
  'productos',
  'categorias',
  'vacunas',
  'precios',
] as const;

export type ComprasSection = (typeof COMPRAS_SECTIONS)[number];

export const COMPRAS_SECTION_LABELS: Record<ComprasSection, string> = {
  compras: 'Compras',
  proveedores: 'Proveedores',
  prestadores: 'Prestadores',
  productos: 'Productos',
  categorias: 'Categorías',
  vacunas: 'Vacunas',
  precios: 'Precios de venta',
};

export function suppliersForProductCategory<
  T extends {
    id: string;
    kind: PurchasePartyKind;
    scope: PurchasePartyScope;
    is_active: boolean;
  },
>(suppliers: T[], category: string, currentId?: string | null): T[] {
  const vaccine = category === 'vacuna';
  return suppliers.filter((supplier) => {
    const matches = vaccine
      ? supplier.kind === 'proveedor' && supplier.scope === 'vacunas'
      : supplier.kind === 'proveedor' && supplier.scope === 'general';
    if (!matches) return false;
    if (!supplier.is_active && supplier.id !== currentId) return false;
    return true;
  });
}

export const INVENTORY_PURCHASE_STATUSES = ['recibida', 'anulada'] as const;

export type InventoryPurchaseStatus = (typeof INVENTORY_PURCHASE_STATUSES)[number];

export const INVENTORY_PURCHASE_STATUS_LABELS: Record<InventoryPurchaseStatus, string> = {
  recibida: 'Recibida',
  anulada: 'Anulada',
};

export const INVENTORY_PURCHASE_STATUS_VARIANT: Record<
  InventoryPurchaseStatus,
  'default' | 'success' | 'warning' | 'destructive'
> = {
  recibida: 'success',
  anulada: 'destructive',
};
