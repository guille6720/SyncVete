import type { FeatureKey } from '../constants/features';
import { isFeatureKey, isLimitFeatureKey } from '../constants/features';

export type EntitlementSource = 'override' | 'addon' | 'plan' | 'default' | 'deny';

export type SubscriptionStatus = 'trialing' | 'active' | 'past_due' | 'cancelled' | 'expired';

export interface FeatureCatalogRow {
  key: string;
  featureType: 'boolean' | 'limit';
  defaultEnabled: boolean;
  defaultLimit: number | null;
  isActive: boolean;
}

export interface PlanFeatureRow {
  featureKey: string;
  enabled: boolean;
  /** null = unlimited for limit features */
  limitValue: number | null;
}

/** Same shape as plan features; add-ons only grant or raise limits. */
export type AddonFeatureRow = PlanFeatureRow;

export interface FeatureOverrideRow {
  featureKey: string;
  enabled: boolean | null;
  limitValue: number | null;
  startsAt: string | null;
  endsAt: string | null;
}

export interface ResolvedEntitlement {
  enabled: boolean;
  /**
   * Limit convention:
   * - null = unlimited (when enabled)
   * - 0 = unavailable / no quota
   * - positive = maximum allowed
   */
  limit: number | null;
  source: EntitlementSource;
}

export type OrganizationEntitlements = Record<string, ResolvedEntitlement>;

export interface EntitlementResolutionInput {
  now?: Date;
  features: FeatureCatalogRow[];
  planFeatures: PlanFeatureRow[];
  addonFeatures?: AddonFeatureRow[];
  overrides: FeatureOverrideRow[];
  /** When false/missing active subscription, add-ons are ignored; only defaults then deny */
  hasActiveSubscription: boolean;
  /** App-only: entitlements schema/RPCs missing — fail open in clinic shell. */
  schemaUnavailable?: boolean;
  planId?: string | null;
  subscriptionStatus?: SubscriptionStatus | null;
  planKey?: string | null;
  planName?: string | null;
  trialEndsAt?: string | null;
  endsAt?: string | null;
}

function isOverrideActive(row: FeatureOverrideRow, now: Date): boolean {
  if (row.startsAt) {
    const start = new Date(row.startsAt);
    if (!Number.isNaN(start.getTime()) && start.getTime() > now.getTime()) {
      return false;
    }
  }
  if (row.endsAt) {
    const end = new Date(row.endsAt);
    if (!Number.isNaN(end.getTime()) && end.getTime() <= now.getTime()) {
      return false;
    }
  }
  return true;
}

function deny(): ResolvedEntitlement {
  return { enabled: false, limit: 0, source: 'deny' };
}

function moreGenerousLimit(left: number | null, right: number | null): number | null {
  if (left === null || right === null) return null;
  return Math.max(left, right);
}

function isLimitMoreGenerous(candidate: number | null, baseline: number | null): boolean {
  if (baseline === null) return false;
  if (candidate === null) return true;
  return candidate > baseline;
}

function asLimitValue(value: number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  return Number(value);
}

function mergeAddonGrant(rows: AddonFeatureRow[]): { limitValue: number | null } | null {
  const granted = rows.filter((row) => row.enabled);
  if (granted.length === 0) return null;
  let limit = asLimitValue(granted[0]?.limitValue);
  for (const row of granted.slice(1)) {
    limit = moreGenerousLimit(limit, asLimitValue(row.limitValue));
  }
  return { limitValue: limit };
}

/**
 * Resolve a single feature.
 * Order: active override → add-on ∪ plan → feature default → deny.
 * Add-ons require an active subscription and never revoke a plan feature.
 * Unknown feature keys always deny.
 */
export function resolveFeatureEntitlement(
  featureKey: string,
  input: EntitlementResolutionInput
): ResolvedEntitlement {
  if (!isFeatureKey(featureKey)) {
    return deny();
  }

  const now = input.now ?? new Date();
  const catalog = input.features.find((f) => f.key === featureKey);
  if (!catalog || !catalog.isActive) {
    return deny();
  }

  const override = input.overrides.find(
    (o) => o.featureKey === featureKey && isOverrideActive(o, now)
  );

  if (override) {
    const enabled =
      override.enabled === null
        ? catalog.featureType === 'limit'
          ? true
          : catalog.defaultEnabled
        : override.enabled;

    if (!enabled) {
      return { enabled: false, limit: 0, source: 'override' };
    }

    if (catalog.featureType === 'limit' || isLimitFeatureKey(featureKey)) {
      const limit =
        override.limitValue !== null && override.limitValue !== undefined
          ? Number(override.limitValue)
          : catalog.defaultLimit;
      return {
        enabled: true,
        limit: limit === null || limit === undefined ? null : Number(limit),
        source: 'override',
      };
    }

    return { enabled: true, limit: null, source: 'override' };
  }

  if (input.hasActiveSubscription) {
    const planRow = input.planFeatures.find((p) => p.featureKey === featureKey);
    const addonGrant = mergeAddonGrant(
      (input.addonFeatures ?? []).filter((row) => row.featureKey === featureKey)
    );
    const planEnabled = Boolean(planRow?.enabled);
    const addonEnabled = Boolean(addonGrant);
    const isLimit = catalog.featureType === 'limit' || isLimitFeatureKey(featureKey);

    if (planEnabled || addonEnabled) {
      if (!isLimit) {
        if (addonEnabled && !planEnabled) {
          return { enabled: true, limit: null, source: 'addon' };
        }
        return { enabled: true, limit: null, source: 'plan' };
      }

      const planLimit = planEnabled ? asLimitValue(planRow?.limitValue) : 0;
      const addonLimit = addonEnabled ? asLimitValue(addonGrant?.limitValue) : 0;
      if (addonEnabled && !planEnabled) {
        return { enabled: true, limit: addonLimit, source: 'addon' };
      }
      if (planEnabled && !addonEnabled) {
        return { enabled: true, limit: planLimit, source: 'plan' };
      }
      const limit = moreGenerousLimit(planLimit, addonLimit);
      return {
        enabled: true,
        limit,
        source: isLimitMoreGenerous(addonLimit, planLimit) ? 'addon' : 'plan',
      };
    }

    if (planRow && !planRow.enabled) {
      return { enabled: false, limit: 0, source: 'plan' };
    }
  }

  // Feature default
  if (catalog.defaultEnabled) {
    if (catalog.featureType === 'limit' || isLimitFeatureKey(featureKey)) {
      return {
        enabled: true,
        limit:
          catalog.defaultLimit === null || catalog.defaultLimit === undefined
            ? null
            : Number(catalog.defaultLimit),
        source: 'default',
      };
    }
    return { enabled: true, limit: null, source: 'default' };
  }

  return deny();
}

export function resolveOrganizationEntitlements(
  input: EntitlementResolutionInput
): OrganizationEntitlements {
  const result: OrganizationEntitlements = {};
  for (const feature of input.features) {
    if (!feature.isActive) continue;
    result[feature.key] = resolveFeatureEntitlement(feature.key, input);
  }
  return result;
}

export function isSubscriptionPeriodOpen(params: {
  status: SubscriptionStatus | null | undefined;
  trialEndsAt?: string | null;
  endsAt?: string | null;
  now?: Date;
}): boolean {
  const status = params.status;
  if (status !== 'trialing' && status !== 'active' && status !== 'past_due') {
    return false;
  }
  const now = (params.now ?? new Date()).getTime();
  if (status === 'trialing') {
    if (!params.trialEndsAt) return true;
    const ends = new Date(params.trialEndsAt).getTime();
    return Number.isFinite(ends) && ends > now;
  }
  if (!params.endsAt) return true;
  const ends = new Date(params.endsAt).getTime();
  return Number.isFinite(ends) && ends > now;
}

export function canUseResolvedFeature(
  entitlements: OrganizationEntitlements,
  featureKey: FeatureKey | string
): boolean {
  const row = entitlements[featureKey];
  return Boolean(row?.enabled);
}

/**
 * Limit convention:
 * - null = unlimited
 * - 0 = unavailable
 * - positive = max allowed
 * Missing / disabled → 0
 */
export function getResolvedFeatureLimit(
  entitlements: OrganizationEntitlements,
  featureKey: FeatureKey | string
): number | null {
  const row = entitlements[featureKey];
  if (!row || !row.enabled) return 0;
  return row.limit;
}
