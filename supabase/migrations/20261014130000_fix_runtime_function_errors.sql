-- Fixes runtime errors found with plpgsql_check (all idempotent).

-- 1. pgcrypto lives in the "extensions" schema on Supabase. Functions pinned to
--    search_path=public could not resolve digest()/gen_random_bytes() (QR check-in and
--    interconsultation token links failed at runtime).
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosrc ~* '\m(digest|gen_random_bytes|hmac|crypt|gen_salt)\s*\('
      AND NOT EXISTS (
        SELECT 1 FROM unnest(coalesce(p.proconfig, '{}')) cfg
        WHERE cfg LIKE 'search_path=%' AND cfg LIKE '%extensions%'
      )
  LOOP
    EXECUTE format('ALTER FUNCTION %s SET search_path = public, extensions', r.sig);
  END LOOP;
END;
$$;

-- 2. format() has no %.2f specifier; hourly settlement rules raised on every run.
DO $$
DECLARE
  r RECORD;
  v_def TEXT;
BEGIN
  FOR r IN
    SELECT p.oid
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'apply_professional_appointment_hourly_rules'
      AND p.prosrc LIKE '%(\%.2f h)%'
  LOOP
    v_def := pg_get_functiondef(r.oid);
    v_def := replace(
      v_def,
      'format(''Horas de turno (%.2f h)'', v_hours)',
      'format(''Horas de turno (%s h)'', to_char(v_hours, ''FM999990.00''))'
    );
    EXECUTE v_def;
  END LOOP;
END;
$$;

-- 3. Seeds its settings row on first read, so it cannot be STABLE.
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'superadmin_get_recommendation_settings'
      AND p.provolatile <> 'v'
  LOOP
    EXECUTE format('ALTER FUNCTION %s VOLATILE', r.sig);
  END LOOP;
END;
$$;

-- 4. Saved views upsert relies on this constraint (ON CONFLICT ON CONSTRAINT).
DO $$
BEGIN
  IF to_regclass('public.commercial_recommendation_saved_views') IS NULL THEN
    RETURN;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.commercial_recommendation_saved_views'::regclass
      AND conname = 'uq_commercial_saved_views_owner_name'
  ) THEN
    ALTER TABLE public.commercial_recommendation_saved_views
      ADD CONSTRAINT uq_commercial_saved_views_owner_name UNIQUE (owner_user_id, name_key);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.commercial_recommendation_saved_views'::regclass
      AND conname = 'commercial_recommendation_saved_views_name_len'
  ) THEN
    ALTER TABLE public.commercial_recommendation_saved_views
      ADD CONSTRAINT commercial_recommendation_saved_views_name_len
      CHECK (char_length(btrim(name)) BETWEEN 1 AND 60);
  END IF;
END;
$$;

NOTIFY pgrst, 'reload schema';
