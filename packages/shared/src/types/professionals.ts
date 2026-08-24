import type {
  CompensationFrequency,
  CompensationRuleType,
  ProfessionalRelationshipType,
  SettlementAdjustmentType,
  SettlementItemSourceType,
  SettlementStatus,
} from '../constants/professionals';
import type { PaymentMethod } from '../constants/billing';

export interface Professional {
  id: string;
  organization_id: string;
  user_id: string | null;
  profile_id: string | null;
  first_name: string;
  last_name: string;
  document_number: string | null;
  tax_id: string | null;
  professional_license: string | null;
  professional_license_jurisdiction: string | null;
  specialty: string | null;
  relationship_type: ProfessionalRelationshipType;
  start_date: string | null;
  end_date: string | null;
  is_active: boolean;
  invoice_required: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface ProfessionalBranch {
  id: string;
  organization_id: string;
  professional_id: string;
  branch_id: string;
  is_active: boolean;
  created_at: string;
}

export interface CompensationScheme {
  id: string;
  organization_id: string;
  professional_id: string;
  name: string;
  valid_from: string;
  valid_to: string | null;
  currency: string;
  is_active: boolean;
  conditions: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface CompensationRule {
  id: string;
  organization_id: string;
  compensation_scheme_id: string;
  rule_type: CompensationRuleType;
  frequency: CompensationFrequency;
  amount: number | null;
  percentage: number | null;
  activity_type: string | null;
  minimum_amount: number | null;
  maximum_amount: number | null;
  conditions: Record<string, unknown> | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface ProfessionalSettlement {
  id: string;
  organization_id: string;
  branch_id: string | null;
  professional_id: string;
  compensation_scheme_id: string;
  period_start: string;
  period_end: string;
  status: SettlementStatus;
  gross_amount: number;
  adjustments_amount: number;
  deductions_amount: number;
  total_amount: number;
  total_paid: number;
  balance_due: number;
  currency: string;
  notes: string | null;
  calculated_at: string;
  approved_at: string | null;
  approved_by: string | null;
  paid_at: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface ProfessionalSettlementItem {
  id: string;
  settlement_id: string;
  organization_id: string;
  rule_id: string | null;
  source_type: SettlementItemSourceType;
  source_id: string | null;
  description: string;
  quantity: number;
  unit_amount: number | null;
  percentage: number | null;
  base_amount: number | null;
  calculated_amount: number;
  created_at: string;
  /** Resolved server-side when static href is insufficient (e.g. shift → internación). */
  source_href?: string | null;
}

export interface ProfessionalSettlementAdjustment {
  id: string;
  settlement_id: string;
  organization_id: string;
  adjustment_type: SettlementAdjustmentType;
  amount: number;
  reason: string;
  created_by: string;
  created_at: string;
}

export interface ProfessionalPayment {
  id: string;
  organization_id: string;
  professional_id: string;
  settlement_id: string;
  amount: number;
  currency: string;
  method: PaymentMethod;
  paid_at: string;
  reference: string | null;
  notes: string | null;
  invoice_number: string | null;
  invoice_date: string | null;
  invoice_amount: number | null;
  invoice_attachment_url: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface ProfessionalSettlementDetail extends ProfessionalSettlement {
  items: ProfessionalSettlementItem[];
  adjustments: ProfessionalSettlementAdjustment[];
  payments: ProfessionalPayment[];
}

export interface CalculateSettlementResult {
  settlement_id: string;
  status: SettlementStatus;
  gross_amount: number;
  adjustments_amount: number;
  deductions_amount: number;
  total_amount: number;
  item_count: number;
}

export interface SettlementSourceClaimInfo {
  settlementId: string;
  status: SettlementStatus;
  periodStart: string;
  periodEnd: string;
}

export interface BulkSettlementActionResult {
  succeeded: string[];
  failed: Array<{ id: string; error: string }>;
}
