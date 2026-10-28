import type {
  InventoryMovementType,
  InventoryProductCategory,
  InventoryUnit,
  ProductCurrency,
} from '../constants/inventory';

export interface InventoryProduct {
  id: string;
  organization_id: string;
  branch_id: string;
  name: string;
  sku: string | null;
  category: InventoryProductCategory;
  unit: InventoryUnit;
  quantity: number;
  min_quantity: number;
  unit_cost: number | null;
  unit_price: number | null;
  cost_currency: ProductCurrency;
  margin_percent: number | null;
  supplier_party_id: string | null;
  catalog_category_id?: string | null;
  manufacturer: string | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface InventoryProductListRow extends InventoryProduct {
  is_low_stock: boolean;
}

export interface InventoryMovement {
  id: string;
  organization_id: string;
  branch_id: string;
  product_id: string;
  movement_type: InventoryMovementType;
  quantity: number;
  quantity_before: number;
  quantity_after: number;
  lot_number: string | null;
  expires_at: string | null;
  reason: string | null;
  performed_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface InventoryMovementListRow extends InventoryMovement {
  performed_by_name: string | null;
}
