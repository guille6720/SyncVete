/** Professionals & Settlements — domain constants (Phase 1 backend). */

export const PROFESSIONAL_RELATIONSHIP_TYPES = [
  'employee',
  'independent',
  'partner',
  'other',
] as const;

export type ProfessionalRelationshipType = (typeof PROFESSIONAL_RELATIONSHIP_TYPES)[number];

export const PROFESSIONAL_RELATIONSHIP_LABELS: Record<ProfessionalRelationshipType, string> = {
  employee: 'Empleado',
  independent: 'Independiente',
  partner: 'Socio',
  other: 'Otro',
};

export const COMPENSATION_RULE_TYPES = ['fixed', 'activity', 'percentage'] as const;

export type CompensationRuleType = (typeof COMPENSATION_RULE_TYPES)[number];

export const COMPENSATION_RULE_TYPE_LABELS: Record<CompensationRuleType, string> = {
  fixed: 'Monto fijo',
  activity: 'Por actividad',
  percentage: 'Porcentaje',
};

export const COMPENSATION_FREQUENCIES = [
  'monthly',
  'biweekly',
  'weekly',
  'daily',
  'hourly',
  'per_consultation',
  'per_appointment',
  'per_procedure',
  'per_surgery',
  'per_shift',
  'per_lab_order',
  'per_prescription',
  'per_vaccination',
  'percentage',
  'mixed',
] as const;

export type CompensationFrequency = (typeof COMPENSATION_FREQUENCIES)[number];

/** Frequencies offered in the rule form. `mixed` is inert in calculate. */
export const COMPENSATION_FREQUENCIES_UI = COMPENSATION_FREQUENCIES.filter(
  (frequency) => frequency !== 'mixed'
);

export const COMPENSATION_FREQUENCY_LABELS: Record<CompensationFrequency, string> = {
  monthly: 'Mensual',
  biweekly: 'Quincenal',
  weekly: 'Semanal',
  daily: 'Diario',
  hourly: 'Por hora',
  per_consultation: 'Por consulta',
  per_appointment: 'Por turno',
  per_procedure: 'Por procedimiento',
  per_surgery: 'Por cirugía',
  per_shift: 'Por guardia',
  per_lab_order: 'Por orden de laboratorio',
  per_prescription: 'Por receta dispensada',
  per_vaccination: 'Por vacunación',
  percentage: 'Porcentaje',
  mixed: 'Mixto',
};

export const SETTLEMENT_PERIOD_PRESETS = ['month', 'biweekly', 'custom'] as const;

export type SettlementPeriodPreset = (typeof SETTLEMENT_PERIOD_PRESETS)[number];

export const SETTLEMENT_PERIOD_PRESET_LABELS: Record<SettlementPeriodPreset, string> = {
  month: 'Mes calendario',
  biweekly: 'Quincena (1–15 / 16–fin)',
  custom: 'Últimos N días',
};

export function isSettlementPeriodPreset(value: string): value is SettlementPeriodPreset {
  return (SETTLEMENT_PERIOD_PRESETS as readonly string[]).includes(value);
}

export const SETTLEMENT_STATUSES = [
  'draft',
  'review',
  'approved',
  'partially_paid',
  'paid',
  'cancelled',
] as const;

export type SettlementStatus = (typeof SETTLEMENT_STATUSES)[number];

export const SETTLEMENT_STATUS_LABELS: Record<SettlementStatus, string> = {
  draft: 'Borrador',
  review: 'En revisión',
  approved: 'Aprobada',
  partially_paid: 'Pago parcial',
  paid: 'Pagada',
  cancelled: 'Cancelada',
};

export const SETTLEMENT_STATUS_VARIANT: Record<
  SettlementStatus,
  'default' | 'success' | 'warning' | 'destructive'
> = {
  draft: 'default',
  review: 'warning',
  approved: 'warning',
  partially_paid: 'warning',
  paid: 'success',
  cancelled: 'destructive',
};

/** Locked statuses — items/adjustments cannot be edited. */
export const SETTLEMENT_LOCKED_STATUSES: SettlementStatus[] = [
  'approved',
  'partially_paid',
  'paid',
];

export const SETTLEMENT_ITEM_SOURCE_TYPES = [
  'appointment',
  'consultation',
  'surgery',
  'procedure',
  'shift',
  'lab_order',
  'prescription',
  'vaccination',
  'manual_adjustment',
  'fixed_compensation',
] as const;

export type SettlementItemSourceType = (typeof SETTLEMENT_ITEM_SOURCE_TYPES)[number];

export const SETTLEMENT_ITEM_SOURCE_TYPE_LABELS: Record<SettlementItemSourceType, string> = {
  appointment: 'Turno',
  consultation: 'Consulta',
  surgery: 'Cirugía',
  procedure: 'Procedimiento',
  shift: 'Guardia',
  lab_order: 'Laboratorio',
  prescription: 'Receta',
  vaccination: 'Vacunación',
  manual_adjustment: 'Ajuste manual',
  fixed_compensation: 'Compensación fija',
};

export const SETTLEMENT_ADJUSTMENT_TYPES = ['bonus', 'deduction', 'correction', 'other'] as const;

export type SettlementAdjustmentType = (typeof SETTLEMENT_ADJUSTMENT_TYPES)[number];

export const SETTLEMENT_ADJUSTMENT_TYPE_LABELS: Record<SettlementAdjustmentType, string> = {
  bonus: 'Bonificación',
  deduction: 'Deducción',
  correction: 'Corrección',
  other: 'Otro',
};

/** ARS monetary scale used in DB (NUMERIC 14,2). Percentages use 5,2. */
export const PROFESSIONALS_CURRENCY_DEFAULT = 'ARS' as const;

export const PROFESSIONALS_MONETARY_SCALE = 2;
export const PROFESSIONALS_PERCENTAGE_SCALE = 2;

export function isProfessionalRelationshipType(value: string): value is ProfessionalRelationshipType {
  return (PROFESSIONAL_RELATIONSHIP_TYPES as readonly string[]).includes(value);
}

export function isSettlementStatus(value: string): value is SettlementStatus {
  return (SETTLEMENT_STATUSES as readonly string[]).includes(value);
}

export function isSettlementLocked(status: SettlementStatus): boolean {
  return (SETTLEMENT_LOCKED_STATUSES as readonly string[]).includes(status);
}
