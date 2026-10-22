-- Include patient photos in the owner portal home payload.

CREATE OR REPLACE FUNCTION public.get_owner_portal_home()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner_id UUID;
  v_owner public.owners%ROWTYPE;
  v_org public.organizations%ROWTYPE;
  v_today DATE;
  v_horizon DATE;
BEGIN
  v_owner_id := public.get_portal_owner_id();
  IF v_owner_id IS NULL THEN
    RETURN '{}'::jsonb;
  END IF;

  SELECT * INTO v_owner FROM public.owners WHERE id = v_owner_id;
  SELECT * INTO v_org FROM public.organizations WHERE id = v_owner.organization_id;

  v_today := (timezone('America/Argentina/Buenos_Aires', now()))::date;
  v_horizon := v_today + 30;

  RETURN jsonb_build_object(
    'clinic', jsonb_build_object(
      'name', v_org.name,
      'phone', v_org.settings ->> 'phone',
      'email', v_org.settings ->> 'email'
    ),
    'owner', jsonb_build_object(
      'id', v_owner.id,
      'full_name', v_owner.full_name,
      'email', v_owner.email,
      'phone', v_owner.phone
    ),
    'patients', COALESCE((
      SELECT jsonb_agg(row_to_json(p)::jsonb ORDER BY p.name)
      FROM (
        SELECT
          pt.id,
          pt.name,
          pt.species::text AS species,
          pt.breed,
          pt.sex::text AS sex,
          pt.birth_date,
          pt.photo_url,
          pt.is_deceased
        FROM public.patients pt
        WHERE pt.owner_id = v_owner_id
          AND pt.deleted_at IS NULL
          AND pt.is_active = true
      ) p
    ), '[]'::jsonb),
    'upcoming_appointments', COALESCE((
      SELECT jsonb_agg(row_to_json(a)::jsonb ORDER BY a.starts_at)
      FROM (
        SELECT
          ap.id,
          ap.patient_id,
          pt.name AS patient_name,
          ap.starts_at,
          ap.ends_at,
          ap.status::text AS status,
          ap.appointment_type::text AS appointment_type,
          ap.title
        FROM public.appointments ap
        INNER JOIN public.patients pt ON pt.id = ap.patient_id
        WHERE ap.owner_id = v_owner_id
          AND ap.deleted_at IS NULL
          AND ap.status IN ('programada', 'confirmada', 'en_curso')
          AND ap.starts_at >= now() - interval '2 hours'
        ORDER BY ap.starts_at ASC
        LIMIT 20
      ) a
    ), '[]'::jsonb),
    'vaccines_due', COALESCE((
      SELECT jsonb_agg(row_to_json(v)::jsonb ORDER BY v.next_due_at)
      FROM (
        SELECT
          l.id,
          l.patient_id,
          l.patient_name,
          l.vaccine_name,
          l.administered_at,
          l.next_due_at,
          CASE
            WHEN l.next_due_at < v_today THEN 'vencida'
            ELSE 'por_vencer'
          END AS due_status
        FROM (
          SELECT DISTINCT ON (vac.patient_id, lower(btrim(vac.vaccine_name)))
            vac.id,
            vac.patient_id,
            pt.name AS patient_name,
            vac.vaccine_name,
            vac.administered_at,
            vac.next_due_at
          FROM public.vaccinations vac
          INNER JOIN public.patients pt
            ON pt.id = vac.patient_id
            AND pt.deleted_at IS NULL
            AND pt.is_deceased = false
            AND pt.is_active = true
          WHERE vac.owner_id = v_owner_id
            AND vac.deleted_at IS NULL
            AND vac.next_due_at IS NOT NULL
          ORDER BY vac.patient_id, lower(btrim(vac.vaccine_name)), vac.administered_at DESC, vac.created_at DESC
        ) l
        WHERE l.next_due_at <= v_horizon
        ORDER BY l.next_due_at ASC
        LIMIT 20
      ) v
    ), '[]'::jsonb),
    'invoices', COALESCE((
      SELECT jsonb_agg(row_to_json(i)::jsonb ORDER BY i.issued_at DESC)
      FROM (
        SELECT
          inv.id,
          inv.number,
          inv.status::text AS status,
          inv.currency,
          inv.issued_at,
          inv.due_at,
          inv.total,
          inv.paid_amount,
          inv.balance,
          pt.name AS patient_name
        FROM public.invoices inv
        LEFT JOIN public.patients pt ON pt.id = inv.patient_id
        WHERE inv.owner_id = v_owner_id
          AND inv.deleted_at IS NULL
          AND inv.status IN ('emitida', 'pagada')
        ORDER BY inv.issued_at DESC NULLS LAST, inv.created_at DESC
        LIMIT 20
      ) i
    ), '[]'::jsonb),
    'recent_clinical', COALESCE((
      SELECT jsonb_agg(row_to_json(c)::jsonb ORDER BY c.entry_date DESC)
      FROM (
        SELECT
          ce.id,
          ce.patient_id,
          pt.name AS patient_name,
          ce.entry_date,
          ce.entry_type::text AS entry_type,
          ce.title,
          ce.diagnosis,
          ce.treatment,
          ce.plan,
          ce.weight_kg
        FROM public.clinical_entries ce
        INNER JOIN public.patients pt ON pt.id = ce.patient_id
        WHERE ce.owner_id = v_owner_id
          AND ce.deleted_at IS NULL
        ORDER BY ce.entry_date DESC
        LIMIT 10
      ) c
    ), '[]'::jsonb)
  );
END;
$$;

NOTIFY pgrst, 'reload schema';
