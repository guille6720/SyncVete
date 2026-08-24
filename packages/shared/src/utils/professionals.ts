import type { ProfessionalSettlement, ProfessionalSettlementItem } from '../types/professionals';
import type { SettlementItemSourceType } from '../constants/professionals';
import { PROFESSIONALS_MONETARY_SCALE } from '../constants/professionals';

/** Documented rounding: half-up to 2 decimals at each line; totals sum rounded lines. */
export function roundProfessionalMoney(value: number): number {
  const factor = 10 ** PROFESSIONALS_MONETARY_SCALE;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

export function parseNumericField(value: unknown): number {
  if (value == null) return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export function mapSettlementRow(row: Record<string, unknown>): ProfessionalSettlement {
  return {
    id: String(row.id),
    organization_id: String(row.organization_id),
    branch_id: row.branch_id ? String(row.branch_id) : null,
    professional_id: String(row.professional_id),
    compensation_scheme_id: String(row.compensation_scheme_id),
    period_start: String(row.period_start),
    period_end: String(row.period_end),
    status: row.status as ProfessionalSettlement['status'],
    gross_amount: parseNumericField(row.gross_amount),
    adjustments_amount: parseNumericField(row.adjustments_amount),
    deductions_amount: parseNumericField(row.deductions_amount),
    total_amount: parseNumericField(row.total_amount),
    total_paid: parseNumericField(row.total_paid),
    balance_due: parseNumericField(row.balance_due),
    currency: String(row.currency ?? 'ARS'),
    notes: row.notes ? String(row.notes) : null,
    calculated_at: String(row.calculated_at),
    approved_at: row.approved_at ? String(row.approved_at) : null,
    approved_by: row.approved_by ? String(row.approved_by) : null,
    paid_at: row.paid_at ? String(row.paid_at) : null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
    deleted_at: row.deleted_at ? String(row.deleted_at) : null,
  };
}

export function mapSettlementItemRow(row: Record<string, unknown>): ProfessionalSettlementItem {
  return {
    id: String(row.id),
    settlement_id: String(row.settlement_id),
    organization_id: String(row.organization_id),
    rule_id: row.rule_id ? String(row.rule_id) : null,
    source_type: row.source_type as ProfessionalSettlementItem['source_type'],
    source_id: row.source_id ? String(row.source_id) : null,
    description: String(row.description),
    quantity: parseNumericField(row.quantity),
    unit_amount: row.unit_amount != null ? parseNumericField(row.unit_amount) : null,
    percentage: row.percentage != null ? parseNumericField(row.percentage) : null,
    base_amount: row.base_amount != null ? parseNumericField(row.base_amount) : null,
    calculated_amount: parseNumericField(row.calculated_amount),
    created_at: String(row.created_at),
  };
}

/** Clinic route for a settlement line source, when the entity has a detail page. */
export function getSettlementItemSourceHref(
  sourceType: SettlementItemSourceType,
  sourceId: string | null | undefined
): string | null {
  if (!sourceId) return null;
  switch (sourceType) {
    case 'appointment':
      return `/agenda/${sourceId}`;
    case 'procedure':
      return `/imagenes/${sourceId}`;
    case 'consultation':
      return `/consultas/${sourceId}`;
    case 'surgery':
      return `/cirugias/${sourceId}`;
    default:
      return null;
  }
}

export interface SettlementsSummary {
  pendingReviewCount: number;
  approvedUnpaidCount: number;
  totalBalanceDue: number;
  paidThisMonth: number;
  currency: string;
  byStatus: Array<{ status: string; count: number }>;
}

/** Escape a CSV cell (RFC-style quoting). */
export function escapeCsvCell(value: string | number | null | undefined): string {
  if (value == null) return '';
  const text = String(value);
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export function buildCsv(rows: Array<Array<string | number | null | undefined>>): string {
  return rows.map((row) => row.map((cell) => escapeCsvCell(cell)).join(',')).join('\r\n');
}

/** CSV export for clinic reports — settlements section. */
export function buildSettlementsReportCsv(
  from: string,
  to: string,
  report: {
    settlementsInPeriod: number;
    totalCalculated: number;
    totalPaidInPeriod: number;
    totalBalanceDue: number;
    byStatus: Array<{ status: string; count: number; totalAmount: number }>;
    byProfessional: Array<{
      professionalName: string;
      count: number;
      totalAmount: number;
      balanceDue: number;
    }>;
  },
  statusLabels: Record<string, string>
): string {
  const rows: Array<Array<string | number | null>> = [
    ['Reporte liquidaciones a profesionales'],
    ['Período', `${from} → ${to}`],
    [],
    ['Resumen'],
    ['Liquidaciones', report.settlementsInPeriod],
    ['Total calculado', report.totalCalculated],
    ['Pagado en período', report.totalPaidInPeriod],
    ['Saldo pendiente', report.totalBalanceDue],
    [],
    ['Por estado', 'Cantidad', 'Importe'],
    ...report.byStatus.map((item) => [
      statusLabels[item.status] ?? item.status,
      item.count,
      item.totalAmount,
    ]),
    [],
    ['Por profesional', 'Liquidaciones', 'Total', 'Saldo'],
    ...report.byProfessional.map((item) => [
      item.professionalName,
      item.count,
      item.totalAmount,
      item.balanceDue,
    ]),
  ];
  return buildCsv(rows);
}
