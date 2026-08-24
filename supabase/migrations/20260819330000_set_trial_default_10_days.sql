-- Product policy: new clinics get a 10-day free trial.
-- Must stay in sync with ONBOARDING_TRIAL_DAYS in packages/shared/src/constants/features.ts

UPDATE public.plans
SET
  metadata = jsonb_set(
    COALESCE(metadata, '{}'::jsonb),
    '{default_trial_days}',
    '10'::jsonb,
    true
  ),
  description = 'Plan de onboarding para organizaciones nuevas. Trial gratis de 10 días (metadata.default_trial_days).',
  updated_at = timezone('utc', now())
WHERE key = 'trial';
