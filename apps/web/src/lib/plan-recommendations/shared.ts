/**
 * Client-safe plan recommendation constants/helpers.
 * Do not import server modules here (next/headers, supabase server, etc.).
 */

export type RecommendationPriorityWeights = {
  critical: number;
  warning: number;
  info: number;
  usage100: number;
  usage90: number;
  usage80: number;
  age31: number;
  age15: number;
  age8: number;
  neverContacted: number;
  overdueFollowUp: number;
  unassigned: number;
  frozenPenalty: number;
};

export const DEFAULT_RECOMMENDATION_PRIORITY_WEIGHTS: RecommendationPriorityWeights = {
  critical: 40,
  warning: 20,
  info: 8,
  usage100: 25,
  usage90: 15,
  usage80: 8,
  age31: 30,
  age15: 18,
  age8: 10,
  neverContacted: 15,
  overdueFollowUp: 22,
  unassigned: 12,
  frozenPenalty: 35,
};

export type RecommendationSettings = {
  thresholdInfo: number;
  thresholdWarning: number;
  thresholdCritical: number;
  clinicSnoozeDays: number;
  staleDays: number;
  priorityWeights: RecommendationPriorityWeights;
  updatedAt: string | null;
};

export type CommercialRecommendationOutcome =
  | 'won'
  | 'lost'
  | 'deferred'
  | 'not_a_fit';

export const COMMERCIAL_OUTCOME_LABELS: Record<CommercialRecommendationOutcome, string> = {
  won: 'Ganada',
  lost: 'Perdida',
  deferred: 'Diferida',
  not_a_fit: 'No encaja',
};

export const COMMERCIAL_SAVED_VIEW_PARAM_KEYS = [
  'assignee',
  'outcome',
  'digest',
  'activity',
  'tag',
  'aging',
  'note',
  'pipeline',
  'psort',
  'priority',
  'pfrozen',
  'psnooze',
  'upgrade',
  'recommended',
] as const;

export type CommercialSavedViewParamKey = (typeof COMMERCIAL_SAVED_VIEW_PARAM_KEYS)[number];

export type RecommendationSavedView = {
  id: string;
  name: string;
  queryParams: Partial<Record<CommercialSavedViewParamKey, string>>;
  isShared: boolean;
  ownerUserId: string;
  ownerEmail: string | null;
  isMine: boolean;
  createdAt: string | null;
  updatedAt: string | null;
};

export function sanitizeCommercialSavedViewParams(
  input: Record<string, string | undefined | null> | null | undefined
): Partial<Record<CommercialSavedViewParamKey, string>> {
  const out: Partial<Record<CommercialSavedViewParamKey, string>> = {};
  if (!input) return out;
  for (const key of COMMERCIAL_SAVED_VIEW_PARAM_KEYS) {
    const raw = input[key];
    if (typeof raw !== 'string') continue;
    const value = raw.trim();
    if (!value || value.length > 120) continue;
    out[key] = value;
  }
  return out;
}

export function commercialSavedViewHref(
  params: Partial<Record<CommercialSavedViewParamKey, string>>
): string {
  const search = new URLSearchParams();
  for (const key of COMMERCIAL_SAVED_VIEW_PARAM_KEYS) {
    const value = params[key];
    if (value) search.set(key, value);
  }
  const qs = search.toString();
  return qs ? `/superadmin?${qs}` : '/superadmin';
}
