-- QA ONLY — STAGING. Fictitious owners, patients, professionals with weekly
-- agendas and appointments (past week + next two weeks) for one organization.
--
-- Run against the staging project (SyncVete-Staging, owmcrqvnfubyjxrlyhlc):
--   npx supabase db query --linked --project-ref owmcrqvnfubyjxrlyhlc -f supabase/ops/qa_seed_staging.sql
-- or paste it in the staging SQL editor. Change v_org_id to seed another org.
--
-- Idempotent: everything is tagged [QA_SEED] (owners, patients, professionals,
-- appointments) and professional logins are <name>.<org8>.qa@syncvete.test.
-- Re-running only fills what is missing.
-- Professional login (testing only): password QaSeed2026!
--
-- Cleanup: delete rows WHERE notes LIKE '%[QA_SEED]%' (appointments first),
-- then the *.qa@syncvete.test auth users.

DO $$
DECLARE
  v_org_id     UUID := '51f6f742-38e5-471d-ad9a-5c912b67a7d1';  -- BMW_Clinic (staging)
  v_tag        TEXT := '[QA_SEED]';
  v_password   TEXT := 'QaSeed2026!';
  v_tz         TEXT := 'America/Argentina/Buenos_Aires';
  v_branch_id  UUID;
  v_instance   UUID;
  v_org8       TEXT;
  v_today      DATE;
  v_user_id    UUID;
  v_pro_id     UUID;
  v_email      TEXT;
  v_patients   UUID[];
  v_owners     UUID[];
  v_names      TEXT[];
  v_n          INT := 0;
  v_created    INT := 0;
  v_skipped    INT := 0;
  v_status     public.appointment_status;
  v_type       public.appointment_type;
  v_types      TEXT[];
  v_start      TIMESTAMPTZ;
  v_end        TIMESTAMPTZ;
  v_idx        INT;
  pro          RECORD;
  sch          RECORD;
  d            DATE;
  slot_start   TIME;
  k            INT;
BEGIN
  SELECT id INTO v_branch_id
  FROM public.branches
  WHERE organization_id = v_org_id AND deleted_at IS NULL
  ORDER BY created_at
  LIMIT 1;
  IF v_branch_id IS NULL THEN
    RAISE EXCEPTION 'La organización % no tiene sucursales', v_org_id;
  END IF;

  v_org8 := left(v_org_id::text, 8);
  v_today := (now() AT TIME ZONE v_tz)::date;
  SELECT id INTO v_instance FROM auth.instances LIMIT 1;
  v_instance := coalesce(v_instance, '00000000-0000-0000-0000-000000000000');

  -- ── Propietarios ──────────────────────────────────────────
  INSERT INTO public.owners (organization_id, branch_id, full_name, email, phone, phone_whatsapp, document_type, document_number, city, notes)
  SELECT v_org_id, v_branch_id, x.full_name, x.email, x.phone, replace(x.phone, '-', ''), 'DNI', x.doc, x.city, v_tag || ' Tutor de prueba'
  FROM (VALUES
    ('Ana Pérez',       'ana.perez.qa@example.com',       '11-5555-0101', '30111222', 'CABA'),
    ('Bruno Gómez',     'bruno.gomez.qa@example.com',     '11-5555-0102', '30222333', 'San Isidro'),
    ('Carla Ruiz',      'carla.ruiz.qa@example.com',      '11-5555-0103', '30333444', 'Vicente López'),
    ('Diego Fernández', 'diego.fernandez.qa@example.com', '11-5555-0104', '30444555', 'Palermo'),
    ('Elena Soto',      'elena.soto.qa@example.com',      '11-5555-0105', '30555666', 'Belgrano'),
    ('Facundo López',   'facundo.lopez.qa@example.com',   '11-5555-0106', '30666777', 'Caballito'),
    ('Gisela Martín',   'gisela.martin.qa@example.com',   '11-5555-0107', '30777888', 'Recoleta'),
    ('Hugo Navarro',    'hugo.navarro.qa@example.com',    '11-5555-0108', '30888999', 'Flores'),
    ('Inés Acosta',     'ines.acosta.qa@example.com',     '11-5555-0109', '31999000', 'Núñez'),
    ('Julián Benítez',  'julian.benitez.qa@example.com',  '11-5555-0110', '32000111', 'Almagro')
  ) AS x(full_name, email, phone, doc, city)
  WHERE NOT EXISTS (
    SELECT 1 FROM public.owners o
    WHERE o.organization_id = v_org_id AND lower(o.email) = x.email AND o.deleted_at IS NULL
  );

  -- ── Mascotas ──────────────────────────────────────────────
  INSERT INTO public.patients (organization_id, branch_id, owner_id, name, species, breed, sex, color, birth_date, is_neutered, notes)
  SELECT v_org_id, v_branch_id, o.id, x.name, x.species::public.patient_species, x.breed, x.sex::public.patient_sex,
         x.color, x.birth::date, x.neutered, v_tag || ' Paciente de prueba'
  FROM (VALUES
    ('ana.perez.qa@example.com',       'Toby',     'Canino', 'Labrador',         'Macho',       'Dorado',         '2021-03-12', true),
    ('ana.perez.qa@example.com',       'Mía',      'Felino', 'Siamés',           'Hembra',      'Crema',          '2022-07-01', true),
    ('bruno.gomez.qa@example.com',     'Rocky',    'Canino', 'Bulldog',          'Macho',       'Atigrado',       '2020-11-20', false),
    ('carla.ruiz.qa@example.com',      'Luna',     'Felino', 'Mestizo',          'Hembra',      'Negro',          '2023-01-15', true),
    ('carla.ruiz.qa@example.com',      'Coco',     'Ave',    'Loro',             'Desconocido', 'Verde',          '2019-05-08', false),
    ('diego.fernandez.qa@example.com', 'Nala',     'Canino', 'Golden Retriever', 'Hembra',      'Dorado',         '2021-09-30', true),
    ('elena.soto.qa@example.com',      'Simba',    'Felino', 'Persa',            'Macho',       'Blanco',         '2022-02-14', false),
    ('elena.soto.qa@example.com',      'Kiwi',     'Roedor', 'Hámster',          'Hembra',      'Marrón',         '2024-06-01', false),
    ('facundo.lopez.qa@example.com',   'Thor',     'Canino', 'Pastor Alemán',    'Macho',       'Negro y fuego',  '2018-12-05', true),
    ('gisela.martin.qa@example.com',   'Olivia',   'Canino', 'Caniche',          'Hembra',      'Blanco',         '2023-08-22', true),
    ('gisela.martin.qa@example.com',   'Garfield', 'Felino', 'Común europeo',    'Macho',       'Naranja',        '2020-04-18', true),
    ('hugo.navarro.qa@example.com',    'Bella',    'Canino', 'Beagle',           'Hembra',      'Tricolor',       '2022-10-10', false),
    ('ines.acosta.qa@example.com',     'Milo',     'Canino', 'Border Collie',    'Macho',       'Blanco y negro', '2021-06-03', true),
    ('julian.benitez.qa@example.com',  'Pelusa',   'Felino', 'Angora',           'Hembra',      'Gris',           '2019-12-24', true)
  ) AS x(email, name, species, breed, sex, color, birth, neutered)
  JOIN public.owners o
    ON o.organization_id = v_org_id AND lower(o.email) = x.email AND o.deleted_at IS NULL
  WHERE NOT EXISTS (
    SELECT 1 FROM public.patients p
    WHERE p.owner_id = o.id AND p.name = x.name AND p.deleted_at IS NULL
  );

  -- ── Profesionales con acceso a agenda ─────────────────────
  CREATE TEMP TABLE _qa_pros (
    first_name TEXT, last_name TEXT, specialty TEXT, relationship TEXT, license TEXT, types TEXT[], user_id UUID
  ) ON COMMIT DROP;
  INSERT INTO _qa_pros (first_name, last_name, specialty, relationship, license, types) VALUES
    ('Martina',   'Vega',   'Clínica general', 'employee',    'MN-QA-1001', ARRAY['consulta', 'vacunacion', 'control']),
    ('Nicolás',   'Ibarra', 'Cirugía',         'independent', 'MN-QA-1002', ARRAY['cirugia', 'control']),
    ('Paula',     'Ríos',   'Dermatología',    'employee',    'MN-QA-1003', ARRAY['consulta', 'control']),
    ('Valentina', 'Castro', 'Exóticos',        'independent', 'MN-QA-1005', ARRAY['consulta', 'vacunacion', 'control']);

  FOR pro IN SELECT * FROM _qa_pros LOOP
    v_email := regexp_replace(
      lower(translate(pro.first_name || '.' || pro.last_name, 'áéíóúñüÁÉÍÓÚÑÜ', 'aeiounuAEIOUNU')),
      '[^a-z0-9.]+', '.', 'g'
    ) || '.' || v_org8 || '.qa@syncvete.test';

    SELECT id INTO v_user_id FROM auth.users WHERE lower(email) = v_email;
    IF v_user_id IS NULL THEN
      v_user_id := gen_random_uuid();
      INSERT INTO auth.users (
        instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
        confirmation_token, recovery_token, email_change_token_new, email_change,
        raw_app_meta_data, raw_user_meta_data, created_at, updated_at, is_sso_user, is_anonymous
      ) VALUES (
        v_instance, v_user_id, 'authenticated', 'authenticated', v_email,
        extensions.crypt(v_password, extensions.gen_salt('bf')), now(),
        '', '', '', '',
        jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email')),
        jsonb_build_object('full_name', pro.first_name || ' ' || pro.last_name, 'qa_seed', true),
        now(), now(), false, false
      );
      INSERT INTO auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
      VALUES (
        gen_random_uuid(), v_user_id, v_user_id::text,
        jsonb_build_object('sub', v_user_id::text, 'email', v_email, 'email_verified', true, 'phone_verified', false),
        'email', now(), now(), now()
      );
    END IF;
    UPDATE _qa_pros SET user_id = v_user_id WHERE first_name = pro.first_name;

    INSERT INTO public.profiles (id, organization_id, full_name, active_branch_id, is_active)
    VALUES (v_user_id, v_org_id, pro.first_name || ' ' || pro.last_name, v_branch_id, true)
    ON CONFLICT (id) DO UPDATE SET
      organization_id = EXCLUDED.organization_id,
      full_name = EXCLUDED.full_name,
      active_branch_id = coalesce(public.profiles.active_branch_id, EXCLUDED.active_branch_id),
      is_active = true,
      deleted_at = NULL;

    INSERT INTO public.branch_members (organization_id, branch_id, user_id, role, is_active)
    VALUES (v_org_id, v_branch_id, v_user_id, 'veterinarian', true)
    ON CONFLICT (branch_id, user_id) DO UPDATE SET role = 'veterinarian', is_active = true, deleted_at = NULL;

    SELECT id INTO v_pro_id FROM public.professionals
    WHERE organization_id = v_org_id AND user_id = v_user_id AND deleted_at IS NULL
    LIMIT 1;
    IF v_pro_id IS NULL THEN
      INSERT INTO public.professionals (
        organization_id, user_id, profile_id, first_name, last_name, specialty,
        relationship_type, professional_license, email, is_active, notes
      ) VALUES (
        v_org_id, v_user_id, v_user_id, pro.first_name, pro.last_name, pro.specialty,
        pro.relationship::public.professional_relationship_type, pro.license, v_email, true, v_tag || ' Profesional de prueba'
      ) RETURNING id INTO v_pro_id;
    END IF;

    INSERT INTO public.professional_branches (organization_id, professional_id, branch_id, is_active)
    SELECT v_org_id, v_pro_id, v_branch_id, true
    WHERE NOT EXISTS (
      SELECT 1 FROM public.professional_branches pb
      WHERE pb.professional_id = v_pro_id AND pb.branch_id = v_branch_id AND pb.deleted_at IS NULL
    );
  END LOOP;

  -- ── Horarios de atención (1=lunes .. 7=domingo) ───────────
  CREATE TEMP TABLE _qa_schedules (first_name TEXT, weekday SMALLINT, start_time TIME, end_time TIME, slot INT) ON COMMIT DROP;
  INSERT INTO _qa_schedules
  SELECT 'Martina', w::smallint, '09:00'::time, '13:00'::time, 30 FROM generate_series(1, 5) w
  UNION ALL SELECT 'Nicolás', w::smallint, '14:00'::time, '19:00'::time, 60 FROM unnest(ARRAY[2, 4]) w
  UNION ALL SELECT 'Paula', w::smallint, '15:00'::time, '19:00'::time, 30 FROM unnest(ARRAY[1, 3, 5]) w
  UNION ALL SELECT 'Paula', 6::smallint, '09:00'::time, '13:00'::time, 30
  UNION ALL SELECT 'Valentina', w::smallint, '10:00'::time, '18:00'::time, 45 FROM generate_series(1, 5) w;

  INSERT INTO public.professional_schedules (organization_id, branch_id, user_id, weekday, start_time, end_time, slot_duration_minutes, is_active)
  SELECT v_org_id, v_branch_id, p.user_id, s.weekday, s.start_time, s.end_time, s.slot, true
  FROM _qa_schedules s
  JOIN _qa_pros p ON p.first_name = s.first_name
  WHERE NOT EXISTS (
    SELECT 1 FROM public.professional_schedules x
    WHERE x.organization_id = v_org_id AND x.branch_id = v_branch_id AND x.user_id = p.user_id
      AND x.weekday = s.weekday AND x.start_time = s.start_time AND x.deleted_at IS NULL
  );

  -- ── Turnos: semana pasada + próximas dos semanas ─────────
  SELECT array_agg(p.id ORDER BY p.name), array_agg(p.owner_id ORDER BY p.name), array_agg(p.name ORDER BY p.name)
  INTO v_patients, v_owners, v_names
  FROM public.patients p
  WHERE p.organization_id = v_org_id AND p.deleted_at IS NULL AND p.notes LIKE '%' || v_tag || '%';

  FOR d IN SELECT generate_series(v_today - 7, v_today + 14, interval '1 day')::date LOOP
    FOR pro IN SELECT * FROM _qa_pros ORDER BY first_name LOOP
      FOR sch IN
        SELECT * FROM _qa_schedules
        WHERE first_name = pro.first_name AND weekday = extract(isodow FROM d)::int
      LOOP
        k := 0;
        FOR slot_start IN
          SELECT t::time FROM generate_series(
            d + sch.start_time,
            d + sch.end_time - make_interval(mins => sch.slot),
            make_interval(mins => sch.slot)
          ) t
        LOOP
          k := k + 1;
          -- about half of the slots booked, at most 4 per professional and day
          CONTINUE WHEN (k + (d - v_today) + length(pro.first_name)) % 2 <> 0 OR k > 8;
          v_n := v_n + 1;

          v_start := (d + slot_start) AT TIME ZONE v_tz;
          v_end := v_start + make_interval(mins => sch.slot);

          CONTINUE WHEN EXISTS (
            SELECT 1 FROM public.appointments a
            WHERE a.organization_id = v_org_id AND a.assigned_user_id = pro.user_id
              AND a.starts_at = v_start AND a.deleted_at IS NULL
          );

          v_idx := 1 + (v_n % array_length(v_patients, 1));
          v_type := pro.types[1 + (v_n % array_length(pro.types, 1))]::public.appointment_type;
          v_status := CASE
            WHEN d < v_today AND v_n % 7 = 0 THEN 'ausente'
            WHEN d < v_today AND v_n % 9 = 0 THEN 'cancelada'
            WHEN d < v_today THEN 'completada'
            WHEN d = v_today OR v_n % 3 = 0 THEN 'confirmada'
            ELSE 'programada'
          END::public.appointment_status;

          BEGIN
            INSERT INTO public.appointments (
              organization_id, branch_id, patient_id, owner_id, assigned_user_id,
              starts_at, ends_at, status, appointment_type, title, notes, cancellation_reason
            ) VALUES (
              v_org_id, v_branch_id, v_patients[v_idx], v_owners[v_idx], pro.user_id,
              v_start, v_end, v_status, v_type,
              CASE v_type
                WHEN 'vacunacion' THEN 'Vacunación anual'
                WHEN 'cirugia' THEN 'Cirugía programada'
                WHEN 'control' THEN 'Control'
                ELSE 'Consulta general'
              END || ' · ' || v_names[v_idx],
              v_tag || ' Turno de prueba',
              CASE WHEN v_status = 'cancelada' THEN 'Cancelado por el tutor (prueba)' END
            );
            v_created := v_created + 1;
          EXCEPTION WHEN OTHERS THEN
            v_skipped := v_skipped + 1;
          END;
        END LOOP;
      END LOOP;
    END LOOP;
  END LOOP;

  RAISE NOTICE 'QA_SEED: % turnos nuevos, % omitidos', v_created, v_skipped;
END $$;

-- trg_notify_appointment emits one "Nueva cita" per seeded appointment.
DELETE FROM public.notifications n
USING public.appointments a
WHERE n.organization_id = '51f6f742-38e5-471d-ad9a-5c912b67a7d1'
  AND n.related_id = a.id
  AND a.notes LIKE '%[QA_SEED]%';

SELECT 'propietarios' AS tipo, count(*)::int AS cantidad FROM public.owners
WHERE organization_id = '51f6f742-38e5-471d-ad9a-5c912b67a7d1' AND deleted_at IS NULL AND notes LIKE '%[QA_SEED]%'
UNION ALL
SELECT 'mascotas', count(*)::int FROM public.patients
WHERE organization_id = '51f6f742-38e5-471d-ad9a-5c912b67a7d1' AND deleted_at IS NULL AND notes LIKE '%[QA_SEED]%'
UNION ALL
SELECT 'profesionales', count(*)::int FROM public.professionals
WHERE organization_id = '51f6f742-38e5-471d-ad9a-5c912b67a7d1' AND deleted_at IS NULL AND notes LIKE '%[QA_SEED]%'
UNION ALL
SELECT 'horarios', count(*)::int FROM public.professional_schedules s
JOIN public.professionals p ON p.user_id = s.user_id AND p.organization_id = s.organization_id
WHERE s.organization_id = '51f6f742-38e5-471d-ad9a-5c912b67a7d1' AND s.deleted_at IS NULL AND p.notes LIKE '%[QA_SEED]%'
UNION ALL
SELECT 'turnos', count(*)::int FROM public.appointments
WHERE organization_id = '51f6f742-38e5-471d-ad9a-5c912b67a7d1' AND deleted_at IS NULL AND notes LIKE '%[QA_SEED]%';
