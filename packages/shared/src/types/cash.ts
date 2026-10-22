import type { CashMovementKind, CashSessionStatus } from '../constants/cash';
import type { PaymentMethod } from '../constants/billing';

export interface CashSession {
  id: string;
  organization_id: string;
  branch_id: string;
  opened_by: string | null;
  closed_by: string | null;
  status: CashSessionStatus;
  opening_amount: number;
  expected_cash: number | null;
  counted_cash: number | null;
  difference: number | null;
  notes: string | null;
  close_notes: string | null;
  opened_at: string;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface CashSessionListRow extends CashSession {
  movement_count: number;
  opened_by_name: string | null;
  closed_by_name: string | null;
  branch_name: string;
}

export interface CashMovement {
  id: string;
  organization_id: string;
  cash_session_id: string;
  payment_id: string | null;
  professional_payment_id?: string | null;
  professional_settlement_id?: string | null;
  recorded_by: string | null;
  kind: CashMovementKind;
  method: PaymentMethod;
  amount: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface CashMovementListRow extends CashMovement {
  recorded_by_name: string | null;
  invoice_id: string | null;
  invoice_number: string | null;
}
