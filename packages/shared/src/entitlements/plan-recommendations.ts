/**
 * Centralized plan upgrade recommendation rules.
 * Pure functions only — no DB / React. Never upgrades or downgrades subscriptions.
 */

import {
  COMMERCIAL_PLAN_KEYS,
  FEATURES,
  isLegacyPlanKey,
  type CommercialPlanKey,
} from '../constants/features';
import type { EntitlementSource, SubscriptionStatus } from './resolve';

export const PLAN_USAGE_THRESHOLDS = {
  info: 0.7,
  warning: 0.85,
  critical: 1,
} as const;

export type PlanUsageThresholdKey = keyof typeof PLAN_USAGE_THRESHOLDS;

/** Paid ladder only (smallest satisfying plan wins). Trial/legacy handled separately. */
export const PLAN_UPGRADE_LADDER = [
  COMMERCIAL_PLAN_KEYS.BASIC,
  COMMERCIAL_PLAN_KEYS.PRO,
  COMMERCIAL_PLAN_KEYS.PREMIUM,
  COMMERCIAL_PLAN_KEYS.ENTERPRISE,
] as const;

export type PaidPlanKey = (typeof PLAN_UPGRADE_LADDER)[number];

export type RecommendationSeverity = 'none' | 'info' | 'warning' | 'critical';

export type RecommendationStatus =
  | 'none'
  | 'recommended'
  | 'reviewed'
  | 'dismissed'
  | 'accepted';

export type UpgradeStatusLabel =
  | 'none'
  | 'upgrade_recommended'
  | 'near_limit'
  | 'limit_reached'
  | 'legacy_review'
  | 'trial_conversion'
  | 'dismissed'
  | 'reviewed';

/** Module activity that typically belongs on Pro (not on Basic). */
export const PRO_MODULE_SIGNALS = [
  { featureKey: FEATURES.HOSPITALIZATION, reason: 'Actividad de internación detectada' },
  { featureKey: FEATURES.SURGERY, reason: 'Actividad de cirugías detectada' },
  { featureKey: FEATURES.LABORATORY, reason: 'Actividad de laboratorio detectada' },
  { featureKey: FEATURES.INVENTORY, reason: 'Actividad de inventario detectada' },
  { featureKey: FEATURES.PHARMACY, reason: 'Actividad de farmacia detectada' },
  { featureKey: FEATURES.BILLING, reason: 'Actividad de facturación detectada' },
  { featureKey: FEATURES.CASH_REGISTER, reason: 'Actividad de caja detectada' },
  { featureKey: FEATURES.OWNER_PORTAL, reason: 'Uso del portal del tutor detectado' },
  { featureKey: FEATURES.BASIC_REPORTS, reason: 'Uso de reportes operativos detectado' },
] as const;

/** Module activity that typically belongs on Premium. */
export const PREMIUM_MODULE_SIGNALS = [
  { featureKey: FEATURES.AI, reason: 'Uso o intento de IA clínica detectado' },
  { featureKey: FEATURES.WHATSAPP, reason: 'Uso o intento de WhatsApp detectado' },
  { featureKey: FEATURES.WHATSAPP_REMINDERS, reason: 'Recordatorios avanzados detectados' },
  { featureKey: FEATURES.CLINICAL_IMAGES, reason: 'Uso de imágenes clínicas detectado' },
  { featureKey: FEATURES.ADVANCED_REPORTS, reason: 'Reportes avanzados detectados' },
  { featureKey: FEATURES.AUTOMATIONS, reason: 'Automatizaciones detectadas' },
] as const;

export const ENTERPRISE_BRANCH_THRESHOLD = 3;
export const ENTERPRISE_USER_THRESHOLD = 20;

export type UsageMeterSnapshot = {
  featureKey: string;
  label: string;
  used: number;
  /** Effective limit after entitlements. null = unlimited. 0 = not included. */
  limit: number | null;
  /** Entitlement source for the limit/feature. */
  source?: EntitlementSource;
};

export type ModuleActivitySnapshot = {
  featureKey: string;
  active: boolean;
  /** Count when available (for messaging). */
  count?: number;
};

export type FeatureGrantSnapshot = {
  featureKey: string;
  enabled: boolean;
  source: EntitlementSource;
};

export type PlanRecommendationInput = {
  organizationId: string;
  currentPlanKey: string | null;
  subscriptionStatus: SubscriptionStatus | null;
  seats: UsageMeterSnapshot[];
  meters: UsageMeterSnapshot[];
  /** Resolved grants for commercial features. */
  grants: FeatureGrantSnapshot[];
  /** Measurable module activity. */
  activity: ModuleActivitySnapshot[];
  /** Lightweight gated-access attempts (feature keys). */
  accessAttempts?: string[];
  /** Plans that include each feature (from plan_features). */
  planIncludesFeature: Partial<Record<PaidPlanKey, string[]>>;
  /** Seat/meter limits per paid plan (null = unlimited). */
  planLimits: Partial<Record<PaidPlanKey, Record<string, number | null>>>;
  /** Persisted recommendation row, if any. */
  persisted?: {
    status: RecommendationStatus;
    recommendedPlanKey: string | null;
    fingerprint: string | null;
    dismissedAt: string | null;
    maxUsageRatioAtDismiss: number | null;
  } | null;
  now?: Date;
  thresholds?: typeof PLAN_USAGE_THRESHOLDS;
};

export type PlanRecommendation = {
  organizationId: string;
  currentPlan: string | null;
  recommendedPlan: PaidPlanKey | null;
  shouldRecommendUpgrade: boolean;
  severity: RecommendationSeverity;
  score: number;
  reasons: string[];
  usageLevel: number;
  upgradeStatus: UpgradeStatusLabel;
  fingerprint: string;
  /** Effective status after dismiss/review rules. */
  status: RecommendationStatus;
  limitPressures: Array<{
    featureKey: string;
    label: string;
    used: number;
    limit: number;
    ratio: number;
  }>;
};

function ladderIndex(plan: string | null | undefined): number {
  if (!plan) return -1;
  return PLAN_UPGRADE_LADDER.indexOf(plan as PaidPlanKey);
}

function paidBasePlan(planKey: string | null): PaidPlanKey | null {
  if (!planKey) return null;
  if (planKey === COMMERCIAL_PLAN_KEYS.TRIAL) return COMMERCIAL_PLAN_KEYS.BASIC;
  if (isLegacyPlanKey(planKey)) return null;
  if ((PLAN_UPGRADE_LADDER as readonly string[]).includes(planKey)) {
    return planKey as PaidPlanKey;
  }
  return null;
}

function grantFor(
  grants: FeatureGrantSnapshot[],
  featureKey: string
): FeatureGrantSnapshot | undefined {
  return grants.find((g) => g.featureKey === featureKey);
}

/**
 * Module activity counts toward a higher plan only when the clinic is not already
 * covered by plan/override/addon. Override/addon coverage suppresses upsell for that module (#20).
 */
function moduleNeedsHigherPlan(
  featureKey: string,
  activity: ModuleActivitySnapshot[],
  accessAttempts: string[],
  grants: FeatureGrantSnapshot[]
): boolean {
  const grant = grantFor(grants, featureKey);
  if (grant?.enabled) {
    // Already entitled (plan, override, or addon) — do not upsell for this module alone.
    return false;
  }
  const hasActivity = activity.some((a) => a.featureKey === featureKey && a.active);
  const attempted = accessAttempts.includes(featureKey);
  return hasActivity || attempted;
}

function meterRatio(meter: UsageMeterSnapshot): number | null {
  if (meter.limit === null || meter.limit <= 0) return null;
  if (!Number.isFinite(meter.used) || meter.used < 0) return null;
  return meter.used / meter.limit;
}

function smallestPlanIncluding(
  featureKey: string,
  planIncludesFeature: Partial<Record<PaidPlanKey, string[]>>,
  minPlan: PaidPlanKey = COMMERCIAL_PLAN_KEYS.BASIC
): PaidPlanKey | null {
  const start = ladderIndex(minPlan);
  for (let i = Math.max(0, start); i < PLAN_UPGRADE_LADDER.length; i++) {
    const plan = PLAN_UPGRADE_LADDER[i];
    const features = planIncludesFeature[plan] ?? [];
    if (features.includes(featureKey)) return plan;
  }
  return null;
}

function smallestPlanWithHigherLimit(params: {
  featureKey: string;
  currentLimit: number;
  planLimits: Partial<Record<PaidPlanKey, Record<string, number | null>>>;
  minPlan: PaidPlanKey;
}): PaidPlanKey | null {
  const start = ladderIndex(params.minPlan);
  for (let i = Math.max(0, start); i < PLAN_UPGRADE_LADDER.length; i++) {
    const plan = PLAN_UPGRADE_LADDER[i];
    const limit = params.planLimits[plan]?.[params.featureKey];
    if (limit === undefined) continue;
    if (limit === null) return plan;
    if (limit > params.currentLimit) return plan;
  }
  return null;
}

function maxPlan(a: PaidPlanKey | null, b: PaidPlanKey | null): PaidPlanKey | null {
  if (!a) return b;
  if (!b) return a;
  return ladderIndex(a) >= ladderIndex(b) ? a : b;
}

export function buildRecommendationFingerprint(params: {
  recommendedPlan: string | null;
  reasons: string[];
  severity: RecommendationSeverity;
}): string {
  const reasons = [...params.reasons].sort().join('|');
  return `${params.recommendedPlan ?? 'none'}::${params.severity}::${reasons}`;
}

/**
 * Decide whether a dismissed recommendation should reappear.
 */
export function shouldReopenDismissed(params: {
  persisted: NonNullable<PlanRecommendationInput['persisted']>;
  nextFingerprint: string;
  nextRecommendedPlan: string | null;
  nextSeverity: RecommendationSeverity;
  nextUsageLevel: number;
}): boolean {
  if (params.persisted.status !== 'dismissed') return true;
  if (params.persisted.recommendedPlanKey !== params.nextRecommendedPlan) return true;
  if (params.persisted.fingerprint && params.persisted.fingerprint !== params.nextFingerprint) {
    return true;
  }
  const severityRank: Record<RecommendationSeverity, number> = {
    none: 0,
    info: 1,
    warning: 2,
    critical: 3,
  };
  // Infer previous severity from fingerprint when possible; otherwise reopen on usage jump.
  const prevRatio = params.persisted.maxUsageRatioAtDismiss ?? 0;
  if (params.nextUsageLevel >= prevRatio + 0.1) return true;
  if (severityRank[params.nextSeverity] >= 2 && params.nextUsageLevel >= PLAN_USAGE_THRESHOLDS.warning) {
    return params.nextUsageLevel > prevRatio;
  }
  return false;
}

export function computePlanRecommendation(input: PlanRecommendationInput): PlanRecommendation {
  const thresholds = input.thresholds ?? PLAN_USAGE_THRESHOLDS;
  const accessAttempts = input.accessAttempts ?? [];
  const currentPlan = input.currentPlanKey;
  const base = paidBasePlan(currentPlan);
  const reasons: string[] = [];
  const limitPressures: PlanRecommendation['limitPressures'] = [];

  let candidate: PaidPlanKey | null = null;
  let severity: RecommendationSeverity = 'none';
  let upgradeStatus: UpgradeStatusLabel = 'none';

  const allMeters = [...input.seats, ...input.meters];
  let usageLevel = 0;
  for (const meter of allMeters) {
    const ratio = meterRatio(meter);
    if (ratio === null) continue;
    usageLevel = Math.max(usageLevel, ratio);
    if (ratio >= thresholds.info && meter.limit !== null && meter.limit > 0) {
      limitPressures.push({
        featureKey: meter.featureKey,
        label: meter.label,
        used: meter.used,
        limit: meter.limit,
        ratio,
      });
    }
  }
  limitPressures.sort((a, b) => b.ratio - a.ratio);

  // Legacy: never auto-recommend paid migration.
  if (currentPlan && isLegacyPlanKey(currentPlan)) {
    const fingerprint = buildRecommendationFingerprint({
      recommendedPlan: null,
      reasons: ['Legacy — requiere revisión comercial manual'],
      severity: 'info',
    });
    return {
      organizationId: input.organizationId,
      currentPlan,
      recommendedPlan: null,
      shouldRecommendUpgrade: false,
      severity: 'info',
      score: Math.round(Math.min(usageLevel, 1) * 100),
      reasons: ['Legacy — requiere revisión comercial manual'],
      usageLevel,
      upgradeStatus: 'legacy_review',
      fingerprint,
      status: 'none',
      limitPressures,
    };
  }

  const minUpgradeFrom = base ?? COMMERCIAL_PLAN_KEYS.BASIC;
  const nextAfterCurrent =
    base && ladderIndex(base) < PLAN_UPGRADE_LADDER.length - 1
      ? PLAN_UPGRADE_LADDER[ladderIndex(base) + 1]
      : null;

  // Limit pressure → smallest higher plan with room.
  for (const pressure of limitPressures) {
    if (pressure.ratio < thresholds.info) continue;
    const target = smallestPlanWithHigherLimit({
      featureKey: pressure.featureKey,
      currentLimit: pressure.limit,
      planLimits: input.planLimits,
      minPlan: nextAfterCurrent ?? COMMERCIAL_PLAN_KEYS.PRO,
    });
    if (!target) continue;
    if (base && ladderIndex(target) <= ladderIndex(base)) continue;
    candidate = maxPlan(candidate, target);
    const pct = Math.round(pressure.ratio * 100);
    reasons.push(`${pressure.label}: ${pressure.used} / ${pressure.limit} (${pct}% del cupo)`);
    if (pressure.ratio >= thresholds.critical) {
      severity = 'critical';
      upgradeStatus = 'limit_reached';
    } else if (pressure.ratio >= thresholds.warning) {
      if (severity !== 'critical') severity = 'warning';
      if (upgradeStatus === 'none' || upgradeStatus === 'near_limit') {
        upgradeStatus = 'upgrade_recommended';
      }
    } else {
      if (severity === 'none') severity = 'info';
      if (upgradeStatus === 'none') upgradeStatus = 'near_limit';
    }
  }

  // Pro module signals
  for (const signal of PRO_MODULE_SIGNALS) {
    if (
      !moduleNeedsHigherPlan(signal.featureKey, input.activity, accessAttempts, input.grants)
    ) {
      continue;
    }
    const target = smallestPlanIncluding(
      signal.featureKey,
      input.planIncludesFeature,
      COMMERCIAL_PLAN_KEYS.PRO
    );
    if (!target) continue;
    if (base && ladderIndex(target) <= ladderIndex(base)) continue;
    candidate = maxPlan(candidate, target);
    reasons.push(signal.reason);
    if (severity === 'none') severity = 'warning';
    if (upgradeStatus === 'none' || upgradeStatus === 'near_limit') {
      upgradeStatus = 'upgrade_recommended';
    }
  }

  // Premium module signals
  for (const signal of PREMIUM_MODULE_SIGNALS) {
    if (
      !moduleNeedsHigherPlan(signal.featureKey, input.activity, accessAttempts, input.grants)
    ) {
      continue;
    }
    const target = smallestPlanIncluding(
      signal.featureKey,
      input.planIncludesFeature,
      COMMERCIAL_PLAN_KEYS.PREMIUM
    );
    if (!target) continue;
    if (base && ladderIndex(target) <= ladderIndex(base)) continue;
    candidate = maxPlan(candidate, target);
    reasons.push(signal.reason);
    if (severity === 'none' || severity === 'info') severity = 'warning';
    if (upgradeStatus === 'none' || upgradeStatus === 'near_limit') {
      upgradeStatus = 'upgrade_recommended';
    }
  }

  // Enterprise: stronger multi-signal bar (never from one isolated metric alone).
  const usersMeter = input.seats.find((s) => s.featureKey === FEATURES.USERS_MAX);
  const branchesMeter = input.seats.find((s) => s.featureKey === FEATURES.BRANCHES_MAX);
  const users = usersMeter?.used ?? 0;
  const branches = branchesMeter?.used ?? 0;
  const extremeUsage = usageLevel >= thresholds.critical;
  const enterpriseSignals =
    (branches >= ENTERPRISE_BRANCH_THRESHOLD ? 1 : 0) +
    (users >= ENTERPRISE_USER_THRESHOLD ? 1 : 0) +
    (extremeUsage && (base === COMMERCIAL_PLAN_KEYS.PREMIUM || candidate === COMMERCIAL_PLAN_KEYS.PREMIUM)
      ? 1
      : 0);

  if (enterpriseSignals >= 2 && (!base || ladderIndex(base) < ladderIndex(COMMERCIAL_PLAN_KEYS.ENTERPRISE))) {
    candidate = COMMERCIAL_PLAN_KEYS.ENTERPRISE;
    if (branches >= ENTERPRISE_BRANCH_THRESHOLD) {
      reasons.push(`Múltiples sucursales activas (${branches})`);
    }
    if (users >= ENTERPRISE_USER_THRESHOLD) {
      reasons.push(`Alto número de usuarios activos (${users})`);
    }
    if (extremeUsage) {
      reasons.push('Uso extremo de cupos del plan actual');
    }
    severity = 'warning';
    upgradeStatus = 'upgrade_recommended';
  }

  // Never recommend same or lower plan.
  if (candidate && base && ladderIndex(candidate) <= ladderIndex(base)) {
    candidate = null;
  }
  if (!candidate) {
    if (upgradeStatus === 'near_limit' || upgradeStatus === 'limit_reached') {
      // Keep status for visibility even without a concrete higher plan.
    } else {
      severity = 'none';
      upgradeStatus = 'none';
      reasons.length = 0;
    }
  }

  // Trial: frame as conversion advice, not silent paid upgrade.
  if (currentPlan === COMMERCIAL_PLAN_KEYS.TRIAL && candidate) {
    upgradeStatus = 'trial_conversion';
    if (severity === 'none') severity = 'info';
    reasons.unshift('Al terminar el trial, este plan comercial encaja con el uso actual');
  }

  const uniqueReasons = [...new Set(reasons)].slice(0, 8);
  const fingerprint = buildRecommendationFingerprint({
    recommendedPlan: candidate,
    reasons: uniqueReasons,
    severity,
  });

  let status: RecommendationStatus =
    candidate && (upgradeStatus === 'upgrade_recommended' || upgradeStatus === 'trial_conversion')
      ? 'recommended'
      : 'none';

  const shouldRecommendUpgrade = Boolean(candidate) && status === 'recommended';

  if (input.persisted?.status === 'dismissed' && candidate) {
    const reopen = shouldReopenDismissed({
      persisted: input.persisted,
      nextFingerprint: fingerprint,
      nextRecommendedPlan: candidate,
      nextSeverity: severity,
      nextUsageLevel: usageLevel,
    });
    if (!reopen) {
      status = 'dismissed';
      upgradeStatus = 'dismissed';
    }
  } else if (input.persisted?.status === 'reviewed' && candidate) {
    if (input.persisted.fingerprint === fingerprint) {
      status = 'reviewed';
      upgradeStatus = 'reviewed';
    }
  } else if (input.persisted?.status === 'accepted' && candidate) {
    if (input.persisted.recommendedPlanKey === candidate) {
      status = 'accepted';
    }
  }

  const score = Math.round(
    Math.min(1, Math.max(usageLevel, candidate ? 0.5 : 0, severity === 'critical' ? 1 : 0)) * 100
  );

  return {
    organizationId: input.organizationId,
    currentPlan,
    recommendedPlan: candidate,
    shouldRecommendUpgrade: shouldRecommendUpgrade && status === 'recommended',
    severity: status === 'dismissed' || status === 'reviewed' ? severity : severity,
    score,
    reasons: uniqueReasons,
    usageLevel,
    upgradeStatus,
    fingerprint,
    status,
    limitPressures,
  };
}

export function comparePlanFeatures(params: {
  currentPlanKey: string;
  targetPlanKey: string;
  featureNames: Record<string, string>;
  currentFeatures: Array<{ featureKey: string; enabled: boolean; limitValue: number | null }>;
  targetFeatures: Array<{ featureKey: string; enabled: boolean; limitValue: number | null }>;
}): {
  gained: string[];
  lost: string[];
  limitChanges: Array<{ label: string; from: string; to: string }>;
} {
  const currentMap = new Map(params.currentFeatures.map((f) => [f.featureKey, f]));
  const targetMap = new Map(params.targetFeatures.map((f) => [f.featureKey, f]));
  const keys = new Set([...currentMap.keys(), ...targetMap.keys()]);
  const gained: string[] = [];
  const lost: string[] = [];
  const limitChanges: Array<{ label: string; from: string; to: string }> = [];

  for (const key of keys) {
    const cur = currentMap.get(key);
    const tgt = targetMap.get(key);
    const name = params.featureNames[key] ?? key;
    const curOn = Boolean(cur?.enabled);
    const tgtOn = Boolean(tgt?.enabled);
    if (!curOn && tgtOn) gained.push(name);
    if (curOn && !tgtOn) lost.push(name);
    const fromLimit = cur?.limitValue;
    const toLimit = tgt?.limitValue;
    if (curOn && tgtOn && fromLimit !== toLimit) {
      const fmt = (v: number | null | undefined) =>
        v === null || v === undefined ? 'ilimitado' : String(v);
      if (fmt(fromLimit) !== fmt(toLimit)) {
        limitChanges.push({ label: name, from: fmt(fromLimit), to: fmt(toLimit) });
      }
    }
  }

  return { gained, lost, limitChanges };
}

export type RecommendationCsvRow = {
  clinicName: string;
  slug: string;
  ownerName: string | null;
  currentPlan: string | null;
  subscriptionStatus: string | null;
  usersUsed: number;
  branchesUsed: number;
  patientsUsed: number;
  usageLevel: number;
  recommendedPlan: string | null;
  upgradeStatus: string;
  severity: string;
  reasons: string[];
};

/** Escape a CSV field (RFC-style quotes). */
export function csvEscape(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function formatRecommendationsCsv(rows: RecommendationCsvRow[]): string {
  const header = [
    'clinic',
    'slug',
    'owner',
    'current_plan',
    'subscription_status',
    'users',
    'branches',
    'patients',
    'usage_level',
    'recommended_plan',
    'upgrade_status',
    'severity',
    'reasons',
  ];
  const lines = [header.join(',')];
  for (const row of rows) {
    lines.push(
      [
        csvEscape(row.clinicName),
        csvEscape(row.slug),
        csvEscape(row.ownerName ?? ''),
        csvEscape(row.currentPlan ?? ''),
        csvEscape(row.subscriptionStatus ?? ''),
        String(row.usersUsed),
        String(row.branchesUsed),
        String(row.patientsUsed),
        String(Math.round(Math.min(row.usageLevel, 9) * 1000) / 1000),
        csvEscape(row.recommendedPlan ?? ''),
        csvEscape(row.upgradeStatus),
        csvEscape(row.severity),
        csvEscape(row.reasons.join(' | ')),
      ].join(',')
    );
  }
  return `${lines.join('\n')}\n`;
}
