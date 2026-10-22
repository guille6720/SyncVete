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
  updateSettlementAdjustmentSchema,
  bulkCalculateSettlementsSchema,
  voidProfessionalPaymentSchema,
  omitSettlementItemSchema,
  restoreSettlementOmissionSchema,
  returnSettlementToDraftSchema,
  cloneCompensationSchemeSchema,
  getSettlementItemSourceHref,
  buildSettlementDetailBasePath,
  buildSettlementDetailHref,
  resolveSettlementPeriodRange,
  settlementPresetToPeriodKind,
  COMPENSATION_FREQUENCIES_UI,
  buildCsv,
  buildSettlementsReportCsv,
  buildLiquidacionesHref,
  buildProfessionalPaymentCashNote,
  extractSettlementHrefFromCashNote,
  currentMonthPeriodRange,
  compensationSchemeRangesOverlap,
  paidThisMonthLiquidacionesHref,
  settlementApproveConfirmMessage,
  settlementHistoryRowHint,
  parseSettlementReturnNotes,
  mergeSettlementReturnNotes,
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

  it('validates settlement adjustment updates', () => {
    const parsed = updateSettlementAdjustmentSchema.safeParse({
      adjustmentId: '00000000-0000-4000-8000-000000000002',
      adjustmentType: 'deduction',
      amount: 1500,
      reason: 'Corrección de monto',
    });
    expect(parsed.success).toBe(true);
    expect(
      updateSettlementAdjustmentSchema.safeParse({
        adjustmentId: '00000000-0000-4000-8000-000000000002',
        adjustmentType: 'bonus',
        amount: 0,
        reason: 'x',
      }).success
    ).toBe(false);
  });

  it('validates bulk calculate and void payment schemas', () => {
    expect(
      bulkCalculateSettlementsSchema.safeParse({
        periodStart: '2026-08-01',
        periodEnd: '2026-08-31',
      }).success
    ).toBe(true);
    expect(
      bulkCalculateSettlementsSchema.safeParse({
        periodStart: '2026-08-31',
        periodEnd: '2026-08-01',
      }).success
    ).toBe(false);
    expect(
      voidProfessionalPaymentSchema.safeParse({
        paymentId: '00000000-0000-4000-8000-000000000003',
        reason: 'Pago duplicado',
      }).success
    ).toBe(true);
    expect(
      voidProfessionalPaymentSchema.safeParse({
        paymentId: '00000000-0000-4000-8000-000000000003',
        reason: 'no',
      }).success
    ).toBe(false);
  });

  it('validates omit / restore settlement item schemas', () => {
    expect(
      omitSettlementItemSchema.safeParse({
        itemId: '00000000-0000-4000-8000-000000000004',
        reason: 'No corresponde',
      }).success
    ).toBe(true);
    expect(
      omitSettlementItemSchema.safeParse({
        itemId: '00000000-0000-4000-8000-000000000004',
        reason: 'x',
      }).success
    ).toBe(false);
    expect(
      restoreSettlementOmissionSchema.safeParse({
        omissionId: '00000000-0000-4000-8000-000000000005',
      }).success
    ).toBe(true);
    expect(
      returnSettlementToDraftSchema.safeParse({
        settlementId: '00000000-0000-4000-8000-000000000006',
        reason: 'Falta ajuste',
      }).success
    ).toBe(true);
    expect(
      cloneCompensationSchemeSchema.safeParse({
        sourceSchemeId: '00000000-0000-4000-8000-000000000007',
        name: 'Septiembre 2026',
        validFrom: '2026-09-01',
        deactivateSource: false,
      }).success
    ).toBe(true);
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
      cancelled_at: null,
      cancelled_by: null,
      cancellation_reason: null,
      created_at: '2026-08-01T00:00:00Z',
      updated_at: '2026-08-01T00:00:00Z',
      deleted_at: null,
    });
    expect(settlement.total_amount).toBe(1505000);
    expect(settlement.balance_due).toBe(1505000);
    expect(settlement.cancelled_at).toBeNull();
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
    expect(getSettlementItemSourceHref('lab_order', 'lab1')).toBe('/laboratorio/lab1');
    expect(getSettlementItemSourceHref('prescription', 'rx1')).toBe('/farmacia/rx1');
    expect(getSettlementItemSourceHref('vaccination', 'vac1')).toBe('/vacunacion/vac1');
    expect(getSettlementItemSourceHref('fixed_compensation', 'abc')).toBeNull();
    expect(getSettlementItemSourceHref('consultation', null)).toBeNull();
  });

  it('builds settlement detail hrefs by access', () => {
    expect(buildSettlementDetailBasePath('admin')).toBe('/liquidaciones');
    expect(buildSettlementDetailBasePath('own')).toBe('/liquidaciones/mis-liquidaciones');
    expect(buildSettlementDetailBasePath(null)).toBe('/liquidaciones');
    expect(buildSettlementDetailHref('own', 's1')).toBe('/liquidaciones/mis-liquidaciones/s1');
    expect(buildSettlementDetailHref('admin', 's1')).toBe('/liquidaciones/s1');
  });

  it('resolves settlement period presets', () => {
    const ref = new Date(2026, 7, 20); // Aug 20, 2026
    expect(resolveSettlementPeriodRange({ kind: 'month', referenceDate: ref })).toEqual({
      start: '2026-08-01',
      end: '2026-08-31',
    });
    expect(resolveSettlementPeriodRange({ kind: 'last_month', referenceDate: ref })).toEqual({
      start: '2026-07-01',
      end: '2026-07-31',
    });
    expect(resolveSettlementPeriodRange({ kind: 'biweekly', referenceDate: ref })).toEqual({
      start: '2026-08-16',
      end: '2026-08-31',
    });
    expect(
      resolveSettlementPeriodRange({ kind: 'biweekly', referenceDate: new Date(2026, 7, 10) })
    ).toEqual({
      start: '2026-08-01',
      end: '2026-08-15',
    });
    expect(
      resolveSettlementPeriodRange({ kind: 'custom', periodDays: 7, referenceDate: ref })
    ).toEqual({
      start: '2026-08-14',
      end: '2026-08-20',
    });
    expect(settlementPresetToPeriodKind('biweekly')).toBe('biweekly');
    expect(settlementPresetToPeriodKind(undefined)).toBe('month');
  });

  it('excludes inert mixed frequency from UI list', () => {
    expect(COMPENSATION_FREQUENCIES_UI).not.toContain('mixed');
    expect(COMPENSATION_FREQUENCIES_UI).toContain('per_lab_order');
  });

  it('builds liquidaciones deep links and cash note trail', () => {
    expect(
      buildLiquidacionesHref({
        unpaid: true,
        periodStart: '2026-08-01',
        periodEnd: '2026-08-31',
      })
    ).toBe('/liquidaciones?unpaid=1&periodStart=2026-08-01&periodEnd=2026-08-31');
    expect(paidThisMonthLiquidacionesHref(new Date(2026, 7, 20))).toBe(
      '/liquidaciones?paidInMonth=1'
    );
    expect(settlementApproveConfirmMessage([{ severity: 'hard' }])).toContain('conflicto');
    expect(settlementApproveConfirmMessage([{ severity: 'soft' }])).toContain('aviso');
    expect(settlementApproveConfirmMessage([])).toContain('Aprobar esta liquidación');
    expect(
      settlementHistoryRowHint({
        status: 'cancelled',
        cancellation_reason: 'Duplicada',
      })
    ).toBe('Cancelada: Duplicada');
    expect(
      settlementHistoryRowHint({
        status: 'draft',
        notes: 'Devuelta a borrador: Falta ajuste · nota previa',
      })
    ).toContain('Devuelta a borrador');
    expect(
      parseSettlementReturnNotes('Devuelta a borrador: Falta ajuste · nota previa')
    ).toEqual({
      returnPrefix: 'Devuelta a borrador: Falta ajuste',
      body: 'nota previa',
    });
    expect(
      mergeSettlementReturnNotes('Devuelta a borrador: Falta ajuste', 'nota nueva')
    ).toBe('Devuelta a borrador: Falta ajuste · nota nueva');
    expect(
      buildProfessionalPaymentCashNote({
        settlementId: '00000000-0000-4000-8000-000000000099',
        paymentId: '11111111-1111-4111-8111-111111111111',
        professionalName: 'Pérez, Ana',
      })
    ).toContain('/liquidaciones/00000000-0000-4000-8000-000000000099');
    expect(
      extractSettlementHrefFromCashNote(
        'Liquidación profesional · /liquidaciones/00000000-0000-4000-8000-000000000099 · pago 11111111'
      )
    ).toBe('/liquidaciones/00000000-0000-4000-8000-000000000099');
    expect(currentMonthPeriodRange(new Date(2026, 7, 20))).toEqual({
      start: '2026-08-01',
      end: '2026-08-31',
    });
  });

  it('detects compensation scheme date range overlaps', () => {
    expect(
      compensationSchemeRangesOverlap(
        { validFrom: '2026-08-01', validTo: '2026-08-31' },
        { validFrom: '2026-08-15', validTo: '2026-09-15' }
      )
    ).toBe(true);
    expect(
      compensationSchemeRangesOverlap(
        { validFrom: '2026-08-01', validTo: '2026-08-31' },
        { validFrom: '2026-09-01', validTo: null }
      )
    ).toBe(false);
    expect(
      compensationSchemeRangesOverlap(
        { validFrom: '2026-08-01', validTo: null },
        { validFrom: '2026-09-01', validTo: '2026-09-30' }
      )
    ).toBe(true);
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
