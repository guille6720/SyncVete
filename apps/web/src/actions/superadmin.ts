'use server';

import { revalidatePath } from 'next/cache';
import {
  buildPaginatedResult,
  canSuperadminAssignPlan,
  COMMERCIAL_QUOTA_WARN_RATIO,
  COMMERCIAL_TRIAL_REMIND_DAYS,
  findSeatDowngradeBlockers,
  formatSeatAssignmentMessage,
  getResolvedFeatureLimit,
  isFeatureKey,
  isLegacyPlanKey,
  isSeatFeatureKey,
  resolveOrganizationEntitlements,
  METERED_FEATURE_KEYS,
  METERED_USAGE_LABELS,
  SEAT_FEATURE_KEYS,
  SEAT_USAGE_LABELS,
  utcMonthPeriod,
  checkoutTargetFromBillingPayload,
  mercadoPagoPaymentIdFromBillingPayload,
  shouldReleaseCheckoutOnBillingSkip,
  type ActionResult,
  type AddonFeatureRow,
  type EntitlementResolutionInput,
  type FeatureCatalogRow,
  type FeatureOverrideRow,
  type OrganizationEntitlements,
  type PaginatedResult,
  type PlanFeatureRow,
  type SeatUsageMeter,
  type MeteredUsageMeter,
  type SubscriptionStatus,
} from '@sincvete/shared';
import type { Json } from '@sincvete/db';
import { PermissionError, requireSuperadmin } from '@/lib/permissions';
import { createServerClient } from '@/lib/supabase/server';
import { getSessionContext } from '@/lib/session';
import { replayClaimedBillingEvent } from '@/lib/billing/dispatch';
import { fetchMercadoPagoPayment } from '@/lib/billing/mercadopago';

function actionError<T = void>(error: unknown): ActionResult<T> {
  if (error instanceof PermissionError) {
    return { success: false, error: error.message };
  }
  if (error && typeof error === 'object' && 'message' in error) {
    const message = String((error as { message?: string }).message ?? '');
    if (message) return { success: false, error: message };
  }
  console.error(error);
  return { success: false, error: 'Ocurrió un error inesperado' };
}

function revalidateOrg(organizationId: string) {
  revalidatePath('/superadmin');
  revalidatePath(`/superadmin/organizaciones/${organizationId}`);
  revalidatePath('/configuracion');
  revalidatePath('/', 'layout');
}

async function clearOrgCheckoutIntents(organizationId: string) {
  const supabase = await createServerClient();
  const { error } = await supabase.rpc('superadmin_cancel_checkout_intents', {
    p_organization_id: organizationId,
  });
  if (error) {
    console.error('[superadmin] clear checkout intents', error.message);
  }
}

export type SuperadminOrgListRow = {
  id: string;
  name: string;
  slug: string;
  planKey: string | null;
  planName: string | null;
  status: SubscriptionStatus | null;
  trialEndsAt: string | null;
  startsAt: string | null;
  createdAt: string;
};

export async function listSuperadminOrganizations(params: {
  search?: string;
  page?: number;
  pageSize?: number;
  planKey?: string;
  status?: string;
}): Promise<PaginatedResult<SuperadminOrgListRow>> {
  await requireSuperadmin();
  const supabase = await createServerClient();
  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, params.pageSize ?? 25));
  const { data, error } = await supabase.rpc('superadmin_list_organizations', {
    p_search: params.search?.trim() || null,
    p_page: page,
    p_page_size: pageSize,
    p_plan_key: params.planKey?.trim() || null,
    p_status: params.status?.trim() || null,
  });
  if (error) throw new Error(error.message);
  const rows = data ?? [];
  const total = rows[0]?.total_count ?? 0;
  return buildPaginatedResult(
    rows.map((row) => ({
      id: row.id,
      name: row.name,
      slug: row.slug,
      planKey: row.plan_key,
      planName: row.plan_name,
      status: row.status,
      trialEndsAt: row.trial_ends_at,
      startsAt: row.starts_at,
      createdAt: row.created_at,
    })),
    Number(total),
    page,
    pageSize
  );
}

export type SuperadminPlanOption = {
  key: string;
  name: string;
  isInternal: boolean;
  isPublic: boolean;
};

export type SuperadminOverrideRow = FeatureOverrideRow & {
  id: string;
  reason: string | null;
  updatedAt: string;
};

export type SuperadminUsageRow = {
  featureKey: string;
  periodStart: string;
  periodEnd: string;
  usageCount: number;
};

export type SuperadminAddonOption = {
  key: string;
  name: string;
  description: string | null;
};

export type SuperadminOrgAddonRow = {
  id: string;
  addonKey: string;
  addonName: string;
  status: SubscriptionStatus;
  startsAt: string;
  endsAt: string | null;
  reason: string | null;
};

export type SuperadminOrgCommercial = {
  organization: { id: string; name: string; slug: string; createdAt: string };
  subscription: {
    id: string;
    planKey: string;
    planName: string;
    status: SubscriptionStatus;
    startsAt: string;
    trialEndsAt: string | null;
    isInternal: boolean;
  } | null;
  plans: SuperadminPlanOption[];
  catalog: Array<{ key: string; name: string; featureType: 'boolean' | 'limit'; usageMetered: boolean }>;
  addonCatalog: SuperadminAddonOption[];
  organizationAddons: SuperadminOrgAddonRow[];
  entitlements: OrganizationEntitlements;
  overrides: SuperadminOverrideRow[];
  usage: SuperadminUsageRow[];
  seats: SeatUsageMeter[];
  meters: MeteredUsageMeter[];
};

function asObject(value: Json | null | undefined): Record<string, Json | undefined> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value;
}

function asString(value: Json | undefined): string | null {
  return typeof value === 'string' ? value : null;
}

function asBoolean(value: Json | undefined): boolean | null {
  return typeof value === 'boolean' ? value : null;
}

function asNumber(value: Json | undefined): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function asArray(value: Json | undefined): Json[] {
  return Array.isArray(value) ? value : [];
}

function asFeatureType(value: Json | undefined): 'boolean' | 'limit' {
  return asString(value) === 'limit' ? 'limit' : 'boolean';
}

function asSubscriptionStatus(value: Json | undefined): SubscriptionStatus | null {
  const status = asString(value);
  if (
    status === 'trialing' ||
    status === 'active' ||
    status === 'past_due' ||
    status === 'cancelled' ||
    status === 'expired'
  ) {
    return status;
  }
  return null;
}

/** datetime-local has no timezone; Superadmin UI labels these fields as UTC. */
function formDateToTimestamptz(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(trimmed)) {
    return `${trimmed}:00Z`;
  }
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(trimmed)) {
    return `${trimmed}Z`;
  }
  return trimmed;
}

function seatLimitsFromRows(
  rows: { feature_key: string; enabled: boolean; limit_value: number | null }[] | null
): Record<string, number | null> {
  const limits: Record<string, number | null> = {};
  for (const row of rows ?? []) {
    if (!isSeatFeatureKey(row.feature_key)) continue;
    if (row.enabled === false) {
      limits[row.feature_key] = 0;
      continue;
    }
    limits[row.feature_key] = row.limit_value === null ? null : Number(row.limit_value);
  }
  return limits;
}

async function superadminSeatAssignmentError(params: {
  organizationId: string;
  planKey: string;
  planName?: string | null;
  currentPlanKey?: string | null;
  allowOverSeats: boolean;
}): Promise<string | null> {
  if (params.allowOverSeats || isLegacyPlanKey(params.planKey)) return null;
  if (params.currentPlanKey && params.currentPlanKey === params.planKey) return null;
  const supabase = await createServerClient();
  const [usageRes, limitsRes] = await Promise.all([
    supabase.rpc('superadmin_list_org_seat_usage', { p_organization_id: params.organizationId }),
    supabase.rpc('list_plan_seat_limits', { p_plan_key: params.planKey }),
  ]);
  if (usageRes.error || limitsRes.error) {
    return 'No se pudieron verificar los cupos de la clínica.';
  }
  const usedByKey = Object.fromEntries(
    (usageRes.data ?? []).map((row) => [row.feature_key, Number(row.used) || 0])
  );
  const blockers = findSeatDowngradeBlockers({
    usedByKey,
    targetLimits: seatLimitsFromRows(limitsRes.data),
  });
  if (blockers.length === 0) return null;
  return formatSeatAssignmentMessage(blockers, params.planName || params.planKey);
}

export async function getSuperadminOrgCommercial(
  organizationId: string
): Promise<SuperadminOrgCommercial> {
  await requireSuperadmin();
  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc('superadmin_get_org_commercial', {
    p_organization_id: organizationId,
  });
  if (error) throw new Error(error.message);
  const bundle = asObject(data);
  if (!bundle) throw new Error('Respuesta comercial inválida');

  const seatsRes = await supabase.rpc('superadmin_list_org_seat_usage', {
    p_organization_id: organizationId,
  });

  const org = asObject(bundle.organization);
  if (!org?.id || !asString(org.id)) throw new Error('Organización inválida');

  const subscriptionRaw = asObject(bundle.subscription);
  const catalogJson = asArray(bundle.catalog);
  const planFeaturesJson = asArray(bundle.plan_features);
  const addonFeaturesJson = asArray(bundle.addon_features);
  const overridesJson = asArray(bundle.overrides);

  const features: FeatureCatalogRow[] = catalogJson.flatMap((row) => {
    const item = asObject(row);
    const key = asString(item?.key);
    if (!item || !key) return [];
    const featureType = asFeatureType(item.feature_type);
    return [
      {
        key,
        featureType,
        defaultEnabled: asBoolean(item.default_enabled) ?? false,
        defaultLimit: asNumber(item.default_limit),
        isActive: asBoolean(item.is_active) ?? true,
      },
    ];
  });

  const catalog = catalogJson.flatMap((row) => {
    const item = asObject(row);
    const key = asString(item?.key);
    const name = asString(item?.name);
    if (!item || !key || !name) return [];
    return [
      {
        key,
        name,
        featureType: asFeatureType(item.feature_type),
        usageMetered: asBoolean(item.usage_metered) ?? false,
      },
    ];
  });

  const planFeatures: PlanFeatureRow[] = planFeaturesJson.flatMap((row) => {
    const item = asObject(row);
    const featureKey = asString(item?.feature_key);
    if (!item || !featureKey) return [];
    return [
      {
        featureKey,
        enabled: asBoolean(item.enabled) ?? false,
        limitValue: asNumber(item.limit_value),
      },
    ];
  });

  const addonFeatures: AddonFeatureRow[] = addonFeaturesJson.flatMap((row) => {
    const item = asObject(row);
    const featureKey = asString(item?.feature_key);
    if (!item || !featureKey) return [];
    return [
      {
        featureKey,
        enabled: asBoolean(item.enabled) ?? false,
        limitValue: asNumber(item.limit_value),
      },
    ];
  });

  const overrides: SuperadminOverrideRow[] = overridesJson.flatMap((row) => {
    const item = asObject(row);
    const featureKey = asString(item?.feature_key);
    const id = asString(item?.id);
    if (!item || !featureKey || !id) return [];
    return [
      {
        id,
        featureKey,
        enabled: asBoolean(item.enabled),
        limitValue: asNumber(item.limit_value),
        startsAt: asString(item.starts_at),
        endsAt: asString(item.ends_at),
        reason: asString(item.reason),
        updatedAt: asString(item.updated_at) ?? '',
      },
    ];
  });

  const input: EntitlementResolutionInput = {
    features,
    planFeatures,
    addonFeatures,
    overrides,
    hasActiveSubscription: Boolean(subscriptionRaw),
  };

  const plans: SuperadminPlanOption[] = asArray(bundle.plans).flatMap((row) => {
    const item = asObject(row);
    const key = asString(item?.key);
    const name = asString(item?.name);
    if (!item || !key || !name) return [];
    return [
      {
        key,
        name,
        isInternal: asBoolean(item.is_internal) ?? false,
        isPublic: asBoolean(item.is_public) ?? false,
      },
    ];
  });

  const addonCatalog: SuperadminAddonOption[] = asArray(bundle.addon_catalog).flatMap((row) => {
    const item = asObject(row);
    const key = asString(item?.key);
    const name = asString(item?.name);
    if (!item || !key || !name) return [];
    return [{ key, name, description: asString(item.description) }];
  });

  const organizationAddons: SuperadminOrgAddonRow[] = asArray(bundle.organization_addons).flatMap(
    (row) => {
      const item = asObject(row);
      const id = asString(item?.id);
      const addonKey = asString(item?.addon_key);
      const addonName = asString(item?.addon_name);
      const status = asSubscriptionStatus(item?.status);
      if (!item || !id || !addonKey || !addonName || !status) return [];
      return [
        {
          id,
          addonKey,
          addonName,
          status,
          startsAt: asString(item.starts_at) ?? '',
          endsAt: asString(item.ends_at),
          reason: asString(item.reason),
        },
      ];
    }
  );

  const usage: SuperadminUsageRow[] = asArray(bundle.usage).flatMap((row) => {
    const item = asObject(row);
    const featureKey = asString(item?.feature_key);
    if (!item || !featureKey) return [];
    return [
      {
        featureKey,
        periodStart: asString(item.period_start) ?? '',
        periodEnd: asString(item.period_end) ?? '',
        usageCount: asNumber(item.usage_count) ?? 0,
      },
    ];
  });

  const status = asSubscriptionStatus(subscriptionRaw?.status);
  const entitlements = resolveOrganizationEntitlements(input);
  const usedByKey = new Map<string, number>();
  for (const row of seatsRes.data ?? []) {
    usedByKey.set(row.feature_key, Number(row.used) || 0);
  }
  const seats: SeatUsageMeter[] = SEAT_FEATURE_KEYS.map((featureKey) => ({
    featureKey,
    label: SEAT_USAGE_LABELS[featureKey] ?? featureKey,
    used: usedByKey.get(featureKey) ?? 0,
    limit: getResolvedFeatureLimit(entitlements, featureKey),
  }));
  const period = utcMonthPeriod();
  const meterUsedByKey = new Map<string, number>();
  for (const row of usage) {
    if (row.periodStart === period.start) {
      meterUsedByKey.set(row.featureKey, row.usageCount);
    }
  }
  const meters: MeteredUsageMeter[] = METERED_FEATURE_KEYS.map((featureKey) => ({
    featureKey,
    label: METERED_USAGE_LABELS[featureKey] ?? featureKey,
    used: meterUsedByKey.get(featureKey) ?? 0,
    limit: getResolvedFeatureLimit(entitlements, featureKey),
  }));

  return {
    organization: {
      id: asString(org.id)!,
      name: asString(org.name) ?? '',
      slug: asString(org.slug) ?? '',
      createdAt: asString(org.created_at) ?? '',
    },
    subscription: subscriptionRaw
      ? {
          id: asString(subscriptionRaw.id) ?? '',
          planKey: asString(subscriptionRaw.plan_key) ?? '',
          planName: asString(subscriptionRaw.plan_name) ?? '',
          status: status ?? 'active',
          startsAt: asString(subscriptionRaw.starts_at) ?? '',
          trialEndsAt: asString(subscriptionRaw.trial_ends_at),
          isInternal: asBoolean(subscriptionRaw.is_internal) ?? false,
        }
      : null,
    plans,
    catalog,
    addonCatalog,
    organizationAddons,
    entitlements,
    overrides,
    usage,
    seats,
    meters,
  };
}

export async function changeOrganizationPlan(formData: FormData): Promise<ActionResult> {
  try {
    await requireSuperadmin();
    const organizationId = String(formData.get('organizationId') ?? '');
    const planKey = String(formData.get('planKey') ?? '');
    const reason = String(formData.get('reason') ?? '').trim() || null;
    const allowLegacy = formData.get('allowLegacy') === 'on';
    const allowOverSeats = formData.get('allowOverSeats') === 'on';
    if (!organizationId || !planKey) {
      return { success: false, error: 'Plan y organización son obligatorios' };
    }
    if (!canSuperadminAssignPlan(planKey, allowLegacy)) {
      return { success: false, error: 'Ese plan no se puede asignar' };
    }
    const commercial = await getSuperadminOrgCommercial(organizationId);
    const planName = commercial.plans.find((plan) => plan.key === planKey)?.name ?? planKey;
    const seatError = await superadminSeatAssignmentError({
      organizationId,
      planKey,
      planName,
      currentPlanKey: commercial.subscription?.planKey ?? null,
      allowOverSeats,
    });
    if (seatError) {
      return { success: false, error: seatError };
    }
    const supabase = await createServerClient();
    const { error } = await supabase.rpc('superadmin_change_plan', {
      p_organization_id: organizationId,
      p_plan_key: planKey,
      p_reason: reason,
      p_allow_legacy: allowLegacy,
      p_trial_days: null,
    });
    if (error) return { success: false, error: error.message };
    await clearOrgCheckoutIntents(organizationId);
    try {
      const { getPlanRecommendationForOrganization, persistPlanRecommendation } = await import(
        '@/lib/plan-recommendations'
      );
      const { recommendation } = await getPlanRecommendationForOrganization(organizationId);
      if (recommendation.recommendedPlan === planKey) {
        await persistPlanRecommendation(recommendation, 'accepted');
      }
    } catch {
      // Recommendation persistence is best-effort; plan change already succeeded.
    }
    revalidateOrg(organizationId);
    return { success: true };
  } catch (error) {
    return actionError(error);
  }
}

export async function startOrganizationTrial(formData: FormData): Promise<ActionResult> {
  try {
    await requireSuperadmin();
    const organizationId = String(formData.get('organizationId') ?? '');
    const reason = String(formData.get('reason') ?? '').trim() || null;
    const daysRaw = String(formData.get('trialDays') ?? '').trim();
    const trialDays = daysRaw ? Number(daysRaw) : null;
    if (!organizationId) return { success: false, error: 'Organización inválida' };
    if (trialDays !== null && (!Number.isInteger(trialDays) || trialDays <= 0)) {
      return { success: false, error: 'Los días de trial deben ser un entero positivo' };
    }
    const supabase = await createServerClient();
    const { error } = await supabase.rpc('superadmin_start_trial', {
      p_organization_id: organizationId,
      p_trial_days: trialDays,
      p_reason: reason,
    });
    if (error) return { success: false, error: error.message };
    revalidateOrg(organizationId);
    return { success: true };
  } catch (error) {
    return actionError(error);
  }
}

export async function endOrganizationTrial(formData: FormData): Promise<ActionResult> {
  try {
    await requireSuperadmin();
    const organizationId = String(formData.get('organizationId') ?? '');
    const planKey = String(formData.get('planKey') ?? 'basic') || 'basic';
    const reason = String(formData.get('reason') ?? '').trim() || null;
    const allowOverSeats = formData.get('allowOverSeats') === 'on';
    if (!organizationId) return { success: false, error: 'Organización inválida' };
    if (!canSuperadminAssignPlan(planKey, false) || planKey === 'trial') {
      return { success: false, error: 'Elegí un plan comercial para terminar el trial' };
    }
    const commercial = await getSuperadminOrgCommercial(organizationId);
    const planName = commercial.plans.find((plan) => plan.key === planKey)?.name ?? planKey;
    const seatError = await superadminSeatAssignmentError({
      organizationId,
      planKey,
      planName,
      currentPlanKey: commercial.subscription?.planKey ?? null,
      allowOverSeats,
    });
    if (seatError) {
      return { success: false, error: seatError };
    }
    const supabase = await createServerClient();
    const { error } = await supabase.rpc('superadmin_end_trial', {
      p_organization_id: organizationId,
      p_plan_key: planKey,
      p_reason: reason,
    });
    if (error) return { success: false, error: error.message };
    await clearOrgCheckoutIntents(organizationId);
    revalidateOrg(organizationId);
    return { success: true };
  } catch (error) {
    return actionError(error);
  }
}

export async function setOrganizationFeatureOverride(formData: FormData): Promise<ActionResult> {
  try {
    await requireSuperadmin();
    const organizationId = String(formData.get('organizationId') ?? '');
    const featureKey = String(formData.get('featureKey') ?? '');
    const enabled = String(formData.get('enabled') ?? 'true') === 'true';
    const reason = String(formData.get('reason') ?? '').trim() || null;
    const limitRaw = String(formData.get('limitValue') ?? '').trim();
    const startsAt = formDateToTimestamptz(String(formData.get('startsAt') ?? ''));
    const endsAt = formDateToTimestamptz(String(formData.get('endsAt') ?? ''));
    if (!organizationId || !isFeatureKey(featureKey)) {
      return { success: false, error: 'Feature u organización inválida' };
    }
    const limitValue = limitRaw === '' ? null : Number(limitRaw);
    if (limitValue !== null && !Number.isFinite(limitValue)) {
      return { success: false, error: 'Límite inválido' };
    }
    const supabase = await createServerClient();
    const { error } = await supabase.rpc('superadmin_set_feature_override', {
      p_organization_id: organizationId,
      p_feature_key: featureKey,
      p_enabled: enabled,
      p_limit_value: limitValue,
      p_reason: reason,
      p_starts_at: startsAt,
      p_ends_at: endsAt,
    });
    if (error) return { success: false, error: error.message };
    revalidateOrg(organizationId);
    return { success: true };
  } catch (error) {
    return actionError(error);
  }
}

export async function clearOrganizationFeatureOverride(formData: FormData): Promise<ActionResult> {
  try {
    await requireSuperadmin();
    const organizationId = String(formData.get('organizationId') ?? '');
    const featureKey = String(formData.get('featureKey') ?? '');
    const reason = String(formData.get('reason') ?? '').trim() || null;
    if (!organizationId || !isFeatureKey(featureKey)) {
      return { success: false, error: 'Feature u organización inválida' };
    }
    const supabase = await createServerClient();
    const { error } = await supabase.rpc('superadmin_clear_feature_override', {
      p_organization_id: organizationId,
      p_feature_key: featureKey,
      p_reason: reason,
    });
    if (error) return { success: false, error: error.message };
    revalidateOrg(organizationId);
    return { success: true };
  } catch (error) {
    return actionError(error);
  }
}

export async function grantOrganizationAddon(formData: FormData): Promise<ActionResult> {
  try {
    await requireSuperadmin();
    const organizationId = String(formData.get('organizationId') ?? '');
    const addonKey = String(formData.get('addonKey') ?? '').trim();
    const reason = String(formData.get('reason') ?? '').trim() || null;
    const startsAt = formDateToTimestamptz(String(formData.get('startsAt') ?? ''));
    const endsAt = formDateToTimestamptz(String(formData.get('endsAt') ?? ''));
    if (!organizationId || !addonKey) {
      return { success: false, error: 'Add-on y organización son obligatorios' };
    }
    const supabase = await createServerClient();
    const { error } = await supabase.rpc('superadmin_grant_addon', {
      p_organization_id: organizationId,
      p_addon_key: addonKey,
      p_reason: reason,
      p_starts_at: startsAt,
      p_ends_at: endsAt,
    });
    if (error) return { success: false, error: error.message };
    revalidateOrg(organizationId);
    return { success: true };
  } catch (error) {
    return actionError(error);
  }
}

export async function revokeOrganizationAddon(formData: FormData): Promise<ActionResult> {
  try {
    await requireSuperadmin();
    const organizationId = String(formData.get('organizationId') ?? '');
    const addonKey = String(formData.get('addonKey') ?? '').trim();
    const reason = String(formData.get('reason') ?? '').trim() || null;
    if (!organizationId || !addonKey) {
      return { success: false, error: 'Add-on y organización son obligatorios' };
    }
    const supabase = await createServerClient();
    const { error } = await supabase.rpc('superadmin_revoke_addon', {
      p_organization_id: organizationId,
      p_addon_key: addonKey,
      p_reason: reason,
    });
    if (error) return { success: false, error: error.message };
    revalidateOrg(organizationId);
    return { success: true };
  } catch (error) {
    return actionError(error);
  }
}

export type SuperadminCommercialSummary = {
  organizations: number;
  trialing: number;
  active: number;
  pastDue: number;
  expired: number;
  cancelled: number;
  plansEndingSoon: number;
  addonsActive: number;
  addonsEndingSoon: number;
  orgsOverSeats: number;
  billingEventsPending: number;
  checkoutIntentsOpen: number;
};

export async function getSuperadminCommercialSummary(): Promise<SuperadminCommercialSummary> {
  await requireSuperadmin();
  const supabase = await createServerClient();
  const [summaryRes, pendingRes, intentsRes] = await Promise.all([
    supabase.rpc('superadmin_commercial_summary', {
      p_remind_days: COMMERCIAL_TRIAL_REMIND_DAYS,
    }),
    supabase.rpc('superadmin_pending_billing_events'),
    supabase.rpc('superadmin_open_checkout_intents'),
  ]);
  if (summaryRes.error) throw new Error(summaryRes.error.message);
  if (pendingRes.error) throw new Error(pendingRes.error.message);
  if (intentsRes.error) throw new Error(intentsRes.error.message);
  const row = asObject(summaryRes.data);
  return {
    organizations: asNumber(row?.organizations) ?? 0,
    trialing: asNumber(row?.trialing) ?? 0,
    active: asNumber(row?.active) ?? 0,
    pastDue: asNumber(row?.past_due) ?? 0,
    expired: asNumber(row?.expired) ?? 0,
    cancelled: asNumber(row?.cancelled) ?? 0,
    plansEndingSoon: asNumber(row?.plans_ending_soon) ?? 0,
    addonsActive: asNumber(row?.addons_active) ?? 0,
    addonsEndingSoon: asNumber(row?.addons_ending_soon) ?? 0,
    orgsOverSeats: asNumber(row?.orgs_over_seats) ?? 0,
    billingEventsPending: asNumber(pendingRes.data) ?? 0,
    checkoutIntentsOpen: asNumber(intentsRes.data) ?? 0,
  };
}

export async function runSuperadminCommercialLifecycle(): Promise<
  ActionResult<{
    expired: number;
    notices: number;
    recommendationsScanned?: number;
    recommendationsActive?: number;
    recommendationsCleared?: number;
  }>
> {
  try {
    await requireSuperadmin();
    const supabase = await createServerClient();
    const { data, error } = await supabase.rpc('run_commercial_lifecycle', {
      p_trial_remind_days: COMMERCIAL_TRIAL_REMIND_DAYS,
      p_quota_warn_ratio: COMMERCIAL_QUOTA_WARN_RATIO,
    });
    if (error) return { success: false, error: error.message };
    const row = asObject(data);

    let recommendationsScanned: number | undefined;
    let recommendationsActive: number | undefined;
    let recommendationsCleared: number | undefined;
    try {
      const { refreshAllPlanRecommendations } = await import('@/lib/plan-recommendations');
      const refresh = await refreshAllPlanRecommendations();
      recommendationsScanned = refresh.scanned;
      recommendationsActive = refresh.recommended;
      recommendationsCleared = refresh.cleared;
    } catch {
      // Phase 31+ optional; lifecycle still succeeds.
    }

    revalidatePath('/superadmin');
    return {
      success: true,
      data: {
        expired: asNumber(row?.expired) ?? 0,
        notices: asNumber(row?.notices) ?? 0,
        recommendationsScanned,
        recommendationsActive,
        recommendationsCleared,
      },
    };
  } catch (error) {
    return actionError(error);
  }
}

export type SuperadminBillingEvent = {
  id: string;
  provider: string;
  eventId: string;
  eventType: string | null;
  processedAt: string;
  appliedAt: string | null;
};

export async function listSuperadminBillingEvents(
  organizationId: string
): Promise<SuperadminBillingEvent[]> {
  await requireSuperadmin();
  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc('superadmin_list_billing_events', {
    p_organization_id: organizationId,
    p_limit: 25,
  });
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => ({
    id: row.id,
    provider: row.provider,
    eventId: row.event_id,
    eventType: row.event_type,
    processedAt: row.processed_at,
    appliedAt: row.applied_at,
  }));
}

export type SuperadminCheckoutIntent = {
  id: string;
  kind: string;
  targetKey: string;
  interval: string;
  provider: string;
  expiresAt: string;
  createdAt: string;
};

export async function listSuperadminCheckoutIntents(
  organizationId: string
): Promise<SuperadminCheckoutIntent[]> {
  await requireSuperadmin();
  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc('superadmin_list_checkout_intents', {
    p_organization_id: organizationId,
  });
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => ({
    id: row.id,
    kind: row.kind,
    targetKey: row.target_key,
    interval: row.billing_interval,
    provider: row.provider,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
  }));
}

export async function cancelSuperadminCheckoutIntents(formData: FormData): Promise<ActionResult> {
  try {
    await requireSuperadmin();
    const organizationId = String(formData.get('organizationId') ?? '');
    if (!organizationId) return { success: false, error: 'Organización inválida' };
    const supabase = await createServerClient();
    const { error } = await supabase.rpc('superadmin_cancel_checkout_intents', {
      p_organization_id: organizationId,
    });
    if (error) return { success: false, error: error.message };
    revalidateOrg(organizationId);
    return { success: true };
  } catch (error) {
    return actionError(error);
  }
}

function revalidateBillingEvent(organizationId: string | null | undefined) {
  if (organizationId) {
    revalidateOrg(organizationId);
    return;
  }
  revalidatePath('/superadmin');
}

export async function replaySuperadminBillingEvent(formData: FormData): Promise<ActionResult> {
  try {
    await requireSuperadmin();
    const eventId = String(formData.get('eventId') ?? '').trim();
    if (!eventId) return { success: false, error: 'Evento inválido' };
    const supabase = await createServerClient();
    const { data, error } = await supabase.rpc('superadmin_get_unapplied_billing_event', {
      p_event_id: eventId,
    });
    if (error) return { success: false, error: error.message };
    const row = data?.[0];
    if (!row) return { success: false, error: 'El evento ya se aplicó o no existe' };
    await replayClaimedBillingEvent({
      eventRowId: row.id,
      provider: row.provider,
      payload: row.payload,
    });
    revalidateBillingEvent(row.organization_id);
    return { success: true };
  } catch (error) {
    return actionError(error);
  }
}

async function resolveSkipCheckoutRelease(params: {
  provider: string;
  eventType: string | null;
  payload: unknown;
}): Promise<{ kind: 'plan' | 'addon'; targetKey: string } | null> {
  if (!shouldReleaseCheckoutOnBillingSkip(params.eventType)) return null;
  if (params.provider === 'mercadopago') {
    const paymentId = mercadoPagoPaymentIdFromBillingPayload(params.payload);
    if (!paymentId) return null;
    const payment = await fetchMercadoPagoPayment(paymentId);
    const target = checkoutTargetFromBillingPayload({
      provider: 'mercadopago',
      mercadoPagoExternalReference: payment?.externalReference ?? null,
    });
    return target ? { kind: target.kind, targetKey: target.targetKey } : null;
  }
  const target = checkoutTargetFromBillingPayload({
    provider: params.provider,
    payload: params.payload,
  });
  return target ? { kind: target.kind, targetKey: target.targetKey } : null;
}

export async function skipSuperadminBillingEvent(
  formData: FormData
): Promise<ActionResult<{ released: number }>> {
  try {
    await requireSuperadmin();
    const eventId = String(formData.get('eventId') ?? '').trim();
    if (!eventId) return { success: false, error: 'Evento inválido' };
    const supabase = await createServerClient();
    const loaded = await supabase.rpc('superadmin_get_unapplied_billing_event', {
      p_event_id: eventId,
    });
    if (loaded.error) return { success: false, error: loaded.error.message };
    const event = loaded.data?.[0];
    if (!event) return { success: false, error: 'El evento ya se aplicó o no existe' };
    const release = await resolveSkipCheckoutRelease({
      provider: event.provider,
      eventType: event.event_type,
      payload: event.payload,
    });
    const { data, error } = await supabase.rpc('superadmin_skip_billing_event', {
      p_event_id: eventId,
      p_kind: release?.kind ?? null,
      p_target_key: release?.targetKey ?? null,
    });
    if (error) return { success: false, error: error.message };
    const row = asObject(data);
    if ((asNumber(row?.skipped) ?? 0) < 1) {
      return { success: false, error: 'El evento ya se aplicó o no existe' };
    }
    revalidateBillingEvent(asString(row?.organization_id) ?? event.organization_id);
    return { success: true, data: { released: asNumber(row?.released) ?? 0 } };
  } catch (error) {
    return actionError(error);
  }
}

export type SuperadminOpenCheckoutIntentRow = SuperadminCheckoutIntent & {
  organizationId: string;
  organizationName: string;
  organizationSlug: string;
};

export async function listSuperadminOpenCheckoutIntents(): Promise<SuperadminOpenCheckoutIntentRow[]> {
  await requireSuperadmin();
  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc('superadmin_list_open_checkout_intents', {
    p_limit: 50,
  });
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => ({
    id: row.id,
    organizationId: row.organization_id,
    organizationName: row.organization_name,
    organizationSlug: row.organization_slug,
    kind: row.kind,
    targetKey: row.target_key,
    interval: row.billing_interval,
    provider: row.provider,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
  }));
}

export type SuperadminUnappliedBillingEvent = SuperadminBillingEvent & {
  organizationId: string | null;
  organizationName: string | null;
  organizationSlug: string | null;
};

export async function listSuperadminUnappliedBillingEvents(): Promise<
  SuperadminUnappliedBillingEvent[]
> {
  await requireSuperadmin();
  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc('superadmin_list_unapplied_billing_events', {
    p_limit: 50,
  });
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => ({
    id: row.id,
    organizationId: row.organization_id,
    organizationName: row.organization_name,
    organizationSlug: row.organization_slug,
    provider: row.provider,
    eventId: row.event_id,
    eventType: row.event_type,
    processedAt: row.processed_at,
    appliedAt: null,
  }));
}

export type SuperadminPlanEndingSoonRow = {
  organizationId: string;
  organizationName: string;
  organizationSlug: string;
  planKey: string;
  planName: string;
  status: string;
  endsAt: string;
};

export async function listSuperadminPlansEndingSoon(): Promise<SuperadminPlanEndingSoonRow[]> {
  await requireSuperadmin();
  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc('superadmin_list_plans_ending_soon', {
    p_remind_days: COMMERCIAL_TRIAL_REMIND_DAYS,
    p_limit: 50,
  });
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => ({
    organizationId: row.organization_id,
    organizationName: row.organization_name,
    organizationSlug: row.organization_slug,
    planKey: row.plan_key,
    planName: row.plan_name,
    status: row.status,
    endsAt: row.ends_at,
  }));
}

export type SuperadminAddonEndingSoonRow = {
  organizationId: string;
  organizationName: string;
  organizationSlug: string;
  addonKey: string;
  addonName: string;
  endsAt: string;
};

export async function listSuperadminAddonsEndingSoon(): Promise<SuperadminAddonEndingSoonRow[]> {
  await requireSuperadmin();
  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc('superadmin_list_addons_ending_soon', {
    p_remind_days: COMMERCIAL_TRIAL_REMIND_DAYS,
    p_limit: 50,
  });
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => ({
    organizationId: row.organization_id,
    organizationName: row.organization_name,
    organizationSlug: row.organization_slug,
    addonKey: row.addon_key,
    addonName: row.addon_name,
    endsAt: row.ends_at,
  }));
}

export type SuperadminOrgOverSeatsRow = {
  organizationId: string;
  organizationName: string;
  organizationSlug: string;
  planKey: string;
  planName: string;
  featureKey: string;
  used: number;
  limitValue: number;
};

export async function listSuperadminOrgsOverSeats(): Promise<SuperadminOrgOverSeatsRow[]> {
  await requireSuperadmin();
  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc('superadmin_list_orgs_over_seats', {
    p_limit: 50,
  });
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => ({
    organizationId: row.organization_id,
    organizationName: row.organization_name,
    organizationSlug: row.organization_slug,
    planKey: row.plan_key,
    planName: row.plan_name,
    featureKey: row.feature_key,
    used: Number(row.used),
    limitValue: Number(row.limit_value),
  }));
}

export async function reverseSuperadminPaidGrant(formData: FormData): Promise<ActionResult> {
  try {
    await requireSuperadmin();
    const organizationId = String(formData.get('organizationId') ?? '');
    const kind = String(formData.get('kind') ?? '').trim();
    const targetKey = String(formData.get('targetKey') ?? '').trim() || null;
    if (!organizationId || (kind !== 'plan' && kind !== 'addon')) {
      return { success: false, error: 'Organización y tipo son obligatorios' };
    }
    if (kind === 'addon' && !targetKey) {
      return { success: false, error: 'El extra es obligatorio' };
    }
    const supabase = await createServerClient();
    const { data, error } = await supabase.rpc('billing_reverse_paid_grant', {
      p_organization_id: organizationId,
      p_kind: kind,
      p_target_key: targetKey,
      p_reason: 'superadmin_refund',
    });
    if (error) return { success: false, error: error.message };
    const row = data && typeof data === 'object' && !Array.isArray(data) ? data : null;
    const reversed = typeof row?.reversed === 'number' ? row.reversed : 0;
    if (reversed < 1) {
      return { success: false, error: 'No había un cobro de checkout para revertir' };
    }
    revalidateOrg(organizationId);
    return { success: true };
  } catch (error) {
    return actionError(error);
  }
}

export async function listSuperadminOrganizationsRecommended(params: {
  search?: string;
  page?: number;
  pageSize?: number;
  planKey?: string;
  status?: string;
  recommendedPlan?: string;
  upgradeFilter?: string;
  sort?: string;
}) {
  const { listSuperadminOrganizationsWithRecommendations } = await import(
    '@/lib/plan-recommendations'
  );
  return listSuperadminOrganizationsWithRecommendations(params);
}

export async function refreshSuperadminPlanRecommendations(): Promise<
  ActionResult<{ scanned: number; recommended: number; cleared: number; pages: number }>
> {
  try {
    await requireSuperadmin();
    const { refreshAllPlanRecommendations } = await import('@/lib/plan-recommendations');
    const data = await refreshAllPlanRecommendations();
    revalidatePath('/superadmin');
    return { success: true, data };
  } catch (error) {
    return actionError(error);
  }
}

export async function exportSuperadminRecommendationsCsv(formData?: FormData): Promise<
  ActionResult<{ csv: string; rowCount: number }>
> {
  try {
    await requireSuperadmin();
    const { exportRecommendationsCsv } = await import('@/lib/plan-recommendations');
    const get = (key: string) => {
      const raw = formData?.get(key);
      return typeof raw === 'string' && raw.trim() ? raw.trim() : undefined;
    };
    const data = await exportRecommendationsCsv({
      search: get('search'),
      planKey: get('plan'),
      status: get('status'),
      recommendedPlan: get('recommended'),
      upgradeFilter: get('upgrade'),
      sort: get('sort'),
    });
    return { success: true, data };
  } catch (error) {
    return actionError(error);
  }
}

export async function dismissOrganizationPlanRecommendation(
  formData: FormData
): Promise<ActionResult> {
  try {
    await requireSuperadmin();
    const organizationId = String(formData.get('organizationId') ?? '');
    if (!organizationId) return { success: false, error: 'Organización inválida' };
    const { getPlanRecommendationForOrganization, persistPlanRecommendation } = await import(
      '@/lib/plan-recommendations'
    );
    const { recommendation } = await getPlanRecommendationForOrganization(organizationId);
    await persistPlanRecommendation(recommendation, 'dismissed');
    revalidateOrg(organizationId);
    return { success: true };
  } catch (error) {
    return actionError(error);
  }
}

export async function reviewOrganizationPlanRecommendation(
  formData: FormData
): Promise<ActionResult> {
  try {
    await requireSuperadmin();
    const organizationId = String(formData.get('organizationId') ?? '');
    if (!organizationId) return { success: false, error: 'Organización inválida' };
    const { getPlanRecommendationForOrganization, persistPlanRecommendation } = await import(
      '@/lib/plan-recommendations'
    );
    const { recommendation } = await getPlanRecommendationForOrganization(organizationId);
    await persistPlanRecommendation(recommendation, 'reviewed');
    revalidateOrg(organizationId);
    return { success: true };
  } catch (error) {
    return actionError(error);
  }
}

export async function saveOrganizationPlanRecommendationNote(
  formData: FormData
): Promise<ActionResult> {
  try {
    await requireSuperadmin();
    const organizationId = String(formData.get('organizationId') ?? '');
    if (!organizationId) return { success: false, error: 'Organización inválida' };
    const noteRaw = String(formData.get('note') ?? '');
    const { setPlanRecommendationCommercialNote } = await import('@/lib/plan-recommendations');
    await setPlanRecommendationCommercialNote(organizationId, noteRaw.trim() || null);
    revalidateOrg(organizationId);
    return { success: true };
  } catch (error) {
    return actionError(error);
  }
}

export async function saveOrganizationPlanRecommendationFollowUp(
  formData: FormData
): Promise<ActionResult> {
  try {
    await requireSuperadmin();
    const organizationId = String(formData.get('organizationId') ?? '');
    if (!organizationId) return { success: false, error: 'Organización inválida' };
    const raw = String(formData.get('followUpAt') ?? '').trim();
    let followUpAt: string | null = null;
    if (raw) {
      const parsed = new Date(raw);
      if (Number.isNaN(parsed.getTime())) {
        return { success: false, error: 'Fecha de seguimiento inválida' };
      }
      followUpAt = parsed.toISOString();
    }
    const { setPlanRecommendationFollowUp } = await import('@/lib/plan-recommendations');
    await setPlanRecommendationFollowUp(organizationId, followUpAt);
    revalidateOrg(organizationId);
    return { success: true };
  } catch (error) {
    return actionError(error);
  }
}

export async function saveOrganizationPlanRecommendationFreeze(
  formData: FormData
): Promise<ActionResult> {
  try {
    await requireSuperadmin();
    const organizationId = String(formData.get('organizationId') ?? '');
    if (!organizationId) return { success: false, error: 'Organización inválida' };
    const frozen = String(formData.get('frozen') ?? '') === 'true';
    const note = String(formData.get('note') ?? '').trim() || null;
    const { setPlanRecommendationFreeze } = await import('@/lib/plan-recommendations');
    await setPlanRecommendationFreeze(organizationId, frozen, note);
    revalidateOrg(organizationId);
    return { success: true };
  } catch (error) {
    return actionError(error);
  }
}

export async function saveOrganizationPlanRecommendationCommercialSnooze(
  formData: FormData
): Promise<ActionResult> {
  try {
    await requireSuperadmin();
    const organizationId = String(formData.get('organizationId') ?? '');
    if (!organizationId) return { success: false, error: 'Organización inválida' };
    const clear = String(formData.get('clear') ?? '') === '1';
    const daysRaw = Number(formData.get('days'));
    const note = String(formData.get('note') ?? '').trim() || null;
    const days = clear ? null : daysRaw;
    if (!clear && (!Number.isFinite(daysRaw) || daysRaw < 1 || daysRaw > 90)) {
      return { success: false, error: 'Snooze debe ser entre 1 y 90 días' };
    }
    const { setPlanRecommendationCommercialSnooze } = await import('@/lib/plan-recommendations');
    await setPlanRecommendationCommercialSnooze(organizationId, days, note);
    revalidateOrg(organizationId);
    revalidatePath('/superadmin');
    return { success: true };
  } catch (error) {
    return actionError(error);
  }
}

export async function bulkSnoozeOrganizationPlanRecommendations(
  formData: FormData
): Promise<ActionResult<{ requested: number; updated: number; errors: number }>> {
  try {
    await requireSuperadmin();
    const ids = String(formData.get('organizationIds') ?? '')
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean);
    const clear = String(formData.get('clear') ?? '') === '1';
    const daysRaw = Number(formData.get('days'));
    const note = String(formData.get('note') ?? '').trim() || null;
    const days = clear ? null : daysRaw;
    if (!clear && (!Number.isFinite(daysRaw) || daysRaw < 1 || daysRaw > 90)) {
      return { success: false, error: 'Snooze debe ser entre 1 y 90 días' };
    }
    const { bulkSetPlanRecommendationCommercialSnooze } = await import(
      '@/lib/plan-recommendations'
    );
    const result = await bulkSetPlanRecommendationCommercialSnooze(ids, days, note);
    revalidatePath('/superadmin');
    return { success: true, data: result };
  } catch (error) {
    return actionError(error);
  }
}

export async function saveOrganizationPlanRecommendationAssignee(
  formData: FormData
): Promise<ActionResult> {
  try {
    await requireSuperadmin();
    const organizationId = String(formData.get('organizationId') ?? '');
    if (!organizationId) return { success: false, error: 'Organización inválida' };
    const raw = String(formData.get('assignedTo') ?? '').trim();
    const assignedTo = raw || null;
    const { setPlanRecommendationAssignee } = await import('@/lib/plan-recommendations');
    await setPlanRecommendationAssignee(organizationId, assignedTo);
    revalidateOrg(organizationId);
    return { success: true };
  } catch (error) {
    return actionError(error);
  }
}

export async function saveOrganizationPlanRecommendationOutcome(
  formData: FormData
): Promise<ActionResult> {
  try {
    await requireSuperadmin();
    const organizationId = String(formData.get('organizationId') ?? '');
    if (!organizationId) return { success: false, error: 'Organización inválida' };
    const raw = String(formData.get('outcome') ?? '').trim();
    const note = String(formData.get('outcomeNote') ?? '').trim() || null;
    const outcome =
      raw === 'won' || raw === 'lost' || raw === 'deferred' || raw === 'not_a_fit' ? raw : null;
    if (raw && !outcome) {
      return { success: false, error: 'Resultado comercial inválido' };
    }
    const { setPlanRecommendationOutcome } = await import('@/lib/plan-recommendations');
    await setPlanRecommendationOutcome(organizationId, outcome, note);
    revalidateOrg(organizationId);
    return { success: true };
  } catch (error) {
    return actionError(error);
  }
}

export async function saveOrganizationPlanRecommendationContact(
  formData: FormData
): Promise<ActionResult> {
  try {
    await requireSuperadmin();
    const organizationId = String(formData.get('organizationId') ?? '');
    if (!organizationId) return { success: false, error: 'Organización inválida' };
    const note = String(formData.get('contactNote') ?? '').trim() || null;
    const { touchPlanRecommendationContact } = await import('@/lib/plan-recommendations');
    await touchPlanRecommendationContact(organizationId, note);
    revalidateOrg(organizationId);
    return { success: true };
  } catch (error) {
    return actionError(error);
  }
}

export async function listSuperadminRecommendationAssignees() {
  const { listRecommendationAssignees } = await import('@/lib/plan-recommendations');
  return listRecommendationAssignees();
}

export async function listSuperadminRecommendationOutcomes(
  limit = 25,
  outcome?: 'won' | 'lost' | 'deferred' | 'not_a_fit' | null
) {
  const { listRecommendationOutcomes } = await import('@/lib/plan-recommendations');
  return listRecommendationOutcomes(limit, outcome);
}

export async function listSuperadminRecommendationStale(limit = 25) {
  const { listRecommendationStale } = await import('@/lib/plan-recommendations');
  return listRecommendationStale(limit);
}

export async function getSuperadminRecommendationDigest(mineOnly = false) {
  const { getRecommendationDigest } = await import('@/lib/plan-recommendations');
  return getRecommendationDigest({ limit: 12, mineOnly });
}

export async function getSuperadminRecommendationFunnel() {
  const { getRecommendationFunnel } = await import('@/lib/plan-recommendations');
  return getRecommendationFunnel();
}

export async function exportSuperadminRecommendationFunnelCsv(): Promise<
  ActionResult<{ csv: string }>
> {
  try {
    await requireSuperadmin();
    const { getRecommendationFunnel, formatRecommendationFunnelCsv } = await import(
      '@/lib/plan-recommendations'
    );
    const funnel = await getRecommendationFunnel();
    return { success: true, data: { csv: formatRecommendationFunnelCsv(funnel) } };
  } catch (error) {
    return actionError(error);
  }
}

export async function getSuperadminRecommendationTrends() {
  const { getRecommendationTrends } = await import('@/lib/plan-recommendations');
  return getRecommendationTrends();
}

export async function exportSuperadminRecommendationTrendsCsv(): Promise<
  ActionResult<{ csv: string; rowCount: number }>
> {
  try {
    await requireSuperadmin();
    const { getRecommendationTrends, formatRecommendationTrendsCsv } = await import(
      '@/lib/plan-recommendations'
    );
    const trends = await getRecommendationTrends();
    return {
      success: true,
      data: { csv: formatRecommendationTrendsCsv(trends), rowCount: 3 },
    };
  } catch (error) {
    return actionError(error);
  }
}

export async function getSuperadminRecommendationAssigneeScorecard() {
  const { getRecommendationAssigneeScorecard } = await import('@/lib/plan-recommendations');
  return getRecommendationAssigneeScorecard();
}

export async function exportSuperadminRecommendationAssigneeScorecardCsv(): Promise<
  ActionResult<{ csv: string; rowCount: number }>
> {
  try {
    await requireSuperadmin();
    const {
      getRecommendationAssigneeScorecard,
      formatRecommendationAssigneeScorecardCsv,
    } = await import('@/lib/plan-recommendations');
    const scorecard = await getRecommendationAssigneeScorecard();
    const rowCount = scorecard.assignees.length + (scorecard.unassigned ? 1 : 0);
    return {
      success: true,
      data: {
        csv: formatRecommendationAssigneeScorecardCsv(scorecard),
        rowCount,
      },
    };
  } catch (error) {
    return actionError(error);
  }
}

export async function getSuperadminRecommendationAssigneeWorkload() {
  const { getRecommendationAssigneeWorkload } = await import('@/lib/plan-recommendations');
  return getRecommendationAssigneeWorkload();
}

export async function listSuperadminRecommendationSavedViews() {
  const { listRecommendationSavedViews } = await import('@/lib/plan-recommendations');
  return listRecommendationSavedViews();
}

export async function upsertSuperadminRecommendationSavedView(
  formData: FormData
): Promise<ActionResult<{ id: string; name: string }>> {
  try {
    await requireSuperadmin();
    const name = String(formData.get('name') ?? '');
    const isShared = String(formData.get('isShared') ?? '') === '1';
    const idRaw = String(formData.get('id') ?? '').trim();
    const paramsJson = String(formData.get('queryParams') ?? '{}');
    let queryParams: Record<string, string> = {};
    try {
      const parsed = JSON.parse(paramsJson) as unknown;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        queryParams = Object.fromEntries(
          Object.entries(parsed as Record<string, unknown>)
            .filter(([, v]) => typeof v === 'string')
            .map(([k, v]) => [k, v as string])
        );
      }
    } catch {
      return { success: false, error: 'Filtros inválidos' };
    }
    const { upsertRecommendationSavedView } = await import('@/lib/plan-recommendations');
    const row = await upsertRecommendationSavedView({
      name,
      queryParams,
      isShared,
      id: idRaw || null,
    });
    revalidatePath('/superadmin');
    return { success: true, data: { id: row.id, name: row.name } };
  } catch (error) {
    return actionError(error);
  }
}

export async function deleteSuperadminRecommendationSavedView(
  formData: FormData
): Promise<ActionResult<{ id: string }>> {
  try {
    await requireSuperadmin();
    const id = String(formData.get('id') ?? '').trim();
    if (!id) return { success: false, error: 'Vista inválida' };
    const { deleteRecommendationSavedView } = await import('@/lib/plan-recommendations');
    await deleteRecommendationSavedView(id);
    revalidatePath('/superadmin');
    return { success: true, data: { id } };
  } catch (error) {
    return actionError(error);
  }
}

export async function exportSuperadminRecommendationAssigneeWorkloadCsv(): Promise<
  ActionResult<{ csv: string; rowCount: number }>
> {
  try {
    await requireSuperadmin();
    const {
      getRecommendationAssigneeWorkload,
      formatRecommendationAssigneeWorkloadCsv,
    } = await import('@/lib/plan-recommendations');
    const workload = await getRecommendationAssigneeWorkload();
    const rowCount = workload.assignees.length + (workload.unassigned ? 1 : 0);
    return {
      success: true,
      data: {
        csv: formatRecommendationAssigneeWorkloadCsv(workload),
        rowCount,
      },
    };
  } catch (error) {
    return actionError(error);
  }
}

export async function listSuperadminRecommendationActivity(mineOnly = false) {
  const { listRecentRecommendationActivity } = await import('@/lib/plan-recommendations');
  return listRecentRecommendationActivity({ limit: 40, mineOnly });
}

export async function exportSuperadminRecommendationActivityCsv(formData?: FormData): Promise<
  ActionResult<{ csv: string; rowCount: number }>
> {
  try {
    await requireSuperadmin();
    const { listRecentRecommendationActivity, formatRecommendationActivityCsv } = await import(
      '@/lib/plan-recommendations'
    );
    const mineOnly = String(formData?.get('mineOnly') ?? '') === 'true';
    const events = await listRecentRecommendationActivity({ limit: 100, mineOnly });
    return {
      success: true,
      data: {
        csv: formatRecommendationActivityCsv(events),
        rowCount: events.length,
      },
    };
  } catch (error) {
    return actionError(error);
  }
}

export async function bulkAssignOrganizationPlanRecommendations(
  formData: FormData
): Promise<ActionResult<{ requested: number; updated: number; skipped: number; errors: number }>> {
  try {
    await requireSuperadmin();
    const ids = String(formData.get('organizationIds') ?? '')
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean);
    const raw = String(formData.get('assignedTo') ?? '').trim();
    const assignedTo = raw || null;
    const { bulkSetPlanRecommendationAssignee } = await import('@/lib/plan-recommendations');
    const result = await bulkSetPlanRecommendationAssignee(ids, assignedTo);
    revalidatePath('/superadmin');
    for (const id of ids.slice(0, 50)) {
      revalidatePath(`/superadmin/organizaciones/${id}`);
    }
    return { success: true, data: result };
  } catch (error) {
    return actionError(error);
  }
}

export async function bulkContactOrganizationPlanRecommendations(
  formData: FormData
): Promise<ActionResult<{ requested: number; updated: number; skipped: number; errors: number }>> {
  try {
    await requireSuperadmin();
    const ids = String(formData.get('organizationIds') ?? '')
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean);
    const note = String(formData.get('contactNote') ?? '').trim() || null;
    const { bulkTouchPlanRecommendationContact } = await import('@/lib/plan-recommendations');
    const result = await bulkTouchPlanRecommendationContact(ids, note);
    revalidatePath('/superadmin');
    for (const id of ids.slice(0, 50)) {
      revalidatePath(`/superadmin/organizaciones/${id}`);
    }
    return { success: true, data: result };
  } catch (error) {
    return actionError(error);
  }
}

export async function bulkFollowUpOrganizationPlanRecommendations(
  formData: FormData
): Promise<ActionResult<{ requested: number; updated: number; skipped: number; errors: number }>> {
  try {
    await requireSuperadmin();
    const ids = String(formData.get('organizationIds') ?? '')
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean);
    const raw = String(formData.get('followUpAt') ?? '').trim();
    let followUpAt: string | null = null;
    if (raw) {
      const parsed = new Date(raw);
      if (Number.isNaN(parsed.getTime())) {
        return { success: false, error: 'Fecha de seguimiento inválida' };
      }
      followUpAt = parsed.toISOString();
    }
    const { bulkSetPlanRecommendationFollowUp } = await import('@/lib/plan-recommendations');
    const result = await bulkSetPlanRecommendationFollowUp(ids, followUpAt);
    revalidatePath('/superadmin');
    for (const id of ids.slice(0, 50)) {
      revalidatePath(`/superadmin/organizaciones/${id}`);
    }
    return { success: true, data: result };
  } catch (error) {
    return actionError(error);
  }
}

export async function bulkOutcomeOrganizationPlanRecommendations(
  formData: FormData
): Promise<ActionResult<{ requested: number; updated: number; skipped: number; errors: number }>> {
  try {
    await requireSuperadmin();
    const ids = String(formData.get('organizationIds') ?? '')
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean);
    const raw = String(formData.get('outcome') ?? '').trim();
    const note = String(formData.get('outcomeNote') ?? '').trim() || null;
    const outcome =
      raw === 'won' || raw === 'lost' || raw === 'deferred' || raw === 'not_a_fit' ? raw : null;
    if (raw && !outcome) {
      return { success: false, error: 'Resultado comercial inválido' };
    }
    const { bulkSetPlanRecommendationOutcome } = await import('@/lib/plan-recommendations');
    const result = await bulkSetPlanRecommendationOutcome(ids, outcome, note);
    revalidatePath('/superadmin');
    for (const id of ids.slice(0, 50)) {
      revalidatePath(`/superadmin/organizaciones/${id}`);
    }
    return { success: true, data: result };
  } catch (error) {
    return actionError(error);
  }
}

export async function bulkFreezeOrganizationPlanRecommendations(
  formData: FormData
): Promise<ActionResult<{ requested: number; updated: number; skipped: number; errors: number }>> {
  try {
    await requireSuperadmin();
    const ids = String(formData.get('organizationIds') ?? '')
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean);
    const frozen = String(formData.get('frozen') ?? '') === 'true';
    const note = String(formData.get('freezeNote') ?? '').trim() || null;
    const { bulkSetPlanRecommendationFreeze } = await import('@/lib/plan-recommendations');
    const result = await bulkSetPlanRecommendationFreeze(ids, frozen, note);
    revalidatePath('/superadmin');
    for (const id of ids.slice(0, 50)) {
      revalidatePath(`/superadmin/organizaciones/${id}`);
    }
    return { success: true, data: result };
  } catch (error) {
    return actionError(error);
  }
}

export async function bulkNoteOrganizationPlanRecommendations(
  formData: FormData
): Promise<ActionResult<{ requested: number; updated: number; skipped: number; errors: number }>> {
  try {
    await requireSuperadmin();
    const ids = String(formData.get('organizationIds') ?? '')
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean);
    const rawMode = String(formData.get('noteMode') ?? 'replace').trim();
    const mode =
      rawMode === 'append' || rawMode === 'clear' || rawMode === 'replace' ? rawMode : 'replace';
    const note = String(formData.get('commercialNote') ?? '').trim() || null;
    if (mode !== 'clear' && !note) {
      return { success: false, error: 'Escribí una nota comercial' };
    }
    const { bulkSetPlanRecommendationNote } = await import('@/lib/plan-recommendations');
    const result = await bulkSetPlanRecommendationNote(ids, note, mode);
    revalidatePath('/superadmin');
    for (const id of ids.slice(0, 50)) {
      revalidatePath(`/superadmin/organizaciones/${id}`);
    }
    return { success: true, data: result };
  } catch (error) {
    return actionError(error);
  }
}

export async function saveOrganizationPlanRecommendationTags(
  formData: FormData
): Promise<ActionResult> {
  try {
    await requireSuperadmin();
    const organizationId = String(formData.get('organizationId') ?? '');
    if (!organizationId) return { success: false, error: 'Organización inválida' };
    const rawMode = String(formData.get('tagMode') ?? 'replace').trim();
    const mode =
      rawMode === 'add' || rawMode === 'remove' || rawMode === 'replace' ? rawMode : 'replace';
    const { parseCommercialTagsInput, setPlanRecommendationTags } = await import(
      '@/lib/plan-recommendations'
    );
    const tags = parseCommercialTagsInput(String(formData.get('tags') ?? ''));
    await setPlanRecommendationTags(organizationId, tags, mode);
    revalidateOrg(organizationId);
    return { success: true };
  } catch (error) {
    return actionError(error);
  }
}

export async function bulkTagOrganizationPlanRecommendations(
  formData: FormData
): Promise<ActionResult<{ requested: number; updated: number; skipped: number; errors: number }>> {
  try {
    await requireSuperadmin();
    const ids = String(formData.get('organizationIds') ?? '')
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean);
    const rawMode = String(formData.get('tagMode') ?? 'add').trim();
    const mode =
      rawMode === 'add' || rawMode === 'remove' || rawMode === 'replace' ? rawMode : 'add';
    const { parseCommercialTagsInput, bulkSetPlanRecommendationTags } = await import(
      '@/lib/plan-recommendations'
    );
    const tags = parseCommercialTagsInput(String(formData.get('tags') ?? ''));
    if (mode !== 'replace' && tags.length === 0) {
      return { success: false, error: 'Escribí al menos una etiqueta' };
    }
    const result = await bulkSetPlanRecommendationTags(ids, tags, mode);
    revalidatePath('/superadmin');
    for (const id of ids.slice(0, 50)) {
      revalidatePath(`/superadmin/organizaciones/${id}`);
    }
    return { success: true, data: result };
  } catch (error) {
    return actionError(error);
  }
}

export async function listSuperadminRecommendationTagCatalog() {
  const { listRecommendationTagCatalog } = await import('@/lib/plan-recommendations');
  return listRecommendationTagCatalog();
}

export async function listSuperadminRecommendationByTag(tag: string) {
  const { listRecommendationByTag } = await import('@/lib/plan-recommendations');
  return listRecommendationByTag(tag, 40);
}

export async function searchSuperadminRecommendationNotes(query: string) {
  const { searchRecommendationNotes } = await import('@/lib/plan-recommendations');
  return searchRecommendationNotes(query, 40);
}

export async function exportSuperadminRecommendationNoteSearchCsv(
  formData: FormData
): Promise<ActionResult<{ csv: string; rowCount: number }>> {
  try {
    await requireSuperadmin();
    const query = String(formData.get('query') ?? '').trim();
    if (query.length < 2) {
      return { success: false, error: 'Escribí al menos 2 caracteres' };
    }
    const { searchRecommendationNotes, formatRecommendationNoteSearchCsv } = await import(
      '@/lib/plan-recommendations'
    );
    const rows = await searchRecommendationNotes(query, 100);
    return {
      success: true,
      data: { csv: formatRecommendationNoteSearchCsv(rows), rowCount: rows.length },
    };
  } catch (error) {
    return actionError(error);
  }
}

export async function listSuperadminOpenRecommendationPipeline(options?: {
  mineOnly?: boolean;
  sort?: string;
}) {
  const { listOpenRecommendationPipeline } = await import('@/lib/plan-recommendations');
  const sortRaw = options?.sort ?? 'age_desc';
  const sort =
    sortRaw === 'age_asc' ||
    sortRaw === 'severity' ||
    sortRaw === 'name' ||
    sortRaw === 'follow_up' ||
    sortRaw === 'age_desc'
      ? sortRaw
      : 'age_desc';
  return listOpenRecommendationPipeline({
    limit: 100,
    mineOnly: options?.mineOnly ?? false,
    sort,
  });
}

export async function exportSuperadminOpenRecommendationPipelineCsv(
  formData?: FormData
): Promise<ActionResult<{ csv: string; rowCount: number }>> {
  try {
    await requireSuperadmin();
    const { listOpenRecommendationPipeline, formatOpenRecommendationPipelineCsv } = await import(
      '@/lib/plan-recommendations'
    );
    const mineOnly = String(formData?.get('mineOnly') ?? '') === 'true';
    const sortRaw = String(formData?.get('sort') ?? 'age_desc').trim();
    const sort =
      sortRaw === 'age_asc' ||
      sortRaw === 'severity' ||
      sortRaw === 'name' ||
      sortRaw === 'follow_up' ||
      sortRaw === 'age_desc'
        ? sortRaw
        : 'age_desc';
    const rows = await listOpenRecommendationPipeline({ limit: 300, mineOnly, sort });
    return {
      success: true,
      data: { csv: formatOpenRecommendationPipelineCsv(rows), rowCount: rows.length },
    };
  } catch (error) {
    return actionError(error);
  }
}

export async function listSuperadminRecommendationPriorityQueue(options?: {
  mineOnly?: boolean;
  includeFrozen?: boolean;
  includeSnoozed?: boolean;
}) {
  const { listRecommendationPriorityQueue } = await import('@/lib/plan-recommendations');
  return listRecommendationPriorityQueue({
    limit: 25,
    mineOnly: options?.mineOnly ?? false,
    includeFrozen: options?.includeFrozen ?? false,
    includeSnoozed: options?.includeSnoozed ?? false,
  });
}

export async function listSuperadminRecommendationCommercialSnoozed(mineOnly = false) {
  const { listRecommendationCommercialSnoozed } = await import('@/lib/plan-recommendations');
  return listRecommendationCommercialSnoozed({ limit: 40, mineOnly });
}

export async function exportSuperadminRecommendationPriorityQueueCsv(
  formData?: FormData
): Promise<ActionResult<{ csv: string; rowCount: number }>> {
  try {
    await requireSuperadmin();
    const { listRecommendationPriorityQueue, formatRecommendationPriorityQueueCsv } = await import(
      '@/lib/plan-recommendations'
    );
    const mineOnly = String(formData?.get('mineOnly') ?? '') === 'true';
    const includeFrozen = String(formData?.get('includeFrozen') ?? '') === 'true';
    const includeSnoozed = String(formData?.get('includeSnoozed') ?? '') === 'true';
    const rows = await listRecommendationPriorityQueue({
      limit: 100,
      mineOnly,
      includeFrozen,
      includeSnoozed,
    });
    return {
      success: true,
      data: { csv: formatRecommendationPriorityQueueCsv(rows), rowCount: rows.length },
    };
  } catch (error) {
    return actionError(error);
  }
}

export async function getSuperadminRecommendationAging() {
  const { getRecommendationAging } = await import('@/lib/plan-recommendations');
  return getRecommendationAging();
}

export async function listSuperadminRecommendationAging(bucket: string) {
  const { listRecommendationAging } = await import('@/lib/plan-recommendations');
  const valid =
    bucket === '0-7' ||
    bucket === '8-14' ||
    bucket === '15-30' ||
    bucket === '31-plus' ||
    bucket === 'unknown'
      ? bucket
      : null;
  if (!valid) return [];
  return listRecommendationAging(valid, 40);
}

export async function exportSuperadminRecommendationAgingCsv(formData?: FormData): Promise<
  ActionResult<{ csv: string; rowCount: number }>
> {
  try {
    await requireSuperadmin();
    const {
      getRecommendationAging,
      listRecommendationAging,
      formatRecommendationAgingCsv,
      formatRecommendationAgingRowsCsv,
    } = await import('@/lib/plan-recommendations');
    const bucket = String(formData?.get('bucket') ?? '').trim();
    if (
      bucket === '0-7' ||
      bucket === '8-14' ||
      bucket === '15-30' ||
      bucket === '31-plus' ||
      bucket === 'unknown'
    ) {
      const rows = await listRecommendationAging(bucket, 100);
      return {
        success: true,
        data: { csv: formatRecommendationAgingRowsCsv(rows), rowCount: rows.length },
      };
    }
    const aging = await getRecommendationAging();
    return {
      success: true,
      data: { csv: formatRecommendationAgingCsv(aging), rowCount: 1 },
    };
  } catch (error) {
    return actionError(error);
  }
}

export async function getSuperadminRecommendationTagScorecard() {
  const { getRecommendationTagScorecard } = await import('@/lib/plan-recommendations');
  return getRecommendationTagScorecard();
}

export async function exportSuperadminRecommendationTagScorecardCsv(): Promise<
  ActionResult<{ csv: string; rowCount: number }>
> {
  try {
    await requireSuperadmin();
    const { getRecommendationTagScorecard, formatRecommendationTagScorecardCsv } = await import(
      '@/lib/plan-recommendations'
    );
    const scorecard = await getRecommendationTagScorecard();
    const rowCount = scorecard.tags.length + (scorecard.untagged ? 1 : 0);
    return {
      success: true,
      data: {
        csv: formatRecommendationTagScorecardCsv(scorecard),
        rowCount,
      },
    };
  } catch (error) {
    return actionError(error);
  }
}

export async function exportSuperadminRecommendationDigestCsv(formData?: FormData): Promise<
  ActionResult<{ csv: string; rowCount: number }>
> {
  try {
    await requireSuperadmin();
    const { getRecommendationDigest, formatRecommendationDigestCsv } = await import(
      '@/lib/plan-recommendations'
    );
    const mineOnly = String(formData?.get('mineOnly') ?? '') === 'true';
    const digest = await getRecommendationDigest({ limit: 50, mineOnly });
    const csv = formatRecommendationDigestCsv(digest);
    const rowCount =
      digest.overdueFollowUps.length +
      digest.dueToday.length +
      digest.staleUnassigned.length +
      digest.criticalUnassigned.length +
      digest.recentOutcomes.length +
      digest.neverContacted.length;
    return { success: true, data: { csv, rowCount } };
  } catch (error) {
    return actionError(error);
  }
}

export async function exportSuperadminOutcomesCsv(formData?: FormData): Promise<
  ActionResult<{ csv: string; rowCount: number }>
> {
  try {
    await requireSuperadmin();
    const { listRecommendationOutcomes, formatOutcomesCsv } = await import(
      '@/lib/plan-recommendations'
    );
    const raw = String(formData?.get('outcomeFilter') ?? '').trim();
    const outcome =
      raw === 'won' || raw === 'lost' || raw === 'deferred' || raw === 'not_a_fit' ? raw : null;
    const rows = await listRecommendationOutcomes(100, outcome);
    return { success: true, data: { csv: formatOutcomesCsv(rows), rowCount: rows.length } };
  } catch (error) {
    return actionError(error);
  }
}

export async function listSuperadminUpgradeQueue(limit = 12) {
  const { listSuperadminOrganizationsWithRecommendations } = await import(
    '@/lib/plan-recommendations'
  );
  return listSuperadminOrganizationsWithRecommendations({
    page: 1,
    pageSize: Math.min(25, Math.max(1, limit)),
    upgradeFilter: 'upgrade_recommended',
    sort: 'usage_desc',
    persistRecommendations: false,
  });
}

export async function listSuperadminRecommendationFollowUps(
  limit = 25,
  filter?: { assignedTo?: string | null; unassignedOnly?: boolean }
) {
  const { listRecommendationFollowUps } = await import('@/lib/plan-recommendations');
  return listRecommendationFollowUps(limit, filter);
}

export async function exportSuperadminFollowUpsCsv(formData?: FormData): Promise<
  ActionResult<{ csv: string; rowCount: number }>
> {
  try {
    await requireSuperadmin();
    const { listRecommendationFollowUps, formatFollowUpsCsv } = await import(
      '@/lib/plan-recommendations'
    );
    const assigneeFilter = String(formData?.get('assigneeFilter') ?? '').trim();
    let filter: { assignedTo?: string | null; unassignedOnly?: boolean } = {};
    if (assigneeFilter === 'unassigned') {
      filter = { unassignedOnly: true };
    } else if (assigneeFilter === 'me') {
      const session = await getSessionContext();
      if (session?.userId) filter = { assignedTo: session.userId };
    } else if (assigneeFilter) {
      filter = { assignedTo: assigneeFilter };
    }
    const rows = await listRecommendationFollowUps(100, filter);
    return { success: true, data: { csv: formatFollowUpsCsv(rows), rowCount: rows.length } };
  } catch (error) {
    return actionError(error);
  }
}

export async function getSuperadminRecommendationSettings() {
  const { getRecommendationSettings } = await import('@/lib/plan-recommendations');
  return getRecommendationSettings();
}

export async function saveSuperadminRecommendationSettings(
  formData: FormData
): Promise<ActionResult> {
  try {
    await requireSuperadmin();
    const thresholdInfo = Number(formData.get('thresholdInfo'));
    const thresholdWarning = Number(formData.get('thresholdWarning'));
    const thresholdCritical = Number(formData.get('thresholdCritical'));
    const clinicSnoozeDays = Number(formData.get('clinicSnoozeDays'));
    const staleDays = Number(formData.get('staleDays'));
    if (
      ![thresholdInfo, thresholdWarning, thresholdCritical, clinicSnoozeDays, staleDays].every((n) =>
        Number.isFinite(n)
      )
    ) {
      return { success: false, error: 'Valores inválidos' };
    }
    if (!(thresholdInfo < thresholdWarning && thresholdWarning <= thresholdCritical)) {
      return { success: false, error: 'Los umbrales deben ser info < warning ≤ critical' };
    }
    if (clinicSnoozeDays < 1 || clinicSnoozeDays > 90) {
      return { success: false, error: 'El snooze debe ser entre 1 y 90 días' };
    }
    if (staleDays < 1 || staleDays > 180) {
      return { success: false, error: 'Stale debe ser entre 1 y 180 días' };
    }

    const {
      DEFAULT_RECOMMENDATION_PRIORITY_WEIGHTS,
      setRecommendationSettings,
    } = await import('@/lib/plan-recommendations');
    const weightKeys = [
      'critical',
      'warning',
      'info',
      'usage100',
      'usage90',
      'usage80',
      'age31',
      'age15',
      'age8',
      'neverContacted',
      'overdueFollowUp',
      'unassigned',
      'frozenPenalty',
    ] as const;
    const priorityWeights = { ...DEFAULT_RECOMMENDATION_PRIORITY_WEIGHTS };
    for (const key of weightKeys) {
      const raw = formData.get(`pw_${key}`);
      if (raw == null || String(raw).trim() === '') continue;
      const value = Number(raw);
      if (!Number.isFinite(value) || value < 0 || value > 200) {
        return { success: false, error: `Peso inválido: ${key}` };
      }
      priorityWeights[key] = Math.round(value);
    }

    await setRecommendationSettings({
      thresholdInfo,
      thresholdWarning,
      thresholdCritical,
      clinicSnoozeDays: Math.round(clinicSnoozeDays),
      staleDays: Math.round(staleDays),
      priorityWeights,
    });
    revalidatePath('/superadmin');
    return { success: true };
  } catch (error) {
    return actionError(error);
  }
}

export async function recordCommercialFeatureSignal(featureKey: string): Promise<void> {
  try {
    if (!featureKey) return;
    const supabase = await createServerClient();
    await supabase.rpc('record_commercial_feature_signal', {
      p_feature_key: featureKey,
      p_event_type: 'feature_denied',
    });
  } catch {
    // Best-effort commercial signal; never block clinic UX.
  }
}
