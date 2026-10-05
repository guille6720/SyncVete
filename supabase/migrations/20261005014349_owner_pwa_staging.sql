-- STAGING ONLY: apply in a session explicitly marked after checking its project.
DO $$ BEGIN
  IF current_setting('app.owner_pwa_staging', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'STAGING ONLY: set app.owner_pwa_staging=on on the verified staging database';
  END IF;
END $$;

CREATE TABLE public.owner_app_settings (
  organization_id uuid PRIMARY KEY REFERENCES public.organizations(id),
  brand jsonb NOT NULL,
  CHECK (jsonb_typeof(brand) = 'object'),
  CHECK (char_length(brand->>'appName') BETWEEN 2 AND 60),
  CHECK (brand->>'primaryColor' ~ '^#[0-9a-fA-F]{6}$')
);
CREATE TABLE public.owner_app_slots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  branch_id uuid NOT NULL REFERENCES public.branches(id),
  assigned_user_id uuid NOT NULL REFERENCES auth.users(id),
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  appointment_id uuid REFERENCES public.appointments(id),
  CHECK (ends_at > starts_at),
  UNIQUE(branch_id, assigned_user_id, starts_at)
);
CREATE INDEX owner_app_slots_available ON public.owner_app_slots(organization_id, starts_at) WHERE appointment_id IS NULL;
CREATE TABLE public.owner_app_reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  owner_id uuid NOT NULL REFERENCES public.owners(id),
  event_key text NOT NULL,
  source_id uuid NOT NULL,
  source_type text NOT NULL CHECK (source_type IN ('appointment','vaccine')),
  source_revision text NOT NULL,
  message text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  emailed_at timestamptz,
  lease_until timestamptz,
  attempts int NOT NULL DEFAULT 0,
  UNIQUE(owner_id, event_key)
);
CREATE INDEX owner_app_reminders_pending ON public.owner_app_reminders(created_at) WHERE emailed_at IS NULL;
ALTER TABLE public.owner_app_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.owner_app_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.owner_app_reminders ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.owner_app_settings, public.owner_app_slots, public.owner_app_reminders FROM anon, authenticated;
GRANT SELECT ON public.owner_app_reminders TO authenticated;
GRANT ALL ON public.owner_app_settings, public.owner_app_slots, public.owner_app_reminders TO service_role;
CREATE POLICY owner_app_reminders_own ON public.owner_app_reminders FOR SELECT TO authenticated
  USING (owner_id = (SELECT public.get_portal_owner_id()));

CREATE FUNCTION public.get_owner_app_brand(p_organization_id uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT s.brand FROM public.owner_app_settings s
  JOIN public.organizations o ON o.id = s.organization_id AND o.deleted_at IS NULL
  WHERE s.organization_id = p_organization_id
    AND ((s.brand->>'enabled')::boolean IS TRUE OR
      (auth.uid() IS NOT NULL AND public.is_clinic_staff() AND public.has_permission('org:manage') AND public.get_user_organization_id() = s.organization_id));
$$;

CREATE FUNCTION public.get_owner_app_invite_brand(p_token text) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, extensions AS $$
  SELECT jsonb_build_object('organizationId', i.organization_id, 'brand', s.brand)
  FROM public.owner_portal_invites i JOIN public.owner_app_settings s ON s.organization_id = i.organization_id
  JOIN public.organizations o ON o.id = i.organization_id AND o.deleted_at IS NULL
  WHERE i.token_hash = encode(digest(p_token, 'sha256'), 'hex') AND i.expires_at > now()
    AND i.accepted_at IS NULL AND i.revoked_at IS NULL AND (s.brand->>'enabled')::boolean IS TRUE;
$$;

CREATE FUNCTION public.save_owner_app_brand(p_brand jsonb) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_org uuid := public.get_user_organization_id();
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_clinic_staff() OR NOT public.has_permission('org:manage') OR v_org IS NULL THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  IF jsonb_typeof(p_brand) IS DISTINCT FROM 'object'
    OR jsonb_typeof(p_brand->'appName') IS DISTINCT FROM 'string'
    OR jsonb_typeof(p_brand->'primaryColor') IS DISTINCT FROM 'string'
    OR jsonb_typeof(p_brand->'welcomeText') IS DISTINCT FROM 'string'
    OR jsonb_typeof(p_brand->'logoUrl') IS DISTINCT FROM 'string'
    OR char_length(p_brand->>'appName') NOT BETWEEN 2 AND 60
    OR (p_brand->>'primaryColor') !~ '^#[0-9a-fA-F]{6}$'
    OR jsonb_typeof(p_brand->'enabled') IS DISTINCT FROM 'boolean'
    OR NOT (p_brand ?& ARRAY['appName','primaryColor','logoUrl','welcomeText','enabled'])
    OR char_length(p_brand->>'welcomeText') > 200
    OR char_length(p_brand->>'logoUrl') > 1000
    OR strpos(p_brand->>'logoUrl', chr(92)) > 0
    OR (p_brand->>'logoUrl' <> '' AND p_brand->>'logoUrl' !~ '^https://' AND p_brand->>'logoUrl' !~ '^/[^/]') THEN
    RAISE EXCEPTION 'Invalid branding';
  END IF;
  INSERT INTO public.owner_app_settings VALUES(v_org, jsonb_build_object('appName',p_brand->>'appName','primaryColor',p_brand->>'primaryColor','logoUrl',p_brand->>'logoUrl','welcomeText',p_brand->>'welcomeText','enabled',p_brand->'enabled'))
  ON CONFLICT(organization_id) DO UPDATE SET brand = EXCLUDED.brand;
END $$;

CREATE FUNCTION public.publish_owner_app_slot(p_branch_id uuid, p_starts_at timestamptz) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_org uuid := public.get_user_organization_id(); v_id uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_clinic_staff() OR NOT public.has_permission('appointments:write')
    OR NOT EXISTS(SELECT 1 FROM public.branch_members WHERE user_id = auth.uid() AND branch_id = p_branch_id AND is_active AND deleted_at IS NULL)
    OR NOT EXISTS(SELECT 1 FROM public.branches WHERE id = p_branch_id AND organization_id = v_org AND is_active AND deleted_at IS NULL)
    OR NOT EXISTS(SELECT 1 FROM public.owner_app_settings WHERE organization_id = v_org AND (brand->>'enabled')::boolean IS TRUE)
    OR p_starts_at IS NULL OR p_starts_at <= now() OR p_starts_at > now() + interval '90 days' THEN
    RAISE EXCEPTION 'Invalid slot or permission';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(auth.uid()::text, 0));
  IF public.appointment_has_overlap(v_org, auth.uid(), p_starts_at, p_starts_at + interval '30 minutes', NULL)
    OR EXISTS(SELECT 1 FROM public.owner_app_slots WHERE branch_id = p_branch_id AND assigned_user_id = auth.uid() AND starts_at < p_starts_at + interval '30 minutes' AND ends_at > p_starts_at) THEN
    RAISE EXCEPTION 'Unavailable slot';
  END IF;
  INSERT INTO public.owner_app_slots(organization_id, branch_id, assigned_user_id, starts_at, ends_at)
  VALUES(v_org, p_branch_id, auth.uid(), p_starts_at, p_starts_at + interval '30 minutes') RETURNING id INTO v_id;
  RETURN v_id;
END $$;

CREATE FUNCTION public.book_owner_app_slot(p_slot_id uuid, p_patient_id uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_owner public.owners%ROWTYPE; v_slot public.owner_app_slots%ROWTYPE; v_id uuid;
BEGIN
  SELECT * INTO v_owner FROM public.owners WHERE id = public.get_portal_owner_id();
  IF auth.uid() IS NULL OR v_owner.id IS NULL OR public.is_clinic_staff() THEN RAISE EXCEPTION 'Forbidden'; END IF;
  SELECT * INTO v_slot FROM public.owner_app_slots
    WHERE id = p_slot_id AND organization_id = v_owner.organization_id FOR UPDATE;
  IF v_slot.id IS NULL OR v_slot.appointment_id IS NOT NULL OR v_slot.starts_at <= now()
    OR NOT EXISTS(SELECT 1 FROM public.owner_app_settings WHERE organization_id = v_owner.organization_id AND (brand->>'enabled')::boolean IS TRUE)
    OR NOT EXISTS(SELECT 1 FROM public.patients WHERE id = p_patient_id AND owner_id = v_owner.id AND organization_id = v_owner.organization_id AND is_active AND NOT is_deceased AND deleted_at IS NULL)
    OR NOT EXISTS(SELECT 1 FROM public.branches WHERE id = v_slot.branch_id AND is_active AND deleted_at IS NULL)
    OR NOT EXISTS(SELECT 1 FROM public.branch_members WHERE user_id = v_slot.assigned_user_id AND branch_id = v_slot.branch_id AND is_active AND deleted_at IS NULL) THEN
    RAISE EXCEPTION 'Unavailable slot';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(v_slot.assigned_user_id::text, 0));
  INSERT INTO public.appointments(organization_id, branch_id, patient_id, owner_id, assigned_user_id, starts_at, ends_at, status, appointment_type, title)
  VALUES(v_slot.organization_id, v_slot.branch_id, p_patient_id, v_owner.id, v_slot.assigned_user_id, v_slot.starts_at, v_slot.ends_at, 'programada', 'consulta', 'Reserva desde app del propietario') RETURNING id INTO v_id;
  UPDATE public.owner_app_slots SET appointment_id = v_id WHERE id = v_slot.id;
  RETURN v_id;
END $$;

CREATE FUNCTION public.cancel_owner_app_booking(p_appointment_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_owner uuid := public.get_portal_owner_id();
BEGIN
  IF auth.uid() IS NULL OR v_owner IS NULL THEN RAISE EXCEPTION 'Forbidden'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.owners o JOIN public.owner_app_settings s ON s.organization_id = o.organization_id WHERE o.id = v_owner AND (s.brand->>'enabled')::boolean IS TRUE) THEN RAISE EXCEPTION 'Disabled'; END IF;
  UPDATE public.appointments SET status = 'cancelada', cancellation_reason = 'Cancelado por el propietario'
  WHERE id = p_appointment_id AND owner_id = v_owner AND starts_at > now() AND deleted_at IS NULL AND status IN ('programada','confirmada')
    AND EXISTS(SELECT 1 FROM public.owner_app_slots WHERE appointment_id = p_appointment_id);
  IF NOT FOUND THEN RAISE EXCEPTION 'Invalid booking'; END IF;
  UPDATE public.owner_app_slots SET appointment_id = NULL WHERE appointment_id = p_appointment_id;
END $$;

CREATE FUNCTION public.get_owner_app_data() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_owner public.owners%ROWTYPE;
BEGIN
  SELECT * INTO v_owner FROM public.owners WHERE id = public.get_portal_owner_id();
  IF auth.uid() IS NULL OR v_owner.id IS NULL THEN RAISE EXCEPTION 'Forbidden'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.owner_app_settings WHERE organization_id = v_owner.organization_id AND (brand->>'enabled')::boolean IS TRUE) THEN
    RETURN jsonb_build_object('slots','[]'::jsonb,'reminders','[]'::jsonb,'bookings','[]'::jsonb);
  END IF;
  RETURN jsonb_build_object(
    'bookings', COALESCE((SELECT jsonb_agg(to_jsonb(a)) FROM (
      SELECT a.id, a.starts_at, p.name AS patient_name FROM public.appointments a JOIN public.owner_app_slots s ON s.appointment_id = a.id
      JOIN public.patients p ON p.id = a.patient_id WHERE a.owner_id = v_owner.id AND a.deleted_at IS NULL AND a.starts_at > now() AND a.status IN ('programada','confirmada') ORDER BY a.starts_at
    ) a),'[]'::jsonb),
    'slots', COALESCE((SELECT jsonb_agg(to_jsonb(s)) FROM (
      SELECT s.id, s.starts_at, s.ends_at, b.name AS branch_name FROM public.owner_app_slots s
      JOIN public.branches b ON b.id = s.branch_id AND b.deleted_at IS NULL AND b.is_active
      WHERE s.organization_id = v_owner.organization_id AND s.appointment_id IS NULL AND s.starts_at > now()
      AND NOT public.appointment_has_overlap(s.organization_id, s.assigned_user_id, s.starts_at, s.ends_at, NULL)
      ORDER BY s.starts_at LIMIT 100
    ) s),'[]'::jsonb),
    'reminders', COALESCE((SELECT jsonb_agg(to_jsonb(r)) FROM (
      SELECT id, message, created_at FROM public.owner_app_reminders WHERE owner_id = v_owner.id ORDER BY created_at DESC LIMIT 30
    ) r),'[]'::jsonb)
  );
END $$;

-- Both notices fire at 08:00 in the clinic timezone, with same-day catch-up.
CREATE FUNCTION public.queue_owner_app_reminders(p_now timestamptz DEFAULT now()) RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_count int;
BEGIN
  IF auth.jwt()->>'role' IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Forbidden'; END IF;
  WITH events AS (
    SELECT a.organization_id, a.owner_id, 'appointment:' || a.id || ':' || extract(epoch FROM a.starts_at)::text AS key,
      a.id AS source_id, 'appointment'::text AS source_type, extract(epoch FROM a.starts_at)::text AS source_revision,
      a.starts_at AS event_at, 'Turno de ' || p.name AS label
    FROM public.appointments a JOIN public.patients p ON p.id = a.patient_id AND p.deleted_at IS NULL AND p.is_active AND NOT p.is_deceased
    WHERE a.deleted_at IS NULL AND a.status IN ('programada','confirmada') AND a.starts_at > p_now
    UNION ALL
    SELECT v.organization_id, v.owner_id, 'vaccine:' || v.id || ':' || v.next_due_at::text,
      v.id, 'vaccine'::text, v.next_due_at::text,
      (v.next_due_at + time '23:59:59') AT TIME ZONE COALESCE(t.name, 'America/Argentina/Buenos_Aires'),
      'Vacuna ' || v.vaccine_name || ' de ' || p.name
    FROM public.vaccinations v JOIN public.patients p ON p.id = v.patient_id AND p.deleted_at IS NULL AND p.is_active AND NOT p.is_deceased
    JOIN public.organizations org ON org.id = v.organization_id
    LEFT JOIN pg_timezone_names t ON t.name = org.settings->>'timezone'
    WHERE v.deleted_at IS NULL AND v.next_due_at IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.vaccinations newer WHERE newer.patient_id = v.patient_id
      AND lower(btrim(newer.vaccine_name)) = lower(btrim(v.vaccine_name)) AND newer.deleted_at IS NULL
      AND (newer.administered_at, newer.created_at, newer.id) > (v.administered_at, v.created_at, v.id)
    )
  ), due AS (
    SELECT e.*, d.days, COALESCE(t.name,'America/Argentina/Buenos_Aires') AS tz,
      (e.event_at AT TIME ZONE COALESCE(t.name,'America/Argentina/Buenos_Aires'))::date - d.days AS notice_date
    FROM events e JOIN public.organizations o ON o.id = e.organization_id AND o.deleted_at IS NULL
    JOIN public.owner_app_settings s ON s.organization_id = o.id AND (s.brand->>'enabled')::boolean IS TRUE
    JOIN public.owners own ON own.id = e.owner_id AND own.portal_user_id IS NOT NULL AND own.deleted_at IS NULL AND own.is_active
    LEFT JOIN pg_timezone_names t ON t.name = o.settings->>'timezone'
    CROSS JOIN (VALUES(1),(0)) AS d(days)
  )
  INSERT INTO public.owner_app_reminders(organization_id, owner_id, event_key, source_id, source_type, source_revision, message)
  SELECT organization_id, owner_id, key || ':' || days, source_id, source_type, source_revision, label || CASE WHEN days=1 THEN ' manana' ELSE ' hoy' END || ' (' || to_char(event_at AT TIME ZONE tz, 'DD/MM/YYYY') || CASE WHEN source_type='appointment' THEN ' ' || to_char(event_at AT TIME ZONE tz,'HH24:MI') ELSE '' END || ')'
  FROM due WHERE (p_now AT TIME ZONE tz)::date = notice_date AND (p_now AT TIME ZONE tz)::time >= time '08:00'
  ON CONFLICT(owner_id,event_key) DO NOTHING;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END $$;

CREATE FUNCTION public.claim_owner_app_emails() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_result jsonb;
BEGIN
  IF auth.jwt()->>'role' IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Forbidden'; END IF;
  WITH pending AS (
    SELECT r.id FROM public.owner_app_reminders r JOIN public.owners o ON o.id = r.owner_id
    JOIN public.owner_app_settings s ON s.organization_id = r.organization_id AND (s.brand->>'enabled')::boolean IS TRUE
    WHERE r.emailed_at IS NULL AND (r.lease_until IS NULL OR r.lease_until < now()) AND r.attempts < 8
      AND o.deleted_at IS NULL AND o.is_active AND o.portal_user_id IS NOT NULL AND o.email IS NOT NULL
      AND r.created_at > now() - interval '1 day'
      AND (
        (r.source_type='appointment' AND EXISTS(SELECT 1 FROM public.appointments a JOIN public.patients p ON p.id=a.patient_id AND p.deleted_at IS NULL AND p.is_active AND NOT p.is_deceased
          WHERE a.id=r.source_id AND a.owner_id=r.owner_id AND a.organization_id=r.organization_id AND a.deleted_at IS NULL AND a.status IN ('programada','confirmada') AND a.starts_at>now() AND extract(epoch FROM a.starts_at)::text=r.source_revision))
        OR (r.source_type='vaccine' AND EXISTS(SELECT 1 FROM public.vaccinations v JOIN public.patients p ON p.id=v.patient_id AND p.deleted_at IS NULL AND p.is_active AND NOT p.is_deceased
          WHERE v.id=r.source_id AND v.owner_id=r.owner_id AND v.organization_id=r.organization_id AND v.deleted_at IS NULL AND v.next_due_at::text=r.source_revision
          AND NOT EXISTS(SELECT 1 FROM public.vaccinations n WHERE n.patient_id=v.patient_id AND lower(btrim(n.vaccine_name))=lower(btrim(v.vaccine_name)) AND n.deleted_at IS NULL AND (n.administered_at,n.created_at,n.id)>(v.administered_at,v.created_at,v.id))))
      )
    ORDER BY r.created_at LIMIT 30 FOR UPDATE OF r SKIP LOCKED
  ), claimed AS (
    UPDATE public.owner_app_reminders r SET lease_until = now() + interval '5 minutes', attempts = attempts + 1
    FROM pending p WHERE r.id = p.id RETURNING r.*
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object('id', r.id,'email',o.email,'message',r.message,'organization_id',r.organization_id)),'[]'::jsonb)
  INTO v_result FROM claimed r JOIN public.owners o ON o.id = r.owner_id;
  RETURN v_result;
END $$;

CREATE FUNCTION public.complete_owner_app_email(p_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.jwt()->>'role' IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Forbidden'; END IF;
  UPDATE public.owner_app_reminders SET emailed_at = now(), lease_until = NULL WHERE id = p_id;
END $$;

REVOKE ALL ON FUNCTION public.get_owner_app_brand(uuid), public.save_owner_app_brand(jsonb), public.publish_owner_app_slot(uuid,timestamptz), public.book_owner_app_slot(uuid,uuid), public.cancel_owner_app_booking(uuid), public.get_owner_app_data(), public.queue_owner_app_reminders(timestamptz), public.claim_owner_app_emails(), public.complete_owner_app_email(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_owner_app_invite_brand(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_owner_app_invite_brand(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_owner_app_brand(uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.save_owner_app_brand(jsonb), public.publish_owner_app_slot(uuid,timestamptz), public.book_owner_app_slot(uuid,uuid), public.cancel_owner_app_booking(uuid), public.get_owner_app_data() TO authenticated;
GRANT EXECUTE ON FUNCTION public.queue_owner_app_reminders(timestamptz), public.claim_owner_app_emails(), public.complete_owner_app_email(uuid) TO service_role;
