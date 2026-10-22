import type {
  InterconsultationBillingLinkStatus,
  InterconsultationPriority,
  InterconsultationQuoteStatus,
  InterconsultationRequestStatus,
  InterconsultationSettlementLinkStatus,
  InterconsultationStatus,
} from '../constants/interconsultations';

export interface Interconsultation {
  id: string;
  organizationId: string;
  branchId: string | null;
  patientId: string;
  ownerId: string;
  requestedBy: string | null;
  title: string;
  clinicalQuestion: string;
  clinicalSummary: string | null;
  priority: InterconsultationPriority;
  status: InterconsultationStatus;
  currency: string;
  clinicMarkupPercentage: number;
  clinicMarkupAmount: number;
  professionalBaseAmount: number;
  clientFinalAmount: number;
  acceptedResponseId: string | null;
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
}

export interface InterconsultationRequest {
  id: string;
  organizationId: string;
  interconsultationId: string;
  professionalId: string | null;
  externalProfessionalName: string | null;
  externalProfessionalEmail: string | null;
  externalProfessionalPhone: string | null;
  status: InterconsultationRequestStatus;
  sentAt: string | null;
  viewedAt: string | null;
  respondedAt: string | null;
  declinedAt: string | null;
  createdAt: string;
  updatedAt: string;
  /** Present only when creating/resending — never persisted raw. */
  secureToken?: string | null;
  tokenExpiresAt?: string | null;
  professionalName?: string | null;
}

export interface InterconsultationQuote {
  id: string;
  organizationId: string;
  interconsultationRequestId: string;
  professionalId: string | null;
  amount: number;
  currency: string;
  estimatedDelivery: string | null;
  professionalMessage: string | null;
  status: InterconsultationQuoteStatus;
  createdAt: string;
  updatedAt: string;
  professionalName?: string | null;
}

export interface InterconsultationResponse {
  id: string;
  organizationId: string;
  interconsultationId: string;
  interconsultationRequestId: string;
  professionalId: string | null;
  responseText: string;
  recommendations: string | null;
  attachments: unknown[];
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface InterconsultationBillingLink {
  id: string;
  organizationId: string;
  interconsultationId: string;
  invoiceId: string | null;
  status: InterconsultationBillingLinkStatus;
  createdAt: string;
  updatedAt: string;
}

export interface InterconsultationSettlementLink {
  id: string;
  organizationId: string;
  interconsultationId: string;
  professionalId: string;
  professionalSettlementId: string | null;
  amount: number;
  status: InterconsultationSettlementLinkStatus;
  createdAt: string;
  updatedAt: string;
}

export interface InterconsultationListRow extends Interconsultation {
  patientName: string | null;
  ownerName: string | null;
  professionalNames: string[];
  quoteCount: number;
}

export interface InterconsultationKpis {
  open: number;
  waitingResponse: number;
  quotesReceived: number;
  pendingBilling: number;
  pendingSettlement: number;
}

export interface InterconsultationDetail extends Interconsultation {
  patientName: string | null;
  patientSpecies: string | null;
  patientBreed: string | null;
  ownerName: string | null;
  requests: InterconsultationRequest[];
  quotes: InterconsultationQuote[];
  responses: InterconsultationResponse[];
  billingLink: InterconsultationBillingLink | null;
  settlementLinks: InterconsultationSettlementLink[];
}
