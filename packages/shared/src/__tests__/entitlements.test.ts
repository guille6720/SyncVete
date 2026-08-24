import { describe, expect, it } from 'vitest';
import {
  FEATURES,
  COMMERCIAL_PLAN_KEYS,
  ONBOARDING_PLAN_KEY,
  ONBOARDING_TRIAL_DAYS,
  METERED_FEATURE_KEYS,
  SEAT_FEATURE_KEYS,
  PUBLIC_PRICING_PLAN_KEYS,
  SUPERADMIN_ASSIGNABLE_PLAN_KEYS,
  assertNotLegacyAutoAssign,
  canSuperadminAssignPlan,
  isAutoAssignableOnboardingPlan,
  isLegacyPlanKey,
  isMeteredFeatureKey,
  isSeatFeatureKey,
  isPublicPricingPlanKey,
  parseSuperadminEmails,
  validateUsageIncrementAmount,
  bytesToStorageMb,
  clinicalAiKindFeature,
  wouldExceedLimit,
  canUseResolvedFeature,
  getResolvedFeatureLimit,
  resolveFeatureEntitlement,
  resolveOrganizationEntitlements,
  getEntitledClinicHrefs,
  isClinicPathEntitled,
  formatMeteredUsage,
  quotaUsageLabel,
  findSeatDowngradeBlockers,
  formatSeatDowngradeMessage,
  formatSeatAssignmentMessage,
  utcMonthPeriod,
  isSubscriptionPeriodOpen,
  isTrialEndingSoon,
  isPeriodEndingSoon,
  isQuotaNearLimit,
  canCancelOwnSubscription,
  canCancelOwnAddon,
  canCheckoutAddonOffer,
  canRenewOwnPlan,
  resolveAddonOfferState,
  resolveCheckoutIntentAction,
  resolveClinicCommercialBanner,
  authorizeCronSecret,
  type EntitlementResolutionInput,
  type FeatureCatalogRow,
} from '../index';

const catalog: FeatureCatalogRow[] = [
  {
    key: FEATURES.AI,
    featureType: 'boolean',
    defaultEnabled: false,
    defaultLimit: null,
    isActive: true,
  },
  {
    key: FEATURES.INVENTORY,
    featureType: 'boolean',
    defaultEnabled: false,
    defaultLimit: null,
    isActive: true,
  },
  {
    key: FEATURES.AI_MONTHLY_REQUESTS,
    featureType: 'limit',
    defaultEnabled: true,
    defaultLimit: 0,
    isActive: true,
  },
  {
    key: FEATURES.USERS_MAX,
    featureType: 'limit',
    defaultEnabled: true,
    defaultLimit: 0,
    isActive: true,
  },
];

function baseInput(partial: Partial<EntitlementResolutionInput> = {}): EntitlementResolutionInput {
  return {
    features: catalog,
    planFeatures: [],
    overrides: [],
    hasActiveSubscription: true,
    ...partial,
  };
}

describe('resolveFeatureEntitlement — plan access', () => {
  it('enabled plan feature → true', () => {
    const resolved = resolveFeatureEntitlement(
      FEATURES.AI,
      baseInput({
        planFeatures: [{ featureKey: FEATURES.AI, enabled: true, limitValue: null }],
      })
    );
    expect(resolved.enabled).toBe(true);
    expect(resolved.source).toBe('plan');
  });

  it('disabled plan feature → false', () => {
    const resolved = resolveFeatureEntitlement(
      FEATURES.AI,
      baseInput({
        planFeatures: [{ featureKey: FEATURES.AI, enabled: false, limitValue: null }],
      })
    );
    expect(resolved.enabled).toBe(false);
    expect(resolved.source).toBe('plan');
  });
});

describe('resolveFeatureEntitlement — overrides', () => {
  it('plan false + override true → true', () => {
    const resolved = resolveFeatureEntitlement(
      FEATURES.AI,
      baseInput({
        planFeatures: [{ featureKey: FEATURES.AI, enabled: false, limitValue: null }],
        overrides: [
          {
            featureKey: FEATURES.AI,
            enabled: true,
            limitValue: null,
            startsAt: null,
            endsAt: null,
          },
        ],
      })
    );
    expect(resolved.enabled).toBe(true);
    expect(resolved.source).toBe('override');
  });

  it('plan true + override false → false', () => {
    const resolved = resolveFeatureEntitlement(
      FEATURES.AI,
      baseInput({
        planFeatures: [{ featureKey: FEATURES.AI, enabled: true, limitValue: null }],
        overrides: [
          {
            featureKey: FEATURES.AI,
            enabled: false,
            limitValue: null,
            startsAt: null,
            endsAt: null,
          },
        ],
      })
    );
    expect(resolved.enabled).toBe(false);
    expect(resolved.source).toBe('override');
  });
});

describe('resolveFeatureEntitlement — limits', () => {
  it('plan 100 → 100', () => {
    const resolved = resolveFeatureEntitlement(
      FEATURES.AI_MONTHLY_REQUESTS,
      baseInput({
        planFeatures: [
          { featureKey: FEATURES.AI_MONTHLY_REQUESTS, enabled: true, limitValue: 100 },
        ],
      })
    );
    expect(resolved.enabled).toBe(true);
    expect(resolved.limit).toBe(100);
  });

  it('override 500 → 500', () => {
    const resolved = resolveFeatureEntitlement(
      FEATURES.AI_MONTHLY_REQUESTS,
      baseInput({
        planFeatures: [
          { featureKey: FEATURES.AI_MONTHLY_REQUESTS, enabled: true, limitValue: 100 },
        ],
        overrides: [
          {
            featureKey: FEATURES.AI_MONTHLY_REQUESTS,
            enabled: true,
            limitValue: 500,
            startsAt: null,
            endsAt: null,
          },
        ],
      })
    );
    expect(resolved.limit).toBe(500);
    expect(resolved.source).toBe('override');
  });

  it('unlimited → null', () => {
    const resolved = resolveFeatureEntitlement(
      FEATURES.USERS_MAX,
      baseInput({
        planFeatures: [{ featureKey: FEATURES.USERS_MAX, enabled: true, limitValue: null }],
      })
    );
    expect(resolved.enabled).toBe(true);
    expect(resolved.limit).toBeNull();
  });

  it('disabled → 0', () => {
    const resolved = resolveFeatureEntitlement(
      FEATURES.USERS_MAX,
      baseInput({
        planFeatures: [{ featureKey: FEATURES.USERS_MAX, enabled: false, limitValue: 10 }],
      })
    );
    expect(resolved.enabled).toBe(false);
    expect(resolved.limit).toBe(0);
    expect(getResolvedFeatureLimit({ [FEATURES.USERS_MAX]: resolved }, FEATURES.USERS_MAX)).toBe(0);
  });
});

describe('resolveFeatureEntitlement — add-ons', () => {
  it('plan false + add-on true → add-on', () => {
    const resolved = resolveFeatureEntitlement(
      FEATURES.AI,
      baseInput({
        planFeatures: [{ featureKey: FEATURES.AI, enabled: false, limitValue: null }],
        addonFeatures: [{ featureKey: FEATURES.AI, enabled: true, limitValue: null }],
      })
    );
    expect(resolved.enabled).toBe(true);
    expect(resolved.source).toBe('addon');
  });

  it('override false beats add-on', () => {
    const resolved = resolveFeatureEntitlement(
      FEATURES.AI,
      baseInput({
        planFeatures: [{ featureKey: FEATURES.AI, enabled: false, limitValue: null }],
        addonFeatures: [{ featureKey: FEATURES.AI, enabled: true, limitValue: null }],
        overrides: [
          {
            featureKey: FEATURES.AI,
            enabled: false,
            limitValue: null,
            startsAt: null,
            endsAt: null,
          },
        ],
      })
    );
    expect(resolved.enabled).toBe(false);
    expect(resolved.source).toBe('override');
  });

  it('add-on raises a plan limit', () => {
    const resolved = resolveFeatureEntitlement(
      FEATURES.AI_MONTHLY_REQUESTS,
      baseInput({
        planFeatures: [
          { featureKey: FEATURES.AI_MONTHLY_REQUESTS, enabled: true, limitValue: 100 },
        ],
        addonFeatures: [
          { featureKey: FEATURES.AI_MONTHLY_REQUESTS, enabled: true, limitValue: 500 },
        ],
      })
    );
    expect(resolved.enabled).toBe(true);
    expect(resolved.limit).toBe(500);
    expect(resolved.source).toBe('addon');
  });

  it('plan unlimited beats a smaller add-on limit', () => {
    const resolved = resolveFeatureEntitlement(
      FEATURES.AI_MONTHLY_REQUESTS,
      baseInput({
        planFeatures: [
          { featureKey: FEATURES.AI_MONTHLY_REQUESTS, enabled: true, limitValue: null },
        ],
        addonFeatures: [
          { featureKey: FEATURES.AI_MONTHLY_REQUESTS, enabled: true, limitValue: 100 },
        ],
      })
    );
    expect(resolved.limit).toBeNull();
    expect(resolved.source).toBe('plan');
  });

  it('add-on unlimited raises a plan cap', () => {
    const resolved = resolveFeatureEntitlement(
      FEATURES.AI_MONTHLY_REQUESTS,
      baseInput({
        planFeatures: [
          { featureKey: FEATURES.AI_MONTHLY_REQUESTS, enabled: true, limitValue: 100 },
        ],
        addonFeatures: [
          { featureKey: FEATURES.AI_MONTHLY_REQUESTS, enabled: true, limitValue: null },
        ],
      })
    );
    expect(resolved.limit).toBeNull();
    expect(resolved.source).toBe('addon');
  });

  it('expired subscription ignores add-ons', () => {
    const resolved = resolveFeatureEntitlement(
      FEATURES.AI,
      baseInput({
        hasActiveSubscription: false,
        addonFeatures: [{ featureKey: FEATURES.AI, enabled: true, limitValue: null }],
      })
    );
    expect(resolved.enabled).toBe(false);
    expect(resolved.source).toBe('deny');
  });
});

describe('resolveFeatureEntitlement — temporary overrides', () => {
  const now = new Date('2026-08-17T12:00:00.000Z');

  it('active window → applied', () => {
    const resolved = resolveFeatureEntitlement(
      FEATURES.WHATSAPP,
      baseInput({
        now,
        features: [
          ...catalog,
          {
            key: FEATURES.WHATSAPP,
            featureType: 'boolean',
            defaultEnabled: false,
            defaultLimit: null,
            isActive: true,
          },
        ],
        planFeatures: [{ featureKey: FEATURES.WHATSAPP, enabled: false, limitValue: null }],
        overrides: [
          {
            featureKey: FEATURES.WHATSAPP,
            enabled: true,
            limitValue: null,
            startsAt: '2026-08-01T00:00:00.000Z',
            endsAt: '2026-09-01T00:00:00.000Z',
          },
        ],
      })
    );
    expect(resolved.enabled).toBe(true);
    expect(resolved.source).toBe('override');
  });

  it('expired → ignored (falls back to plan)', () => {
    const resolved = resolveFeatureEntitlement(
      FEATURES.WHATSAPP,
      baseInput({
        now,
        features: [
          ...catalog,
          {
            key: FEATURES.WHATSAPP,
            featureType: 'boolean',
            defaultEnabled: false,
            defaultLimit: null,
            isActive: true,
          },
        ],
        planFeatures: [{ featureKey: FEATURES.WHATSAPP, enabled: false, limitValue: null }],
        overrides: [
          {
            featureKey: FEATURES.WHATSAPP,
            enabled: true,
            limitValue: null,
            startsAt: '2026-07-01T00:00:00.000Z',
            endsAt: '2026-08-01T00:00:00.000Z',
          },
        ],
      })
    );
    expect(resolved.enabled).toBe(false);
    expect(resolved.source).toBe('plan');
  });

  it('future → ignored until starts_at', () => {
    const resolved = resolveFeatureEntitlement(
      FEATURES.WHATSAPP,
      baseInput({
        now,
        features: [
          ...catalog,
          {
            key: FEATURES.WHATSAPP,
            featureType: 'boolean',
            defaultEnabled: false,
            defaultLimit: null,
            isActive: true,
          },
        ],
        planFeatures: [{ featureKey: FEATURES.WHATSAPP, enabled: false, limitValue: null }],
        overrides: [
          {
            featureKey: FEATURES.WHATSAPP,
            enabled: true,
            limitValue: null,
            startsAt: '2026-09-01T00:00:00.000Z',
            endsAt: '2026-10-01T00:00:00.000Z',
          },
        ],
      })
    );
    expect(resolved.enabled).toBe(false);
    expect(resolved.source).toBe('plan');
  });
});

describe('resolveFeatureEntitlement — unknown / deny', () => {
  it('unknown feature → DENY', () => {
    const resolved = resolveFeatureEntitlement('totally.unknown', baseInput());
    expect(resolved).toEqual({ enabled: false, limit: 0, source: 'deny' });
  });

  it('no subscription and no default → DENY', () => {
    const resolved = resolveFeatureEntitlement(
      FEATURES.INVENTORY,
      baseInput({ hasActiveSubscription: false, planFeatures: [] })
    );
    expect(resolved.enabled).toBe(false);
    expect(resolved.source).toBe('deny');
  });
});

describe('resolveOrganizationEntitlements helpers', () => {
  it('builds map and canUse helpers', () => {
    const map = resolveOrganizationEntitlements(
      baseInput({
        planFeatures: [
          { featureKey: FEATURES.AI, enabled: true, limitValue: null },
          { featureKey: FEATURES.INVENTORY, enabled: false, limitValue: null },
        ],
      })
    );
    expect(canUseResolvedFeature(map, FEATURES.AI)).toBe(true);
    expect(canUseResolvedFeature(map, FEATURES.INVENTORY)).toBe(false);
  });
});

describe('onboarding / legacy safeguards', () => {
  it('legacy is never auto-assignable', () => {
    expect(isLegacyPlanKey(COMMERCIAL_PLAN_KEYS.LEGACY)).toBe(true);
    expect(isAutoAssignableOnboardingPlan(COMMERCIAL_PLAN_KEYS.LEGACY)).toBe(false);
    expect(() => assertNotLegacyAutoAssign(COMMERCIAL_PLAN_KEYS.LEGACY)).toThrow(/migration-only/);
  });

  it('new organizations use trial onboarding plan, not legacy', () => {
    expect(ONBOARDING_PLAN_KEY).toBe(COMMERCIAL_PLAN_KEYS.TRIAL);
    expect(ONBOARDING_PLAN_KEY).not.toBe(COMMERCIAL_PLAN_KEYS.LEGACY);
    expect(isAutoAssignableOnboardingPlan(COMMERCIAL_PLAN_KEYS.TRIAL)).toBe(true);
    expect(isAutoAssignableOnboardingPlan(COMMERCIAL_PLAN_KEYS.BASIC)).toBe(false);
  });

  it('trial duration is 10 days for new clinics', () => {
    expect(ONBOARDING_TRIAL_DAYS).toBe(10);
  });

  it('legacy and trial are excluded from public pricing selectors', () => {
    expect(PUBLIC_PRICING_PLAN_KEYS).not.toContain(COMMERCIAL_PLAN_KEYS.LEGACY);
    expect(PUBLIC_PRICING_PLAN_KEYS).not.toContain(COMMERCIAL_PLAN_KEYS.TRIAL);
    expect(isPublicPricingPlanKey(COMMERCIAL_PLAN_KEYS.LEGACY)).toBe(false);
    expect(isPublicPricingPlanKey(COMMERCIAL_PLAN_KEYS.TRIAL)).toBe(false);
    expect(isPublicPricingPlanKey(COMMERCIAL_PLAN_KEYS.BASIC)).toBe(true);
  });

  it('superadmin cannot assign legacy unless explicitly allowed', () => {
    expect(canSuperadminAssignPlan(COMMERCIAL_PLAN_KEYS.BASIC)).toBe(true);
    expect(canSuperadminAssignPlan(COMMERCIAL_PLAN_KEYS.TRIAL)).toBe(true);
    expect(canSuperadminAssignPlan(COMMERCIAL_PLAN_KEYS.LEGACY)).toBe(false);
    expect(canSuperadminAssignPlan(COMMERCIAL_PLAN_KEYS.LEGACY, true)).toBe(true);
    expect(SUPERADMIN_ASSIGNABLE_PLAN_KEYS).not.toContain(COMMERCIAL_PLAN_KEYS.LEGACY);
  });

  it('parses SUPERADMIN_EMAILS allowlist', () => {
    expect(parseSuperadminEmails('a@x.com, B@X.com; c@x.com')).toEqual([
      'a@x.com',
      'b@x.com',
      'c@x.com',
    ]);
    expect(parseSuperadminEmails('')).toEqual([]);
    expect(parseSuperadminEmails(undefined)).toEqual([]);
  });

  it('existing organization on legacy keeps currently available modules', () => {
    const map = resolveOrganizationEntitlements(
      baseInput({
        planFeatures: catalog.map((f) => ({
          featureKey: f.key,
          enabled: true,
          limitValue: null,
        })),
      })
    );
    expect(canUseResolvedFeature(map, FEATURES.AI)).toBe(true);
    expect(canUseResolvedFeature(map, FEATURES.INVENTORY)).toBe(true);
    expect(getResolvedFeatureLimit(map, FEATURES.USERS_MAX)).toBeNull();
  });

  it('new organization on trial/basic does not inherit unlimited legacy entitlements', () => {
    const trialLike: EntitlementResolutionInput = baseInput({
      planFeatures: [
        { featureKey: FEATURES.INVENTORY, enabled: false, limitValue: null },
        { featureKey: FEATURES.AI, enabled: false, limitValue: null },
        { featureKey: FEATURES.USERS_MAX, enabled: true, limitValue: 3 },
      ],
    });
    expect(resolveFeatureEntitlement(FEATURES.AI, trialLike).enabled).toBe(false);
    expect(resolveFeatureEntitlement(FEATURES.INVENTORY, trialLike).enabled).toBe(false);
    expect(getResolvedFeatureLimit(
      { [FEATURES.USERS_MAX]: resolveFeatureEntitlement(FEATURES.USERS_MAX, trialLike) },
      FEATURES.USERS_MAX
    )).toBe(3);
  });
});

describe('usage increment validation helpers', () => {
  it('accepts positive integer amounts only', () => {
    expect(validateUsageIncrementAmount(1)).toBe(true);
    expect(validateUsageIncrementAmount(10)).toBe(true);
    expect(validateUsageIncrementAmount(0)).toBe(false);
    expect(validateUsageIncrementAmount(-1)).toBe(false);
    expect(validateUsageIncrementAmount(1.5)).toBe(false);
    expect(validateUsageIncrementAmount(null)).toBe(false);
    expect(validateUsageIncrementAmount(undefined)).toBe(false);
  });

  it('documents metered feature keys', () => {
    expect(METERED_FEATURE_KEYS).toContain(FEATURES.AI_MONTHLY_REQUESTS);
    expect(METERED_FEATURE_KEYS).toContain(FEATURES.WHATSAPP_MONTHLY_MESSAGES);
    expect(METERED_FEATURE_KEYS).not.toContain(FEATURES.AI);
    expect(isMeteredFeatureKey(FEATURES.STORAGE_MAX_MB)).toBe(true);
    expect(isMeteredFeatureKey(FEATURES.AI)).toBe(false);
  });

  it('blocks a downgrade when occupancy already exceeds the target seats', () => {
    expect(SEAT_FEATURE_KEYS).toContain(FEATURES.USERS_MAX);
    expect(isSeatFeatureKey(FEATURES.PATIENTS_MAX)).toBe(true);
    expect(isSeatFeatureKey(FEATURES.AI_MONTHLY_REQUESTS)).toBe(false);
    const blockers = findSeatDowngradeBlockers({
      usedByKey: { 'users.max': 12, 'branches.max': 1, 'patients.max': 10 },
      targetLimits: { 'users.max': 3, 'branches.max': 1, 'patients.max': null },
    });
    expect(blockers).toEqual([
      { featureKey: 'users.max', label: 'Usuarios', used: 12, limit: 3 },
    ]);
    expect(findSeatDowngradeBlockers({
      usedByKey: { 'users.max': 3 },
      targetLimits: { 'users.max': 3 },
    })).toEqual([]);
    expect(
      formatSeatDowngradeMessage(
        [{ featureKey: 'users.max', label: 'Usuarios', used: 12, limit: 3 }],
        'Basic'
      )
    ).toContain('Basic');
    expect(
      formatSeatAssignmentMessage(
        [{ featureKey: 'users.max', label: 'Usuarios', used: 12, limit: 3 }],
        'Basic'
      )
    ).toContain('Confirmá');
  });

  it('counts storage usage in whole megabytes', () => {
    expect(bytesToStorageMb(0)).toBe(0);
    expect(bytesToStorageMb(-1)).toBe(0);
    expect(bytesToStorageMb(1)).toBe(1);
    expect(bytesToStorageMb(1024 * 1024)).toBe(1);
    expect(bytesToStorageMb(1024 * 1024 + 1)).toBe(2);
  });

  it('maps clinical AI kinds to feature keys', () => {
    expect(clinicalAiKindFeature('patient_summary')).toBe(FEATURES.AI_PATIENT_SUMMARY);
    expect(clinicalAiKindFeature('soap_assist')).toBe(FEATURES.AI_SOAP_ASSISTANT);
    expect(clinicalAiKindFeature('owner_instructions')).toBe(FEATURES.AI_OWNER_INSTRUCTIONS);
  });

  it('wouldExceedLimit follows null/0/positive convention', () => {
    expect(wouldExceedLimit(100, 1, null)).toBe(false);
    expect(wouldExceedLimit(0, 1, 0)).toBe(true);
    expect(wouldExceedLimit(2, 1, 3)).toBe(false);
    expect(wouldExceedLimit(3, 1, 3)).toBe(true);
  });
});

describe('clinic nav entitlements', () => {
  it('hides unpurchased modules and keeps settings visible', () => {
    const entitlements = resolveOrganizationEntitlements(
      baseInput({
        features: [
          ...catalog,
          {
            key: FEATURES.WHATSAPP,
            featureType: 'boolean',
            defaultEnabled: false,
            defaultLimit: null,
            isActive: true,
          },
          {
            key: FEATURES.DASHBOARD,
            featureType: 'boolean',
            defaultEnabled: true,
            defaultLimit: null,
            isActive: true,
          },
        ],
        planFeatures: [
          { featureKey: FEATURES.DASHBOARD, enabled: true, limitValue: null },
          { featureKey: FEATURES.WHATSAPP, enabled: false, limitValue: 0 },
        ],
      })
    );

    const hrefs = getEntitledClinicHrefs(entitlements);
    expect(hrefs).toContain('/dashboard');
    expect(hrefs).toContain('/configuracion');
    expect(hrefs).not.toContain('/whatsapp');
    expect(isClinicPathEntitled('/whatsapp', hrefs)).toBe(false);
    expect(isClinicPathEntitled('/whatsapp/nuevo', hrefs)).toBe(false);
    expect(isClinicPathEntitled('/imagenes?patientId=abc', hrefs)).toBe(false);
    expect(isClinicPathEntitled('/internacion/nueva?patientId=abc', hrefs)).toBe(false);
    expect(isClinicPathEntitled('/configuracion', hrefs)).toBe(true);
    expect(isClinicPathEntitled('/pacientes/nuevo', hrefs)).toBe(false);
    expect(isClinicPathEntitled('/ruta-desconocida', hrefs)).toBe(true);
    expect(isClinicPathEntitled('/whatsapp', null)).toBe(true);
  });

  it('formats metered usage for the clinic UI', () => {
    expect(formatMeteredUsage({ featureKey: 'ai.monthly_requests', label: 'IA', used: 3, limit: 10 })).toBe(
      '3 / 10'
    );
    expect(formatMeteredUsage({ featureKey: 'storage.max_mb', label: 'Storage', used: 12, limit: null })).toBe(
      '12 MB / ilimitado'
    );
    expect(quotaUsageLabel('users.max')).toBe('Usuarios');
    expect(quotaUsageLabel('ai.monthly_requests')).toBe('IA clínica');
    expect(quotaUsageLabel('storage.max_mb')).toBe('Almacenamiento');
  });

  it('utcMonthPeriod uses UTC month bounds', () => {
    const period = utcMonthPeriod(new Date('2026-08-18T10:00:00.000Z'));
    expect(period.start).toBe('2026-08-01');
    expect(period.end).toBe('2026-08-31');
  });
});

describe('subscription period', () => {
  const now = new Date('2026-08-18T12:00:00.000Z');

  it('keeps open-ended trial and legacy active without end dates', () => {
    expect(
      isSubscriptionPeriodOpen({ status: 'trialing', trialEndsAt: null, endsAt: null, now })
    ).toBe(true);
    expect(
      isSubscriptionPeriodOpen({ status: 'active', trialEndsAt: null, endsAt: null, now })
    ).toBe(true);
  });

  it('closes trial and paid periods after their end timestamps', () => {
    expect(
      isSubscriptionPeriodOpen({
        status: 'trialing',
        trialEndsAt: '2026-08-01T00:00:00.000Z',
        now,
      })
    ).toBe(false);
    expect(
      isSubscriptionPeriodOpen({
        status: 'active',
        endsAt: '2026-08-17T00:00:00.000Z',
        now,
      })
    ).toBe(false);
    expect(
      isSubscriptionPeriodOpen({
        status: 'past_due',
        endsAt: '2026-08-19T00:00:00.000Z',
        now,
      })
    ).toBe(true);
    expect(isSubscriptionPeriodOpen({ status: 'expired', now })).toBe(false);
  });
});

describe('commercial lifecycle helpers', () => {
  const now = new Date('2026-08-18T12:00:00.000Z');

  it('reminds only when trial_ends_at is within the lead window', () => {
    expect(isTrialEndingSoon({ trialEndsAt: null, now })).toBe(false);
    expect(isTrialEndingSoon({ trialEndsAt: '2026-08-18T11:00:00.000Z', now })).toBe(false);
    expect(isTrialEndingSoon({ trialEndsAt: '2026-08-20T12:00:00.000Z', now })).toBe(true);
    expect(isTrialEndingSoon({ trialEndsAt: '2026-09-18T12:00:00.000Z', now })).toBe(false);
  });

  it('warns at 80% of a finite quota and ignores unlimited or zero', () => {
    expect(isQuotaNearLimit({ used: 8, limit: 10 })).toBe(true);
    expect(isQuotaNearLimit({ used: 7, limit: 10 })).toBe(false);
    expect(isQuotaNearLimit({ used: 100, limit: null })).toBe(false);
    expect(isQuotaNearLimit({ used: 1, limit: 0 })).toBe(false);
  });

  it('allows clinic cancel except legacy', () => {
    expect(canCancelOwnSubscription({ planKey: 'pro', status: 'active' })).toBe(true);
    expect(canCancelOwnSubscription({ planKey: 'trial', status: 'trialing' })).toBe(true);
    expect(canCancelOwnSubscription({ planKey: 'legacy', status: 'active' })).toBe(false);
    expect(canCancelOwnSubscription({ planKey: 'basic', status: 'expired' })).toBe(false);
  });

  it('offers add-on checkout only on a commercial plan that does not already include the feature', () => {
    expect(
      resolveAddonOfferState({
        planKey: 'basic',
        subscriptionOpen: true,
        addonActive: false,
        primaryFeatureEnabled: false,
      })
    ).toBe('available');
    expect(
      resolveAddonOfferState({
        planKey: 'premium',
        subscriptionOpen: true,
        addonActive: false,
        primaryFeatureEnabled: true,
      })
    ).toBe('included');
    expect(
      resolveAddonOfferState({
        planKey: 'basic',
        subscriptionOpen: true,
        addonActive: true,
        primaryFeatureEnabled: true,
      })
    ).toBe('active');
    expect(
      resolveAddonOfferState({
        planKey: 'legacy',
        subscriptionOpen: true,
        addonActive: false,
        primaryFeatureEnabled: false,
      })
    ).toBe('included');
    expect(
      resolveAddonOfferState({
        planKey: 'basic',
        subscriptionOpen: false,
        addonActive: false,
        primaryFeatureEnabled: false,
      })
    ).toBe('blocked');
    expect(canCancelOwnAddon({ status: 'active' })).toBe(true);
    expect(canCancelOwnAddon({ status: 'cancelled' })).toBe(false);
    expect(canCheckoutAddonOffer('available')).toBe(true);
    expect(canCheckoutAddonOffer('active')).toBe(true);
    expect(canCheckoutAddonOffer('included')).toBe(false);
    expect(canCheckoutAddonOffer('blocked')).toBe(false);
    expect(
      canRenewOwnPlan({ planKey: 'pro', status: 'active', endsAt: '2026-09-18T12:00:00.000Z' })
    ).toBe(true);
    expect(canRenewOwnPlan({ planKey: 'pro', status: 'active', endsAt: null })).toBe(false);
    expect(canRenewOwnPlan({ planKey: 'legacy', status: 'active', endsAt: '2026-09-18T12:00:00.000Z' })).toBe(
      false
    );
    expect(canRenewOwnPlan({ planKey: 'trial', status: 'trialing', endsAt: '2026-08-20T12:00:00.000Z' })).toBe(
      false
    );
  });

  it('reminds extras with ends_at in the lead window, not open-ended grants', () => {
    expect(isPeriodEndingSoon({ endsAt: null, now })).toBe(false);
    expect(isPeriodEndingSoon({ endsAt: '2026-08-20T12:00:00.000Z', now })).toBe(true);
    expect(isPeriodEndingSoon({ endsAt: '2026-09-18T12:00:00.000Z', now })).toBe(false);
    expect(isPeriodEndingSoon({ endsAt: '2026-08-18T11:00:00.000Z', now })).toBe(false);
  });

  it('shows plan/add-on ending banners after trial and payment problems', () => {
    expect(
      resolveClinicCommercialBanner({
        hasOpenSubscription: false,
        latestClosedStatus: 'expired',
        latestClosedPlanName: 'Pro',
        endsAt: '2026-08-20T12:00:00.000Z',
        now,
      })?.kind
    ).toBe('expired');
    expect(
      resolveClinicCommercialBanner({
        hasOpenSubscription: true,
        status: 'past_due',
        planKey: 'pro',
        planName: 'Pro',
        endsAt: '2026-08-20T12:00:00.000Z',
        now,
      })?.kind
    ).toBe('past_due');
    expect(
      resolveClinicCommercialBanner({
        hasOpenSubscription: true,
        status: 'trialing',
        planKey: 'trial',
        trialEndsAt: '2026-08-20T12:00:00.000Z',
        now,
      })?.kind
    ).toBe('trial');
    expect(
      resolveClinicCommercialBanner({
        hasOpenSubscription: true,
        status: 'active',
        planKey: 'pro',
        planName: 'Pro',
        endsAt: '2026-08-20T12:00:00.000Z',
        now,
      })
    ).toEqual({
      kind: 'plan_ending',
      planName: 'Pro',
      trialEndsAt: null,
      endsAt: '2026-08-20T12:00:00.000Z',
      addonName: null,
    });
    expect(
      resolveClinicCommercialBanner({
        hasOpenSubscription: true,
        status: 'active',
        planKey: 'legacy',
        endsAt: '2026-08-20T12:00:00.000Z',
        now,
      })
    ).toBeNull();
    expect(
      resolveClinicCommercialBanner({
        hasOpenSubscription: true,
        status: 'active',
        planKey: 'basic',
        endsAt: '2026-09-18T12:00:00.000Z',
        addonsEnding: [{ name: 'IA clínica', endsAt: '2026-08-20T12:00:00.000Z' }],
        now,
      })
    ).toMatchObject({ kind: 'addon_ending', addonName: 'IA clínica' });
    expect(
      resolveClinicCommercialBanner({
        hasOpenSubscription: true,
        status: 'active',
        planKey: 'pro',
        endsAt: '2026-08-20T12:00:00.000Z',
        addonsEnding: [{ name: 'IA clínica', endsAt: '2026-08-19T12:00:00.000Z' }],
        now,
      })?.kind
    ).toBe('plan_ending');
    expect(
      resolveClinicCommercialBanner({
        hasOpenSubscription: true,
        status: 'active',
        planKey: 'pro',
        planName: 'Pro',
        endsAt: '2026-08-20T12:00:00.000Z',
        checkoutPending: { kind: 'plan', targetKey: 'pro' },
        now,
      })?.kind
    ).toBe('checkout_pending');
    expect(
      resolveClinicCommercialBanner({
        hasOpenSubscription: false,
        latestClosedStatus: 'expired',
        checkoutPending: { kind: 'plan', targetKey: 'basic' },
        now,
      })?.kind
    ).toBe('checkout_pending');
    expect(
      resolveClinicCommercialBanner({
        hasOpenSubscription: true,
        status: 'active',
        planKey: 'pro',
        planName: 'Pro',
        endsAt: '2026-09-18T12:00:00.000Z',
        seats: [{ label: 'Usuarios', used: 6, limit: 5 }],
        now,
      })
    ).toMatchObject({
      kind: 'quota_over',
      quotaLabel: 'Usuarios',
      quotaUsed: 6,
      quotaLimit: 5,
    });
    expect(
      resolveClinicCommercialBanner({
        hasOpenSubscription: true,
        status: 'active',
        planKey: 'pro',
        endsAt: '2026-09-18T12:00:00.000Z',
        seats: [{ label: 'Usuarios', used: 8, limit: 10 }],
        now,
      })?.kind
    ).toBe('quota_near');
    expect(
      resolveClinicCommercialBanner({
        hasOpenSubscription: true,
        status: 'active',
        planKey: 'legacy',
        seats: [{ label: 'Usuarios', used: 20, limit: 5 }],
        now,
      })
    ).toBeNull();
    expect(
      resolveClinicCommercialBanner({
        hasOpenSubscription: true,
        status: 'active',
        planKey: 'pro',
        endsAt: '2026-08-20T12:00:00.000Z',
        seats: [{ label: 'Usuarios', used: 6, limit: 5 }],
        now,
      })?.kind
    ).toBe('plan_ending');
    expect(
      resolveClinicCommercialBanner({
        hasOpenSubscription: true,
        status: 'active',
        planKey: 'pro',
        endsAt: '2026-09-18T12:00:00.000Z',
        seats: [
          { featureKey: 'users.max', label: 'Usuarios', used: 8, limit: 10 },
          { featureKey: 'ai.monthly_requests', label: 'IA clínica', used: 120, limit: 100 },
        ],
        now,
      })
    ).toMatchObject({
      kind: 'quota_over',
      quotaLabel: 'IA clínica',
      quotaUsed: 120,
      quotaLimit: 100,
      quotaFeatureKey: 'ai.monthly_requests',
    });
  });

  it('reuses the same checkout and blocks a second plan payment', () => {
    expect(
      resolveCheckoutIntentAction({
        openIntents: [],
        kind: 'plan',
        targetKey: 'pro',
      })
    ).toBe('ok');
    expect(
      resolveCheckoutIntentAction({
        openIntents: [{ kind: 'plan', targetKey: 'pro' }],
        kind: 'plan',
        targetKey: 'pro',
      })
    ).toBe('reuse');
    expect(
      resolveCheckoutIntentAction({
        openIntents: [{ kind: 'plan', targetKey: 'pro' }],
        kind: 'plan',
        targetKey: 'basic',
      })
    ).toBe('blocked');
    expect(
      resolveCheckoutIntentAction({
        openIntents: [{ kind: 'plan', targetKey: 'pro' }],
        kind: 'addon',
        targetKey: 'addon.ai',
      })
    ).toBe('ok');
  });

  it('authorizes cron bearer without leaking unset secrets', () => {
    expect(authorizeCronSecret({ authorizationHeader: 'Bearer abc', secret: 'abc' })).toBe(true);
    expect(authorizeCronSecret({ cronSecretHeader: 'abc', secret: 'abc' })).toBe(true);
    expect(authorizeCronSecret({ authorizationHeader: 'Bearer xyz', secret: 'abc' })).toBe(false);
    expect(authorizeCronSecret({ authorizationHeader: 'Bearer abc', secret: '' })).toBe(false);
  });
});
