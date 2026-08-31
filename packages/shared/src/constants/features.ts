/**
 * Commercial feature registry (organization entitlements).
 * Distinct from PERMISSIONS (user/role capabilities).
 */

export const FEATURES = {
  DASHBOARD: 'core.dashboard',

  OWNERS: 'owners.enabled',
  PATIENTS: 'patients.enabled',
  APPOINTMENTS: 'appointments.enabled',
  WAITING_ROOM: 'waiting_room.enabled',

  CLINICAL_HISTORY: 'clinical.history',
  CONSULTATIONS: 'clinical.consultations',
  HOSPITALIZATION: 'clinical.hospitalization',
  VACCINATION: 'clinical.vaccination',
  SURGERY: 'clinical.surgery',

  LABORATORY: 'laboratory.enabled',

  INVENTORY: 'inventory.enabled',
  PHARMACY: 'pharmacy.enabled',

  BILLING: 'billing.enabled',
  CASH_REGISTER: 'cash_register.enabled',

  BASIC_REPORTS: 'reports.basic',
  ADVANCED_REPORTS: 'reports.advanced',

  OWNER_PORTAL: 'owner_portal.enabled',

  WHATSAPP: 'whatsapp.enabled',
  WHATSAPP_REMINDERS: 'whatsapp.reminders',

  NOTIFICATIONS: 'notifications.enabled',

  CLINICAL_IMAGES: 'clinical_images.enabled',

  AUDIT: 'audit.enabled',

  DATA_IMPORT_EXPORT: 'data.import_export',

  PROFESSIONALS_SETTLEMENTS: 'professionals.settlements',
  PROFESSIONALS_INTERCONSULTATIONS: 'professionals.interconsultations',

  AI: 'ai.enabled',
  AI_PATIENT_SUMMARY: 'ai.patient_summary',
  AI_SOAP_ASSISTANT: 'ai.soap_assistant',
  AI_OWNER_INSTRUCTIONS: 'ai.owner_instructions',

  AUTOMATIONS: 'automation.enabled',

  USERS_MAX: 'users.max',
  BRANCHES_MAX: 'branches.max',
  PROFESSIONALS_MAX: 'professionals.max',
  PATIENTS_MAX: 'patients.max',
  AI_MONTHLY_REQUESTS: 'ai.monthly_requests',
  WHATSAPP_MONTHLY_MESSAGES: 'whatsapp.monthly_messages',
  STORAGE_MAX_MB: 'storage.max_mb',
  AUTOMATIONS_MAX_ACTIVE: 'automations.max_active',
} as const;

export type FeatureKey = (typeof FEATURES)[keyof typeof FEATURES];

export const FEATURE_KEYS = Object.values(FEATURES) as FeatureKey[];

export const LIMIT_FEATURE_KEYS = [
  FEATURES.USERS_MAX,
  FEATURES.BRANCHES_MAX,
  FEATURES.PROFESSIONALS_MAX,
  FEATURES.PATIENTS_MAX,
  FEATURES.AI_MONTHLY_REQUESTS,
  FEATURES.WHATSAPP_MONTHLY_MESSAGES,
  FEATURES.STORAGE_MAX_MB,
  FEATURES.AUTOMATIONS_MAX_ACTIVE,
] as const satisfies readonly FeatureKey[];

export type LimitFeatureKey = (typeof LIMIT_FEATURE_KEYS)[number];

export function isFeatureKey(value: string): value is FeatureKey {
  return (FEATURE_KEYS as string[]).includes(value);
}

export function isLimitFeatureKey(value: string): value is LimitFeatureKey {
  return (LIMIT_FEATURE_KEYS as readonly string[]).includes(value);
}

/** Clinic sidebar href → commercial feature. Unmapped routes stay visible. */
export const NAV_FEATURE_BY_HREF: Record<string, FeatureKey> = {
  '/dashboard': FEATURES.DASHBOARD,
  '/propietarios': FEATURES.OWNERS,
  '/pacientes': FEATURES.PATIENTS,
  '/agenda': FEATURES.APPOINTMENTS,
  '/sala-espera': FEATURES.WAITING_ROOM,
  '/historia-clinica': FEATURES.CLINICAL_HISTORY,
  '/consultas': FEATURES.CONSULTATIONS,
  '/internacion': FEATURES.HOSPITALIZATION,
  '/vacunacion': FEATURES.VACCINATION,
  '/cirugias': FEATURES.SURGERY,
  '/laboratorio': FEATURES.LABORATORY,
  '/inventario': FEATURES.INVENTORY,
  '/farmacia': FEATURES.PHARMACY,
  '/facturacion': FEATURES.BILLING,
  '/caja': FEATURES.CASH_REGISTER,
  '/reportes': FEATURES.BASIC_REPORTS,
  '/portal': FEATURES.OWNER_PORTAL,
  '/whatsapp': FEATURES.WHATSAPP,
  '/recordatorios': FEATURES.WHATSAPP_REMINDERS,
  '/notificaciones': FEATURES.NOTIFICATIONS,
  '/imagenes': FEATURES.CLINICAL_IMAGES,
  '/auditoria': FEATURES.AUDIT,
  '/ia-clinica': FEATURES.AI,
  '/profesionales': FEATURES.PROFESSIONALS_SETTLEMENTS,
  '/interconsultas': FEATURES.PROFESSIONALS_INTERCONSULTATIONS,
  '/liquidaciones': FEATURES.PROFESSIONALS_SETTLEMENTS,
  '/liquidaciones/mis-liquidaciones': FEATURES.PROFESSIONALS_SETTLEMENTS,
};

/** Commercial plan keys in DB (not the legacy organizations.plan enum). */
export const COMMERCIAL_PLAN_KEYS = {
  LEGACY: 'legacy',
  TRIAL: 'trial',
  BASIC: 'basic',
  PRO: 'pro',
  PREMIUM: 'premium',
  ENTERPRISE: 'enterprise',
} as const;

export type CommercialPlanKey =
  (typeof COMMERCIAL_PLAN_KEYS)[keyof typeof COMMERCIAL_PLAN_KEYS];

/**
 * Timed free trial for new clinics (days).
 * Must stay in sync with plans.metadata.default_trial_days for key = 'trial'.
 * null = open-ended `trialing` (trial_ends_at NULL) until configured.
 */
export const ONBOARDING_TRIAL_DAYS: number | null = 10;

/** Plan assigned to organizations created AFTER the entitlements migration. Never `legacy`. */
export const ONBOARDING_PLAN_KEY = COMMERCIAL_PLAN_KEYS.TRIAL;

/** Plans shown in public pricing selectors. Excludes legacy (internal) and trial (onboarding). */
export const PUBLIC_PRICING_PLAN_KEYS = [
  COMMERCIAL_PLAN_KEYS.BASIC,
  COMMERCIAL_PLAN_KEYS.PRO,
  COMMERCIAL_PLAN_KEYS.PREMIUM,
  COMMERCIAL_PLAN_KEYS.ENTERPRISE,
] as const satisfies readonly CommercialPlanKey[];

/** Features allowed for usage counters (must match DB features.usage_metered). */
export const METERED_FEATURE_KEYS = [
  FEATURES.AI_MONTHLY_REQUESTS,
  FEATURES.WHATSAPP_MONTHLY_MESSAGES,
  FEATURES.STORAGE_MAX_MB,
] as const satisfies readonly FeatureKey[];

/** Occupancy limits (not monthly meters). */
export const SEAT_FEATURE_KEYS = [
  FEATURES.USERS_MAX,
  FEATURES.BRANCHES_MAX,
  FEATURES.PROFESSIONALS_MAX,
  FEATURES.PATIENTS_MAX,
] as const satisfies readonly FeatureKey[];

export type SeatFeatureKey = (typeof SEAT_FEATURE_KEYS)[number];

export function isLegacyPlanKey(key: string): boolean {
  return key === COMMERCIAL_PLAN_KEYS.LEGACY;
}

export function isPublicPricingPlanKey(key: string): boolean {
  return (PUBLIC_PRICING_PLAN_KEYS as readonly string[]).includes(key);
}

/**
 * Public/commercial assignment helpers for Phase 2 Superadmin.
 * Legacy is never auto-assignable.
 */
export function isAutoAssignableOnboardingPlan(key: string): boolean {
  return key === ONBOARDING_PLAN_KEY && !isLegacyPlanKey(key);
}

export function assertNotLegacyAutoAssign(planKey: string): void {
  if (isLegacyPlanKey(planKey)) {
    throw new Error('legacy plan is migration-only and cannot be auto-assigned');
  }
}

/** Plans Superadmin may assign without the explicit-legacy flag. */
export const SUPERADMIN_ASSIGNABLE_PLAN_KEYS = [
  COMMERCIAL_PLAN_KEYS.TRIAL,
  COMMERCIAL_PLAN_KEYS.BASIC,
  COMMERCIAL_PLAN_KEYS.PRO,
  COMMERCIAL_PLAN_KEYS.PREMIUM,
  COMMERCIAL_PLAN_KEYS.ENTERPRISE,
] as const satisfies readonly CommercialPlanKey[];

/** Catalog keys Superadmin may grant. Extra add-ons can be added in SQL later. */
export const ADDON_KEYS = {
  AI: 'addon.ai',
  WHATSAPP: 'addon.whatsapp',
  PORTAL: 'addon.portal',
  IMAGES: 'addon.images',
  REPORTS: 'addon.reports',
} as const;

export type AddonKey = (typeof ADDON_KEYS)[keyof typeof ADDON_KEYS];

export const ADDON_PRIMARY_FEATURE: Record<AddonKey, FeatureKey> = {
  [ADDON_KEYS.AI]: FEATURES.AI,
  [ADDON_KEYS.WHATSAPP]: FEATURES.WHATSAPP,
  [ADDON_KEYS.PORTAL]: FEATURES.OWNER_PORTAL,
  [ADDON_KEYS.IMAGES]: FEATURES.CLINICAL_IMAGES,
  [ADDON_KEYS.REPORTS]: FEATURES.ADVANCED_REPORTS,
};

export function isAddonKey(value: string): value is AddonKey {
  return (Object.values(ADDON_KEYS) as string[]).includes(value);
}

export function canSuperadminAssignPlan(planKey: string, allowLegacy = false): boolean {
  if (isLegacyPlanKey(planKey)) return allowLegacy === true;
  return (SUPERADMIN_ASSIGNABLE_PLAN_KEYS as readonly string[]).includes(planKey);
}

export function parseSuperadminEmails(raw: string | undefined | null): string[] {
  if (!raw) return [];
  return raw
    .split(/[,;\s]+/)
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Session Superadmin gate.
 * When SUPERADMIN_EMAILS is set, it is the exclusive allowlist (DB rows alone are not enough).
 * When unset/empty, fall back to platform_admins membership (local/dev convenience).
 */
export function resolvePlatformAdminAccess(params: {
  email: string | undefined | null;
  allowlistRaw: string | undefined | null;
  isDbPlatformAdmin: boolean;
}): boolean {
  const allow = parseSuperadminEmails(params.allowlistRaw);
  const email = params.email?.trim().toLowerCase() ?? '';
  if (allow.length > 0) {
    return Boolean(email && allow.includes(email));
  }
  return params.isDbPlatformAdmin === true;
}

export function isMeteredFeatureKey(value: string): boolean {
  return (METERED_FEATURE_KEYS as readonly string[]).includes(value);
}

export function isSeatFeatureKey(value: string): value is SeatFeatureKey {
  return (SEAT_FEATURE_KEYS as readonly string[]).includes(value);
}

export function validateUsageIncrementAmount(amount: unknown): amount is number {
  return typeof amount === 'number' && Number.isFinite(amount) && Number.isInteger(amount) && amount > 0;
}
