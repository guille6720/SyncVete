import { describe, expect, it } from 'vitest';
import {
  FEATURES,
  COMMERCIAL_PLAN_KEYS,
  computePlanRecommendation,
  comparePlanFeatures,
  formatRecommendationsCsv,
  PLAN_USAGE_THRESHOLDS,
  type FeatureGrantSnapshot,
  type PlanRecommendationInput,
} from '../index';

const planIncludesFeature: PlanRecommendationInput['planIncludesFeature'] = {
  basic: [FEATURES.PATIENTS, FEATURES.APPOINTMENTS, FEATURES.CONSULTATIONS],
  pro: [
    FEATURES.INVENTORY,
    FEATURES.HOSPITALIZATION,
    FEATURES.BILLING,
    FEATURES.LABORATORY,
    FEATURES.PHARMACY,
    FEATURES.CASH_REGISTER,
    FEATURES.OWNER_PORTAL,
    FEATURES.BASIC_REPORTS,
    FEATURES.PATIENTS,
  ],
  premium: [
    FEATURES.AI,
    FEATURES.WHATSAPP,
    FEATURES.CLINICAL_IMAGES,
    FEATURES.ADVANCED_REPORTS,
    FEATURES.INVENTORY,
    FEATURES.BILLING,
  ],
  enterprise: [
    FEATURES.AI,
    FEATURES.WHATSAPP,
    FEATURES.INVENTORY,
    FEATURES.BILLING,
    FEATURES.USERS_MAX,
  ],
};

const planLimits: PlanRecommendationInput['planLimits'] = {
  basic: {
    [FEATURES.USERS_MAX]: 3,
    [FEATURES.PATIENTS_MAX]: 500,
  },
  pro: {
    [FEATURES.USERS_MAX]: 10,
    [FEATURES.PATIENTS_MAX]: 5000,
  },
  premium: {
    [FEATURES.USERS_MAX]: 25,
    [FEATURES.PATIENTS_MAX]: null,
    [FEATURES.AI_MONTHLY_REQUESTS]: 500,
  },
  enterprise: {
    [FEATURES.USERS_MAX]: null,
    [FEATURES.PATIENTS_MAX]: null,
    [FEATURES.AI_MONTHLY_REQUESTS]: null,
  },
};

function denyAll(keys: string[]): FeatureGrantSnapshot[] {
  return keys.map((featureKey) => ({ featureKey, enabled: false, source: 'deny' as const }));
}

function baseInput(
  overrides: Partial<PlanRecommendationInput> = {}
): PlanRecommendationInput {
  return {
    organizationId: 'org-1',
    currentPlanKey: COMMERCIAL_PLAN_KEYS.BASIC,
    subscriptionStatus: 'active',
    seats: [
      { featureKey: FEATURES.USERS_MAX, label: 'Usuarios', used: 1, limit: 3 },
      { featureKey: FEATURES.BRANCHES_MAX, label: 'Sucursales', used: 1, limit: 1 },
      { featureKey: FEATURES.PROFESSIONALS_MAX, label: 'Veterinarios', used: 1, limit: 3 },
      { featureKey: FEATURES.PATIENTS_MAX, label: 'Pacientes', used: 10, limit: 500 },
    ],
    meters: [],
    grants: denyAll([FEATURES.INVENTORY, FEATURES.AI, FEATURES.BILLING, FEATURES.HOSPITALIZATION]),
    activity: [],
    accessAttempts: [],
    planIncludesFeature,
    planLimits,
    ...overrides,
  };
}

describe('computePlanRecommendation', () => {
  it('Trial + no activity → no paid recommendation', () => {
    const result = computePlanRecommendation(
      baseInput({ currentPlanKey: COMMERCIAL_PLAN_KEYS.TRIAL, activity: [] })
    );
    expect(result.recommendedPlan).toBeNull();
    expect(result.shouldRecommendUpgrade).toBe(false);
  });

  it('Basic + basic activity → no recommendation', () => {
    const result = computePlanRecommendation(
      baseInput({
        grants: [
          { featureKey: FEATURES.PATIENTS, enabled: true, source: 'plan' },
          { featureKey: FEATURES.INVENTORY, enabled: false, source: 'deny' },
        ],
        activity: [{ featureKey: FEATURES.PATIENTS, active: true }],
      })
    );
    expect(result.recommendedPlan).toBeNull();
    expect(result.shouldRecommendUpgrade).toBe(false);
  });

  it('Basic + inventory use → recommend Pro', () => {
    const result = computePlanRecommendation(
      baseInput({
        activity: [{ featureKey: FEATURES.INVENTORY, active: true }],
      })
    );
    expect(result.recommendedPlan).toBe('pro');
    expect(result.shouldRecommendUpgrade).toBe(true);
    expect(result.reasons.some((r) => /inventario/i.test(r))).toBe(true);
  });

  it('Basic + 90% patient limit → recommend Pro', () => {
    const result = computePlanRecommendation(
      baseInput({
        seats: [
          { featureKey: FEATURES.USERS_MAX, label: 'Usuarios', used: 1, limit: 3 },
          { featureKey: FEATURES.BRANCHES_MAX, label: 'Sucursales', used: 1, limit: 1 },
          { featureKey: FEATURES.PROFESSIONALS_MAX, label: 'Veterinarios', used: 1, limit: 3 },
          { featureKey: FEATURES.PATIENTS_MAX, label: 'Pacientes', used: 450, limit: 500 },
        ],
      })
    );
    expect(result.usageLevel).toBeGreaterThanOrEqual(PLAN_USAGE_THRESHOLDS.warning);
    expect(result.recommendedPlan).toBe('pro');
    expect(result.shouldRecommendUpgrade).toBe(true);
  });

  it('Pro + hospitalization entitled → no recommendation', () => {
    const result = computePlanRecommendation(
      baseInput({
        currentPlanKey: COMMERCIAL_PLAN_KEYS.PRO,
        grants: [{ featureKey: FEATURES.HOSPITALIZATION, enabled: true, source: 'plan' }],
        activity: [{ featureKey: FEATURES.HOSPITALIZATION, active: true }],
      })
    );
    expect(result.recommendedPlan).toBeNull();
  });

  it('Pro + AI requirement → recommend Premium', () => {
    const result = computePlanRecommendation(
      baseInput({
        currentPlanKey: COMMERCIAL_PLAN_KEYS.PRO,
        grants: [{ featureKey: FEATURES.AI, enabled: false, source: 'deny' }],
        activity: [{ featureKey: FEATURES.AI, active: true }],
      })
    );
    expect(result.recommendedPlan).toBe('premium');
  });

  it('Pro + AI override already granted → no Premium solely because of AI', () => {
    const result = computePlanRecommendation(
      baseInput({
        currentPlanKey: COMMERCIAL_PLAN_KEYS.PRO,
        grants: [{ featureKey: FEATURES.AI, enabled: true, source: 'override' }],
        activity: [{ featureKey: FEATURES.AI, active: true }],
      })
    );
    expect(result.recommendedPlan).toBeNull();
  });

  it('Basic + Inventory override → no Pro solely because of inventory', () => {
    const result = computePlanRecommendation(
      baseInput({
        grants: [{ featureKey: FEATURES.INVENTORY, enabled: true, source: 'override' }],
        activity: [{ featureKey: FEATURES.INVENTORY, active: true }],
      })
    );
    expect(result.recommendedPlan).toBeNull();
  });

  it('Premium + multiple branches + extreme usage → Enterprise', () => {
    const result = computePlanRecommendation(
      baseInput({
        currentPlanKey: COMMERCIAL_PLAN_KEYS.PREMIUM,
        seats: [
          { featureKey: FEATURES.USERS_MAX, label: 'Usuarios', used: 22, limit: 25 },
          { featureKey: FEATURES.BRANCHES_MAX, label: 'Sucursales', used: 4, limit: 10 },
          { featureKey: FEATURES.PROFESSIONALS_MAX, label: 'Veterinarios', used: 10, limit: 25 },
          { featureKey: FEATURES.PATIENTS_MAX, label: 'Pacientes', used: 100, limit: null },
        ],
        meters: [
          { featureKey: FEATURES.AI_MONTHLY_REQUESTS, label: 'IA', used: 500, limit: 500 },
        ],
      })
    );
    expect(result.recommendedPlan).toBe('enterprise');
  });

  it('Legacy → manual review only', () => {
    const result = computePlanRecommendation(
      baseInput({
        currentPlanKey: COMMERCIAL_PLAN_KEYS.LEGACY,
        activity: [{ featureKey: FEATURES.INVENTORY, active: true }],
      })
    );
    expect(result.recommendedPlan).toBeNull();
    expect(result.upgradeStatus).toBe('legacy_review');
    expect(result.shouldRecommendUpgrade).toBe(false);
  });

  it('never recommends a downgrade', () => {
    const result = computePlanRecommendation(
      baseInput({
        currentPlanKey: COMMERCIAL_PLAN_KEYS.PREMIUM,
        activity: [{ featureKey: FEATURES.INVENTORY, active: true }],
        grants: [{ featureKey: FEATURES.INVENTORY, enabled: false, source: 'deny' }],
      })
    );
    expect(result.recommendedPlan).not.toBe('pro');
    expect(result.recommendedPlan).not.toBe('basic');
  });

  it('dismissed recommendation stays dismissed until material change', () => {
    const first = computePlanRecommendation(
      baseInput({
        activity: [{ featureKey: FEATURES.INVENTORY, active: true }],
      })
    );
    const dismissed = computePlanRecommendation(
      baseInput({
        activity: [{ featureKey: FEATURES.INVENTORY, active: true }],
        persisted: {
          status: 'dismissed',
          recommendedPlanKey: first.recommendedPlan,
          fingerprint: first.fingerprint,
          dismissedAt: new Date().toISOString(),
          maxUsageRatioAtDismiss: first.usageLevel,
        },
      })
    );
    expect(dismissed.status).toBe('dismissed');
    expect(dismissed.shouldRecommendUpgrade).toBe(false);

    const reopened = computePlanRecommendation(
      baseInput({
        activity: [
          { featureKey: FEATURES.INVENTORY, active: true },
          { featureKey: FEATURES.AI, active: true },
        ],
        persisted: {
          status: 'dismissed',
          recommendedPlanKey: first.recommendedPlan,
          fingerprint: first.fingerprint,
          dismissedAt: new Date().toISOString(),
          maxUsageRatioAtDismiss: first.usageLevel,
        },
      })
    );
    expect(reopened.recommendedPlan).toBe('premium');
    expect(reopened.status).toBe('recommended');
  });
});

describe('comparePlanFeatures', () => {
  it('shows gained features and limit changes from catalog rows', () => {
    const result = comparePlanFeatures({
      currentPlanKey: 'basic',
      targetPlanKey: 'pro',
      featureNames: {
        [FEATURES.INVENTORY]: 'Inventario',
        [FEATURES.USERS_MAX]: 'Usuarios',
      },
      currentFeatures: [
        { featureKey: FEATURES.INVENTORY, enabled: false, limitValue: null },
        { featureKey: FEATURES.USERS_MAX, enabled: true, limitValue: 3 },
      ],
      targetFeatures: [
        { featureKey: FEATURES.INVENTORY, enabled: true, limitValue: null },
        { featureKey: FEATURES.USERS_MAX, enabled: true, limitValue: 10 },
      ],
    });
    expect(result.gained).toContain('Inventario');
    expect(result.limitChanges.some((c) => c.label === 'Usuarios' && c.from === '3' && c.to === '10')).toBe(
      true
    );
  });
});

describe('formatRecommendationsCsv', () => {
  it('escapes commas and quotes in clinic names', () => {
    const csv = formatRecommendationsCsv([
      {
        clinicName: 'Clínica "BMW", Norte',
        slug: 'bmw',
        ownerName: null,
        currentPlan: 'basic',
        subscriptionStatus: 'active',
        usersUsed: 2,
        branchesUsed: 1,
        patientsUsed: 40,
        usageLevel: 0.82,
        recommendedPlan: 'pro',
        upgradeStatus: 'near_limit',
        severity: 'warning',
        reasons: ['Uso alto', 'Inventario'],
      },
    ]);
    expect(csv).toContain('"Clínica ""BMW"", Norte"');
    expect(csv).toContain('bmw');
    expect(csv.split('\n')[0]).toContain('recommended_plan');
  });
});
