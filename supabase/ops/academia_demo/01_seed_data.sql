-- ============================================================================
-- Academia Demo SyncVete — IDEMPOTENT SEED (public schema) — Phase 5C.1 hardened
-- Target: STAGING owmcrqvnfubyjxrlyhlc ONLY
--
-- Manual approval gate (required inside the same transaction):
--   SELECT set_config('app.academia_demo_seed_approved', 'yes', true);
-- This GUC is NOT a security boundary against attackers; it is an operator
-- foot-gun guard. Real isolation is: staging-only apply + marker maintainer
-- roles + ownership collision checks below.
--
-- Does NOT insert into auth.users.
-- Does NOT reassign profiles/memberships from other organizations.
-- Fixed-ID UPSERTs refuse collisions belonging to other orgs.
-- Seed-managed domain rows use source_system = 'academia_demo_seed'.
-- ============================================================================

DO $$
DECLARE
  c_org_id      uuid := 'a0a0a0a0-d0e0-4000-8000-000000000001';
  c_branch_id   uuid := 'a0a0a0a0-d0e0-4000-8000-000000000002';
  c_owner_id    uuid := 'a0a0a0a0-d0e0-4000-8000-000000000003';
  c_patient_id  uuid := 'a0a0a0a0-d0e0-4000-8000-000000000004';
  c_prof_id     uuid := 'a0a0a0a0-d0e0-4000-8000-000000000005';
  c_marker_key  text := 'sv-academia-demo-v1';
  c_slug        text := 'academia-demo-syncvete';
  c_source      text := 'academia_demo_seed';
  c_tz          text := 'America/Argentina/Buenos_Aires';

  v_owner_uid   uuid;
  v_vet_uid     uuid;
  v_rec_uid     uuid;
  v_weekday     smallint;
  v_other_orgs  int;
  v_demo_count  int;
  v_uid         uuid;
BEGIN
  IF coalesce(current_setting('app.academia_demo_seed_approved', true), '') IS DISTINCT FROM 'yes' THEN
    RAISE EXCEPTION 'ACADEMIA_DEMO: approval gate missing — set_config(''app.academia_demo_seed_approved'', ''yes'', true) in this transaction';
  END IF;

  -- Refuse if marker key already on a *different* org
  SELECT count(*) INTO v_demo_count
  FROM public.organizations o
  WHERE o.deleted_at IS NULL
    AND coalesce(o.settings->>'academia_demo_key', '') = c_marker_key
    AND o.id <> c_org_id;
  IF v_demo_count > 0 THEN
    RAISE EXCEPTION 'ACADEMIA_DEMO: marker key already on another organization';
  END IF;

  -- Fixed org id collision: must be absent or already our demo org
  IF EXISTS (
    SELECT 1 FROM public.organizations o
    WHERE o.id = c_org_id
      AND o.deleted_at IS NULL
      AND (
        coalesce(o.settings->>'academia_demo_key', '') IS DISTINCT FROM c_marker_key
        OR NOT coalesce((o.settings->>'academia_demo')::boolean, false)
      )
  ) THEN
    RAISE EXCEPTION 'ACADEMIA_DEMO: fixed org id % exists without demo marker (ownership conflict)', c_org_id;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.organizations o
    WHERE o.slug = c_slug AND o.id <> c_org_id AND o.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'ACADEMIA_DEMO: slug academia-demo-syncvete taken by another org';
  END IF;

  -- Fixed child-id collisions belonging to another org
  IF EXISTS (
    SELECT 1 FROM public.branches b
    WHERE b.id = c_branch_id AND b.organization_id IS DISTINCT FROM c_org_id
  ) THEN
    RAISE EXCEPTION 'ACADEMIA_DEMO: branch id collision outside demo org';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.owners ow
    WHERE ow.id = c_owner_id AND ow.organization_id IS DISTINCT FROM c_org_id
  ) THEN
    RAISE EXCEPTION 'ACADEMIA_DEMO: owner id collision outside demo org';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.patients pt
    WHERE pt.id = c_patient_id AND pt.organization_id IS DISTINCT FROM c_org_id
  ) THEN
    RAISE EXCEPTION 'ACADEMIA_DEMO: patient id collision outside demo org';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.professionals pr
    WHERE pr.id = c_prof_id AND pr.organization_id IS DISTINCT FROM c_org_id
  ) THEN
    RAISE EXCEPTION 'ACADEMIA_DEMO: professional id collision outside demo org';
  END IF;

  SELECT id INTO v_owner_uid FROM auth.users WHERE email = 'owner.demo@academia-demo.invalid' LIMIT 1;
  SELECT id INTO v_vet_uid   FROM auth.users WHERE email = 'vet.demo@academia-demo.invalid' LIMIT 1;
  SELECT id INTO v_rec_uid   FROM auth.users WHERE email = 'recepcion.demo@academia-demo.invalid' LIMIT 1;

  IF v_owner_uid IS NULL OR v_vet_uid IS NULL OR v_rec_uid IS NULL THEN
    RAISE EXCEPTION 'ACADEMIA_DEMO: missing auth users — run 02_auth_users.ps1 first (owner/vet/recepcion)';
  END IF;

  -- Never reassign profiles / memberships from other clinics
  FOREACH v_uid IN ARRAY ARRAY[v_owner_uid, v_vet_uid, v_rec_uid]
  LOOP
    IF EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = v_uid
        AND p.deleted_at IS NULL
        AND p.organization_id IS DISTINCT FROM c_org_id
    ) THEN
      RAISE EXCEPTION 'ACADEMIA_DEMO: auth user % already bound to another organization', v_uid;
    END IF;

    IF EXISTS (
      SELECT 1 FROM public.branch_members bm
      WHERE bm.user_id = v_uid
        AND bm.deleted_at IS NULL
        AND bm.is_active
        AND bm.organization_id IS DISTINCT FROM c_org_id
    ) THEN
      RAISE EXCEPTION 'ACADEMIA_DEMO: auth user % has active membership in another organization', v_uid;
    END IF;
  END LOOP;

  SELECT count(*) INTO v_other_orgs
  FROM public.organizations
  WHERE deleted_at IS NULL AND id <> c_org_id;

  -- 1) Organization (upsert by fixed id) — marker only via maintainer session
  INSERT INTO public.organizations (id, name, slug, plan, settings)
  VALUES (
    c_org_id,
    'Academia Demo SyncVete',
    c_slug,
    'trial',
    jsonb_build_object(
      'academia_demo', true,
      'academia_demo_key', c_marker_key,
      'academia_demo_managed', true,
      'academia_demo_source', c_source,
      'timezone', c_tz,
      'currency', 'ARS',
      'email', 'noreply@academia-demo.invalid'
    )
  )
  ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    slug = EXCLUDED.slug,
    deleted_at = NULL,
    settings = public.organizations.settings || EXCLUDED.settings,
    updated_at = now()
  WHERE public.organizations.id = c_org_id;

  UPDATE public.organization_subscriptions s
  SET metadata = coalesce(s.metadata, '{}'::jsonb) || jsonb_build_object(
    'academia_demo', true,
    'academia_demo_key', c_marker_key,
    'academia_demo_source', c_source,
    'billing_isolated', true
  )
  WHERE s.organization_id = c_org_id;

  -- 2) Branch
  INSERT INTO public.branches (
    id, organization_id, name, code, timezone, is_active, is_main, address, phone, email
  )
  VALUES (
    c_branch_id, c_org_id, 'Sucursal Demo', 'DEMO', c_tz, true, true,
    'Calle Ficticia 123', NULL, 'sucursal@academia-demo.invalid'
  )
  ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    code = EXCLUDED.code,
    deleted_at = NULL,
    is_active = true,
    is_main = true,
    updated_at = now()
  WHERE public.branches.organization_id = c_org_id;

  -- 3) Profiles + branch_members (only when unbound or already demo org)
  INSERT INTO public.profiles (id, organization_id, full_name, active_branch_id, is_active, account_status)
  VALUES (v_owner_uid, c_org_id, 'Owner Demo Academia', c_branch_id, true, 'active')
  ON CONFLICT (id) DO UPDATE SET
    organization_id = c_org_id,
    full_name = EXCLUDED.full_name,
    active_branch_id = c_branch_id,
    deleted_at = NULL,
    is_active = true,
    account_status = 'active',
    updated_at = now()
  WHERE public.profiles.organization_id = c_org_id;

  INSERT INTO public.branch_members (organization_id, branch_id, user_id, role, permissions, is_active)
  VALUES (
    c_org_id, c_branch_id, v_owner_uid, 'owner',
    '["org:manage","branch:manage","users:manage","patients:read","patients:write","appointments:read","appointments:write","clinical:read","clinical:write","billing:read","billing:write","inventory:read","inventory:write","reports:read","audit:read","data:import","data:export","waiting_room:read","waiting_room:write"]'::jsonb,
    true
  )
  ON CONFLICT (branch_id, user_id) DO UPDATE SET
    organization_id = c_org_id,
    role = 'owner',
    permissions = EXCLUDED.permissions,
    is_active = true,
    deleted_at = NULL,
    updated_at = now()
  WHERE public.branch_members.organization_id = c_org_id;

  INSERT INTO public.profiles (id, organization_id, full_name, active_branch_id, is_active, account_status)
  VALUES (v_vet_uid, c_org_id, 'Dra. Ana Demo', c_branch_id, true, 'active')
  ON CONFLICT (id) DO UPDATE SET
    organization_id = c_org_id,
    full_name = EXCLUDED.full_name,
    active_branch_id = c_branch_id,
    deleted_at = NULL,
    is_active = true,
    account_status = 'active',
    updated_at = now()
  WHERE public.profiles.organization_id = c_org_id;

  INSERT INTO public.branch_members (organization_id, branch_id, user_id, role, permissions, is_active)
  VALUES (
    c_org_id, c_branch_id, v_vet_uid, 'veterinarian',
    '["patients:read","patients:write","appointments:read","appointments:write","clinical:read","clinical:write","inventory:read","reports:read","data:export","waiting_room:read","waiting_room:write"]'::jsonb,
    true
  )
  ON CONFLICT (branch_id, user_id) DO UPDATE SET
    organization_id = c_org_id,
    role = 'veterinarian',
    permissions = EXCLUDED.permissions,
    is_active = true,
    deleted_at = NULL,
    updated_at = now()
  WHERE public.branch_members.organization_id = c_org_id;

  INSERT INTO public.profiles (id, organization_id, full_name, active_branch_id, is_active, account_status)
  VALUES (v_rec_uid, c_org_id, 'Recepción Demo', c_branch_id, true, 'active')
  ON CONFLICT (id) DO UPDATE SET
    organization_id = c_org_id,
    full_name = EXCLUDED.full_name,
    active_branch_id = c_branch_id,
    deleted_at = NULL,
    is_active = true,
    account_status = 'active',
    updated_at = now()
  WHERE public.profiles.organization_id = c_org_id;

  INSERT INTO public.branch_members (organization_id, branch_id, user_id, role, permissions, is_active)
  VALUES (
    c_org_id, c_branch_id, v_rec_uid, 'receptionist',
    '["patients:read","patients:write","appointments:read","appointments:write","billing:read","waiting_room:read","waiting_room:write"]'::jsonb,
    true
  )
  ON CONFLICT (branch_id, user_id) DO UPDATE SET
    organization_id = c_org_id,
    role = 'receptionist',
    permissions = EXCLUDED.permissions,
    is_active = true,
    deleted_at = NULL,
    updated_at = now()
  WHERE public.branch_members.organization_id = c_org_id;

  -- 4) Professional
  INSERT INTO public.professionals (
    id, organization_id, user_id, profile_id, first_name, last_name,
    relationship_type, specialty, is_active, invoice_required, email, notes
  )
  VALUES (
    c_prof_id, c_org_id, v_vet_uid, v_vet_uid, 'Ana', 'Demo',
    'employee', 'Medicina general', true, false, 'vet.demo@academia-demo.invalid',
    c_source
  )
  ON CONFLICT (id) DO UPDATE SET
    user_id = v_vet_uid,
    profile_id = v_vet_uid,
    first_name = 'Ana',
    last_name = 'Demo',
    notes = c_source,
    deleted_at = NULL,
    is_active = true,
    updated_at = now()
  WHERE public.professionals.organization_id = c_org_id;

  -- 5) Schedules only for demo vet on demo branch
  FOR v_weekday IN 1..7 LOOP
    IF NOT EXISTS (
      SELECT 1 FROM public.professional_schedules s
      WHERE s.organization_id = c_org_id
        AND s.branch_id = c_branch_id
        AND s.user_id = v_vet_uid
        AND s.weekday = v_weekday
        AND s.deleted_at IS NULL
    ) THEN
      INSERT INTO public.professional_schedules (
        organization_id, branch_id, user_id, weekday, start_time, end_time,
        slot_duration_minutes, allowed_appointment_types, is_active
      ) VALUES (
        c_org_id, c_branch_id, v_vet_uid, v_weekday, '08:00', '20:00',
        30, NULL, true
      );
    ELSE
      UPDATE public.professional_schedules
      SET start_time = '08:00',
          end_time = '20:00',
          is_active = true,
          deleted_at = NULL,
          updated_at = now()
      WHERE organization_id = c_org_id
        AND branch_id = c_branch_id
        AND user_id = v_vet_uid
        AND weekday = v_weekday
        AND deleted_at IS NULL;
    END IF;
  END LOOP;

  -- 6) Owner María Ejemplo
  INSERT INTO public.owners (
    id, organization_id, branch_id, full_name, email, phone, phone_whatsapp,
    document_type, document_number, city, province, notes, is_active, portal_user_id,
    source_system, source_record_id
  )
  VALUES (
    c_owner_id, c_org_id, c_branch_id, 'María Ejemplo',
    'maria.ejemplo@academia-demo.invalid', NULL, NULL,
    'DNI', '00000000', 'Ciudad Demo', 'CABA',
    'Tutor ficticio Academia Demo — no contactar', true, NULL,
    c_source, 'owner-maria'
  )
  ON CONFLICT (id) DO UPDATE SET
    branch_id = c_branch_id,
    full_name = EXCLUDED.full_name,
    email = EXCLUDED.email,
    phone_whatsapp = NULL,
    portal_user_id = NULL,
    source_system = c_source,
    source_record_id = 'owner-maria',
    deleted_at = NULL,
    is_active = true,
    updated_at = now()
  WHERE public.owners.organization_id = c_org_id;

  -- 7) Patient Luna
  INSERT INTO public.patients (
    id, organization_id, branch_id, owner_id, name, species, breed, sex,
    is_neutered, is_deceased, is_active, notes, source_system, source_record_id
  )
  VALUES (
    c_patient_id, c_org_id, c_branch_id, c_owner_id, 'Luna', 'Canino', 'Mestizo', 'Hembra',
    false, false, true, 'Paciente ficticio Academia Demo', c_source, 'patient-luna'
  )
  ON CONFLICT (id) DO UPDATE SET
    branch_id = c_branch_id,
    owner_id = c_owner_id,
    name = 'Luna',
    species = 'Canino',
    source_system = c_source,
    source_record_id = 'patient-luna',
    deleted_at = NULL,
    is_active = true,
    updated_at = now()
  WHERE public.patients.organization_id = c_org_id;

  -- 8) Appointments — only seed-tagged rows
  <<seed_appts>>
  DECLARE
    r record;
    v_starts timestamptz;
    v_ends timestamptz;
  BEGIN
    FOR r IN
      SELECT * FROM (VALUES
        ('appt-1', -1, time '09:30', time '10:00', 'completada'::public.appointment_status, 'control'::public.appointment_type, 'Control Luna', 'Demo: cita completada'),
        ('appt-2',  0, time '10:30', time '11:00', 'confirmada'::public.appointment_status, 'consulta'::public.appointment_type, 'Consulta general Luna', 'Demo: cita confirmada'),
        ('appt-3',  0, time '16:00', time '16:30', 'programada'::public.appointment_status, 'vacunacion'::public.appointment_type, 'Vacunación (simulada)', 'Demo: vacunación ficticia'),
        ('appt-4',  1, time '11:00', time '11:30', 'programada'::public.appointment_status, 'control'::public.appointment_type, 'Control', 'Demo: control futuro'),
        ('appt-5',  2, time '15:00', time '15:30', 'cancelada'::public.appointment_status, 'consulta'::public.appointment_type, 'Ejemplo de cancelación', 'Demo: cancelada')
      ) AS t(src, day_off, t_start, t_end, st, typ, title, notes)
    LOOP
      v_starts := ((current_date + r.day_off) + r.t_start) AT TIME ZONE c_tz;
      v_ends   := ((current_date + r.day_off) + r.t_end) AT TIME ZONE c_tz;

      UPDATE public.appointments a
      SET branch_id = c_branch_id,
          patient_id = c_patient_id,
          owner_id = c_owner_id,
          assigned_user_id = v_vet_uid,
          starts_at = v_starts,
          ends_at = v_ends,
          status = r.st,
          appointment_type = r.typ,
          title = r.title,
          notes = r.notes,
          remind_24h = false,
          remind_2h = false,
          remind_confirmation = false,
          deleted_at = NULL,
          updated_at = now()
      WHERE a.organization_id = c_org_id
        AND a.source_system = c_source
        AND a.source_record_id = r.src
        AND a.deleted_at IS NULL;

      IF NOT FOUND THEN
        INSERT INTO public.appointments (
          organization_id, branch_id, patient_id, owner_id, assigned_user_id,
          starts_at, ends_at, status, appointment_type, title, notes,
          remind_24h, remind_2h, remind_confirmation,
          source_system, source_record_id
        ) VALUES (
          c_org_id, c_branch_id, c_patient_id, c_owner_id, v_vet_uid,
          v_starts, v_ends, r.st, r.typ, r.title, r.notes,
          false, false, false, c_source, r.src
        );
      END IF;
    END LOOP;
  END;

  DELETE FROM public.owner_app_settings WHERE organization_id = c_org_id;

  RAISE NOTICE 'ACADEMIA_DEMO seed OK org=% other_orgs_untouched_count=%', c_org_id, v_other_orgs;
END $$;
