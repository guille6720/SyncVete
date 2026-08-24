-- Trial clinics should explore the full product during onboarding (10-day trial).
-- Staging often shows everything via legacy/fail-open; production trial was limited to ~basic modules.

INSERT INTO public.plan_features (plan_id, feature_id, enabled, limit_value)
SELECT trial.id, pf.feature_id, pf.enabled, pf.limit_value
FROM public.plans premium
JOIN public.plan_features pf ON pf.plan_id = premium.id
JOIN public.plans trial ON trial.key = 'trial'
WHERE premium.key = 'premium'
ON CONFLICT (plan_id, feature_id) DO UPDATE
SET
  enabled = EXCLUDED.enabled,
  limit_value = EXCLUDED.limit_value,
  updated_at = now();

COMMENT ON TABLE public.plan_features IS
  'Trial plan mirrors premium feature access during onboarding; paid plans apply after trial.';
