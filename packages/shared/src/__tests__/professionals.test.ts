import { describe, expect, it } from 'vitest';
import {
  FEATURES,
  getPermissionsForRole,
  isFeatureKey,
  roundProfessionalMoney,
  mapSettlementRow,
  mapSettlementItemRow,
  professionalCreateSchema,
  compensationRuleCreateSchema,
  bulkSettlementIdsSchema,
  bulkRegisterProfessionalPaymentsSchema,
  calculateSettlementSchema,
  settlementAdjustmentSchema,
  registerProfessionalPaymentSchema,
  getSettlementItemSourceHref,
  buildCsv,
  buildSettlementsReportCsv,
  SETTLEMENT_ITEM_SOURCE_TYPE_LABELS,
  SETTLEMENT_ADJUSTMENT_TYPE_LABELS,
  SETTLEMENT_STATUS_LABELS,
  PERMISSION_LABELS,
  SETTLEMENT_LOCKED_STATUSES,
} from '../index';

describe('professionals permissions & entitlements registry', () => {
  it('registers professionals permissions on admin roles', () => {
    expect(getPermissionsForRole('owner')).toContain('professionals:read');
    expect(getPermissionsForRole('owner')).toContain('professional_settlements:approve');
    expect(getPermissionsForRole('admin')).toContain('professional_compensation:write');
  });

  it('does not grant compensation access to readonly veterinarians', () => {
    const perms = getPermissionsForRole('readonly');
    expect(perms).not.toContain('professional_compensation:read');
    expect(perms).not.toContain('professional_settlements:read');
  });

  it('allows cashier to read and pay settlements only', () => {
    const perms = getPermissionsForRole('cashier');
    expect(perms).toContain('professional_settlements:read');
    expect(perms).toContain('professional_settlements:pay');
    expect(perms).not.toContain('professional_settlements:approve');
    expect(perms).not.toContain('professional_compensation:write');
  });

  it('registers professionals.settlements feature key', () => {
    expect(FEATURES.PROFESSIONALS_SETTLEMENTS).toBe('professionals.settlements');
    expect(isFeatureKey('professionals.settlements')).toBe(true);
  });
});

describe('professionals schemas', () => {
  it('validates professional create payload', () => {
    const parsed = professionalCreateSchema.safeParse({
      firstName: 'Ana',
      lastName: 'Vet',
      relationshipType: 'independent',
      branchIds: [],
    });
    expect(parsed.success).toBe(true);
  });

  it('requires amount for fixed rules', () => {
    const parsed = compensationRuleCreateSchema.safeParse({
      compensationSchemeId: '00000000-0000-4000-8000-000000000001',
      ruleType: 'fixed',
      frequency: 'monthly',
    });
    expect(parsed.success).toBe(false);
  });

  it('requires percentage for percentage rules', () => {
    const parsed = compensationRuleCreateSchema.safeParse({
      compensationSchemeId: '00000000-0000-4000-8000-000000000001',
      ruleType: 'percentage',
      frequency: 'per_consultation',
    });
    expect(parsed.success).toBe(false);
  });

  it('rejects invalid settlement periods', () => {
    const parsed = calculateSettlementSchema.safeParse({
      professionalId: '00000000-0000-4000-8000-000000000001',
      periodStart: '2026-08-31',
      periodEnd: '2026-08-01',
    });
    expect(parsed.success).toBe(false);
  });

  it('validates settlement adjustment reason', () => {
    const parsed = settlementAdjustmentSchema.safeParse({
      settlementId: '00000000-0000-4000-8000-000000000001',
      adjustmentType: 'bonus',
      amount: 5000,
      reason: 'Bonus por guardia',
    });
    expect(parsed.success).toBe(true);
  });

  it('validates professional payment method reuse', () => {
    const parsed = registerProfessionalPaymentSchema.safeParse({
      settlementId: '00000000-0000-4000-8000-000000000001',
      amount: 1000,
      method: 'transferencia',
    });
    expect(parsed.success).toBe(true);
  });
});

describe('professionals money helpers', () => {
  it('rounds half-up to 2 decimals', () => {
    expect(roundProfessionalMoney(10.005)).toBe(10.01);
    expect(roundProfessionalMoney(10.004)).toBe(10);
  });

  it('maps settlement rows with numeric fields', () => {
    const settlement = mapSettlementRow({
      id: 's1',
      organization_id: 'o1',
      branch_id: null,
      professional_id: 'p1',
      compensation_scheme_id: 'c1',
      period_start: '2026-08-01',
      period_end: '2026-08-31',
      status: 'draft',
      gross_amount: '1500000.00',
      adjustments_amount: '10000',
      deductions_amount: '5000',
      total_amount: '1505000',
      total_paid: '0',
      balance_due: '1505000',
      currency: 'ARS',
      notes: null,
      calculated_at: '2026-08-01T00:00:00Z',
      approved_at: null,
      approved_by: null,
      paid_at: null,
      created_at: '2026-08-01T00:00:00Z',
      updated_at: '2026-08-01T00:00:00Z',
      deleted_at: null,
    });
    expect(settlement.total_amount).toBe(1505000);
    expect(settlement.balance_due).toBe(1505000);
  });

  it('maps settlement item rows', () => {
    const item = mapSettlementItemRow({
      id: 'i1',
      settlement_id: 's1',
      organization_id: 'o1',
      rule_id: 'r1',
      source_type: 'consultation',
      source_id: 'c1',
      description: 'Consulta',
      quantity: 2,
      unit_amount: 15000,
      percentage: null,
      base_amount: null,
      calculated_amount: 30000,
      created_at: '2026-08-01T00:00:00Z',
    });
    expect(item.calculated_amount).toBe(30000);
  });

  it('defines locked settlement statuses', () => {
    expect(SETTLEMENT_LOCKED_STATUSES).toContain('approved');
    expect(SETTLEMENT_LOCKED_STATUSES).toContain('paid');
  });

  it('maps settlement item source routes', () => {
    expect(getSettlementItemSourceHref('consultation', 'abc')).toBe('/consultas/abc');
    expect(getSettlementItemSourceHref('surgery', 'xyz')).toBe('/cirugias/xyz');
    expect(getSettlementItemSourceHref('appointment', 'turno')).toBe('/agenda/turno');
    expect(getSettlementItemSourceHref('procedure', 'img1')).toBe('/imagenes/img1');
    expect(getSettlementItemSourceHref('fixed_compensation', 'abc')).toBeNull();
    expect(getSettlementItemSourceHref('consultation', null)).toBeNull();
  });

  it('exposes readable labels for UI', () => {
    expect(SETTLEMENT_ITEM_SOURCE_TYPE_LABELS.consultation).toBe('Consulta');
    expect(SETTLEMENT_ADJUSTMENT_TYPE_LABELS.bonus).toBe('Bonificación');
    expect(PERMISSION_LABELS['professional_settlements:pay']).toContain('pagos');
  });

  it('builds CSV with quoted cells', () => {
    expect(buildCsv([['a', 'b'], ['hello, world', 42]])).toBe('a,b\r\n"hello, world",42');
  });

  it('builds settlements report CSV with summary sections', () => {
    const csv = buildSettlementsReportCsv(
      '2026-08-01',
      '2026-08-31',
      {
        settlementsInPeriod: 2,
        totalCalculated: 150000,
        totalPaidInPeriod: 50000,
        totalBalanceDue: 100000,
        byStatus: [{ status: 'approved', count: 2, totalAmount: 150000 }],
        byProfessional: [
          {
            professionalName: 'Pérez, Ana',
            count: 1,
            totalAmount: 90000,
            balanceDue: 90000,
          },
        ],
      },
      SETTLEMENT_STATUS_LABELS
    );
    expect(csv).toContain('Reporte liquidaciones a profesionales');
    expect(csv).toContain('Pérez, Ana');
    expect(csv).toContain('Aprobada');
  });

  it('validates bulk settlement ids', () => {
    expect(bulkSettlementIdsSchema.safeParse({ settlementIds: [] }).success).toBe(false);
    expect(
      bulkSettlementIdsSchema.safeParse({
        settlementIds: ['550e8400-e29b-41d4-a716-446655440000'],
      }).success
    ).toBe(true);
  });

  it('validates bulk payment payload', () => {
    expect(
      bulkRegisterProfessionalPaymentsSchema.safeParse({
        mode: 'full',
        settlementIds: ['550e8400-e29b-41d4-a716-446655440000'],
        method: 'transferencia',
      }).success
    ).toBe(true);
    expect(
      bulkRegisterProfessionalPaymentsSchema.safeParse({
        mode: 'custom',
        payments: [{ settlementId: '550e8400-e29b-41d4-a716-446655440000', amount: 1500 }],
        method: 'efectivo',
      }).success
    ).toBe(true);
  });
});
