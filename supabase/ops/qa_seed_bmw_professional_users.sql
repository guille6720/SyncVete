-- QA ONLY — link fictitious BMW professionals to auth users + profiles + branch_members
-- so they appear in Agenda → Nueva cita → Profesional.
--
-- Org: BMW (Guille) — production Preview QA data
--   organization_id: 285acad6-daf1-4aaf-84d1-be39f9d5deca
--   branch_id:       fb781413-402b-4b7c-a4de-a47854ac481d
--
-- Run in Supabase SQL editor (service role / postgres) AFTER _tmp_qa_seed_bmw.sql
-- Idempotent: skips professionals that already have user_id.
--
-- Test login (optional, not for real use):
--   Email: *@syncvete.test (see NOTICE output)
--   Password: QaSeed2026!

DO $$
DECLARE
  v_org_id UUID := '285acad6-daf1-4aaf-84d1-be39f9d5deca';
  v_branch_id UUID := 'fb781413-402b-4b7c-a4de-a47854ac481d';
  v_instance_id UUID;
  v_password TEXT := 'QaSeed2026!';
  rec RECORD;
  v_user_id UUID;
  v_email TEXT;
  v_full_name TEXT;
  v_slug TEXT;
BEGIN
  SELECT id INTO v_instance_id FROM auth.instances LIMIT 1;
  IF v_instance_id IS NULL THEN
    v_instance_id := '00000000-0000-0000-0000-000000000000';
  END IF;

  FOR rec IN
    SELECT id, first_name, last_name
    FROM public.professionals
    WHERE organization_id = v_org_id
      AND deleted_at IS NULL
      AND is_active = true
      AND coalesce(notes, '') LIKE '%[QA_SEED]%'
      AND user_id IS NULL
    ORDER BY first_name, last_name
  LOOP
    v_slug := lower(
      translate(
        rec.first_name || '.' || rec.last_name,
        'áéíóúñüÁÉÍÓÚÑÜ',
        'aeiounuAEIOUNU'
      )
    );
    v_slug := regexp_replace(v_slug, '[^a-z0-9.]+', '.', 'g');
    v_email := v_slug || '.qa@syncvete.test';
    v_full_name := trim(rec.first_name || ' ' || rec.last_name);

    SELECT id INTO v_user_id
    FROM auth.users
    WHERE lower(email) = lower(v_email);

    -- Never reuse org owner accounts (e.g. Guille) if email lookup fails but user_id was wrong.
    IF v_user_id IS NOT NULL AND EXISTS (
      SELECT 1
      FROM public.branch_members bm
      WHERE bm.user_id = v_user_id
        AND bm.organization_id = v_org_id
        AND bm.role = 'owner'
        AND bm.deleted_at IS NULL
    ) THEN
      v_user_id := NULL;
    END IF;

    IF v_user_id IS NULL THEN
      v_user_id := gen_random_uuid();

      INSERT INTO auth.users (
        instance_id,
        id,
        aud,
        role,
        email,
        encrypted_password,
        email_confirmed_at,
        confirmation_token,
        recovery_token,
        email_change_token_new,
        email_change,
        raw_app_meta_data,
        raw_user_meta_data,
        created_at,
        updated_at,
        is_sso_user,
        is_anonymous
      ) VALUES (
        v_instance_id,
        v_user_id,
        'authenticated',
        'authenticated',
        v_email,
        extensions.crypt(v_password, extensions.gen_salt('bf')),
        timezone('utc', now()),
        '',
        '',
        '',
        '',
        jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email')),
        jsonb_build_object('full_name', v_full_name, 'qa_seed', true),
        timezone('utc', now()),
        timezone('utc', now()),
        false,
        false
      );

      INSERT INTO auth.identities (
        id,
        user_id,
        provider_id,
        identity_data,
        provider,
        last_sign_in_at,
        created_at,
        updated_at
      ) VALUES (
        gen_random_uuid(),
        v_user_id,
        v_user_id::text,
        jsonb_build_object(
          'sub', v_user_id::text,
          'email', v_email,
          'email_verified', true,
          'phone_verified', false
        ),
        'email',
        timezone('utc', now()),
        timezone('utc', now()),
        timezone('utc', now())
      );
    END IF;

    INSERT INTO public.profiles (id, organization_id, full_name, active_branch_id, is_active)
    VALUES (v_user_id, v_org_id, v_full_name, v_branch_id, true)
    ON CONFLICT (id) DO UPDATE SET
      organization_id = EXCLUDED.organization_id,
      full_name = EXCLUDED.full_name,
      active_branch_id = COALESCE(public.profiles.active_branch_id, EXCLUDED.active_branch_id),
      is_active = true,
      deleted_at = NULL,
      updated_at = timezone('utc', now());

    INSERT INTO public.branch_members (organization_id, branch_id, user_id, role, is_active)
    VALUES (v_org_id, v_branch_id, v_user_id, 'veterinarian', true)
    ON CONFLICT (branch_id, user_id) DO UPDATE SET
      role = 'veterinarian',
      is_active = true,
      deleted_at = NULL,
      updated_at = timezone('utc', now());

    UPDATE public.professionals
    SET
      user_id = v_user_id,
      profile_id = v_user_id,
      updated_at = timezone('utc', now())
    WHERE id = rec.id;

    RAISE NOTICE 'QA_SEED linked professional % → % (user_id=%)', v_full_name, v_email, v_user_id;
  END LOOP;
END $$;

SELECT
  p.first_name,
  p.last_name,
  u.email,
  p.user_id IS NOT NULL AS linked
FROM public.professionals p
LEFT JOIN auth.users u ON u.id = p.user_id
WHERE p.organization_id = '285acad6-daf1-4aaf-84d1-be39f9d5deca'
  AND coalesce(p.notes, '') LIKE '%[QA_SEED]%'
  AND p.deleted_at IS NULL
ORDER BY p.first_name;
