import type {
  InventoryProductCategory,
  InventoryUnit,
  ProductCurrency,
} from '../constants/inventory';
import type {
  InventoryPurchaseStatus,
  PurchasePartyKind,
  PurchasePartyScope,
} from '../constants/purchases';

export interface PurchaseParty {
  cuit?: string | null;
  id: string;
  organization_id: string;
  kind: PurchasePartyKind;
  scope: PurchasePartyScope;
  name: string;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CatalogProductRow {
  id: string;
  name: string;
  sku: string | null;
  category: InventoryProductCategory;
  unit: InventoryUnit;
  quantity: number;
  unit_cost: number | null;
  unit_price: number | null;
  cost_currency: ProductCurrency;
  margin_percent: number | null;
  manufacturer: string | null;
  supplier_party_id: string | null;
  supplier_name: string | null;
  catalog_category_id: string | null;
  catalog_category_name: string | null;
}

export interface PurchaseCategory {
  id: string;
  organization_id: string;
  name: string;
  base_category: InventoryProductCategory;
}

export interface InventoryPurchaseListRow {
  id: string;
  organization_id: string;
  branch_id: string;
  supplier_name: string;
  invoice_number: string | null;
  purchased_at: string;
  notes: string | null;
  status: InventoryPurchaseStatus;
  total_cost: number;
  received_by: string | null;
  received_by_name: string | null;
  item_count: number;
  created_at: string;
  updated_at: string;
}

export interface InventoryPurchaseItemRow {
  id: string;
  product_id: string;
  product_name: string;
  product_sku: string | null;
  product_unit: InventoryUnit;
  quantity: number;
  unit_cost: number | null;
  line_total: number;
  lot_number: string | null;
  expires_at: string | null;
  movement_id: string | null;
}

export interface InventoryPurchaseDetail {
  id: string;
  organization_id: string;
  branch_id: string;
  supplier_name: string;
  invoice_number: string | null;
  purchased_at: string;
  notes: string | null;
  status: InventoryPurchaseStatus;
  total_cost: number;
  received_by: string | null;
  received_by_name: string | null;
  created_at: string;
  updated_at: string;
  items: InventoryPurchaseItemRow[];
}
