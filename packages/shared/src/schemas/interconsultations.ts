import { z } from 'zod';
import {
  INTERCONSULTATION_PRIORITIES,
  INTERCONSULTATION_STATUSES,
} from '../constants/interconsultations';

const moneySchema = z.coerce.number().finite().min(0).max(999999999999.99);
const percentageSchema = z.coerce.number().finite().min(0).max(1000);

export const interconsultationCreateSchema = z.object({
  patientId: z.string().uuid(),
  ownerId: z.string().uuid(),
  branchId: z.string().uuid().optional().nullable(),
  title: z.string().trim().min(1).max(200),
  clinicalQuestion: z.string().trim().min(1).max(8000),
  clinicalSummary: z.string().trim().max(8000).optional().nullable(),
  priority: z.enum(INTERCONSULTATION_PRIORITIES).default('normal'),
  clinicMarkupPercentage: percentageSchema.default(0),
});

export const interconsultationUpdateSchema = z.object({
  id: z.string().uuid(),
  title: z.string().trim().min(1).max(200).optional(),
  clinicalQuestion: z.string().trim().min(1).max(8000).optional(),
  clinicalSummary: z.string().trim().max(8000).optional().nullable(),
  priority: z.enum(INTERCONSULTATION_PRIORITIES).optional(),
  clinicMarkupPercentage: percentageSchema.optional(),
  status: z.enum(INTERCONSULTATION_STATUSES).optional(),
});

export const interconsultationProfessionalTargetSchema = z
  .object({
    professionalId: z.string().uuid().optional().nullable(),
    externalProfessionalName: z.string().trim().max(160).optional().nullable(),
    externalProfessionalEmail: z.string().trim().email().max(200).optional().nullable().or(z.literal('')),
    externalProfessionalPhone: z.string().trim().max(40).optional().nullable(),
  })
  .superRefine((value, ctx) => {
    const hasInternal = Boolean(value.professionalId);
    const hasExternal = Boolean(value.externalProfessionalName?.trim());
    if (!hasInternal && !hasExternal) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Indicá un profesional interno o externo',
      });
    }
  });

export const interconsultationRequestQuotesSchema = z.object({
  interconsultationId: z.string().uuid(),
  professionals: z.array(interconsultationProfessionalTargetSchema).min(1).max(20),
});

export const interconsultationQuoteSubmitSchema = z.object({
  amount: moneySchema,
  estimatedDelivery: z.string().trim().max(200).optional().nullable(),
  professionalMessage: z.string().trim().max(4000).optional().nullable(),
});

export const interconsultationQuoteApproveSchema = z.object({
  quoteId: z.string().uuid(),
  interconsultationId: z.string().uuid(),
});

export const interconsultationResponseSubmitSchema = z.object({
  responseText: z.string().trim().min(1).max(16000),
  recommendations: z.string().trim().max(8000).optional().nullable(),
});

export const interconsultationAttachInvoiceSchema = z.object({
  interconsultationId: z.string().uuid(),
  invoiceId: z.string().uuid().optional().nullable(),
  createDraft: z.boolean().optional().default(true),
});

export const interconsultationAttachSettlementSchema = z.object({
  interconsultationId: z.string().uuid(),
  settlementLinkId: z.string().uuid(),
  professionalSettlementId: z.string().uuid(),
});

export const interconsultationListFiltersSchema = z.object({
  status: z.enum(INTERCONSULTATION_STATUSES).optional().nullable(),
  priority: z.enum(INTERCONSULTATION_PRIORITIES).optional().nullable(),
  patientId: z.string().uuid().optional().nullable(),
  professionalId: z.string().uuid().optional().nullable(),
  from: z.string().datetime().optional().nullable(),
  to: z.string().datetime().optional().nullable(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});
