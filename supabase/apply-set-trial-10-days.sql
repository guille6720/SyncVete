-- Pegar en Supabase → SQL Editor → Run (Production).
-- Activa trial gratis de 10 días para clínicas NUEVAS (plan key = trial).
-- Las clínicas Legacy actuales no cambian.

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

-- Verificación
SELECT key, name, metadata->>'default_trial_days' AS default_trial_days
FROM public.plans
WHERE key = 'trial';
