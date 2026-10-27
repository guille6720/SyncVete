export const INVENTORY_PRODUCT_CATEGORIES = [
  'medicamento',
  'vacuna',
  'insumo',
  'alimento',
  'laboratorio',
  'otro',
] as const;

export type InventoryProductCategory = (typeof INVENTORY_PRODUCT_CATEGORIES)[number];

export const INVENTORY_PRODUCT_CATEGORY_LABELS: Record<InventoryProductCategory, string> = {
  medicamento: 'Medicamento',
  vacuna: 'Vacuna',
  insumo: 'Insumo',
  alimento: 'Alimento',
  laboratorio: 'Laboratorio',
  otro: 'Otro',
};

export const PRODUCT_CURRENCIES = ['ARS', 'USD'] as const;

export type ProductCurrency = (typeof PRODUCT_CURRENCIES)[number];

export const PRODUCT_CURRENCY_LABELS: Record<ProductCurrency, string> = {
  ARS: 'ARS',
  USD: 'USD',
};

export function salePriceFromCost(cost: number, marginPercent: number): number {
  return Math.round(cost * (1 + marginPercent / 100) * 100) / 100;
}

export function resolveProductSalePrice(input: {
  unitCost?: number;
  unitPrice?: number;
  marginPercent?: number;
  costCurrency?: ProductCurrency;
  exchangeRate?: number | null;
}): number | null {
  if (input.unitCost != null && input.marginPercent != null) {
    const rate = input.costCurrency === 'USD' ? input.exchangeRate : 1;
    if (rate == null || !Number.isFinite(rate) || rate <= 0) return null;
    return salePriceFromCost(input.unitCost * rate, input.marginPercent);
  }
  return input.unitPrice ?? null;
}

export function formatProductAmount(
  value: number | null | undefined,
  currency: ProductCurrency = 'ARS'
): string {
  if (value == null || Number.isNaN(value)) return '—';
  const formatted = value.toLocaleString('es-AR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return currency === 'USD' ? `USD ${formatted}` : `$ ${formatted}`;
}

export const INVENTORY_UNITS = [
  'unidad',
  'caja',
  'frasco',
  'ml',
  'mg',
  'g',
  'kg',
  'dosis',
  'otro',
] as const;

export type InventoryUnit = (typeof INVENTORY_UNITS)[number];

export const INVENTORY_UNIT_LABELS: Record<InventoryUnit, string> = {
  unidad: 'Unidad',
  caja: 'Caja',
  frasco: 'Frasco',
  ml: 'ml',
  mg: 'mg',
  g: 'g',
  kg: 'kg',
  dosis: 'Dosis',
  otro: 'Otra',
};

export const INVENTORY_MOVEMENT_TYPES = ['entrada', 'salida', 'ajuste', 'descarte'] as const;

export type InventoryMovementType = (typeof INVENTORY_MOVEMENT_TYPES)[number];

export const INVENTORY_MOVEMENT_TYPE_LABELS: Record<InventoryMovementType, string> = {
  entrada: 'Entrada',
  salida: 'Salida',
  ajuste: 'Ajuste',
  descarte: 'Descarte',
};

export const INVENTORY_MOVEMENT_TYPE_VARIANT: Record<
  InventoryMovementType,
  'default' | 'success' | 'warning' | 'destructive'
> = {
  entrada: 'success',
  salida: 'default',
  ajuste: 'warning',
  descarte: 'destructive',
};

export const INVENTORY_PRODUCT_PRESETS = [
  {
    name: 'Amoxicilina + Ác. clavulánico',
    category: 'medicamento' as const,
    unit: 'caja' as const,
  },
  { name: 'Meloxicam', category: 'medicamento' as const, unit: 'frasco' as const },
  { name: 'Vacuna séxtuple canina', category: 'vacuna' as const, unit: 'dosis' as const },
  { name: 'Vacuna triple felina', category: 'vacuna' as const, unit: 'dosis' as const },
  { name: 'Jeringa 3 ml', category: 'insumo' as const, unit: 'unidad' as const },
  { name: 'Suero fisiológico 500 ml', category: 'insumo' as const, unit: 'unidad' as const },
  { name: 'Alimento renal 2 kg', category: 'alimento' as const, unit: 'unidad' as const },
  { name: 'Tubo EDTA', category: 'laboratorio' as const, unit: 'unidad' as const },
] as const;
