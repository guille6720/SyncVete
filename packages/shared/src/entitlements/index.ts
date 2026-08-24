export type {
  EntitlementSource,
  SubscriptionStatus,
  FeatureCatalogRow,
  PlanFeatureRow,
  AddonFeatureRow,
  FeatureOverrideRow,
  ResolvedEntitlement,
  OrganizationEntitlements,
  EntitlementResolutionInput,
} from './resolve';

export {
  resolveFeatureEntitlement,
  resolveOrganizationEntitlements,
  canUseResolvedFeature,
  getResolvedFeatureLimit,
  isSubscriptionPeriodOpen,
} from './resolve';

export {
  bytesToStorageMb,
  clinicalAiKindFeature,
  utcMonthPeriod,
  METERED_USAGE_LABELS,
  SEAT_USAGE_LABELS,
  quotaUsageLabel,
  wouldExceedLimit,
  formatMeteredUsage,
  findSeatDowngradeBlockers,
  formatSeatDowngradeMessage,
  formatSeatAssignmentMessage,
} from './limits';

export type { MeteredUsageMeter, SeatUsageMeter, SeatDowngradeBlocker } from './limits';

export {
  getNavFeatureKey,
  getNavHrefForPath,
  getEntitledClinicHrefs,
  isClinicPathEntitled,
} from './nav';

export {
  COMMERCIAL_CHECKOUT_INTENT_HOURS,
  COMMERCIAL_QUOTA_WARN_RATIO,
  COMMERCIAL_TRIAL_REMIND_DAYS,
  PLAN_BILLING_HREF,
  authorizeCronSecret,
  canCancelOwnAddon,
  canCancelOwnSubscription,
  canCheckoutAddonOffer,
  canRenewOwnPlan,
  isPeriodEndingSoon,
  isQuotaNearLimit,
  isTrialEndingSoon,
  resolveAddonOfferState,
  resolveCheckoutIntentAction,
  resolveClinicCommercialBanner,
} from './lifecycle';

export type {
  AddonOfferState,
  CheckoutIntentKind,
  ClinicCommercialBanner,
  ClinicCommercialBannerKind,
  ClinicSeatMeter,
  OpenCheckoutIntent,
} from './lifecycle';

export {
  PLAN_USAGE_THRESHOLDS,
  PLAN_UPGRADE_LADDER,
  PRO_MODULE_SIGNALS,
  PREMIUM_MODULE_SIGNALS,
  ENTERPRISE_BRANCH_THRESHOLD,
  ENTERPRISE_USER_THRESHOLD,
  computePlanRecommendation,
  buildRecommendationFingerprint,
  shouldReopenDismissed,
  comparePlanFeatures,
  formatRecommendationsCsv,
  csvEscape,
} from './plan-recommendations';

export type {
  PlanUsageThresholdKey,
  PaidPlanKey,
  RecommendationSeverity,
  RecommendationStatus,
  UpgradeStatusLabel,
  UsageMeterSnapshot,
  ModuleActivitySnapshot,
  FeatureGrantSnapshot,
  PlanRecommendationInput,
  PlanRecommendation,
  RecommendationCsvRow,
} from './plan-recommendations';
