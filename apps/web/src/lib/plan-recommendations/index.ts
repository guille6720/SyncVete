import 'server-only';

import {
  FEATURES,
  PLAN_UPGRADE_LADDER,
  PLAN_USAGE_THRESHOLDS,
  SEAT_USAGE_LABELS,
  METERED_USAGE_LABELS,
  computePlanRecommendation,
  comparePlanFeatures,
  formatRecommendationsCsv,
  getResolvedFeatureLimit,
  type PlanRecommendation,
  type PlanRecommendationInput,
  type PaidPlanKey,
  type FeatureGrantSnapshot,
  type ModuleActivitySnapshot,
  type UsageMeterSnapshot,
  type RecommendationStatus,
  type CommercialPlanKey,
} from '@sincvete/shared';
import { createServerClient } from '@/lib/supabase/server';
import { requireSuperadmin } from '@/lib/permissions';
import { getOrganizationEntitlements, loadOrganizationEntitlementInput } from '@/lib/entitlements';
import {
  COMMERCIAL_OUTCOME_LABELS,
  COMMERCIAL_SAVED_VIEW_PARAM_KEYS,
  DEFAULT_RECOMMENDATION_PRIORITY_WEIGHTS,
  commercialSavedViewHref,
  sanitizeCommercialSavedViewParams,
  type CommercialRecommendationOutcome,
  type CommercialSavedViewParamKey,
  type RecommendationPriorityWeights,
  type RecommendationSavedView,
  type RecommendationSettings,
} from '@/lib/plan-recommendations/shared';

export {
  COMMERCIAL_OUTCOME_LABELS,
  COMMERCIAL_SAVED_VIEW_PARAM_KEYS,
  DEFAULT_RECOMMENDATION_PRIORITY_WEIGHTS,
  commercialSavedViewHref,
  sanitizeCommercialSavedViewParams,
};
export type {
  CommercialRecommendationOutcome,
  CommercialSavedViewParamKey,
  RecommendationPriorityWeights,
  RecommendationSavedView,
  RecommendationSettings,
};

export type PlanCatalogMatrix = {
  plans: Array<{
    key: string;
    name: string;
    isInternal: boolean;
    isPublic: boolean;
    features: Array<{
      featureKey: string;
      featureName: string;
      enabled: boolean;
      limitValue: number | null;
    }>;
  }>;
};

type RecommendationInputRow = {
  id: string;
  name: string;
  slug: string;
  plan_key: string | null;
  plan_name: string | null;
  status: PlanRecommendationInput['subscriptionStatus'];
  trial_ends_at: string | null;
  starts_at: string | null;
  created_at: string;
  owner_name: string | null;
  users_used: number;
  branches_used: number;
  professionals_used: number;
  patients_used: number;
  ai_used: number;
  whatsapp_used: number;
  storage_used: number;
  has_hospitalization: boolean;
  has_surgery: boolean;
  has_laboratory: boolean;
  has_inventory: boolean;
  has_pharmacy: boolean;
  has_billing: boolean;
  has_cash: boolean;
  has_portal: boolean;
  has_reports: boolean;
  has_ai: boolean;
  has_whatsapp: boolean;
  has_images: boolean;
  has_advanced_reports: boolean;
  access_attempt_features: string[] | null;
  rec_status: string | null;
  rec_recommended_plan_key: string | null;
  rec_fingerprint: string | null;
  rec_dismissed_at: string | null;
  rec_max_usage_ratio_at_dismiss: number | null;
  total_count: number;
};

let catalogCache: { at: number; value: PlanCatalogMatrix } | null = null;
let thresholdsCache: { at: number; value: typeof PLAN_USAGE_THRESHOLDS } | null = null;

function parsePriorityWeights(raw: unknown): RecommendationPriorityWeights {
  const row =
    raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : ({} as Record<string, unknown>);
  const num = (key: string, fallback: number) => {
    const value = Number(row[key]);
    return Number.isFinite(value) && value >= 0 && value <= 200 ? Math.round(value) : fallback;
  };
  return {
    critical: num('critical', DEFAULT_RECOMMENDATION_PRIORITY_WEIGHTS.critical),
    warning: num('warning', DEFAULT_RECOMMENDATION_PRIORITY_WEIGHTS.warning),
    info: num('info', DEFAULT_RECOMMENDATION_PRIORITY_WEIGHTS.info),
    usage100: num('usage_100', DEFAULT_RECOMMENDATION_PRIORITY_WEIGHTS.usage100),
    usage90: num('usage_90', DEFAULT_RECOMMENDATION_PRIORITY_WEIGHTS.usage90),
    usage80: num('usage_80', DEFAULT_RECOMMENDATION_PRIORITY_WEIGHTS.usage80),
    age31: num('age_31', DEFAULT_RECOMMENDATION_PRIORITY_WEIGHTS.age31),
    age15: num('age_15', DEFAULT_RECOMMENDATION_PRIORITY_WEIGHTS.age15),
    age8: num('age_8', DEFAULT_RECOMMENDATION_PRIORITY_WEIGHTS.age8),
    neverContacted: num('never_contacted', DEFAULT_RECOMMENDATION_PRIORITY_WEIGHTS.neverContacted),
    overdueFollowUp: num(
      'overdue_follow_up',
      DEFAULT_RECOMMENDATION_PRIORITY_WEIGHTS.overdueFollowUp
    ),
    unassigned: num('unassigned', DEFAULT_RECOMMENDATION_PRIORITY_WEIGHTS.unassigned),
    frozenPenalty: num('frozen_penalty', DEFAULT_RECOMMENDATION_PRIORITY_WEIGHTS.frozenPenalty),
  };
}

function priorityWeightsToRpc(weights: RecommendationPriorityWeights) {
  return {
    critical: weights.critical,
    warning: weights.warning,
    info: weights.info,
    usage_100: weights.usage100,
    usage_90: weights.usage90,
    usage_80: weights.usage80,
    age_31: weights.age31,
    age_15: weights.age15,
    age_8: weights.age8,
    never_contacted: weights.neverContacted,
    overdue_follow_up: weights.overdueFollowUp,
    unassigned: weights.unassigned,
    frozen_penalty: weights.frozenPenalty,
  };
}

export async function loadRecommendationThresholds(): Promise<typeof PLAN_USAGE_THRESHOLDS> {
  if (thresholdsCache && Date.now() - thresholdsCache.at < 60_000) {
    return thresholdsCache.value;
  }
  try {
    const supabase = await createServerClient();
    const { data, error } = await supabase.rpc('get_recommendation_thresholds');
    if (error || !data || typeof data !== 'object') {
      return PLAN_USAGE_THRESHOLDS;
    }
    const row = data as Record<string, unknown>;
    const info = Number(row.info);
    const warning = Number(row.warning);
    const critical = Number(row.critical);
    const value = {
      info: Number.isFinite(info) && info > 0 ? info : PLAN_USAGE_THRESHOLDS.info,
      warning: Number.isFinite(warning) && warning > 0 ? warning : PLAN_USAGE_THRESHOLDS.warning,
      critical: Number.isFinite(critical) && critical > 0 ? critical : PLAN_USAGE_THRESHOLDS.critical,
    } as typeof PLAN_USAGE_THRESHOLDS;
    thresholdsCache = { at: Date.now(), value };
    return value;
  } catch {
    return PLAN_USAGE_THRESHOLDS;
  }
}

export async function getRecommendationSettings(): Promise<RecommendationSettings> {
  await requireSuperadmin();
  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc('superadmin_get_recommendation_settings');
  if (error) throw new Error(error.message);
  const row = (data ?? {}) as Record<string, unknown>;
  return {
    thresholdInfo: Number(row.threshold_info ?? PLAN_USAGE_THRESHOLDS.info),
    thresholdWarning: Number(row.threshold_warning ?? PLAN_USAGE_THRESHOLDS.warning),
    thresholdCritical: Number(row.threshold_critical ?? PLAN_USAGE_THRESHOLDS.critical),
    clinicSnoozeDays: Number(row.clinic_snooze_days ?? 14) || 14,
    staleDays: Number(row.stale_days ?? 14) || 14,
    priorityWeights: parsePriorityWeights(row.priority_weights),
    updatedAt: typeof row.updated_at === 'string' ? row.updated_at : null,
  };
}

export async function setRecommendationSettings(input: {
  thresholdInfo: number;
  thresholdWarning: number;
  thresholdCritical: number;
  clinicSnoozeDays: number;
  staleDays: number;
  priorityWeights?: RecommendationPriorityWeights;
}): Promise<RecommendationSettings> {
  await requireSuperadmin();
  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc('superadmin_set_recommendation_settings', {
    p_threshold_info: input.thresholdInfo,
    p_threshold_warning: input.thresholdWarning,
    p_threshold_critical: input.thresholdCritical,
    p_clinic_snooze_days: input.clinicSnoozeDays,
    p_stale_days: input.staleDays,
    p_priority_weights: input.priorityWeights
      ? priorityWeightsToRpc(input.priorityWeights)
      : null,
  });
  if (error) throw new Error(error.message);
  thresholdsCache = null;
  const row = (data ?? {}) as Record<string, unknown>;
  return {
    thresholdInfo: Number(row.threshold_info ?? input.thresholdInfo),
    thresholdWarning: Number(row.threshold_warning ?? input.thresholdWarning),
    thresholdCritical: Number(row.threshold_critical ?? input.thresholdCritical),
    clinicSnoozeDays: Number(row.clinic_snooze_days ?? input.clinicSnoozeDays) || 14,
    staleDays: Number(row.stale_days ?? input.staleDays) || 14,
    priorityWeights: parsePriorityWeights(
      row.priority_weights ??
        (input.priorityWeights ? priorityWeightsToRpc(input.priorityWeights) : null)
    ),
    updatedAt: typeof row.updated_at === 'string' ? row.updated_at : null,
  };
}

export async function loadPlanCatalogMatrix(): Promise<PlanCatalogMatrix> {
  await requireSuperadmin();
  if (catalogCache && Date.now() - catalogCache.at < 60_000) {
    return catalogCache.value;
  }
  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc('superadmin_plan_catalog_matrix');
  if (error) throw new Error(error.message);
  const raw = (data ?? {}) as {
    plans?: Array<{
      key: string;
      name: string;
      is_internal?: boolean;
      is_public?: boolean;
      features?: Array<{
        feature_key: string;
        feature_name: string;
        enabled: boolean;
        limit_value: number | null;
      }>;
    }>;
  };
  const value: PlanCatalogMatrix = {
    plans: (raw.plans ?? []).map((plan) => ({
      key: plan.key,
      name: plan.name,
      isInternal: Boolean(plan.is_internal),
      isPublic: Boolean(plan.is_public),
      features: (plan.features ?? []).map((f) => ({
        featureKey: f.feature_key,
        featureName: f.feature_name,
        enabled: Boolean(f.enabled),
        limitValue: f.limit_value === null || f.limit_value === undefined ? null : Number(f.limit_value),
      })),
    })),
  };
  catalogCache = { at: Date.now(), value };
  return value;
}

function matrixToEngineMaps(matrix: PlanCatalogMatrix): {
  planIncludesFeature: PlanRecommendationInput['planIncludesFeature'];
  planLimits: PlanRecommendationInput['planLimits'];
  featureNames: Record<string, string>;
} {
  const planIncludesFeature: PlanRecommendationInput['planIncludesFeature'] = {};
  const planLimits: PlanRecommendationInput['planLimits'] = {};
  const featureNames: Record<string, string> = {};

  for (const plan of matrix.plans) {
    if (!(PLAN_UPGRADE_LADDER as readonly string[]).includes(plan.key)) continue;
    const key = plan.key as PaidPlanKey;
    planIncludesFeature[key] = plan.features.filter((f) => f.enabled).map((f) => f.featureKey);
    const limits: Record<string, number | null> = {};
    for (const f of plan.features) {
      featureNames[f.featureKey] = f.featureName;
      if (f.limitValue !== null || f.enabled) {
        limits[f.featureKey] = f.enabled ? f.limitValue : 0;
      }
    }
    planLimits[key] = limits;
  }
  return { planIncludesFeature, planLimits, featureNames };
}

function activityFromRow(row: RecommendationInputRow): ModuleActivitySnapshot[] {
  return [
    { featureKey: FEATURES.HOSPITALIZATION, active: row.has_hospitalization },
    { featureKey: FEATURES.SURGERY, active: row.has_surgery },
    { featureKey: FEATURES.LABORATORY, active: row.has_laboratory },
    { featureKey: FEATURES.INVENTORY, active: row.has_inventory },
    { featureKey: FEATURES.PHARMACY, active: row.has_pharmacy },
    { featureKey: FEATURES.BILLING, active: row.has_billing },
    { featureKey: FEATURES.CASH_REGISTER, active: row.has_cash },
    { featureKey: FEATURES.OWNER_PORTAL, active: row.has_portal },
    { featureKey: FEATURES.BASIC_REPORTS, active: row.has_reports },
    { featureKey: FEATURES.AI, active: row.has_ai },
    { featureKey: FEATURES.WHATSAPP, active: row.has_whatsapp },
    { featureKey: FEATURES.CLINICAL_IMAGES, active: row.has_images },
    { featureKey: FEATURES.ADVANCED_REPORTS, active: row.has_advanced_reports },
  ];
}

function seatsFromRow(row: RecommendationInputRow, limits: Record<string, number | null>): UsageMeterSnapshot[] {
  const mk = (featureKey: string, used: number): UsageMeterSnapshot => ({
    featureKey,
    label: SEAT_USAGE_LABELS[featureKey] ?? featureKey,
    used: Number(used) || 0,
    limit: limits[featureKey] ?? null,
  });
  return [
    mk(FEATURES.USERS_MAX, row.users_used),
    mk(FEATURES.BRANCHES_MAX, row.branches_used),
    mk(FEATURES.PROFESSIONALS_MAX, row.professionals_used),
    mk(FEATURES.PATIENTS_MAX, row.patients_used),
  ];
}

function metersFromRow(row: RecommendationInputRow, limits: Record<string, number | null>): UsageMeterSnapshot[] {
  const mk = (featureKey: string, used: number): UsageMeterSnapshot => ({
    featureKey,
    label: METERED_USAGE_LABELS[featureKey] ?? featureKey,
    used: Number(used) || 0,
    limit: limits[featureKey] ?? null,
  });
  return [
    mk(FEATURES.AI_MONTHLY_REQUESTS, row.ai_used),
    mk(FEATURES.WHATSAPP_MONTHLY_MESSAGES, row.whatsapp_used),
    mk(FEATURES.STORAGE_MAX_MB, row.storage_used),
  ];
}

/** Approximate grants from plan matrix when per-org entitlements are not loaded (list path). */
function grantsFromPlanMatrix(
  planKey: string | null,
  matrix: PlanCatalogMatrix,
  activity: ModuleActivitySnapshot[],
  accessAttempts: string[]
): FeatureGrantSnapshot[] {
  const plan = matrix.plans.find((p) => p.key === planKey);
  const grants: FeatureGrantSnapshot[] = [];
  const seen = new Set<string>();
  for (const f of plan?.features ?? []) {
    seen.add(f.featureKey);
    grants.push({
      featureKey: f.featureKey,
      enabled: Boolean(f.enabled),
      source: f.enabled ? 'plan' : 'deny',
    });
  }
  // Access attempts / activity on features not in plan → not granted
  for (const item of [...activity, ...accessAttempts.map((k) => ({ featureKey: k, active: true }))]) {
    if (seen.has(item.featureKey)) continue;
    grants.push({ featureKey: item.featureKey, enabled: false, source: 'deny' });
  }
  return grants;
}

export type SuperadminOrgRecommendationRow = {
  id: string;
  name: string;
  slug: string;
  ownerName: string | null;
  planKey: string | null;
  planName: string | null;
  status: PlanRecommendationInput['subscriptionStatus'];
  trialEndsAt: string | null;
  startsAt: string | null;
  createdAt: string;
  usersUsed: number;
  branchesUsed: number;
  patientsUsed: number;
  recommendation: PlanRecommendation;
};

export async function listSuperadminOrganizationsWithRecommendations(params: {
  search?: string;
  page?: number;
  pageSize?: number;
  planKey?: string;
  status?: string;
  recommendedPlan?: string;
  upgradeFilter?: string;
  sort?: string;
  /** When false, skip writing recommendation rows (used by bulk refresh). Default true. */
  persistRecommendations?: boolean;
}): Promise<{
  rows: SuperadminOrgRecommendationRow[];
  total: number;
  page: number;
  pageSize: number;
  summary: RecommendationDashboardSummary;
}> {
  await requireSuperadmin();
  const supabase = await createServerClient();
  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, params.pageSize ?? 25));
  const persistRecommendations = params.persistRecommendations !== false;
  const matrix = await loadPlanCatalogMatrix();
  const maps = matrixToEngineMaps(matrix);
  const thresholds = await loadRecommendationThresholds();

  const { data, error } = await supabase.rpc('superadmin_list_orgs_recommendation_inputs', {
    p_search: params.search?.trim() || null,
    p_page: page,
    p_page_size: pageSize,
    p_plan_key: params.planKey?.trim() || null,
    p_status: params.status?.trim() || null,
    p_recommended_plan: params.recommendedPlan?.trim() || null,
    p_upgrade_filter: params.upgradeFilter?.trim() || null,
    p_sort: params.sort?.trim() || null,
    p_organization_id: null,
  });
  if (error) throw new Error(error.message);

  const rawRows = (data ?? []) as RecommendationInputRow[];
  const total = Number(rawRows[0]?.total_count ?? 0);

  // Load entitlements for the page only (batched, not N+1 across all clinics).
  const entitlementsByOrg = new Map<string, Awaited<ReturnType<typeof getOrganizationEntitlements>>>();
  await Promise.all(
    rawRows.map(async (row) => {
      try {
        const entitlements = await getOrganizationEntitlements(row.id);
        entitlementsByOrg.set(row.id, entitlements);
      } catch {
        // Schema may be incomplete; fall back to plan matrix grants.
      }
    })
  );

  const rows: SuperadminOrgRecommendationRow[] = rawRows.map((row) => {
    const entitlements = entitlementsByOrg.get(row.id);
    const activity = activityFromRow(row);
    const accessAttempts = row.access_attempt_features ?? [];
    const limitKeys = [
      FEATURES.USERS_MAX,
      FEATURES.BRANCHES_MAX,
      FEATURES.PROFESSIONALS_MAX,
      FEATURES.PATIENTS_MAX,
      FEATURES.AI_MONTHLY_REQUESTS,
      FEATURES.WHATSAPP_MONTHLY_MESSAGES,
      FEATURES.STORAGE_MAX_MB,
    ];
    const limits: Record<string, number | null> = {};
    for (const key of limitKeys) {
      limits[key] = entitlements
        ? getResolvedFeatureLimit(entitlements, key)
        : maps.planLimits[row.plan_key as PaidPlanKey]?.[key] ?? null;
    }

    const grants: FeatureGrantSnapshot[] = entitlements
      ? Object.entries(entitlements).map(([featureKey, resolved]) => ({
          featureKey,
          enabled: resolved.enabled,
          source: resolved.source,
        }))
      : grantsFromPlanMatrix(row.plan_key, matrix, activity, accessAttempts);

    const recommendation = computePlanRecommendation({
      organizationId: row.id,
      currentPlanKey: row.plan_key,
      subscriptionStatus: row.status,
      seats: seatsFromRow(row, limits),
      meters: metersFromRow(row, limits),
      grants,
      activity,
      accessAttempts,
      planIncludesFeature: maps.planIncludesFeature,
      planLimits: maps.planLimits,
      thresholds,
      persisted: row.rec_status
        ? {
            status: row.rec_status as RecommendationStatus,
            recommendedPlanKey: row.rec_recommended_plan_key,
            fingerprint: row.rec_fingerprint,
            dismissedAt: row.rec_dismissed_at,
            maxUsageRatioAtDismiss:
              row.rec_max_usage_ratio_at_dismiss === null
                ? null
                : Number(row.rec_max_usage_ratio_at_dismiss),
          }
        : null,
    });

    return {
      id: row.id,
      name: row.name,
      slug: row.slug,
      ownerName: row.owner_name,
      planKey: row.plan_key,
      planName: row.plan_name,
      status: row.status,
      trialEndsAt: row.trial_ends_at,
      startsAt: row.starts_at,
      createdAt: row.created_at,
      usersUsed: Number(row.users_used) || 0,
      branchesUsed: Number(row.branches_used) || 0,
      patientsUsed: Number(row.patients_used) || 0,
      recommendation,
    };
  });

  // Persist active recommendations so clinic soft notices can appear (best-effort, page only).
  if (persistRecommendations) {
    await Promise.all(
      rows
        .filter((row) => row.recommendation.shouldRecommendUpgrade && row.recommendation.status === 'recommended')
        .map(async (row) => {
          try {
            await persistPlanRecommendation(row.recommendation, 'recommended');
          } catch {
            // Persistence optional if phase 31/32 not applied yet.
          }
        })
    );
  }

  const [pageSummary, globalSummary] = await Promise.all([
    Promise.resolve(buildRecommendationSummary(rows, total)),
    getGlobalRecommendationSummary().catch(() => null),
  ]);

  return {
    rows,
    total,
    page,
    pageSize,
    summary: globalSummary ?? pageSummary,
  };
}

/**
 * Walk all clinics, recompute recommendations, and persist advisory rows.
 * Does not change subscriptions.
 */
export async function refreshAllPlanRecommendations(options?: {
  maxOrgs?: number;
  pageSize?: number;
}): Promise<{ scanned: number; recommended: number; cleared: number; pages: number }> {
  await requireSuperadmin();
  const supabase = await createServerClient();
  const pageSize = Math.min(100, Math.max(10, options?.pageSize ?? 50));
  const maxOrgs = Math.max(1, options?.maxOrgs ?? 5000);
  let page = 1;
  let scanned = 0;
  let recommended = 0;
  let cleared = 0;
  let pages = 0;
  let total = Number.POSITIVE_INFINITY;

  while (scanned < maxOrgs && scanned < total) {
    const batch = await listSuperadminOrganizationsWithRecommendations({
      page,
      pageSize,
      persistRecommendations: false,
    });
    pages += 1;
    total = batch.total;
    if (batch.rows.length === 0) break;

    for (const row of batch.rows) {
      scanned += 1;
      const rec = row.recommendation;
      try {
        if (rec.status === 'recommended' && rec.shouldRecommendUpgrade) {
          await persistPlanRecommendation(rec, 'recommended');
          recommended += 1;
        } else if (rec.status === 'none') {
          const { data: clearData, error: clearError } = await supabase.rpc(
            'superadmin_clear_idle_plan_recommendation',
            { p_organization_id: row.id }
          );
          if (!clearError && clearData && typeof clearData === 'object' && (clearData as { cleared?: boolean }).cleared) {
            cleared += 1;
          }
        }
      } catch {
        // Continue remaining orgs if one upsert fails.
      }
      if (scanned >= maxOrgs) break;
    }

    if (batch.rows.length < pageSize) break;
    page += 1;
  }

  return { scanned, recommended, cleared, pages };
}

export function recommendationsToCsv(rows: SuperadminOrgRecommendationRow[]): string {
  return formatRecommendationsCsv(
    rows.map((row) => ({
      clinicName: row.name,
      slug: row.slug,
      ownerName: row.ownerName,
      currentPlan: row.planKey,
      subscriptionStatus: row.status,
      usersUsed: row.usersUsed,
      branchesUsed: row.branchesUsed,
      patientsUsed: row.patientsUsed,
      usageLevel: row.recommendation.usageLevel,
      recommendedPlan: row.recommendation.recommendedPlan,
      upgradeStatus: row.recommendation.upgradeStatus,
      severity: row.recommendation.severity,
      reasons: row.recommendation.reasons,
    }))
  );
}

export async function exportRecommendationsCsv(params: {
  search?: string;
  planKey?: string;
  status?: string;
  recommendedPlan?: string;
  upgradeFilter?: string;
  sort?: string;
  maxRows?: number;
}): Promise<{ csv: string; rowCount: number }> {
  await requireSuperadmin();
  const pageSize = 100;
  const maxRows = Math.min(5000, Math.max(1, params.maxRows ?? 2000));
  const all: SuperadminOrgRecommendationRow[] = [];
  let page = 1;
  let total = Number.POSITIVE_INFINITY;

  while (all.length < maxRows && all.length < total) {
    const batch = await listSuperadminOrganizationsWithRecommendations({
      search: params.search,
      planKey: params.planKey,
      status: params.status,
      recommendedPlan: params.recommendedPlan,
      upgradeFilter: params.upgradeFilter,
      sort: params.sort,
      page,
      pageSize,
      persistRecommendations: false,
    });
    total = batch.total;
    if (batch.rows.length === 0) break;
    all.push(...batch.rows);
    if (batch.rows.length < pageSize) break;
    page += 1;
  }

  const trimmed = all.slice(0, maxRows);
  return { csv: recommendationsToCsv(trimmed), rowCount: trimmed.length };
}

export type RecommendationDashboardSummary = {
  upgradeRecommended: number;
  basicToPro: number;
  proToPremium: number;
  premiumToEnterprise: number;
  nearLimit: number;
  atLimit: number;
  legacyReview: number;
  trialConversion: number;
  reviewed?: number;
  dismissed?: number;
  accepted?: number;
  clinicDismissedActive?: number;
  frozen?: number;
  followUpsOpen?: number;
  followUpsOverdue?: number;
  unassignedRecommended?: number;
  assignedOpen?: number;
  assignedToMe?: number;
  outcomeWon?: number;
  outcomeLost?: number;
  outcomeDeferred?: number;
  outcomeNotAFit?: number;
  staleOpen?: number;
  staleDays?: number;
  neverContactedOpen?: number;
};

export async function getGlobalRecommendationSummary(): Promise<RecommendationDashboardSummary> {
  await requireSuperadmin();
  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc('superadmin_recommendation_summary');
  if (error) throw new Error(error.message);
  const row = (data ?? {}) as Record<string, unknown>;
  const num = (key: string) => Number(row[key] ?? 0) || 0;
  return {
    upgradeRecommended: num('upgrade_recommended'),
    basicToPro: num('basic_to_pro'),
    proToPremium: num('pro_to_premium'),
    premiumToEnterprise: num('premium_to_enterprise'),
    nearLimit: num('near_limit'),
    atLimit: num('at_limit'),
    legacyReview: num('legacy_rows'),
    trialConversion: num('trial_conversion'),
    reviewed: num('reviewed'),
    dismissed: num('dismissed'),
    accepted: num('accepted'),
    clinicDismissedActive: num('clinic_dismissed_active'),
    frozen: num('frozen'),
    followUpsOpen: num('follow_ups_open'),
    followUpsOverdue: num('follow_ups_overdue'),
    unassignedRecommended: num('unassigned_recommended'),
    assignedOpen: num('assigned_open'),
    assignedToMe: num('assigned_to_me'),
    outcomeWon: num('outcome_won'),
    outcomeLost: num('outcome_lost'),
    outcomeDeferred: num('outcome_deferred'),
    outcomeNotAFit: num('outcome_not_a_fit'),
    staleOpen: num('stale_open'),
    staleDays: num('stale_days') || 14,
    neverContactedOpen: num('never_contacted_open'),
  };
}

function buildRecommendationSummary(
  rows: SuperadminOrgRecommendationRow[],
  _total: number
): RecommendationDashboardSummary {
  const summary: RecommendationDashboardSummary = {
    upgradeRecommended: 0,
    basicToPro: 0,
    proToPremium: 0,
    premiumToEnterprise: 0,
    nearLimit: 0,
    atLimit: 0,
    legacyReview: 0,
    trialConversion: 0,
  };
  for (const row of rows) {
    const rec = row.recommendation;
    if (rec.shouldRecommendUpgrade) summary.upgradeRecommended += 1;
    if (rec.upgradeStatus === 'near_limit') summary.nearLimit += 1;
    if (rec.upgradeStatus === 'limit_reached') summary.atLimit += 1;
    if (rec.upgradeStatus === 'legacy_review') summary.legacyReview += 1;
    if (rec.upgradeStatus === 'trial_conversion') summary.trialConversion += 1;
    if (rec.shouldRecommendUpgrade && rec.recommendedPlan === 'pro' && rec.currentPlan === 'basic') {
      summary.basicToPro += 1;
    }
    if (rec.shouldRecommendUpgrade && rec.recommendedPlan === 'premium' && rec.currentPlan === 'pro') {
      summary.proToPremium += 1;
    }
    if (
      rec.shouldRecommendUpgrade &&
      rec.recommendedPlan === 'enterprise' &&
      rec.currentPlan === 'premium'
    ) {
      summary.premiumToEnterprise += 1;
    }
  }
  return summary;
}

export async function getPlanRecommendationForOrganization(
  organizationId: string
): Promise<{
  recommendation: PlanRecommendation;
  comparison: ReturnType<typeof comparePlanFeatures> | null;
  catalog: PlanCatalogMatrix;
}> {
  await requireSuperadmin();
  const matrix = await loadPlanCatalogMatrix();
  const maps = matrixToEngineMaps(matrix);
  const thresholds = await loadRecommendationThresholds();
  const supabase = await createServerClient();

  const { data, error } = await supabase.rpc('superadmin_list_orgs_recommendation_inputs', {
    p_search: null,
    p_page: 1,
    p_page_size: 1,
    p_plan_key: null,
    p_status: null,
    p_recommended_plan: null,
    p_upgrade_filter: null,
    p_sort: null,
    p_organization_id: organizationId,
  });
  if (error) throw new Error(error.message);
  const rawRows = (data ?? []) as RecommendationInputRow[];
  const row = rawRows.find((r) => r.id === organizationId);

  if (!row) {
    // Org may be outside first page — fetch by scanning pages is avoided; build minimal input.
    const entitlements = await getOrganizationEntitlements(organizationId);
    const input = await loadOrganizationEntitlementInput(organizationId);
    const grants: FeatureGrantSnapshot[] = Object.entries(entitlements).map(([featureKey, resolved]) => ({
      featureKey,
      enabled: resolved.enabled,
      source: resolved.source,
    }));
    const recommendation = computePlanRecommendation({
      organizationId,
      currentPlanKey: input.planKey,
      subscriptionStatus: input.subscriptionStatus,
      seats: [],
      meters: [],
      grants,
      activity: [],
      accessAttempts: [],
      planIncludesFeature: maps.planIncludesFeature,
      planLimits: maps.planLimits,
      thresholds,
    });
    return {
      recommendation,
      comparison: null,
      catalog: matrix,
    };
  }

  const entitlements = await getOrganizationEntitlements(organizationId).catch(() => null);
  const activity = activityFromRow(row);
  const accessAttempts = row.access_attempt_features ?? [];
  const limitKeys = [
    FEATURES.USERS_MAX,
    FEATURES.BRANCHES_MAX,
    FEATURES.PROFESSIONALS_MAX,
    FEATURES.PATIENTS_MAX,
    FEATURES.AI_MONTHLY_REQUESTS,
    FEATURES.WHATSAPP_MONTHLY_MESSAGES,
    FEATURES.STORAGE_MAX_MB,
  ];
  const limits: Record<string, number | null> = {};
  for (const key of limitKeys) {
    limits[key] = entitlements
      ? getResolvedFeatureLimit(entitlements, key)
      : maps.planLimits[row.plan_key as PaidPlanKey]?.[key] ?? null;
  }
  const grants: FeatureGrantSnapshot[] = entitlements
    ? Object.entries(entitlements).map(([featureKey, resolved]) => ({
        featureKey,
        enabled: resolved.enabled,
        source: resolved.source,
      }))
    : grantsFromPlanMatrix(row.plan_key, matrix, activity, accessAttempts);

  const recommendation = computePlanRecommendation({
    organizationId: row.id,
    currentPlanKey: row.plan_key,
    subscriptionStatus: row.status,
    seats: seatsFromRow(row, limits),
    meters: metersFromRow(row, limits),
    grants,
    activity,
    accessAttempts,
    planIncludesFeature: maps.planIncludesFeature,
    planLimits: maps.planLimits,
    thresholds,
    persisted: row.rec_status
      ? {
          status: row.rec_status as RecommendationStatus,
          recommendedPlanKey: row.rec_recommended_plan_key,
          fingerprint: row.rec_fingerprint,
          dismissedAt: row.rec_dismissed_at,
          maxUsageRatioAtDismiss:
            row.rec_max_usage_ratio_at_dismiss === null
              ? null
              : Number(row.rec_max_usage_ratio_at_dismiss),
        }
      : null,
  });

  let comparison: ReturnType<typeof comparePlanFeatures> | null = null;
  if (recommendation.recommendedPlan && recommendation.currentPlan) {
    const current = matrix.plans.find((p) => p.key === recommendation.currentPlan);
    const target = matrix.plans.find((p) => p.key === recommendation.recommendedPlan);
    if (current && target) {
      comparison = comparePlanFeatures({
        currentPlanKey: current.key,
        targetPlanKey: target.key,
        featureNames: maps.featureNames,
        currentFeatures: current.features.map((f) => ({
          featureKey: f.featureKey,
          enabled: f.enabled,
          limitValue: f.limitValue,
        })),
        targetFeatures: target.features.map((f) => ({
          featureKey: f.featureKey,
          enabled: f.enabled,
          limitValue: f.limitValue,
        })),
      });
    }
  }

  return { recommendation, comparison, catalog: matrix };
}

export async function persistPlanRecommendation(
  recommendation: PlanRecommendation,
  status?: RecommendationStatus
): Promise<void> {
  await requireSuperadmin();
  const supabase = await createServerClient();
  const nextStatus = status ?? recommendation.status;
  const { error } = await supabase.rpc('superadmin_upsert_plan_recommendation', {
    p_organization_id: recommendation.organizationId,
    p_status: nextStatus,
    p_current_plan_key: recommendation.currentPlan,
    p_recommended_plan_key: recommendation.recommendedPlan,
    p_severity: recommendation.severity,
    p_score: recommendation.score,
    p_usage_level: recommendation.usageLevel,
    p_reasons: recommendation.reasons,
    p_fingerprint: recommendation.fingerprint,
    p_max_usage_ratio_at_dismiss:
      nextStatus === 'dismissed' ? recommendation.usageLevel : null,
  });
  if (error) throw new Error(error.message);
  try {
    await supabase.rpc('superadmin_touch_plan_recommendation_refresh', {
      p_organization_id: recommendation.organizationId,
    });
  } catch {
    // Phase 34 optional until applied.
  }
}

export type PlanRecommendationCommercialMeta = {
  commercialNote: string | null;
  commercialNoteUpdatedAt: string | null;
  lastRefreshedAt: string | null;
  followUpAt: string | null;
  followUpBy: string | null;
  isFrozen: boolean;
  frozenAt: string | null;
  frozenNote: string | null;
  assignedTo: string | null;
  assignedAt: string | null;
  assignedEmail: string | null;
  commercialOutcome: CommercialRecommendationOutcome | null;
  commercialOutcomeAt: string | null;
  commercialOutcomeNote: string | null;
  lastContactedAt: string | null;
  lastContactNote: string | null;
  commercialTags: string[];
  commercialSnoozeUntil: string | null;
  commercialSnoozeNote: string | null;
  commercialSnoozedAt: string | null;
  isCommerciallySnoozed: boolean;
  status: string | null;
};

function parseOutcome(value: unknown): CommercialRecommendationOutcome | null {
  if (value === 'won' || value === 'lost' || value === 'deferred' || value === 'not_a_fit') {
    return value;
  }
  return null;
}

export async function getPlanRecommendationCommercialMeta(
  organizationId: string
): Promise<PlanRecommendationCommercialMeta> {
  await requireSuperadmin();
  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc('superadmin_get_plan_recommendation_note', {
    p_organization_id: organizationId,
  });
  if (error) throw new Error(error.message);
  const row = (data ?? {}) as Record<string, unknown>;
  return {
    commercialNote: typeof row.commercial_note === 'string' ? row.commercial_note : null,
    commercialNoteUpdatedAt:
      typeof row.commercial_note_updated_at === 'string' ? row.commercial_note_updated_at : null,
    lastRefreshedAt: typeof row.last_refreshed_at === 'string' ? row.last_refreshed_at : null,
    followUpAt: typeof row.follow_up_at === 'string' ? row.follow_up_at : null,
    followUpBy: typeof row.follow_up_by === 'string' ? row.follow_up_by : null,
    isFrozen: Boolean(row.is_frozen),
    frozenAt: typeof row.frozen_at === 'string' ? row.frozen_at : null,
    frozenNote: typeof row.frozen_note === 'string' ? row.frozen_note : null,
    assignedTo: typeof row.assigned_to === 'string' ? row.assigned_to : null,
    assignedAt: typeof row.assigned_at === 'string' ? row.assigned_at : null,
    assignedEmail: typeof row.assigned_email === 'string' ? row.assigned_email : null,
    commercialOutcome: parseOutcome(row.commercial_outcome),
    commercialOutcomeAt:
      typeof row.commercial_outcome_at === 'string' ? row.commercial_outcome_at : null,
    commercialOutcomeNote:
      typeof row.commercial_outcome_note === 'string' ? row.commercial_outcome_note : null,
    lastContactedAt: typeof row.last_contacted_at === 'string' ? row.last_contacted_at : null,
    lastContactNote: typeof row.last_contact_note === 'string' ? row.last_contact_note : null,
    commercialTags: Array.isArray(row.commercial_tags)
      ? row.commercial_tags.map((item) => String(item)).filter(Boolean)
      : [],
    commercialSnoozeUntil:
      typeof row.commercial_snooze_until === 'string' ? row.commercial_snooze_until : null,
    commercialSnoozeNote:
      typeof row.commercial_snooze_note === 'string' ? row.commercial_snooze_note : null,
    commercialSnoozedAt:
      typeof row.commercial_snoozed_at === 'string' ? row.commercial_snoozed_at : null,
    isCommerciallySnoozed: Boolean(row.is_commercially_snoozed),
    status: typeof row.status === 'string' ? row.status : null,
  };
}

export async function setPlanRecommendationCommercialNote(
  organizationId: string,
  note: string | null
): Promise<void> {
  await requireSuperadmin();
  const supabase = await createServerClient();
  const { error } = await supabase.rpc('superadmin_set_plan_recommendation_note', {
    p_organization_id: organizationId,
    p_note: note,
  });
  if (error) throw new Error(error.message);
}

export async function setPlanRecommendationFollowUp(
  organizationId: string,
  followUpAt: string | null
): Promise<void> {
  await requireSuperadmin();
  const supabase = await createServerClient();
  const { error } = await supabase.rpc('superadmin_set_plan_recommendation_follow_up', {
    p_organization_id: organizationId,
    p_follow_up_at: followUpAt,
  });
  if (error) throw new Error(error.message);
}

export async function setPlanRecommendationFreeze(
  organizationId: string,
  frozen: boolean,
  note?: string | null
): Promise<void> {
  await requireSuperadmin();
  const supabase = await createServerClient();
  const { error } = await supabase.rpc('superadmin_set_plan_recommendation_freeze', {
    p_organization_id: organizationId,
    p_frozen: frozen,
    p_note: note ?? null,
  });
  if (error) throw new Error(error.message);
}

export async function setPlanRecommendationCommercialSnooze(
  organizationId: string,
  days: number | null,
  note?: string | null
): Promise<void> {
  await requireSuperadmin();
  const supabase = await createServerClient();
  const { error } = await supabase.rpc('superadmin_set_plan_recommendation_commercial_snooze', {
    p_organization_id: organizationId,
    p_days: days,
    p_note: note ?? null,
  });
  if (error) throw new Error(error.message);
}

export async function bulkSetPlanRecommendationCommercialSnooze(
  organizationIds: string[],
  days: number | null,
  note?: string | null
): Promise<{ requested: number; updated: number; errors: number }> {
  await requireSuperadmin();
  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc(
    'superadmin_bulk_set_plan_recommendation_commercial_snooze',
    {
      p_organization_ids: organizationIds.slice(0, 50),
      p_days: days,
      p_note: note ?? null,
    }
  );
  if (error) throw new Error(error.message);
  const row = (data ?? {}) as Record<string, unknown>;
  return {
    requested: Number(row.requested) || 0,
    updated: Number(row.updated) || 0,
    errors: Number(row.errors) || 0,
  };
}

export async function setPlanRecommendationAssignee(
  organizationId: string,
  assignedTo: string | null
): Promise<void> {
  await requireSuperadmin();
  const supabase = await createServerClient();
  const { error } = await supabase.rpc('superadmin_set_plan_recommendation_assignee', {
    p_organization_id: organizationId,
    p_assigned_to: assignedTo,
  });
  if (error) throw new Error(error.message);
}

export async function setPlanRecommendationOutcome(
  organizationId: string,
  outcome: CommercialRecommendationOutcome | null,
  note?: string | null
): Promise<void> {
  await requireSuperadmin();
  const supabase = await createServerClient();
  const { error } = await supabase.rpc('superadmin_set_plan_recommendation_outcome', {
    p_organization_id: organizationId,
    p_outcome: outcome,
    p_note: note ?? null,
  });
  if (error) throw new Error(error.message);
}

export async function touchPlanRecommendationContact(
  organizationId: string,
  note?: string | null
): Promise<void> {
  await requireSuperadmin();
  const supabase = await createServerClient();
  const { error } = await supabase.rpc('superadmin_touch_plan_recommendation_contact', {
    p_organization_id: organizationId,
    p_note: note ?? null,
  });
  if (error) throw new Error(error.message);
}

export type RecommendationAssigneeOption = {
  userId: string;
  email: string;
};

export async function listRecommendationAssignees(): Promise<RecommendationAssigneeOption[]> {
  await requireSuperadmin();
  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc('superadmin_list_recommendation_assignees');
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => ({
    userId: row.user_id,
    email: row.email,
  }));
}

export type RecommendationFollowUpRow = {
  organizationId: string;
  organizationName: string;
  organizationSlug: string;
  currentPlanKey: string | null;
  recommendedPlanKey: string | null;
  status: string;
  severity: string;
  usageLevel: number;
  followUpAt: string;
  commercialNote: string | null;
  assignedTo: string | null;
  assignedEmail: string | null;
  commercialOutcome: CommercialRecommendationOutcome | null;
};

export type RecommendationFollowUpFilter = {
  assignedTo?: string | null;
  unassignedOnly?: boolean;
};

export async function listRecommendationFollowUps(
  limit = 25,
  filter: RecommendationFollowUpFilter = {}
): Promise<RecommendationFollowUpRow[]> {
  await requireSuperadmin();
  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc('superadmin_list_recommendation_follow_ups', {
    p_limit: limit,
    p_assigned_to: filter.assignedTo ?? null,
    p_unassigned_only: filter.unassignedOnly ?? false,
  });
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => ({
    organizationId: row.organization_id,
    organizationName: row.organization_name,
    organizationSlug: row.organization_slug,
    currentPlanKey: row.current_plan_key,
    recommendedPlanKey: row.recommended_plan_key,
    status: row.status,
    severity: row.severity,
    usageLevel: Number(row.usage_level) || 0,
    followUpAt: row.follow_up_at,
    commercialNote: row.commercial_note,
    assignedTo: row.assigned_to ?? null,
    assignedEmail: row.assigned_email ?? null,
    commercialOutcome: parseOutcome(row.commercial_outcome),
  }));
}

export type RecommendationOutcomeRow = {
  organizationId: string;
  organizationName: string;
  organizationSlug: string;
  currentPlanKey: string | null;
  recommendedPlanKey: string | null;
  status: string;
  severity: string;
  usageLevel: number;
  commercialOutcome: CommercialRecommendationOutcome;
  commercialOutcomeAt: string | null;
  commercialOutcomeNote: string | null;
  assignedTo: string | null;
  assignedEmail: string | null;
};

export async function listRecommendationOutcomes(
  limit = 25,
  outcome?: CommercialRecommendationOutcome | null
): Promise<RecommendationOutcomeRow[]> {
  await requireSuperadmin();
  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc('superadmin_list_recommendation_outcomes', {
    p_limit: limit,
    p_outcome: outcome ?? null,
  });
  if (error) throw new Error(error.message);
  return (data ?? [])
    .map((row) => {
      const parsed = parseOutcome(row.commercial_outcome);
      if (!parsed) return null;
      return {
        organizationId: row.organization_id,
        organizationName: row.organization_name,
        organizationSlug: row.organization_slug,
        currentPlanKey: row.current_plan_key,
        recommendedPlanKey: row.recommended_plan_key,
        status: row.status,
        severity: row.severity,
        usageLevel: Number(row.usage_level) || 0,
        commercialOutcome: parsed,
        commercialOutcomeAt: row.commercial_outcome_at,
        commercialOutcomeNote: row.commercial_outcome_note,
        assignedTo: row.assigned_to ?? null,
        assignedEmail: row.assigned_email ?? null,
      } satisfies RecommendationOutcomeRow;
    })
    .filter((row): row is RecommendationOutcomeRow => row !== null);
}

export function formatFollowUpsCsv(rows: RecommendationFollowUpRow[]): string {
  const header = [
    'clinic',
    'slug',
    'current_plan',
    'recommended_plan',
    'status',
    'severity',
    'usage_level',
    'follow_up_at',
    'overdue',
    'assigned_email',
    'outcome',
    'commercial_note',
  ];
  const lines = [header.join(',')];
  const now = Date.now();
  for (const row of rows) {
    const overdue = new Date(row.followUpAt).getTime() < now ? 'yes' : 'no';
    const esc = (value: string) => {
      if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
      return value;
    };
    lines.push(
      [
        esc(row.organizationName),
        esc(row.organizationSlug),
        esc(row.currentPlanKey ?? ''),
        esc(row.recommendedPlanKey ?? ''),
        esc(row.status),
        esc(row.severity),
        String(row.usageLevel),
        esc(row.followUpAt),
        overdue,
        esc(row.assignedEmail ?? ''),
        esc(row.commercialOutcome ?? ''),
        esc(row.commercialNote ?? ''),
      ].join(',')
    );
  }
  return `${lines.join('\n')}\n`;
}

export function formatOutcomesCsv(rows: RecommendationOutcomeRow[]): string {
  const header = [
    'clinic',
    'slug',
    'current_plan',
    'recommended_plan',
    'status',
    'severity',
    'usage_level',
    'outcome',
    'outcome_at',
    'assigned_email',
    'outcome_note',
  ];
  const lines = [header.join(',')];
  for (const row of rows) {
    const esc = (value: string) => {
      if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
      return value;
    };
    lines.push(
      [
        esc(row.organizationName),
        esc(row.organizationSlug),
        esc(row.currentPlanKey ?? ''),
        esc(row.recommendedPlanKey ?? ''),
        esc(row.status),
        esc(row.severity),
        String(row.usageLevel),
        esc(row.commercialOutcome),
        esc(row.commercialOutcomeAt ?? ''),
        esc(row.assignedEmail ?? ''),
        esc(row.commercialOutcomeNote ?? ''),
      ].join(',')
    );
  }
  return `${lines.join('\n')}\n`;
}

export type RecommendationStaleRow = {
  organizationId: string;
  organizationName: string;
  organizationSlug: string;
  currentPlanKey: string | null;
  recommendedPlanKey: string | null;
  status: string;
  severity: string;
  usageLevel: number;
  lastTouchAt: string | null;
  staleDays: number;
  assignedTo: string | null;
  assignedEmail: string | null;
  commercialOutcome: CommercialRecommendationOutcome | null;
  lastContactedAt: string | null;
};

export async function listRecommendationStale(limit = 25): Promise<RecommendationStaleRow[]> {
  await requireSuperadmin();
  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc('superadmin_list_recommendation_stale', {
    p_limit: limit,
  });
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => ({
    organizationId: row.organization_id,
    organizationName: row.organization_name,
    organizationSlug: row.organization_slug,
    currentPlanKey: row.current_plan_key,
    recommendedPlanKey: row.recommended_plan_key,
    status: row.status,
    severity: row.severity,
    usageLevel: Number(row.usage_level) || 0,
    lastTouchAt: row.last_touch_at,
    staleDays: Number(row.stale_days) || 14,
    assignedTo: row.assigned_to ?? null,
    assignedEmail: row.assigned_email ?? null,
    commercialOutcome: parseOutcome(row.commercial_outcome),
    lastContactedAt: row.last_contacted_at ?? null,
  }));
}

export type RecommendationDigestItem = {
  organizationId: string;
  organizationName: string;
  organizationSlug: string;
  currentPlanKey: string | null;
  recommendedPlanKey: string | null;
  status: string;
  severity: string;
  usageLevel: number;
  sortAt: string | null;
  assignedTo: string | null;
  assignedEmail: string | null;
  commercialNote: string | null;
  kind: string;
  commercialOutcome: CommercialRecommendationOutcome | null;
};

export type RecommendationDigest = {
  generatedAt: string | null;
  staleDays: number;
  mineOnly: boolean;
  counts: {
    overdueFollowUps: number;
    dueToday: number;
    staleUnassigned: number;
    criticalUnassigned: number;
    recentOutcomes: number;
    neverContacted: number;
  };
  overdueFollowUps: RecommendationDigestItem[];
  dueToday: RecommendationDigestItem[];
  staleUnassigned: RecommendationDigestItem[];
  criticalUnassigned: RecommendationDigestItem[];
  recentOutcomes: RecommendationDigestItem[];
  neverContacted: RecommendationDigestItem[];
};

function mapDigestItem(raw: unknown): RecommendationDigestItem | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const row = raw as Record<string, unknown>;
  const organizationId = typeof row.organization_id === 'string' ? row.organization_id : null;
  const organizationName =
    typeof row.organization_name === 'string' ? row.organization_name : null;
  if (!organizationId || !organizationName) return null;
  return {
    organizationId,
    organizationName,
    organizationSlug: typeof row.organization_slug === 'string' ? row.organization_slug : '',
    currentPlanKey: typeof row.current_plan_key === 'string' ? row.current_plan_key : null,
    recommendedPlanKey:
      typeof row.recommended_plan_key === 'string' ? row.recommended_plan_key : null,
    status: typeof row.status === 'string' ? row.status : 'none',
    severity: typeof row.severity === 'string' ? row.severity : 'none',
    usageLevel: Number(row.usage_level) || 0,
    sortAt: typeof row.sort_at === 'string' ? row.sort_at : null,
    assignedTo: typeof row.assigned_to === 'string' ? row.assigned_to : null,
    assignedEmail: typeof row.assigned_email === 'string' ? row.assigned_email : null,
    commercialNote: typeof row.commercial_note === 'string' ? row.commercial_note : null,
    kind: typeof row.kind === 'string' ? row.kind : 'unknown',
    commercialOutcome: parseOutcome(row.commercial_outcome),
  };
}

function mapDigestList(value: unknown): RecommendationDigestItem[] {
  if (!Array.isArray(value)) return [];
  return value.map(mapDigestItem).filter((item): item is RecommendationDigestItem => item !== null);
}

export async function getRecommendationDigest(options?: {
  limit?: number;
  mineOnly?: boolean;
}): Promise<RecommendationDigest> {
  await requireSuperadmin();
  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc('superadmin_recommendation_digest', {
    p_limit: options?.limit ?? 12,
    p_mine_only: options?.mineOnly ?? false,
  });
  if (error) throw new Error(error.message);
  const row = (data ?? {}) as Record<string, unknown>;
  const counts =
    row.counts && typeof row.counts === 'object' && !Array.isArray(row.counts)
      ? (row.counts as Record<string, unknown>)
      : {};
  return {
    generatedAt: typeof row.generated_at === 'string' ? row.generated_at : null,
    staleDays: Number(row.stale_days) || 14,
    mineOnly: Boolean(row.mine_only),
    counts: {
      overdueFollowUps: Number(counts.overdue_follow_ups) || 0,
      dueToday: Number(counts.due_today) || 0,
      staleUnassigned: Number(counts.stale_unassigned) || 0,
      criticalUnassigned: Number(counts.critical_unassigned) || 0,
      recentOutcomes: Number(counts.recent_outcomes) || 0,
      neverContacted: Number(counts.never_contacted) || 0,
    },
    overdueFollowUps: mapDigestList(row.overdue_follow_ups),
    dueToday: mapDigestList(row.due_today),
    staleUnassigned: mapDigestList(row.stale_unassigned),
    criticalUnassigned: mapDigestList(row.critical_unassigned),
    recentOutcomes: mapDigestList(row.recent_outcomes),
    neverContacted: mapDigestList(row.never_contacted),
  };
}

export function formatRecommendationDigestCsv(digest: RecommendationDigest): string {
  const header = [
    'section',
    'kind',
    'clinic',
    'slug',
    'current_plan',
    'recommended_plan',
    'status',
    'severity',
    'usage_level',
    'sort_at',
    'assigned_email',
    'outcome',
    'note',
  ];
  const lines = [header.join(',')];
  const esc = (value: string) => {
    if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
    return value;
  };
  const push = (section: string, items: RecommendationDigestItem[]) => {
    for (const item of items) {
      lines.push(
        [
          esc(section),
          esc(item.kind),
          esc(item.organizationName),
          esc(item.organizationSlug),
          esc(item.currentPlanKey ?? ''),
          esc(item.recommendedPlanKey ?? ''),
          esc(item.status),
          esc(item.severity),
          String(item.usageLevel),
          esc(item.sortAt ?? ''),
          esc(item.assignedEmail ?? ''),
          esc(item.commercialOutcome ?? ''),
          esc(item.commercialNote ?? ''),
        ].join(',')
      );
    }
  };
  push('overdue_follow_ups', digest.overdueFollowUps);
  push('due_today', digest.dueToday);
  push('stale_unassigned', digest.staleUnassigned);
  push('critical_unassigned', digest.criticalUnassigned);
  push('recent_outcomes', digest.recentOutcomes);
  push('never_contacted', digest.neverContacted);
  return `${lines.join('\n')}\n`;
}

export type RecommendationFunnel = {
  generatedAt: string | null;
  openPipeline: number;
  contactedOpen: number;
  withFollowUp: number;
  withAssignee: number;
  frozenOpen: number;
  outcomeWon: number;
  outcomeLost: number;
  outcomeDeferred: number;
  outcomeNotAFit: number;
  closedDecisions: number;
  acceptedPlanChanges: number;
  contactRatePct: number | null;
  winRatePct: number | null;
  closeRatePct: number | null;
  avgDaysToFirstContact: number | null;
  avgDaysToOutcome: number | null;
  avgDaysOpen: number | null;
};

export async function getRecommendationFunnel(): Promise<RecommendationFunnel> {
  await requireSuperadmin();
  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc('superadmin_recommendation_funnel');
  if (error) throw new Error(error.message);
  const row = (data ?? {}) as Record<string, unknown>;
  const num = (key: string) => {
    const value = Number(row[key]);
    return Number.isFinite(value) ? value : 0;
  };
  const numOrNull = (key: string) => {
    if (row[key] === null || row[key] === undefined) return null;
    const value = Number(row[key]);
    return Number.isFinite(value) ? value : null;
  };
  return {
    generatedAt: typeof row.generated_at === 'string' ? row.generated_at : null,
    openPipeline: num('open_pipeline'),
    contactedOpen: num('contacted_open'),
    withFollowUp: num('with_follow_up'),
    withAssignee: num('with_assignee'),
    frozenOpen: num('frozen_open'),
    outcomeWon: num('outcome_won'),
    outcomeLost: num('outcome_lost'),
    outcomeDeferred: num('outcome_deferred'),
    outcomeNotAFit: num('outcome_not_a_fit'),
    closedDecisions: num('closed_decisions'),
    acceptedPlanChanges: num('accepted_plan_changes'),
    contactRatePct: numOrNull('contact_rate_pct'),
    winRatePct: numOrNull('win_rate_pct'),
    closeRatePct: numOrNull('close_rate_pct'),
    avgDaysToFirstContact: numOrNull('avg_days_to_first_contact'),
    avgDaysToOutcome: numOrNull('avg_days_to_outcome'),
    avgDaysOpen: numOrNull('avg_days_open'),
  };
}

export function formatRecommendationFunnelCsv(funnel: RecommendationFunnel): string {
  const rows: Array<[string, string]> = [
    ['generated_at', funnel.generatedAt ?? ''],
    ['open_pipeline', String(funnel.openPipeline)],
    ['contacted_open', String(funnel.contactedOpen)],
    ['with_follow_up', String(funnel.withFollowUp)],
    ['with_assignee', String(funnel.withAssignee)],
    ['frozen_open', String(funnel.frozenOpen)],
    ['outcome_won', String(funnel.outcomeWon)],
    ['outcome_lost', String(funnel.outcomeLost)],
    ['outcome_deferred', String(funnel.outcomeDeferred)],
    ['outcome_not_a_fit', String(funnel.outcomeNotAFit)],
    ['closed_decisions', String(funnel.closedDecisions)],
    ['accepted_plan_changes', String(funnel.acceptedPlanChanges)],
    ['contact_rate_pct', funnel.contactRatePct == null ? '' : String(funnel.contactRatePct)],
    ['win_rate_pct', funnel.winRatePct == null ? '' : String(funnel.winRatePct)],
    ['close_rate_pct', funnel.closeRatePct == null ? '' : String(funnel.closeRatePct)],
    [
      'avg_days_to_first_contact',
      funnel.avgDaysToFirstContact == null ? '' : String(funnel.avgDaysToFirstContact),
    ],
    ['avg_days_to_outcome', funnel.avgDaysToOutcome == null ? '' : String(funnel.avgDaysToOutcome)],
    ['avg_days_open', funnel.avgDaysOpen == null ? '' : String(funnel.avgDaysOpen)],
  ];
  return `metric,value\n${rows.map(([k, v]) => `${k},${v}`).join('\n')}\n`;
}

export type RecommendationTrendWindow = {
  from: string | null;
  to: string | null;
  contacted: number;
  noted: number;
  assigned: number;
  unassigned: number;
  tagged: number;
  followUpSet: number;
  frozen: number;
  unfrozen: number;
  outcomeWon: number;
  outcomeLost: number;
  outcomeDeferred: number;
  outcomeNotAFit: number;
  closedDecisions: number;
  winRatePct: number | null;
};

export type RecommendationTrends = {
  generatedAt: string | null;
  d7: RecommendationTrendWindow;
  d7Prev: RecommendationTrendWindow;
  d30: RecommendationTrendWindow;
};

function parseTrendWindow(raw: unknown): RecommendationTrendWindow {
  const row =
    raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : ({} as Record<string, unknown>);
  const num = (key: string) => {
    const value = Number(row[key]);
    return Number.isFinite(value) ? value : 0;
  };
  const numOrNull = (key: string) => {
    if (row[key] === null || row[key] === undefined) return null;
    const value = Number(row[key]);
    return Number.isFinite(value) ? value : null;
  };
  return {
    from: typeof row.from === 'string' ? row.from : null,
    to: typeof row.to === 'string' ? row.to : null,
    contacted: num('contacted'),
    noted: num('noted'),
    assigned: num('assigned'),
    unassigned: num('unassigned'),
    tagged: num('tagged'),
    followUpSet: num('follow_up_set'),
    frozen: num('frozen'),
    unfrozen: num('unfrozen'),
    outcomeWon: num('outcome_won'),
    outcomeLost: num('outcome_lost'),
    outcomeDeferred: num('outcome_deferred'),
    outcomeNotAFit: num('outcome_not_a_fit'),
    closedDecisions: num('closed_decisions'),
    winRatePct: numOrNull('win_rate_pct'),
  };
}

export async function getRecommendationTrends(): Promise<RecommendationTrends> {
  await requireSuperadmin();
  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc('superadmin_recommendation_trends');
  if (error) throw new Error(error.message);
  const row = (data ?? {}) as Record<string, unknown>;
  return {
    generatedAt: typeof row.generated_at === 'string' ? row.generated_at : null,
    d7: parseTrendWindow(row.d7),
    d7Prev: parseTrendWindow(row.d7_prev),
    d30: parseTrendWindow(row.d30),
  };
}

export function formatRecommendationTrendsCsv(trends: RecommendationTrends): string {
  const header = [
    'window',
    'from',
    'to',
    'contacted',
    'noted',
    'assigned',
    'unassigned',
    'tagged',
    'follow_up_set',
    'frozen',
    'unfrozen',
    'outcome_won',
    'outcome_lost',
    'outcome_deferred',
    'outcome_not_a_fit',
    'closed_decisions',
    'win_rate_pct',
  ].join(',');
  const push = (label: string, w: RecommendationTrendWindow) =>
    [
      label,
      w.from ?? '',
      w.to ?? '',
      w.contacted,
      w.noted,
      w.assigned,
      w.unassigned,
      w.tagged,
      w.followUpSet,
      w.frozen,
      w.unfrozen,
      w.outcomeWon,
      w.outcomeLost,
      w.outcomeDeferred,
      w.outcomeNotAFit,
      w.closedDecisions,
      w.winRatePct ?? '',
    ].join(',');
  return `${header}\n${[
    push('d7', trends.d7),
    push('d7_prev', trends.d7Prev),
    push('d30', trends.d30),
  ].join('\n')}\n`;
}

export type RecommendationAssigneeScorecardRow = {
  assigneeUserId: string | null;
  assigneeEmail: string | null;
  openPipeline: number;
  contactedOpen: number;
  withFollowUp: number;
  overdueFollowUp: number;
  frozenOpen: number;
  outcomeWon: number;
  outcomeLost: number;
  outcomeDeferred: number;
  outcomeNotAFit: number;
  closedDecisions: number;
  contactRatePct: number | null;
  winRatePct: number | null;
  avgDaysOpen: number | null;
};

export type RecommendationAssigneeScorecard = {
  generatedAt: string | null;
  assignees: RecommendationAssigneeScorecardRow[];
  unassigned: RecommendationAssigneeScorecardRow | null;
};

function parseAssigneeScorecardRow(raw: Record<string, unknown>): RecommendationAssigneeScorecardRow {
  const num = (key: string) => {
    const value = Number(raw[key]);
    return Number.isFinite(value) ? value : 0;
  };
  const numOrNull = (key: string) => {
    if (raw[key] === null || raw[key] === undefined) return null;
    const value = Number(raw[key]);
    return Number.isFinite(value) ? value : null;
  };
  return {
    assigneeUserId: typeof raw.assignee_user_id === 'string' ? raw.assignee_user_id : null,
    assigneeEmail: typeof raw.assignee_email === 'string' ? raw.assignee_email : null,
    openPipeline: num('open_pipeline'),
    contactedOpen: num('contacted_open'),
    withFollowUp: num('with_follow_up'),
    overdueFollowUp: num('overdue_follow_up'),
    frozenOpen: num('frozen_open'),
    outcomeWon: num('outcome_won'),
    outcomeLost: num('outcome_lost'),
    outcomeDeferred: num('outcome_deferred'),
    outcomeNotAFit: num('outcome_not_a_fit'),
    closedDecisions: num('closed_decisions'),
    contactRatePct: numOrNull('contact_rate_pct'),
    winRatePct: numOrNull('win_rate_pct'),
    avgDaysOpen: numOrNull('avg_days_open'),
  };
}

export async function getRecommendationAssigneeScorecard(): Promise<RecommendationAssigneeScorecard> {
  await requireSuperadmin();
  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc('superadmin_recommendation_assignee_scorecard');
  if (error) throw new Error(error.message);
  const row = (data ?? {}) as Record<string, unknown>;
  const assigneesRaw = Array.isArray(row.assignees) ? row.assignees : [];
  const assignees = assigneesRaw
    .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
    .map(parseAssigneeScorecardRow);
  const unassignedRaw =
    row.unassigned && typeof row.unassigned === 'object'
      ? (row.unassigned as Record<string, unknown>)
      : null;
  const unassigned = unassignedRaw ? parseAssigneeScorecardRow(unassignedRaw) : null;
  const unassignedHasWork =
    unassigned &&
    (unassigned.openPipeline > 0 ||
      unassigned.closedDecisions > 0 ||
      unassigned.outcomeDeferred > 0);
  return {
    generatedAt: typeof row.generated_at === 'string' ? row.generated_at : null,
    assignees,
    unassigned: unassignedHasWork ? unassigned : null,
  };
}

export function formatRecommendationAssigneeScorecardCsv(
  scorecard: RecommendationAssigneeScorecard
): string {
  const header = [
    'assignee_email',
    'assignee_user_id',
    'open_pipeline',
    'contacted_open',
    'with_follow_up',
    'overdue_follow_up',
    'frozen_open',
    'outcome_won',
    'outcome_lost',
    'outcome_deferred',
    'outcome_not_a_fit',
    'closed_decisions',
    'contact_rate_pct',
    'win_rate_pct',
    'avg_days_open',
  ].join(',');
  const lines = [header];
  const push = (item: RecommendationAssigneeScorecardRow, label: string) => {
    lines.push(
      [
        label,
        item.assigneeUserId ?? '',
        item.openPipeline,
        item.contactedOpen,
        item.withFollowUp,
        item.overdueFollowUp,
        item.frozenOpen,
        item.outcomeWon,
        item.outcomeLost,
        item.outcomeDeferred,
        item.outcomeNotAFit,
        item.closedDecisions,
        item.contactRatePct ?? '',
        item.winRatePct ?? '',
        item.avgDaysOpen ?? '',
      ].join(',')
    );
  };
  for (const row of scorecard.assignees) {
    push(row, row.assigneeEmail ?? '');
  }
  if (scorecard.unassigned) {
    push(scorecard.unassigned, '(sin responsable)');
  }
  return `${lines.join('\n')}\n`;
}

export type RecommendationAssigneeWorkloadRow = {
  assigneeUserId: string | null;
  assigneeEmail: string | null;
  openPipeline: number;
  openActive: number;
  criticalOpen: number;
  overdueFollowUp: number;
  aging31Plus: number;
  neverContacted: number;
  frozenOpen: number;
  prioritySum: number;
  avgPriority: number | null;
};

export type RecommendationAssigneeWorkload = {
  generatedAt: string | null;
  assignees: RecommendationAssigneeWorkloadRow[];
  unassigned: RecommendationAssigneeWorkloadRow | null;
};

function parseAssigneeWorkloadRow(raw: Record<string, unknown>): RecommendationAssigneeWorkloadRow {
  const num = (key: string) => {
    const value = Number(raw[key]);
    return Number.isFinite(value) ? value : 0;
  };
  const numOrNull = (key: string) => {
    if (raw[key] === null || raw[key] === undefined) return null;
    const value = Number(raw[key]);
    return Number.isFinite(value) ? value : null;
  };
  return {
    assigneeUserId: typeof raw.assignee_user_id === 'string' ? raw.assignee_user_id : null,
    assigneeEmail: typeof raw.assignee_email === 'string' ? raw.assignee_email : null,
    openPipeline: num('open_pipeline'),
    openActive: num('open_active'),
    criticalOpen: num('critical_open'),
    overdueFollowUp: num('overdue_follow_up'),
    aging31Plus: num('aging_31_plus'),
    neverContacted: num('never_contacted'),
    frozenOpen: num('frozen_open'),
    prioritySum: num('priority_sum'),
    avgPriority: numOrNull('avg_priority'),
  };
}

export async function getRecommendationAssigneeWorkload(): Promise<RecommendationAssigneeWorkload> {
  await requireSuperadmin();
  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc('superadmin_recommendation_assignee_workload');
  if (error) throw new Error(error.message);
  const row = (data ?? {}) as Record<string, unknown>;
  const assigneesRaw = Array.isArray(row.assignees) ? row.assignees : [];
  const assignees = assigneesRaw
    .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
    .map(parseAssigneeWorkloadRow);
  const unassignedRaw =
    row.unassigned && typeof row.unassigned === 'object'
      ? (row.unassigned as Record<string, unknown>)
      : null;
  const unassigned = unassignedRaw ? parseAssigneeWorkloadRow(unassignedRaw) : null;
  const unassignedHasWork = unassigned && unassigned.openPipeline > 0;
  return {
    generatedAt: typeof row.generated_at === 'string' ? row.generated_at : null,
    assignees,
    unassigned: unassignedHasWork ? unassigned : null,
  };
}

export function formatRecommendationAssigneeWorkloadCsv(
  workload: RecommendationAssigneeWorkload
): string {
  const header = [
    'assignee_email',
    'assignee_user_id',
    'open_pipeline',
    'open_active',
    'critical_open',
    'overdue_follow_up',
    'aging_31_plus',
    'never_contacted',
    'frozen_open',
    'priority_sum',
    'avg_priority',
  ].join(',');
  const lines = [header];
  const push = (item: RecommendationAssigneeWorkloadRow, label: string) => {
    lines.push(
      [
        label,
        item.assigneeUserId ?? '',
        item.openPipeline,
        item.openActive,
        item.criticalOpen,
        item.overdueFollowUp,
        item.aging31Plus,
        item.neverContacted,
        item.frozenOpen,
        item.prioritySum,
        item.avgPriority ?? '',
      ].join(',')
    );
  };
  for (const row of workload.assignees) {
    push(row, row.assigneeEmail ?? '');
  }
  if (workload.unassigned) {
    push(workload.unassigned, '(sin responsable)');
  }
  return `${lines.join('\n')}\n`;
}

export type RecommendationAgingBucket =
  | '0-7'
  | '8-14'
  | '15-30'
  | '31-plus'
  | 'unknown';

export type RecommendationAging = {
  generatedAt: string | null;
  openPipeline: number;
  bucket07: number;
  bucket814: number;
  bucket1530: number;
  bucket31Plus: number;
  bucketUnknown: number;
  avgAgeDays: number | null;
  medianAgeDays: number | null;
};

export type RecommendationAgingRow = {
  organizationId: string;
  organizationName: string;
  organizationSlug: string;
  currentPlanKey: string | null;
  recommendedPlanKey: string | null;
  status: string;
  severity: string | null;
  ageDays: number | null;
  lastTouchAt: string | null;
  assignedTo: string | null;
  assignedEmail: string | null;
  commercialTags: string[];
  commercialOutcome: CommercialRecommendationOutcome | null;
};

export async function getRecommendationAging(): Promise<RecommendationAging> {
  await requireSuperadmin();
  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc('superadmin_recommendation_aging');
  if (error) throw new Error(error.message);
  const row = (data ?? {}) as Record<string, unknown>;
  const num = (key: string) => {
    const value = Number(row[key]);
    return Number.isFinite(value) ? value : 0;
  };
  const numOrNull = (key: string) => {
    if (row[key] === null || row[key] === undefined) return null;
    const value = Number(row[key]);
    return Number.isFinite(value) ? value : null;
  };
  return {
    generatedAt: typeof row.generated_at === 'string' ? row.generated_at : null,
    openPipeline: num('open_pipeline'),
    bucket07: num('bucket_0_7'),
    bucket814: num('bucket_8_14'),
    bucket1530: num('bucket_15_30'),
    bucket31Plus: num('bucket_31_plus'),
    bucketUnknown: num('bucket_unknown'),
    avgAgeDays: numOrNull('avg_age_days'),
    medianAgeDays: numOrNull('median_age_days'),
  };
}

export async function listRecommendationAging(
  bucket: RecommendationAgingBucket,
  limit = 40
): Promise<RecommendationAgingRow[]> {
  await requireSuperadmin();
  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc('superadmin_list_recommendation_aging', {
    p_bucket: bucket,
    p_limit: limit,
  });
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => ({
    organizationId: row.organization_id,
    organizationName: row.organization_name,
    organizationSlug: row.organization_slug,
    currentPlanKey: row.current_plan_key,
    recommendedPlanKey: row.recommended_plan_key,
    status: row.status,
    severity: row.severity,
    ageDays: row.age_days === null ? null : Number(row.age_days),
    lastTouchAt: row.last_touch_at,
    assignedTo: row.assigned_to,
    assignedEmail: row.assigned_email,
    commercialTags: Array.isArray(row.commercial_tags)
      ? row.commercial_tags.map((item) => String(item))
      : [],
    commercialOutcome: parseOutcome(row.commercial_outcome),
  }));
}

export function formatRecommendationAgingCsv(aging: RecommendationAging): string {
  const rows: Array<[string, string]> = [
    ['generated_at', aging.generatedAt ?? ''],
    ['open_pipeline', String(aging.openPipeline)],
    ['bucket_0_7', String(aging.bucket07)],
    ['bucket_8_14', String(aging.bucket814)],
    ['bucket_15_30', String(aging.bucket1530)],
    ['bucket_31_plus', String(aging.bucket31Plus)],
    ['bucket_unknown', String(aging.bucketUnknown)],
    ['avg_age_days', aging.avgAgeDays == null ? '' : String(aging.avgAgeDays)],
    ['median_age_days', aging.medianAgeDays == null ? '' : String(aging.medianAgeDays)],
  ];
  return `metric,value\n${rows.map(([k, v]) => `${k},${v}`).join('\n')}\n`;
}

export function formatRecommendationAgingRowsCsv(rows: RecommendationAgingRow[]): string {
  const header = [
    'organization_name',
    'organization_slug',
    'organization_id',
    'age_days',
    'last_touch_at',
    'current_plan_key',
    'recommended_plan_key',
    'severity',
    'assigned_email',
    'commercial_tags',
    'commercial_outcome',
  ].join(',');
  const escape = (value: string) => `"${value.replaceAll('"', '""')}"`;
  const lines = rows.map((row) =>
    [
      escape(row.organizationName),
      row.organizationSlug,
      row.organizationId,
      row.ageDays ?? '',
      row.lastTouchAt ?? '',
      row.currentPlanKey ?? '',
      row.recommendedPlanKey ?? '',
      row.severity ?? '',
      row.assignedEmail ?? '',
      escape(row.commercialTags.join('|')),
      row.commercialOutcome ?? '',
    ].join(',')
  );
  return `${header}\n${lines.join('\n')}\n`;
}

export type RecommendationTagScorecardRow = {
  tag: string | null;
  openPipeline: number;
  contactedOpen: number;
  withFollowUp: number;
  overdueFollowUp: number;
  frozenOpen: number;
  aging31Plus: number;
  outcomeWon: number;
  outcomeLost: number;
  outcomeDeferred: number;
  outcomeNotAFit: number;
  closedDecisions: number;
  contactRatePct: number | null;
  winRatePct: number | null;
  avgDaysOpen: number | null;
};

export type RecommendationTagScorecard = {
  generatedAt: string | null;
  tags: RecommendationTagScorecardRow[];
  untagged: RecommendationTagScorecardRow | null;
};

function parseTagScorecardRow(raw: Record<string, unknown>): RecommendationTagScorecardRow {
  const num = (key: string) => {
    const value = Number(raw[key]);
    return Number.isFinite(value) ? value : 0;
  };
  const numOrNull = (key: string) => {
    if (raw[key] === null || raw[key] === undefined) return null;
    const value = Number(raw[key]);
    return Number.isFinite(value) ? value : null;
  };
  return {
    tag: typeof raw.tag === 'string' ? raw.tag : null,
    openPipeline: num('open_pipeline'),
    contactedOpen: num('contacted_open'),
    withFollowUp: num('with_follow_up'),
    overdueFollowUp: num('overdue_follow_up'),
    frozenOpen: num('frozen_open'),
    aging31Plus: num('aging_31_plus'),
    outcomeWon: num('outcome_won'),
    outcomeLost: num('outcome_lost'),
    outcomeDeferred: num('outcome_deferred'),
    outcomeNotAFit: num('outcome_not_a_fit'),
    closedDecisions: num('closed_decisions'),
    contactRatePct: numOrNull('contact_rate_pct'),
    winRatePct: numOrNull('win_rate_pct'),
    avgDaysOpen: numOrNull('avg_days_open'),
  };
}

export async function getRecommendationTagScorecard(): Promise<RecommendationTagScorecard> {
  await requireSuperadmin();
  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc('superadmin_recommendation_tag_scorecard');
  if (error) throw new Error(error.message);
  const row = (data ?? {}) as Record<string, unknown>;
  const tagsRaw = Array.isArray(row.tags) ? row.tags : [];
  const tags = tagsRaw
    .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
    .map(parseTagScorecardRow);
  const untaggedRaw =
    row.untagged && typeof row.untagged === 'object'
      ? (row.untagged as Record<string, unknown>)
      : null;
  const untagged = untaggedRaw ? parseTagScorecardRow(untaggedRaw) : null;
  const untaggedHasWork =
    untagged &&
    (untagged.openPipeline > 0 ||
      untagged.closedDecisions > 0 ||
      untagged.outcomeDeferred > 0);
  return {
    generatedAt: typeof row.generated_at === 'string' ? row.generated_at : null,
    tags,
    untagged: untaggedHasWork ? untagged : null,
  };
}

export function formatRecommendationTagScorecardCsv(
  scorecard: RecommendationTagScorecard
): string {
  const header = [
    'tag',
    'open_pipeline',
    'contacted_open',
    'with_follow_up',
    'overdue_follow_up',
    'frozen_open',
    'aging_31_plus',
    'outcome_won',
    'outcome_lost',
    'outcome_deferred',
    'outcome_not_a_fit',
    'closed_decisions',
    'contact_rate_pct',
    'win_rate_pct',
    'avg_days_open',
  ].join(',');
  const lines = [header];
  const push = (item: RecommendationTagScorecardRow, label: string) => {
    lines.push(
      [
        label,
        item.openPipeline,
        item.contactedOpen,
        item.withFollowUp,
        item.overdueFollowUp,
        item.frozenOpen,
        item.aging31Plus,
        item.outcomeWon,
        item.outcomeLost,
        item.outcomeDeferred,
        item.outcomeNotAFit,
        item.closedDecisions,
        item.contactRatePct ?? '',
        item.winRatePct ?? '',
        item.avgDaysOpen ?? '',
      ].join(',')
    );
  };
  for (const row of scorecard.tags) {
    push(row, row.tag ?? '');
  }
  if (scorecard.untagged) {
    push(scorecard.untagged, '(sin etiqueta)');
  }
  return `${lines.join('\n')}\n`;
}

export type BulkCommercialResult = {
  requested: number;
  updated: number;
  skipped: number;
  errors: number;
};

export async function bulkSetPlanRecommendationAssignee(
  organizationIds: string[],
  assignedTo: string | null
): Promise<BulkCommercialResult> {
  await requireSuperadmin();
  const supabase = await createServerClient();
  const unique = Array.from(new Set(organizationIds.filter(Boolean))).slice(0, 50);
  if (unique.length === 0) {
    throw new Error('Seleccioná al menos una organización');
  }
  const { data, error } = await supabase.rpc('superadmin_bulk_set_plan_recommendation_assignee', {
    p_organization_ids: unique,
    p_assigned_to: assignedTo,
  });
  if (error) throw new Error(error.message);
  const row = (data ?? {}) as Record<string, unknown>;
  return {
    requested: Number(row.requested) || unique.length,
    updated: Number(row.updated) || 0,
    skipped: Number(row.skipped) || 0,
    errors: Number(row.errors) || 0,
  };
}

export async function bulkTouchPlanRecommendationContact(
  organizationIds: string[],
  note?: string | null
): Promise<BulkCommercialResult> {
  await requireSuperadmin();
  const supabase = await createServerClient();
  const unique = Array.from(new Set(organizationIds.filter(Boolean))).slice(0, 50);
  if (unique.length === 0) {
    throw new Error('Seleccioná al menos una organización');
  }
  const { data, error } = await supabase.rpc('superadmin_bulk_touch_plan_recommendation_contact', {
    p_organization_ids: unique,
    p_note: note ?? null,
  });
  if (error) throw new Error(error.message);
  const row = (data ?? {}) as Record<string, unknown>;
  return {
    requested: Number(row.requested) || unique.length,
    updated: Number(row.updated) || 0,
    skipped: Number(row.skipped) || 0,
    errors: Number(row.errors) || 0,
  };
}

export async function bulkSetPlanRecommendationFollowUp(
  organizationIds: string[],
  followUpAt: string | null
): Promise<BulkCommercialResult> {
  await requireSuperadmin();
  const supabase = await createServerClient();
  const unique = Array.from(new Set(organizationIds.filter(Boolean))).slice(0, 50);
  if (unique.length === 0) {
    throw new Error('Seleccioná al menos una organización');
  }
  const { data, error } = await supabase.rpc('superadmin_bulk_set_plan_recommendation_follow_up', {
    p_organization_ids: unique,
    p_follow_up_at: followUpAt,
  });
  if (error) throw new Error(error.message);
  const row = (data ?? {}) as Record<string, unknown>;
  return {
    requested: Number(row.requested) || unique.length,
    updated: Number(row.updated) || 0,
    skipped: Number(row.skipped) || 0,
    errors: Number(row.errors) || 0,
  };
}

export async function bulkSetPlanRecommendationOutcome(
  organizationIds: string[],
  outcome: CommercialRecommendationOutcome | null,
  note?: string | null
): Promise<BulkCommercialResult> {
  await requireSuperadmin();
  const supabase = await createServerClient();
  const unique = Array.from(new Set(organizationIds.filter(Boolean))).slice(0, 50);
  if (unique.length === 0) {
    throw new Error('Seleccioná al menos una organización');
  }
  const { data, error } = await supabase.rpc('superadmin_bulk_set_plan_recommendation_outcome', {
    p_organization_ids: unique,
    p_outcome: outcome,
    p_note: note ?? null,
  });
  if (error) throw new Error(error.message);
  const row = (data ?? {}) as Record<string, unknown>;
  return {
    requested: Number(row.requested) || unique.length,
    updated: Number(row.updated) || 0,
    skipped: Number(row.skipped) || 0,
    errors: Number(row.errors) || 0,
  };
}

export async function bulkSetPlanRecommendationFreeze(
  organizationIds: string[],
  frozen: boolean,
  note?: string | null
): Promise<BulkCommercialResult> {
  await requireSuperadmin();
  const supabase = await createServerClient();
  const unique = Array.from(new Set(organizationIds.filter(Boolean))).slice(0, 50);
  if (unique.length === 0) {
    throw new Error('Seleccioná al menos una organización');
  }
  const { data, error } = await supabase.rpc('superadmin_bulk_set_plan_recommendation_freeze', {
    p_organization_ids: unique,
    p_frozen: frozen,
    p_note: note ?? null,
  });
  if (error) throw new Error(error.message);
  const row = (data ?? {}) as Record<string, unknown>;
  return {
    requested: Number(row.requested) || unique.length,
    updated: Number(row.updated) || 0,
    skipped: Number(row.skipped) || 0,
    errors: Number(row.errors) || 0,
  };
}

export async function bulkSetPlanRecommendationNote(
  organizationIds: string[],
  note: string | null,
  mode: 'replace' | 'append' | 'clear' = 'replace'
): Promise<BulkCommercialResult> {
  await requireSuperadmin();
  const supabase = await createServerClient();
  const unique = Array.from(new Set(organizationIds.filter(Boolean))).slice(0, 50);
  if (unique.length === 0) {
    throw new Error('Seleccioná al menos una organización');
  }
  if (mode !== 'clear' && !note?.trim()) {
    throw new Error('Escribí una nota comercial');
  }
  const { data, error } = await supabase.rpc('superadmin_bulk_set_plan_recommendation_note', {
    p_organization_ids: unique,
    p_note: mode === 'clear' ? null : note,
    p_mode: mode,
  });
  if (error) throw new Error(error.message);
  const row = (data ?? {}) as Record<string, unknown>;
  return {
    requested: Number(row.requested) || unique.length,
    updated: Number(row.updated) || 0,
    skipped: Number(row.skipped) || 0,
    errors: Number(row.errors) || 0,
  };
}

export function parseCommercialTagsInput(raw: string): string[] {
  return Array.from(
    new Set(
      raw
        .split(/[,;\n]+/)
        .map((item) => item.trim().toLowerCase())
        .filter(Boolean)
        .slice(0, 12)
    )
  );
}

export async function setPlanRecommendationTags(
  organizationId: string,
  tags: string[],
  mode: 'replace' | 'add' | 'remove' = 'replace'
): Promise<void> {
  await requireSuperadmin();
  const supabase = await createServerClient();
  const { error } = await supabase.rpc('superadmin_set_plan_recommendation_tags', {
    p_organization_id: organizationId,
    p_tags: tags,
    p_mode: mode,
  });
  if (error) throw new Error(error.message);
}

export async function bulkSetPlanRecommendationTags(
  organizationIds: string[],
  tags: string[],
  mode: 'replace' | 'add' | 'remove' = 'add'
): Promise<BulkCommercialResult> {
  await requireSuperadmin();
  const supabase = await createServerClient();
  const unique = Array.from(new Set(organizationIds.filter(Boolean))).slice(0, 50);
  if (unique.length === 0) {
    throw new Error('Seleccioná al menos una organización');
  }
  if (mode !== 'replace' && tags.length === 0) {
    throw new Error('Escribí al menos una etiqueta');
  }
  const { data, error } = await supabase.rpc('superadmin_bulk_set_plan_recommendation_tags', {
    p_organization_ids: unique,
    p_tags: tags,
    p_mode: mode,
  });
  if (error) throw new Error(error.message);
  const row = (data ?? {}) as Record<string, unknown>;
  return {
    requested: Number(row.requested) || unique.length,
    updated: Number(row.updated) || 0,
    skipped: Number(row.skipped) || 0,
    errors: Number(row.errors) || 0,
  };
}

export type RecommendationTagCatalogItem = {
  tag: string;
  orgCount: number;
};

export async function listRecommendationTagCatalog(): Promise<RecommendationTagCatalogItem[]> {
  await requireSuperadmin();
  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc('superadmin_list_recommendation_tag_catalog');
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => ({
    tag: row.tag,
    orgCount: Number(row.org_count) || 0,
  }));
}

export type RecommendationTaggedOrg = {
  organizationId: string;
  organizationName: string;
  organizationSlug: string;
  currentPlanKey: string | null;
  recommendedPlanKey: string | null;
  status: string;
  severity: string | null;
  commercialTags: string[];
  assignedTo: string | null;
  assignedEmail: string | null;
  commercialOutcome: CommercialRecommendationOutcome | null;
};

export async function listRecommendationByTag(
  tag: string,
  limit = 40
): Promise<RecommendationTaggedOrg[]> {
  await requireSuperadmin();
  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc('superadmin_list_recommendation_by_tag', {
    p_tag: tag,
    p_limit: limit,
  });
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => ({
    organizationId: row.organization_id,
    organizationName: row.organization_name,
    organizationSlug: row.organization_slug,
    currentPlanKey: row.current_plan_key,
    recommendedPlanKey: row.recommended_plan_key,
    status: row.status,
    severity: row.severity,
    commercialTags: Array.isArray(row.commercial_tags)
      ? row.commercial_tags.map((item) => String(item))
      : [],
    assignedTo: row.assigned_to,
    assignedEmail: row.assigned_email,
    commercialOutcome: parseOutcome(row.commercial_outcome),
  }));
}

export type RecommendationNoteSearchHit = {
  organizationId: string;
  organizationName: string;
  organizationSlug: string;
  currentPlanKey: string | null;
  recommendedPlanKey: string | null;
  status: string;
  severity: string | null;
  commercialNote: string | null;
  commercialOutcomeNote: string | null;
  lastContactNote: string | null;
  frozenNote: string | null;
  commercialTags: string[];
  assignedTo: string | null;
  assignedEmail: string | null;
  commercialOutcome: CommercialRecommendationOutcome | null;
  matchedIn: string[];
};

export async function searchRecommendationNotes(
  query: string,
  limit = 40
): Promise<RecommendationNoteSearchHit[]> {
  await requireSuperadmin();
  const trimmed = query.trim();
  if (trimmed.length < 2) {
    throw new Error('Escribí al menos 2 caracteres');
  }
  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc('superadmin_search_recommendation_notes', {
    p_query: trimmed,
    p_limit: limit,
  });
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => ({
    organizationId: row.organization_id,
    organizationName: row.organization_name,
    organizationSlug: row.organization_slug,
    currentPlanKey: row.current_plan_key,
    recommendedPlanKey: row.recommended_plan_key,
    status: row.status,
    severity: row.severity,
    commercialNote: row.commercial_note,
    commercialOutcomeNote: row.commercial_outcome_note,
    lastContactNote: row.last_contact_note,
    frozenNote: row.frozen_note,
    commercialTags: Array.isArray(row.commercial_tags)
      ? row.commercial_tags.map((item) => String(item))
      : [],
    assignedTo: row.assigned_to,
    assignedEmail: row.assigned_email,
    commercialOutcome: parseOutcome(row.commercial_outcome),
    matchedIn: Array.isArray(row.matched_in) ? row.matched_in.map((item) => String(item)) : [],
  }));
}

export function formatRecommendationNoteSearchCsv(rows: RecommendationNoteSearchHit[]): string {
  const header = [
    'organization_name',
    'organization_slug',
    'organization_id',
    'matched_in',
    'commercial_note',
    'outcome_note',
    'contact_note',
    'frozen_note',
    'current_plan_key',
    'recommended_plan_key',
    'assigned_email',
    'commercial_tags',
    'commercial_outcome',
  ].join(',');
  const escape = (value: string) => `"${value.replaceAll('"', '""')}"`;
  const lines = rows.map((row) =>
    [
      escape(row.organizationName),
      row.organizationSlug,
      row.organizationId,
      escape(row.matchedIn.join('|')),
      escape(row.commercialNote ?? ''),
      escape(row.commercialOutcomeNote ?? ''),
      escape(row.lastContactNote ?? ''),
      escape(row.frozenNote ?? ''),
      row.currentPlanKey ?? '',
      row.recommendedPlanKey ?? '',
      row.assignedEmail ?? '',
      escape(row.commercialTags.join('|')),
      row.commercialOutcome ?? '',
    ].join(',')
  );
  return `${header}\n${lines.join('\n')}\n`;
}

export type RecommendationOpenPipelineSort =
  | 'age_desc'
  | 'age_asc'
  | 'severity'
  | 'name'
  | 'follow_up';

export type RecommendationOpenPipelineRow = {
  organizationId: string;
  organizationName: string;
  organizationSlug: string;
  currentPlanKey: string | null;
  recommendedPlanKey: string | null;
  status: string;
  severity: string | null;
  score: number | null;
  usageLevel: number | null;
  ageDays: number | null;
  lastTouchAt: string | null;
  lastContactedAt: string | null;
  followUpAt: string | null;
  isFrozen: boolean;
  assignedTo: string | null;
  assignedEmail: string | null;
  commercialOutcome: CommercialRecommendationOutcome | null;
  commercialTags: string[];
  commercialNote: string | null;
  recommendedAt: string | null;
};

export async function listOpenRecommendationPipeline(options?: {
  limit?: number;
  mineOnly?: boolean;
  sort?: RecommendationOpenPipelineSort;
}): Promise<RecommendationOpenPipelineRow[]> {
  await requireSuperadmin();
  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc('superadmin_list_open_recommendation_pipeline', {
    p_limit: options?.limit ?? 100,
    p_mine_only: options?.mineOnly ?? false,
    p_sort: options?.sort ?? 'age_desc',
  });
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => ({
    organizationId: row.organization_id,
    organizationName: row.organization_name,
    organizationSlug: row.organization_slug,
    currentPlanKey: row.current_plan_key,
    recommendedPlanKey: row.recommended_plan_key,
    status: row.status,
    severity: row.severity,
    score: row.score === null ? null : Number(row.score),
    usageLevel: row.usage_level === null ? null : Number(row.usage_level),
    ageDays: row.age_days === null ? null : Number(row.age_days),
    lastTouchAt: row.last_touch_at,
    lastContactedAt: row.last_contacted_at,
    followUpAt: row.follow_up_at,
    isFrozen: Boolean(row.is_frozen),
    assignedTo: row.assigned_to,
    assignedEmail: row.assigned_email,
    commercialOutcome: parseOutcome(row.commercial_outcome),
    commercialTags: Array.isArray(row.commercial_tags)
      ? row.commercial_tags.map((item) => String(item))
      : [],
    commercialNote: row.commercial_note,
    recommendedAt: row.recommended_at,
  }));
}

export function formatOpenRecommendationPipelineCsv(
  rows: RecommendationOpenPipelineRow[]
): string {
  const header = [
    'organization_name',
    'organization_slug',
    'organization_id',
    'current_plan_key',
    'recommended_plan_key',
    'status',
    'severity',
    'score',
    'usage_level',
    'age_days',
    'last_touch_at',
    'last_contacted_at',
    'follow_up_at',
    'is_frozen',
    'assigned_email',
    'commercial_outcome',
    'commercial_tags',
    'commercial_note',
    'recommended_at',
  ].join(',');
  const escape = (value: string) => `"${value.replaceAll('"', '""')}"`;
  const lines = rows.map((row) =>
    [
      escape(row.organizationName),
      row.organizationSlug,
      row.organizationId,
      row.currentPlanKey ?? '',
      row.recommendedPlanKey ?? '',
      row.status,
      row.severity ?? '',
      row.score ?? '',
      row.usageLevel ?? '',
      row.ageDays ?? '',
      row.lastTouchAt ?? '',
      row.lastContactedAt ?? '',
      row.followUpAt ?? '',
      row.isFrozen ? 'true' : 'false',
      row.assignedEmail ?? '',
      row.commercialOutcome ?? '',
      escape(row.commercialTags.join('|')),
      escape(row.commercialNote ?? ''),
      row.recommendedAt ?? '',
    ].join(',')
  );
  return `${header}\n${lines.join('\n')}\n`;
}

export type RecommendationPriorityRow = {
  organizationId: string;
  organizationName: string;
  organizationSlug: string;
  currentPlanKey: string | null;
  recommendedPlanKey: string | null;
  status: string;
  severity: string | null;
  score: number | null;
  usageLevel: number | null;
  ageDays: number | null;
  priority: number;
  priorityReasons: string[];
  lastTouchAt: string | null;
  lastContactedAt: string | null;
  followUpAt: string | null;
  isFrozen: boolean;
  commercialSnoozeUntil: string | null;
  assignedTo: string | null;
  assignedEmail: string | null;
  commercialOutcome: CommercialRecommendationOutcome | null;
  commercialTags: string[];
  commercialNote: string | null;
};

export async function listRecommendationPriorityQueue(options?: {
  limit?: number;
  mineOnly?: boolean;
  includeFrozen?: boolean;
  includeSnoozed?: boolean;
}): Promise<RecommendationPriorityRow[]> {
  await requireSuperadmin();
  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc('superadmin_list_recommendation_priority_queue', {
    p_limit: options?.limit ?? 25,
    p_mine_only: options?.mineOnly ?? false,
    p_include_frozen: options?.includeFrozen ?? false,
    p_include_snoozed: options?.includeSnoozed ?? false,
  });
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => ({
    organizationId: row.organization_id,
    organizationName: row.organization_name,
    organizationSlug: row.organization_slug,
    currentPlanKey: row.current_plan_key,
    recommendedPlanKey: row.recommended_plan_key,
    status: row.status,
    severity: row.severity,
    score: row.score === null ? null : Number(row.score),
    usageLevel: row.usage_level === null ? null : Number(row.usage_level),
    ageDays: row.age_days === null ? null : Number(row.age_days),
    priority: Number(row.priority) || 0,
    priorityReasons: Array.isArray(row.priority_reasons)
      ? row.priority_reasons.map((item) => String(item))
      : [],
    lastTouchAt: row.last_touch_at,
    lastContactedAt: row.last_contacted_at,
    followUpAt: row.follow_up_at,
    isFrozen: Boolean(row.is_frozen),
    commercialSnoozeUntil: row.commercial_snooze_until,
    assignedTo: row.assigned_to,
    assignedEmail: row.assigned_email,
    commercialOutcome: parseOutcome(row.commercial_outcome),
    commercialTags: Array.isArray(row.commercial_tags)
      ? row.commercial_tags.map((item) => String(item))
      : [],
    commercialNote: row.commercial_note,
  }));
}

export function formatRecommendationPriorityQueueCsv(rows: RecommendationPriorityRow[]): string {
  const header = [
    'priority',
    'priority_reasons',
    'organization_name',
    'organization_slug',
    'organization_id',
    'current_plan_key',
    'recommended_plan_key',
    'severity',
    'usage_level',
    'age_days',
    'follow_up_at',
    'is_frozen',
    'commercial_snooze_until',
    'assigned_email',
    'commercial_tags',
    'commercial_note',
    'commercial_outcome',
  ].join(',');
  const escape = (value: string) => `"${value.replaceAll('"', '""')}"`;
  const lines = rows.map((row) =>
    [
      row.priority,
      escape(row.priorityReasons.join('|')),
      escape(row.organizationName),
      row.organizationSlug,
      row.organizationId,
      row.currentPlanKey ?? '',
      row.recommendedPlanKey ?? '',
      row.severity ?? '',
      row.usageLevel ?? '',
      row.ageDays ?? '',
      row.followUpAt ?? '',
      row.isFrozen ? 'true' : 'false',
      row.commercialSnoozeUntil ?? '',
      row.assignedEmail ?? '',
      escape(row.commercialTags.join('|')),
      escape(row.commercialNote ?? ''),
      row.commercialOutcome ?? '',
    ].join(',')
  );
  return `${header}\n${lines.join('\n')}\n`;
}

export type RecommendationCommercialSnoozeRow = {
  organizationId: string;
  organizationName: string;
  organizationSlug: string;
  currentPlanKey: string | null;
  recommendedPlanKey: string | null;
  status: string;
  severity: string | null;
  commercialSnoozeUntil: string | null;
  commercialSnoozeNote: string | null;
  commercialSnoozedAt: string | null;
  snoozedBy: string | null;
  snoozedByEmail: string | null;
  assignedTo: string | null;
  assignedEmail: string | null;
  commercialTags: string[];
  isFrozen: boolean;
};

export async function listRecommendationCommercialSnoozed(options?: {
  limit?: number;
  mineOnly?: boolean;
}): Promise<RecommendationCommercialSnoozeRow[]> {
  await requireSuperadmin();
  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc('superadmin_list_recommendation_commercial_snoozed', {
    p_limit: options?.limit ?? 40,
    p_mine_only: options?.mineOnly ?? false,
  });
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => ({
    organizationId: row.organization_id,
    organizationName: row.organization_name,
    organizationSlug: row.organization_slug,
    currentPlanKey: row.current_plan_key,
    recommendedPlanKey: row.recommended_plan_key,
    status: row.status,
    severity: row.severity,
    commercialSnoozeUntil: row.commercial_snooze_until,
    commercialSnoozeNote: row.commercial_snooze_note,
    commercialSnoozedAt: row.commercial_snoozed_at,
    snoozedBy: row.snoozed_by,
    snoozedByEmail: row.snoozed_by_email,
    assignedTo: row.assigned_to,
    assignedEmail: row.assigned_email,
    commercialTags: Array.isArray(row.commercial_tags)
      ? row.commercial_tags.map((item) => String(item))
      : [],
    isFrozen: Boolean(row.is_frozen),
  }));
}

/**
 * Soft clinic notice for org managers (Configuración → Plan).
 * Only shows Superadmin-persisted recommendations (phase 31/32).
 */
export type ClinicPlanRecommendationNotice = {
  currentPlan: string | null;
  recommendedPlan: PaidPlanKey;
  reasons: string[];
  severity: string;
  usageLevel: number;
  fingerprint: string | null;
  gainsPreview: string[];
};

export async function getClinicFacingPlanRecommendationHint(
  organizationId: string
): Promise<ClinicPlanRecommendationNotice | null> {
  void organizationId;
  try {
    const supabase = await createServerClient();
    const { data, error } = await supabase.rpc('list_own_plan_recommendation_notice');
    if (error || !data || typeof data !== 'object' || Array.isArray(data)) {
      return null;
    }
    const row = data as Record<string, unknown>;
    const recommended = typeof row.recommended_plan_key === 'string' ? row.recommended_plan_key : null;
    if (!recommended || !(PLAN_UPGRADE_LADDER as readonly string[]).includes(recommended)) {
      return null;
    }
    const reasonsRaw = row.reasons;
    const reasons = Array.isArray(reasonsRaw) ? reasonsRaw.map((item) => String(item)) : [];
    const currentPlan = typeof row.current_plan_key === 'string' ? row.current_plan_key : null;

    let gainsPreview: string[] = [];
    if (recommended === 'pro') {
      gainsPreview = ['Inventario', 'Internación / cirugía', 'Facturación y caja', 'Reportes'];
    } else if (recommended === 'premium') {
      gainsPreview = ['IA clínica', 'WhatsApp', 'Imágenes clínicas', 'Reportes avanzados'];
    } else if (recommended === 'enterprise') {
      gainsPreview = ['Límites a medida', 'Operación multi-sucursal', 'Acompañamiento comercial'];
    }

    return {
      currentPlan,
      recommendedPlan: recommended as PaidPlanKey,
      reasons,
      severity: typeof row.severity === 'string' ? row.severity : 'info',
      usageLevel: Number(row.usage_level ?? 0) || 0,
      fingerprint: typeof row.fingerprint === 'string' ? row.fingerprint : null,
      gainsPreview,
    };
  } catch {
    return null;
  }
}

export type PlanRecommendationHistoryEvent = {
  id: string;
  eventType: string;
  actorKind: string;
  actorUserId: string | null;
  currentPlanKey: string | null;
  recommendedPlanKey: string | null;
  severity: string | null;
  score: number | null;
  usageLevel: number | null;
  reasons: string[];
  fingerprint: string | null;
  note: string | null;
  createdAt: string;
};

export async function listPlanRecommendationHistory(
  organizationId: string,
  limit = 50
): Promise<PlanRecommendationHistoryEvent[]> {
  await requireSuperadmin();
  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc('superadmin_list_plan_recommendation_events', {
    p_organization_id: organizationId,
    p_limit: limit,
  });
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => ({
    id: row.id,
    eventType: row.event_type,
    actorKind: row.actor_kind,
    actorUserId: row.actor_user_id,
    currentPlanKey: row.current_plan_key,
    recommendedPlanKey: row.recommended_plan_key,
    severity: row.severity,
    score: row.score,
    usageLevel: row.usage_level === null ? null : Number(row.usage_level),
    reasons: Array.isArray(row.reasons) ? row.reasons.map((item) => String(item)) : [],
    fingerprint: row.fingerprint,
    note: row.note,
    createdAt: row.created_at,
  }));
}

export type RecommendationActivityEvent = {
  id: string;
  organizationId: string;
  organizationName: string;
  organizationSlug: string;
  eventType: string;
  actorKind: string;
  actorUserId: string | null;
  actorEmail: string | null;
  currentPlanKey: string | null;
  recommendedPlanKey: string | null;
  severity: string | null;
  score: number | null;
  note: string | null;
  createdAt: string;
};

export async function listRecentRecommendationActivity(options?: {
  limit?: number;
  mineOnly?: boolean;
}): Promise<RecommendationActivityEvent[]> {
  await requireSuperadmin();
  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc('superadmin_list_recent_recommendation_events', {
    p_limit: options?.limit ?? 40,
    p_mine_only: options?.mineOnly ?? false,
  });
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => ({
    id: row.id,
    organizationId: row.organization_id,
    organizationName: row.organization_name,
    organizationSlug: row.organization_slug,
    eventType: row.event_type,
    actorKind: row.actor_kind,
    actorUserId: row.actor_user_id,
    actorEmail: row.actor_email,
    currentPlanKey: row.current_plan_key,
    recommendedPlanKey: row.recommended_plan_key,
    severity: row.severity,
    score: row.score,
    note: row.note,
    createdAt: row.created_at,
  }));
}

export function formatRecommendationActivityCsv(events: RecommendationActivityEvent[]): string {
  const header = [
    'created_at',
    'organization_name',
    'organization_slug',
    'organization_id',
    'event_type',
    'actor_email',
    'actor_kind',
    'current_plan_key',
    'recommended_plan_key',
    'severity',
    'score',
    'note',
  ].join(',');
  const escape = (value: string) => `"${value.replaceAll('"', '""')}"`;
  const lines = events.map((event) =>
    [
      event.createdAt,
      escape(event.organizationName),
      event.organizationSlug,
      event.organizationId,
      event.eventType,
      event.actorEmail ?? '',
      event.actorKind,
      event.currentPlanKey ?? '',
      event.recommendedPlanKey ?? '',
      event.severity ?? '',
      event.score ?? '',
      escape(event.note ?? ''),
    ].join(',')
  );
  return `${header}\n${lines.join('\n')}\n`;
}

function parseSavedViewRow(raw: Record<string, unknown>): RecommendationSavedView {
  const paramsRaw = raw.query_params;
  const paramsObj =
    paramsRaw && typeof paramsRaw === 'object' && !Array.isArray(paramsRaw)
      ? (paramsRaw as Record<string, unknown>)
      : {};
  const asStrings: Record<string, string> = {};
  for (const [key, value] of Object.entries(paramsObj)) {
    if (typeof value === 'string') asStrings[key] = value;
    else if (value != null) asStrings[key] = String(value);
  }
  return {
    id: String(raw.id ?? ''),
    name: String(raw.name ?? ''),
    queryParams: sanitizeCommercialSavedViewParams(asStrings),
    isShared: Boolean(raw.is_shared),
    ownerUserId: String(raw.owner_user_id ?? ''),
    ownerEmail: typeof raw.owner_email === 'string' ? raw.owner_email : null,
    isMine: Boolean(raw.is_mine),
    createdAt: typeof raw.created_at === 'string' ? raw.created_at : null,
    updatedAt: typeof raw.updated_at === 'string' ? raw.updated_at : null,
  };
}

export async function listRecommendationSavedViews(): Promise<RecommendationSavedView[]> {
  await requireSuperadmin();
  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc('superadmin_list_recommendation_saved_views');
  if (error) throw new Error(error.message);
  return ((data ?? []) as Record<string, unknown>[]).map(parseSavedViewRow).filter((row) => row.id);
}

export async function upsertRecommendationSavedView(input: {
  name: string;
  queryParams: Record<string, string | undefined | null>;
  isShared?: boolean;
  id?: string | null;
}): Promise<RecommendationSavedView> {
  await requireSuperadmin();
  const name = input.name.trim();
  if (!name) throw new Error('Nombre requerido');
  if (name.length > 60) throw new Error('Nombre demasiado largo');
  const params = sanitizeCommercialSavedViewParams(input.queryParams);
  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc('superadmin_upsert_recommendation_saved_view', {
    p_name: name,
    p_query_params: params,
    p_is_shared: Boolean(input.isShared),
    p_id: input.id ?? null,
  });
  if (error) throw new Error(error.message);
  const row = (data ?? {}) as Record<string, unknown>;
  return parseSavedViewRow({
    ...row,
    owner_user_id: typeof row.owner_user_id === 'string' ? row.owner_user_id : '',
    owner_email: null,
    is_mine: true,
    created_at: typeof row.created_at === 'string' ? row.created_at : null,
  });
}

export async function deleteRecommendationSavedView(id: string): Promise<void> {
  await requireSuperadmin();
  if (!id) throw new Error('Vista inválida');
  const supabase = await createServerClient();
  const { error } = await supabase.rpc('superadmin_delete_recommendation_saved_view', {
    p_id: id,
  });
  if (error) throw new Error(error.message);
}

export async function dismissClinicPlanRecommendationNotice(): Promise<void> {
  const supabase = await createServerClient();
  const { error } = await supabase.rpc('dismiss_own_plan_recommendation_notice');
  if (error) throw new Error(error.message);
}

export type { CommercialPlanKey };
