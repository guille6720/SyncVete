import type { InventoryPurchaseStatus } from '../constants/purchases';
import type { InventoryUnit } from '../constants/inventory';

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
