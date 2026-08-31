/** Interconsultas — domain constants (isolated from clinical consultas). */

export const INTERCONSULTATION_STATUSES = [
  'draft',
  'requesting',
  'quotes_received',
  'approved',
  'in_progress',
  'completed',
  'cancelled',
] as const;

export type InterconsultationStatus = (typeof INTERCONSULTATION_STATUSES)[number];

export const INTERCONSULTATION_STATUS_LABELS: Record<InterconsultationStatus, string> = {
  draft: 'Borrador',
  requesting: 'Solicitando',
  quotes_received: 'Presupuestos recibidos',
  approved: 'Presupuesto aceptado',
  in_progress: 'En curso',
  completed: 'Completada',
  cancelled: 'Cancelada',
};

export const INTERCONSULTATION_PRIORITIES = ['normal', 'urgent'] as const;

export type InterconsultationPriority = (typeof INTERCONSULTATION_PRIORITIES)[number];

export const INTERCONSULTATION_PRIORITY_LABELS: Record<InterconsultationPriority, string> = {
  normal: 'Normal',
  urgent: 'Urgente',
};

export const INTERCONSULTATION_REQUEST_STATUSES = [
  'pending',
  'sent',
  'viewed',
  'quoted',
  'accepted',
  'declined',
  'expired',
  'cancelled',
] as const;

export type InterconsultationRequestStatus = (typeof INTERCONSULTATION_REQUEST_STATUSES)[number];

export const INTERCONSULTATION_REQUEST_STATUS_LABELS: Record<
  InterconsultationRequestStatus,
  string
> = {
  pending: 'Pendiente',
  sent: 'Enviada',
  viewed: 'Vista',
  quoted: 'Presupuestada',
  accepted: 'Aceptada',
  declined: 'Rechazada',
  expired: 'Expirada',
  cancelled: 'Cancelada',
};

export const INTERCONSULTATION_QUOTE_STATUSES = [
  'pending',
  'submitted',
  'accepted',
  'rejected',
  'withdrawn',
] as const;

export type InterconsultationQuoteStatus = (typeof INTERCONSULTATION_QUOTE_STATUSES)[number];

export const INTERCONSULTATION_QUOTE_STATUS_LABELS: Record<InterconsultationQuoteStatus, string> = {
  pending: 'Pendiente',
  submitted: 'Enviado',
  accepted: 'Aceptado',
  rejected: 'Rechazado',
  withdrawn: 'Retirado',
};

export const INTERCONSULTATION_BILLING_LINK_STATUSES = ['pending', 'invoiced', 'cancelled'] as const;

export type InterconsultationBillingLinkStatus =
  (typeof INTERCONSULTATION_BILLING_LINK_STATUSES)[number];

export const INTERCONSULTATION_BILLING_LINK_STATUS_LABELS: Record<
  InterconsultationBillingLinkStatus,
  string
> = {
  pending: 'Pendiente de cobro',
  invoiced: 'Facturada',
  cancelled: 'Cancelada',
};

export const INTERCONSULTATION_SETTLEMENT_LINK_STATUSES = [
  'pending',
  'linked',
  'cancelled',
] as const;

export type InterconsultationSettlementLinkStatus =
  (typeof INTERCONSULTATION_SETTLEMENT_LINK_STATUSES)[number];

export const INTERCONSULTATION_SETTLEMENT_LINK_STATUS_LABELS: Record<
  InterconsultationSettlementLinkStatus,
  string
> = {
  pending: 'Pendiente de liquidación',
  linked: 'Vinculada',
  cancelled: 'Cancelada',
};

/** Allowed clinic-side status transitions. */
export const INTERCONSULTATION_STATUS_TRANSITIONS: Record<
  InterconsultationStatus,
  readonly InterconsultationStatus[]
> = {
  draft: ['requesting', 'cancelled'],
  requesting: ['quotes_received', 'cancelled'],
  quotes_received: ['approved', 'cancelled'],
  approved: ['in_progress', 'cancelled'],
  in_progress: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
};

export const INTERCONSULTATION_TOKEN_TTL_DAYS = 14;

export const INTERCONSULTATION_LIST_COLUMNS =
  'id, organization_id, branch_id, patient_id, owner_id, requested_by, title, clinical_question, clinical_summary, priority, status, currency, clinic_markup_percentage, clinic_markup_amount, professional_base_amount, client_final_amount, accepted_response_id, created_at, updated_at, closed_at' as const;
