import { cache } from 'react';
import {
  FEATURES,
  canUseResolvedFeature,
  getEntitledClinicHrefs,
  getResolvedFeatureLimit,
  isSubscriptionPeriodOpen,
  resolveOrganizationEntitlements,
  resolveClinicCommercialBanner,
  validateUsageIncrementAmount,
  wouldExceedLimit,
  utcMonthPeriod,
  METERED_FEATURE_KEYS,
  METERED_USAGE_LABELS,
  SEAT_FEATURE_KEYS,
  SEAT_USAGE_LABELS,
  type ActionResult,
  type ClinicCommercialBanner,
  type FeatureCatalogRow,
  type FeatureKey,
  type FeatureOverrideRow,
  type MeteredUsageMeter,
  type SeatUsageMeter,
  type OrganizationEntitlements,
  type AddonFeatureRow,
  type PlanFeatureRow,
  type ResolvedEntitlement,
  type SubscriptionStatus,
} from '@sincvete/shared';
import { createServerClient } from '@/lib/supabase/server';

export class FeatureNotAvailableError extends Error {
  featureKey: string;
  constructor(
    featureKey: string,
    message = 'Esta función no está incluida en el plan actual de tu clínica'
  ) {
    super(message);
    this.name = 'FeatureNotAvailableError';
    this.featureKey = featureKey;
  }
}

export class FeatureQuotaExceededError extends Error {
  featureKey: string;
  constructor(featureKey: string, message = 'Alcanzaste el límite de tu plan para esta función') {
    super(message);
    this.name = 'FeatureQuotaExceededError';
    this.featureKey = featureKey;
  }
}

export function isPlanRestrictionError(
  error: unknown
): error is FeatureNotAvailableError | FeatureQuotaExceededError {
  return error instanceof FeatureNotAvailableError || error instanceof FeatureQuotaExceededError;
}

export function planRestrictionResult<T = void>(error: unknown): ActionResult<T> | null {
  if (isPlanRestrictionError(error)) {
    return { success: false, error: error.message };
  }
  return null;
}

type NestedFeature = { key: string } | { key: string }[] | null;

function isMissingDbObject(message: string | undefined): boolean {
  if (!message) return false;
  return /schema cache|does not exist|Could not find the (table|function)|relation .* does not exist/i.test(
    message
  );
}

function featureKeyFromJoin(features: NestedFeature): string | null {
  if (!features) return null;
  if (Array.isArray(features)) return features[0]?.key ?? null;
  return features.key ?? null;
}

/**
 * Load raw entitlement inputs for an organization (batched, no N+1).
 * Request-scoped via React.cache — never reuse across tenants.
 */
export const loadOrganizationEntitlementInput = cache(async (organizationId: string) => {
  const supabase = await createServerClient();
  // Subscription expiry is scheduled (service_role job) — never write on page reads.

  const [featuresRes, subscriptionRes, overridesRes, addonFeaturesRes] = await Promise.all([
    supabase
      .from('features')
      .select('key, feature_type, default_enabled, default_limit, is_active'),
    supabase
      .from('organization_subscriptions')
      .select('id, plan_id, status, cancelled_at, trial_ends_at, ends_at, plans(key, name)')
      .eq('organization_id', organizationId)
      .in('status', ['trialing', 'active', 'past_due'])
      .is('cancelled_at', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('organization_feature_overrides')
      .select('enabled, limit_value, starts_at, ends_at, features!inner(key)')
      .eq('organization_id', organizationId),
    supabase.rpc('list_own_addon_features'),
  ]);

  if (featuresRes.error) {
    if (isMissingDbObject(featuresRes.error.message)) {
      console.warn('[entitlements] catalog missing', featuresRes.error.message);
      return {
        schemaUnavailable: true,
        features: [],
        planFeatures: [],
        addonFeatures: [],
        overrides: [],
        hasActiveSubscription: false,
        planId: null,
        subscriptionStatus: null,
        planKey: null,
        planName: null,
        trialEndsAt: null,
        endsAt: null,
      };
    }
    throw new Error(`No se pudieron cargar features: ${featuresRes.error.message}`);
  }
  if (subscriptionRes.error) {
    if (isMissingDbObject(subscriptionRes.error.message)) {
      console.warn('[entitlements] subscriptions missing', subscriptionRes.error.message);
      return {
        schemaUnavailable: true,
        features: [],
        planFeatures: [],
        addonFeatures: [],
        overrides: [],
        hasActiveSubscription: false,
        planId: null,
        subscriptionStatus: null,
        planKey: null,
        planName: null,
        trialEndsAt: null,
        endsAt: null,
      };
    }
    throw new Error(`No se pudo cargar la suscripción: ${subscriptionRes.error.message}`);
  }
  if (overridesRes.error) {
    if (isMissingDbObject(overridesRes.error.message)) {
      console.warn('[entitlements] overrides missing', overridesRes.error.message);
    } else {
      throw new Error(`No se pudieron cargar overrides: ${overridesRes.error.message}`);
    }
  }
  if (addonFeaturesRes.error) {
    if (!isMissingDbObject(addonFeaturesRes.error.message)) {
      throw new Error(`No se pudieron cargar add-ons: ${addonFeaturesRes.error.message}`);
    }
    console.warn('[entitlements] add-ons missing', addonFeaturesRes.error.message);
  }

  const features: FeatureCatalogRow[] = (featuresRes.data ?? []).map((f) => ({
    key: f.key,
    featureType: f.feature_type,
    defaultEnabled: f.default_enabled,
    defaultLimit: f.default_limit === null ? null : Number(f.default_limit),
    isActive: f.is_active,
  }));

  const activeSub = subscriptionRes.data;
  const planJoin = activeSub?.plans as { key?: string; name?: string } | { key?: string; name?: string }[] | null;
  const planRow = Array.isArray(planJoin) ? planJoin[0] : planJoin;
  const periodOpen = isSubscriptionPeriodOpen({
    status: (activeSub?.status as SubscriptionStatus | undefined) ?? null,
    trialEndsAt: activeSub?.trial_ends_at ?? null,
    endsAt: activeSub?.ends_at ?? null,
  });
  const commerciallyActive = Boolean(activeSub) && periodOpen;
  let planFeatures: PlanFeatureRow[] = [];

  if (commerciallyActive && activeSub?.plan_id) {
    const { data: pfData, error: pfError } = await supabase
      .from('plan_features')
      .select('enabled, limit_value, features!inner(key)')
      .eq('plan_id', activeSub.plan_id);

    if (pfError) {
      throw new Error(`No se pudieron cargar plan_features: ${pfError.message}`);
    }

    planFeatures = (pfData ?? [])
      .map((row) => {
        const key = featureKeyFromJoin(row.features as NestedFeature);
        if (!key) return null;
        return {
          featureKey: key,
          enabled: row.enabled,
          limitValue: row.limit_value === null ? null : Number(row.limit_value),
        } satisfies PlanFeatureRow;
      })
      .filter((row): row is PlanFeatureRow => row !== null);
  }

  const overrides: FeatureOverrideRow[] = (overridesRes.data ?? [])
    .map((row) => {
      const key = featureKeyFromJoin(row.features as NestedFeature);
      if (!key) return null;
      return {
        featureKey: key,
        enabled: row.enabled,
        limitValue: row.limit_value === null ? null : Number(row.limit_value),
        startsAt: row.starts_at,
        endsAt: row.ends_at,
      } satisfies FeatureOverrideRow;
    })
    .filter((row): row is FeatureOverrideRow => row !== null);

  const addonFeatures: AddonFeatureRow[] = (addonFeaturesRes.data ?? []).map((row) => ({
    featureKey: row.feature_key,
    enabled: row.enabled,
    limitValue: row.limit_value === null ? null : Number(row.limit_value),
  }));

  return {
    schemaUnavailable: false,
    features,
    planFeatures,
    addonFeatures,
    overrides,
    hasActiveSubscription: commerciallyActive,
    planId: activeSub?.plan_id ?? null,
    subscriptionStatus: (activeSub?.status as SubscriptionStatus | undefined) ?? null,
    planKey: planRow?.key ?? null,
    planName: planRow?.name ?? null,
    trialEndsAt: activeSub?.trial_ends_at ?? null,
    endsAt: activeSub?.ends_at ?? null,
  };
});

export const getOrganizationEntitlements = cache(
  async (organizationId: string): Promise<OrganizationEntitlements> => {
    const input = await loadOrganizationEntitlementInput(organizationId);
    return resolveOrganizationEntitlements(input);
  }
);

export async function canUseFeature(params: {
  organizationId: string;
  featureKey: FeatureKey | string;
}): Promise<boolean> {
  const input = await loadOrganizationEntitlementInput(params.organizationId);
  if (input.schemaUnavailable) return true;
  return canUseResolvedFeature(resolveOrganizationEntitlements(input), params.featureKey);
}

/**
 * Limit convention:
 * - null = unlimited
 * - 0 = unavailable
 * - positive = maximum allowed
 */
export async function getFeatureLimit(params: {
  organizationId: string;
  featureKey: FeatureKey | string;
}): Promise<number | null> {
  const input = await loadOrganizationEntitlementInput(params.organizationId);
  if (input.schemaUnavailable) return null;
  return getResolvedFeatureLimit(resolveOrganizationEntitlements(input), params.featureKey);
}

export async function getMeteredUsageMeters(organizationId: string): Promise<MeteredUsageMeter[]> {
  const supabase = await createServerClient();
  const period = utcMonthPeriod();
  const [entitlements, usageRes] = await Promise.all([
    getOrganizationEntitlements(organizationId),
    supabase
      .from('feature_usage')
      .select('usage_count, features!inner(key)')
      .eq('organization_id', organizationId)
      .eq('period_start', period.start),
  ]);

  const usedByKey = new Map<string, number>();
  for (const row of usageRes.data ?? []) {
    const key = featureKeyFromJoin(row.features as NestedFeature);
    if (key) usedByKey.set(key, Number(row.usage_count) || 0);
  }

  return METERED_FEATURE_KEYS.map((featureKey) => ({
    featureKey,
    label: METERED_USAGE_LABELS[featureKey] ?? featureKey,
    used: usedByKey.get(featureKey) ?? 0,
    limit: getResolvedFeatureLimit(entitlements, featureKey),
  }));
}

export async function getSeatUsageMeters(organizationId: string): Promise<SeatUsageMeter[]> {
  const supabase = await createServerClient();
  const [entitlements, usageRes] = await Promise.all([
    getOrganizationEntitlements(organizationId),
    supabase.rpc('list_own_seat_usage'),
  ]);
  if (usageRes.error) {
    throw new Error(usageRes.error.message);
  }
  const usedByKey = new Map<string, number>();
  for (const row of usageRes.data ?? []) {
    usedByKey.set(row.feature_key, Number(row.used) || 0);
  }
  return SEAT_FEATURE_KEYS.map((featureKey) => ({
    featureKey,
    label: SEAT_USAGE_LABELS[featureKey] ?? featureKey,
    used: usedByKey.get(featureKey) ?? 0,
    limit: getResolvedFeatureLimit(entitlements, featureKey),
  }));
}

export async function getFeatureEntitlement(params: {
  organizationId: string;
  featureKey: FeatureKey | string;
}): Promise<ResolvedEntitlement> {
  const entitlements = await getOrganizationEntitlements(params.organizationId);
  return (
    entitlements[params.featureKey] ?? {
      enabled: false,
      limit: 0,
      source: 'deny',
    }
  );
}

export async function requireFeature(
  organizationId: string,
  featureKey: FeatureKey
): Promise<void> {
  const allowed = await canUseFeature({ organizationId, featureKey });
  if (!allowed) {
    throw new FeatureNotAvailableError(featureKey);
  }
}

/**
 * Preferred quota path for metered features:
 * resolve limit → try_consume_feature_usage (atomic check+increment).
 * Avoid separate "read usage then increment" in app code (race-prone).
 */
export async function tryConsumeFeatureUsage(params: {
  featureKey: FeatureKey;
  amount?: number;
  limit: number | null;
}): Promise<number | null> {
  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc('try_consume_feature_usage', {
    p_feature_key: params.featureKey,
    p_amount: params.amount ?? 1,
    p_limit: params.limit,
  });
  if (error) {
    throw new Error(error.message);
  }
  return data;
}

export async function consumeMeteredFeature(params: {
  organizationId: string;
  featureKey: FeatureKey;
  amount?: number;
  requireEnabled?: FeatureKey;
}): Promise<number> {
  if (params.requireEnabled) {
    await requireFeature(params.organizationId, params.requireEnabled);
  }
  const amount = params.amount ?? 1;
  if (!validateUsageIncrementAmount(amount)) {
    throw new Error('La cantidad de uso debe ser un entero positivo');
  }
  const limit = await getFeatureLimit({
    organizationId: params.organizationId,
    featureKey: params.featureKey,
  });
  if (limit === 0) {
    throw new FeatureNotAvailableError(params.featureKey);
  }
  const next = await tryConsumeFeatureUsage({
    featureKey: params.featureKey,
    amount,
    limit,
  });
  if (next === null) {
    throw new FeatureQuotaExceededError(params.featureKey);
  }
  return next;
}

export async function assertWithinLimit(params: {
  organizationId: string;
  featureKey: FeatureKey;
  currentCount: number;
  increment?: number;
}): Promise<void> {
  const increment = params.increment ?? 1;
  const limit = await getFeatureLimit({
    organizationId: params.organizationId,
    featureKey: params.featureKey,
  });
  if (wouldExceedLimit(params.currentCount, increment, limit)) {
    if (limit === 0) {
      throw new FeatureNotAvailableError(params.featureKey);
    }
    throw new FeatureQuotaExceededError(params.featureKey);
  }
}

export { FEATURES };

export type { ClinicCommercialBanner };

export type ClinicCommercialShell = {
  entitledHrefs: string[] | null;
  banner: ClinicCommercialBanner | null;
};

/**
 * CRITICAL path for clinic nav gating: entitled hrefs from plan/features/overrides.
 * Does not load checkout intents, usage meters, or marketing banner state.
 */
export const getClinicEntitledHrefs = cache(
  async (organizationId: string): Promise<string[] | null> => {
    try {
      const input = await loadOrganizationEntitlementInput(organizationId);
      if (input.schemaUnavailable) return null;
      return getEntitledClinicHrefs(resolveOrganizationEntitlements(input));
    } catch (error) {
      console.error('[entitlements] entitled hrefs failed open', error);
      return null;
    }
  }
);

/**
 * NON-CRITICAL commercial banner (checkout, closed plans, add-ons ending, quota).
 * Safe to defer relative to primary module content when streamed separately.
 */
export const getClinicCommercialBanner = cache(
  async (organizationId: string): Promise<ClinicCommercialBanner | null> => {
    try {
      const input = await loadOrganizationEntitlementInput(organizationId);
      if (input.schemaUnavailable) return null;

      const supabase = await createServerClient();
      const [intentsRes, latestRes, addonsRes] = await Promise.all([
        supabase.rpc('list_own_open_checkout_intents'),
        !input.hasActiveSubscription
          ? supabase
              .from('organization_subscriptions')
              .select('status, plans(name)')
              .eq('organization_id', organizationId)
              .order('created_at', { ascending: false })
              .limit(1)
              .maybeSingle()
          : Promise.resolve({ data: null, error: null }),
        supabase.rpc('list_own_addons'),
      ]);

      const openIntent = (intentsRes.data ?? []).find(
        (row) => row.kind === 'plan' || row.kind === 'addon'
      );
      const checkoutPending = openIntent
        ? { kind: openIntent.kind as 'plan' | 'addon', targetKey: openIntent.target_key }
        : null;

      let latestClosedStatus: 'expired' | 'cancelled' | null = null;
      let latestClosedPlanName: string | null = null;
      const latestData = latestRes.data;
      if (latestData?.status === 'expired' || latestData?.status === 'cancelled') {
        const latestJoin = latestData.plans as { name?: string } | { name?: string }[] | null;
        const latestPlan = Array.isArray(latestJoin) ? latestJoin[0] : latestJoin;
        latestClosedStatus = latestData.status;
        latestClosedPlanName = latestPlan?.name ?? input.planName;
      }

      const addonsEnding = (addonsRes.data ?? [])
        .filter((row) => row.status === 'active' && row.ends_at)
        .map((row) => ({ name: row.addon_name, endsAt: row.ends_at as string }));

      const bannerInput = {
        hasOpenSubscription: input.hasActiveSubscription,
        status: input.subscriptionStatus,
        planKey: input.planKey,
        planName: input.planName,
        trialEndsAt: input.trialEndsAt,
        endsAt: input.endsAt,
        latestClosedStatus,
        latestClosedPlanName,
        checkoutPending,
        addonsEnding,
      };

      const early = resolveClinicCommercialBanner(bannerInput);
      if (early) return early;

      try {
        const [seats, meters] = await Promise.all([
          getSeatUsageMeters(organizationId).catch((error) => {
            console.error('[entitlements] seat meters failed open', error);
            return [];
          }),
          getMeteredUsageMeters(organizationId).catch((error) => {
            console.error('[entitlements] metered meters failed open', error);
            return [];
          }),
        ]);
        return resolveClinicCommercialBanner({
          ...bannerInput,
          seats: [...seats, ...meters],
        });
      } catch (error) {
        console.error('[entitlements] quota banner failed open', error);
        return null;
      }
    } catch (error) {
      console.error('[entitlements] commercial banner failed open', error);
      return null;
    }
  }
);

export const getClinicCommercialShell = cache(
  async (organizationId: string): Promise<ClinicCommercialShell> => {
    const [entitledHrefs, banner] = await Promise.all([
      getClinicEntitledHrefs(organizationId),
      getClinicCommercialBanner(organizationId),
    ]);
    return { entitledHrefs, banner };
  }
);
