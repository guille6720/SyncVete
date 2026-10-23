DO $$ BEGIN
  IF current_setting('app.owner_pwa_staging', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'STAGING ONLY';
  END IF;
END $$;

CREATE FUNCTION public.get_owner_professional_availability(p_date date DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_owner public.owners%ROWTYPE; v_today date := (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date; v_date date := coalesce(p_date,v_today); v_result jsonb;
BEGIN
  SELECT * INTO v_owner FROM public.owners WHERE id=public.get_portal_owner_id();
  IF auth.uid() IS NULL OR v_owner.id IS NULL OR public.is_clinic_staff() THEN RAISE EXCEPTION 'Forbidden'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.owner_app_settings WHERE organization_id=v_owner.organization_id AND (brand->>'enabled')::boolean IS TRUE) THEN RAISE EXCEPTION 'Disabled'; END IF;
  IF v_date < v_today OR v_date > v_today+30 THEN RAISE EXCEPTION 'Invalid date'; END IF;
  WITH eligible AS (
    SELECT s.*, b.name AS branch_name, coalesce(nullif(trim(concat(p.first_name,' ',p.last_name)),''), pr.full_name) AS professional_name, p.specialty
    FROM public.professional_schedules s
    JOIN public.branches b ON b.id=s.branch_id AND b.organization_id=s.organization_id AND b.is_active AND b.deleted_at IS NULL
    JOIN public.branch_members m ON m.user_id=s.user_id AND m.branch_id=s.branch_id AND m.is_active AND m.deleted_at IS NULL
    JOIN public.profiles pr ON pr.id=s.user_id AND pr.organization_id=s.organization_id AND pr.is_active AND pr.deleted_at IS NULL
    LEFT JOIN LATERAL (SELECT p.first_name,p.last_name,p.specialty,p.is_active FROM public.professionals p WHERE p.organization_id=s.organization_id AND p.user_id=s.user_id AND p.deleted_at IS NULL ORDER BY p.created_at LIMIT 1) p ON true
    WHERE s.organization_id=v_owner.organization_id AND s.is_active AND s.deleted_at IS NULL AND coalesce(p.is_active,true)
      AND (s.allowed_appointment_types IS NULL OR 'consulta'=ANY(s.allowed_appointment_types))
  ), candidates AS (
    SELECT s.id AS schedule_id,s.user_id AS professional_id,s.professional_name,s.branch_name,s.branch_id,
      t AS starts_at,t+make_interval(mins=>s.slot_duration_minutes) AS ends_at
    FROM eligible s CROSS JOIN LATERAL generate_series(
      (v_date+s.start_time) AT TIME ZONE 'America/Argentina/Buenos_Aires',
      ((v_date+s.end_time) AT TIME ZONE 'America/Argentina/Buenos_Aires')-make_interval(mins=>s.slot_duration_minutes),
      make_interval(mins=>s.slot_duration_minutes)) t
    WHERE s.weekday=extract(isodow FROM v_date) AND s.slot_duration_minutes>0
  ), available AS (
    SELECT c.* FROM candidates c WHERE c.starts_at>now()
      AND NOT public.appointment_has_overlap(v_owner.organization_id,c.professional_id,c.starts_at,c.ends_at,NULL)
      AND NOT EXISTS(SELECT 1 FROM public.professional_time_blocks b WHERE b.organization_id=v_owner.organization_id AND b.branch_id=c.branch_id AND b.deleted_at IS NULL AND (b.user_id IS NULL OR b.user_id=c.professional_id) AND b.starts_at<c.ends_at AND b.ends_at>c.starts_at)
    ORDER BY c.starts_at,c.professional_name LIMIT 500
  )
  SELECT jsonb_build_object('date',v_date,'minDate',v_today,'maxDate',v_today+30,'timezone','America/Argentina/Buenos_Aires',
    'professionals',coalesce((SELECT jsonb_agg(to_jsonb(p) ORDER BY p.name) FROM (SELECT DISTINCT user_id AS id,professional_name AS name,specialty FROM eligible) p),'[]'::jsonb),
    'slots',coalesce((SELECT jsonb_agg(to_jsonb(a) ORDER BY a.starts_at,a.professional_name) FROM available a),'[]'::jsonb)) INTO v_result;
  RETURN v_result;
END $$;
REVOKE ALL ON FUNCTION public.get_owner_professional_availability(date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_owner_professional_availability(date) TO authenticated;

-- All clinic and owner writers share the same lock before the existing availability trigger.
CREATE FUNCTION public.lock_owner_agenda_writer() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.assigned_user_id IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtextextended(NEW.assigned_user_id::text,0));
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.lock_owner_agenda_writer() FROM PUBLIC;
CREATE TRIGGER owner_app_00_booking_lock BEFORE INSERT OR UPDATE ON public.appointments
FOR EACH ROW EXECUTE FUNCTION public.lock_owner_agenda_writer();

CREATE FUNCTION public.book_owner_professional_slot(p_schedule_id uuid,p_starts_at timestamptz,p_patient_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_owner public.owners%ROWTYPE; v_schedule public.professional_schedules%ROWTYPE; v_slot jsonb; v_slot_id uuid;
BEGIN
  SELECT * INTO v_owner FROM public.owners WHERE id=public.get_portal_owner_id();
  IF auth.uid() IS NULL OR v_owner.id IS NULL OR public.is_clinic_staff() THEN RAISE EXCEPTION 'Forbidden'; END IF;
  SELECT * INTO v_schedule FROM public.professional_schedules WHERE id=p_schedule_id AND organization_id=v_owner.organization_id FOR SHARE;
  IF v_schedule.id IS NULL THEN RAISE EXCEPTION 'Unavailable slot'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(v_schedule.user_id::text,0));
  SELECT s INTO v_slot FROM jsonb_array_elements(public.get_owner_professional_availability((p_starts_at AT TIME ZONE 'America/Argentina/Buenos_Aires')::date)->'slots') s
    WHERE (s->>'schedule_id')::uuid=p_schedule_id AND (s->>'starts_at')::timestamptz=p_starts_at;
  IF v_slot IS NULL THEN RAISE EXCEPTION 'Unavailable slot'; END IF;
  INSERT INTO public.owner_app_slots(organization_id,branch_id,assigned_user_id,starts_at,ends_at)
    VALUES(v_owner.organization_id,v_schedule.branch_id,v_schedule.user_id,p_starts_at,(v_slot->>'ends_at')::timestamptz)
    ON CONFLICT(branch_id,assigned_user_id,starts_at) DO UPDATE SET ends_at=EXCLUDED.ends_at
      WHERE owner_app_slots.appointment_id IS NULL RETURNING id INTO v_slot_id;
  IF v_slot_id IS NULL THEN RAISE EXCEPTION 'Unavailable slot'; END IF;
  RETURN public.book_owner_app_slot(v_slot_id,p_patient_id);
END $$;
REVOKE ALL ON FUNCTION public.book_owner_professional_slot(uuid,timestamptz,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.book_owner_professional_slot(uuid,timestamptz,uuid) TO authenticated;
