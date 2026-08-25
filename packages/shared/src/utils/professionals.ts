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
    case 'lab_order':
      return `/laboratorio/${sourceId}`;
    case 'prescription':
      return `/farmacia/${sourceId}`;
    case 'vaccination':
      return `/vacunacion/${sourceId}`;
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

function toDateOnly(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export type SettlementPeriodKind = 'month' | 'last_month' | 'biweekly' | 'custom';

/** Resolve a settlement period range for calculate form defaults / presets. */
export function resolveSettlementPeriodRange(input?: {
  kind?: SettlementPeriodKind | null;
  periodDays?: number | null;
  referenceDate?: Date;
}): { start: string; end: string } {
  const ref = input?.referenceDate ? new Date(input.referenceDate) : new Date();
  const kind = input?.kind ?? 'month';
  const periodDays =
    input?.periodDays != null && Number.isFinite(input.periodDays) && input.periodDays > 0
      ? Math.min(366, Math.round(input.periodDays))
      : 14;

  if (kind === 'last_month') {
    const start = new Date(ref.getFullYear(), ref.getMonth() - 1, 1);
    const end = new Date(ref.getFullYear(), ref.getMonth(), 0);
    return { start: toDateOnly(start), end: toDateOnly(end) };
  }

  if (kind === 'biweekly') {
    if (ref.getDate() <= 15) {
      const start = new Date(ref.getFullYear(), ref.getMonth(), 1);
      const end = new Date(ref.getFullYear(), ref.getMonth(), 15);
      return { start: toDateOnly(start), end: toDateOnly(end) };
    }
    const start = new Date(ref.getFullYear(), ref.getMonth(), 16);
    const end = new Date(ref.getFullYear(), ref.getMonth() + 1, 0);
    return { start: toDateOnly(start), end: toDateOnly(end) };
  }

  if (kind === 'custom') {
    const end = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate());
    const start = new Date(end);
    start.setDate(start.getDate() - (periodDays - 1));
    return { start: toDateOnly(start), end: toDateOnly(end) };
  }

  const start = new Date(ref.getFullYear(), ref.getMonth(), 1);
  const end = new Date(ref.getFullYear(), ref.getMonth() + 1, 0);
  return { start: toDateOnly(start), end: toDateOnly(end) };
}

/** Map org settlement preset to calculate period kind. */
export function settlementPresetToPeriodKind(
  preset: string | null | undefined
): SettlementPeriodKind {
  if (preset === 'biweekly') return 'biweekly';
  if (preset === 'custom') return 'custom';
  return 'month';
}

/** Build /liquidaciones query string for deep links. */
export function buildLiquidacionesHref(params: {
  status?: string | null;
  unpaid?: boolean;
  pendingReview?: boolean;
  professionalId?: string | null;
  periodStart?: string | null;
  periodEnd?: string | null;
  basePath?: string;
}): string {
  const q = new URLSearchParams();
  if (params.unpaid) q.set('unpaid', '1');
  else if (params.pendingReview) q.set('pendingReview', '1');
  else if (params.status) q.set('status', params.status);
  if (params.professionalId) q.set('professionalId', params.professionalId);
  if (params.periodStart) q.set('periodStart', params.periodStart);
  if (params.periodEnd) q.set('periodEnd', params.periodEnd);
  const query = q.toString();
  const base = params.basePath ?? '/liquidaciones';
  return query ? `${base}?${query}` : base;
}

/** Cash-movement notes that can be parsed back to a settlement detail link. */
export function buildProfessionalPaymentCashNote(input: {
  settlementId: string;
  paymentId?: string | null;
  professionalName?: string | null;
}): string {
  const parts = [
    'Liquidación profesional',
    input.professionalName?.trim() || null,
    `/liquidaciones/${input.settlementId}`,
    input.paymentId ? `pago ${input.paymentId.slice(0, 8)}` : null,
  ].filter(Boolean);
  return parts.join(' · ').slice(0, 500);
}

/** Extract /liquidaciones/{uuid} from cash notes (soft trail, no FK). */
export function extractSettlementHrefFromCashNote(
  notes: string | null | undefined
): string | null {
  if (!notes) return null;
  const match = notes.match(/\/liquidaciones\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  return match ? match[0] : null;
}

/** Current calendar month range (local) for dashboard deep links. */
export function currentMonthPeriodRange(referenceDate = new Date()): { start: string; end: string } {
  const start = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), 1);
  const end = new Date(referenceDate.getFullYear(), referenceDate.getMonth() + 1, 0);
  return { start: toDateOnly(start), end: toDateOnly(end) };
}
