import { z } from 'zod';
import {
  COMPENSATION_FREQUENCIES,
  COMPENSATION_RULE_TYPES,
  PROFESSIONAL_RELATIONSHIP_TYPES,
  SETTLEMENT_ADJUSTMENT_TYPES,
  SETTLEMENT_STATUSES,
} from '../constants/professionals';
import { PAYMENT_METHODS } from '../constants/billing';

const moneySchema = z.coerce.number().finite().min(0).max(999999999999.99);
const percentageSchema = z.coerce.number().finite().min(0).max(100);

export const professionalCreateSchema = z.object({
  userId: z.string().uuid().optional().nullable(),
  profileId: z.string().uuid().optional().nullable(),
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  documentNumber: z.string().trim().max(50).optional().nullable(),
  taxId: z.string().trim().max(50).optional().nullable(),
  professionalLicense: z.string().trim().max(80).optional().nullable(),
  professionalLicenseJurisdiction: z.string().trim().max(80).optional().nullable(),
  specialty: z.string().trim().max(120).optional().nullable(),
  relationshipType: z.enum(PROFESSIONAL_RELATIONSHIP_TYPES),
  startDate: z.string().date().optional().nullable(),
  endDate: z.string().date().optional().nullable(),
  isActive: z.boolean().optional().default(true),
  invoiceRequired: z.boolean().optional().default(false),
  notes: z.string().trim().max(2000).optional().nullable(),
  branchIds: z.array(z.string().uuid()).optional().default([]),
});

export const professionalUpdateSchema = professionalCreateSchema.partial().extend({
  id: z.string().uuid(),
});

export const compensationSchemeCreateSchema = z.object({
  professionalId: z.string().uuid(),
  name: z.string().trim().min(1).max(120),
  validFrom: z.string().date(),
  validTo: z.string().date().optional().nullable(),
  currency: z.string().length(3).default('ARS'),
  isActive: z.boolean().optional().default(true),
  conditions: z.record(z.unknown()).optional().nullable(),
});

export const compensationSchemeUpdateSchema = compensationSchemeCreateSchema
  .partial()
  .extend({ id: z.string().uuid() });

const compensationRuleBaseSchema = z.object({
  compensationSchemeId: z.string().uuid(),
  ruleType: z.enum(COMPENSATION_RULE_TYPES),
  frequency: z.enum(COMPENSATION_FREQUENCIES),
  amount: moneySchema.optional().nullable(),
  percentage: percentageSchema.optional().nullable(),
  activityType: z.string().trim().max(80).optional().nullable(),
  minimumAmount: moneySchema.optional().nullable(),
  maximumAmount: moneySchema.optional().nullable(),
  conditions: z.record(z.unknown()).optional().nullable(),
  isActive: z.boolean().optional().default(true),
});

function refineCompensationRule<T extends z.ZodTypeAny>(schema: T) {
  return schema.superRefine((value, ctx) => {
    const rule = value as z.infer<typeof compensationRuleBaseSchema>;
    if (rule.ruleType === 'percentage' && rule.percentage == null) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Indicá el porcentaje', path: ['percentage'] });
    }
    if ((rule.ruleType === 'fixed' || rule.ruleType === 'activity') && rule.amount == null) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Indicá el monto', path: ['amount'] });
    }
  });
}

export const compensationRuleCreateSchema = refineCompensationRule(compensationRuleBaseSchema);

export const compensationRuleUpdateSchema = refineCompensationRule(
  compensationRuleBaseSchema.partial().extend({ id: z.string().uuid() })
);

export const calculateSettlementSchema = z
  .object({
    professionalId: z.string().uuid(),
    periodStart: z.string().date(),
    periodEnd: z.string().date(),
    branchId: z.string().uuid().optional().nullable(),
  })
  .refine((v) => v.periodEnd >= v.periodStart, {
    message: 'period_end debe ser >= period_start',
    path: ['periodEnd'],
  });

export const bulkCalculateSettlementsSchema = z
  .object({
    periodStart: z.string().date(),
    periodEnd: z.string().date(),
    branchId: z.string().uuid().optional().nullable(),
    professionalIds: z.array(z.string().uuid()).min(1).max(100).optional(),
  })
  .refine((v) => v.periodEnd >= v.periodStart, {
    message: 'period_end debe ser >= period_start',
    path: ['periodEnd'],
  });

export const voidProfessionalPaymentSchema = z.object({
  paymentId: z.string().uuid(),
  reason: z.string().trim().min(3).max(500),
});

export const omitSettlementItemSchema = z.object({
  itemId: z.string().uuid(),
  reason: z.string().trim().min(3).max(500),
});

export const restoreSettlementOmissionSchema = z.object({
  omissionId: z.string().uuid(),
});

export const settlementAdjustmentSchema = z.object({
  settlementId: z.string().uuid(),
  adjustmentType: z.enum(SETTLEMENT_ADJUSTMENT_TYPES),
  amount: moneySchema.refine((n) => n > 0, 'El monto debe ser positivo'),
  reason: z.string().trim().min(3).max(500),
});

export const approveSettlementSchema = z.object({
  settlementId: z.string().uuid(),
});

export const cancelSettlementSchema = z.object({
  settlementId: z.string().uuid(),
  reason: z.string().trim().min(3).max(500).optional(),
});

export const registerProfessionalPaymentSchema = z.object({
  settlementId: z.string().uuid(),
  amount: moneySchema.refine((n) => n > 0, 'El monto debe ser positivo'),
  method: z.enum(PAYMENT_METHODS),
  paidAt: z.string().datetime().optional(),
  reference: z.string().trim().max(120).optional().nullable(),
  notes: z.string().trim().max(500).optional().nullable(),
  invoiceNumber: z.string().trim().max(80).optional().nullable(),
  invoiceDate: z.string().date().optional().nullable(),
  invoiceAmount: moneySchema.optional().nullable(),
  invoiceAttachmentUrl: z.string().url().max(500).optional().nullable(),
});

export const listSettlementsSchema = z.object({
  professionalId: z.string().uuid().optional(),
  status: z.enum(SETTLEMENT_STATUSES).optional(),
  periodStart: z.string().date().optional(),
  periodEnd: z.string().date().optional(),
  branchId: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

export const bulkSettlementIdsSchema = z.object({
  settlementIds: z.array(z.string().uuid()).min(1).max(50),
});

const bulkPaymentCommonSchema = z.object({
  method: z.enum(PAYMENT_METHODS),
  paidAt: z.string().datetime().optional(),
  reference: z.string().trim().max(120).optional().nullable(),
  notes: z.string().trim().max(500).optional().nullable(),
  invoiceNumber: z.string().trim().max(80).optional().nullable(),
  invoiceDate: z.string().date().optional().nullable(),
  invoiceAmount: moneySchema.optional().nullable(),
  invoiceAttachmentUrl: z.string().url().max(500).optional().nullable(),
});

export const settlementNotesSchema = z.object({
  settlementId: z.string().uuid(),
  notes: z.string().trim().max(2000).optional().nullable(),
});

export const deleteSettlementAdjustmentSchema = z.object({
  adjustmentId: z.string().uuid(),
});

export const updateSettlementAdjustmentSchema = z.object({
  adjustmentId: z.string().uuid(),
  adjustmentType: z.enum(SETTLEMENT_ADJUSTMENT_TYPES),
  amount: moneySchema.refine((n) => n > 0, 'El monto debe ser positivo'),
  reason: z.string().trim().min(3).max(500),
});

export const bulkRegisterProfessionalPaymentsSchema = bulkPaymentCommonSchema.and(
  z.discriminatedUnion('mode', [
    z.object({
      mode: z.literal('full'),
      settlementIds: z.array(z.string().uuid()).min(1).max(50),
    }),
    z.object({
      mode: z.literal('custom'),
      payments: z
        .array(
          z.object({
            settlementId: z.string().uuid(),
            amount: z.coerce.number().positive(),
          })
        )
        .min(1)
        .max(50),
    }),
  ])
);

export type ProfessionalCreateInput = z.infer<typeof professionalCreateSchema>;
export type ProfessionalUpdateInput = z.infer<typeof professionalUpdateSchema>;
export type CompensationSchemeCreateInput = z.infer<typeof compensationSchemeCreateSchema>;
export type CompensationRuleCreateInput = z.infer<typeof compensationRuleCreateSchema>;
export type CalculateSettlementInput = z.infer<typeof calculateSettlementSchema>;
export type RegisterProfessionalPaymentInput = z.infer<typeof registerProfessionalPaymentSchema>;
export type OmitSettlementItemInput = z.infer<typeof omitSettlementItemSchema>;
export type RestoreSettlementOmissionInput = z.infer<typeof restoreSettlementOmissionSchema>;
