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
