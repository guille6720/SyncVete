-- Academia Demo — read-only validation suite
-- STAGING: owmcrqvnfubyjxrlyhlc
-- Safe to run anytime (SELECT only). Compare before/after counts scoped by org.

-- Fixed demo org id / marker
-- a0a0a0a0-d0e0-4000-8000-000000000001
-- academia_demo_key = sv-academia-demo-v1

WITH params AS (
  SELECT
    'a0a0a0a0-d0e0-4000-8000-000000000001'::uuid AS demo_org_id,
    'a0a0a0a0-d0e0-4000-8000-000000000002'::uuid AS demo_branch_id,
    'a0a0a0a0-d0e0-4000-8000-000000000003'::uuid AS demo_owner_id,
    'a0a0a0a0-d0e0-4000-8000-000000000004'::uuid AS demo_patient_id,
    'sv-academia-demo-v1'::text AS marker_key,
    'academia_demo_seed'::text AS source_system
),
baseline AS (
  SELECT
    (SELECT count(*) FROM public.organizations WHERE deleted_at IS NULL) AS orgs_total,
    (SELECT count(*) FROM public.organizations WHERE deleted_at IS NULL AND id <> (SELECT demo_org_id FROM params)) AS orgs_non_demo,
    (SELECT count(*) FROM public.appointments WHERE deleted_at IS NULL) AS appts_total,
    (SELECT count(*) FROM public.appointments a, params p WHERE a.deleted_at IS NULL AND a.organization_id <> p.demo_org_id) AS appts_non_demo
)
SELECT json_build_object(
  'project_database', current_database(),
  'expected_staging_ref', 'owmcrqvnfubyjxrlyhlc',
  'operator_must_confirm_cli_project_ref', true,

  'demo_org_unique', (
    SELECT count(*) = 1
    FROM public.organizations o, params p
    WHERE o.deleted_at IS NULL
      AND coalesce((o.settings->>'academia_demo')::boolean, false)
      AND o.settings->>'academia_demo_key' = p.marker_key
  ),
  'demo_org_id_match', (
    SELECT o.id = p.demo_org_id
    FROM public.organizations o, params p
    WHERE o.deleted_at IS NULL
      AND o.settings->>'academia_demo_key' = p.marker_key
    LIMIT 1
  ),
  'demo_org_name_not_sole_signal', (
    -- Name alone must not be how app detects demo; marker required
    SELECT coalesce((o.settings->>'academia_demo')::boolean, false)
       AND o.settings->>'academia_demo_key' = p.marker_key
    FROM public.organizations o, params p
    WHERE o.id = p.demo_org_id
  ),

  'branch_ok', (
    SELECT count(*) = 1
    FROM public.branches b, params p
    WHERE b.id = p.demo_branch_id
      AND b.organization_id = p.demo_org_id
      AND b.deleted_at IS NULL
      AND b.code = 'DEMO'
  ),

  'owner_patient_ok', (
    SELECT count(*) = 1
    FROM public.patients pt
    JOIN public.owners ow ON ow.id = pt.owner_id
    JOIN params p ON true
    WHERE pt.id = p.demo_patient_id
      AND pt.organization_id = p.demo_org_id
      AND ow.id = p.demo_owner_id
      AND ow.organization_id = p.demo_org_id
      AND pt.name = 'Luna'
      AND ow.full_name = 'María Ejemplo'
      AND ow.portal_user_id IS NULL
      AND ow.phone_whatsapp IS NULL
      AND pt.deleted_at IS NULL
      AND ow.deleted_at IS NULL
  ),

  'professional_ok', (
    SELECT count(*) = 1
    FROM public.professionals pr, params p
    WHERE pr.organization_id = p.demo_org_id
      AND pr.first_name = 'Ana'
      AND pr.last_name = 'Demo'
      AND pr.deleted_at IS NULL
      AND pr.user_id IS NOT NULL
  ),

  'schedules_ok', (
    SELECT count(*) = 7
    FROM public.professional_schedules s, params p
    WHERE s.organization_id = p.demo_org_id
      AND s.branch_id = p.demo_branch_id
      AND s.deleted_at IS NULL
      AND s.is_active
  ),

  'appointments_five', (
    SELECT count(*) = 5
    FROM public.appointments a, params p
    WHERE a.organization_id = p.demo_org_id
      AND a.source_system = p.source_system
      AND a.deleted_at IS NULL
  ),

  'appointment_statuses', (
    SELECT json_object_agg(status, cnt)
    FROM (
      SELECT a.status::text AS status, count(*) AS cnt
      FROM public.appointments a, params p
      WHERE a.organization_id = p.demo_org_id
        AND a.source_system = p.source_system
        AND a.deleted_at IS NULL
      GROUP BY a.status
    ) s
  ),

  'all_appts_in_demo_org', (
    SELECT count(*) = 0
    FROM public.appointments a, params p
    WHERE a.source_system = p.source_system
      AND a.deleted_at IS NULL
      AND a.organization_id <> p.demo_org_id
  ),

  'no_cross_tenant_fk', (
    SELECT count(*) = 0
    FROM public.appointments a
    JOIN params p ON true
    LEFT JOIN public.patients pt ON pt.id = a.patient_id
    LEFT JOIN public.owners ow ON ow.id = a.owner_id
    LEFT JOIN public.branches b ON b.id = a.branch_id
    WHERE a.organization_id = p.demo_org_id
      AND a.deleted_at IS NULL
      AND (
        pt.organization_id IS DISTINCT FROM p.demo_org_id
        OR ow.organization_id IS DISTINCT FROM p.demo_org_id
        OR b.organization_id IS DISTINCT FROM p.demo_org_id
        OR a.branch_id IS DISTINCT FROM p.demo_branch_id
      )
  ),

  'reminders_disabled_on_appts', (
    SELECT count(*) = 0
    FROM public.appointments a, params p
    WHERE a.organization_id = p.demo_org_id
      AND a.deleted_at IS NULL
      AND (a.remind_24h OR a.remind_2h OR a.remind_confirmation)
  ),

  'no_owner_app_settings', (
    SELECT count(*) = 0
    FROM public.owner_app_settings s, params p
    WHERE s.organization_id = p.demo_org_id
  ),

  'no_whatsapp_messages', (
    SELECT count(*) = 0
    FROM public.whatsapp_messages w, params p
    WHERE w.organization_id = p.demo_org_id
      AND w.deleted_at IS NULL
  ),

  'no_reminder_logs', (
    SELECT count(*) = 0
    FROM public.reminder_logs r, params p
    WHERE r.organization_id = p.demo_org_id
      AND r.deleted_at IS NULL
  ),

  'qa_profiles', (
    SELECT json_agg(json_build_object(
      'email', u.email,
      'profile_org', pr.organization_id,
      'role', bm.role,
      'has_whatsapp_send', coalesce(bm.permissions::text ILIKE '%whatsapp:send%', false)
    ) ORDER BY u.email)
    FROM auth.users u
    JOIN public.profiles pr ON pr.id = u.id AND pr.deleted_at IS NULL
    JOIN public.branch_members bm ON bm.user_id = u.id AND bm.deleted_at IS NULL AND bm.is_active
    JOIN params p ON pr.organization_id = p.demo_org_id
    WHERE u.email IN (
      'owner.demo@academia-demo.invalid',
      'vet.demo@academia-demo.invalid',
      'recepcion.demo@academia-demo.invalid'
    )
  ),

  'trial_subscription_tagged', (
    SELECT count(*) >= 1
    FROM public.organization_subscriptions s, params p
    WHERE s.organization_id = p.demo_org_id
      AND coalesce((s.metadata->>'academia_demo')::boolean, false)
  ),

  'in_app_notifications_scoped', (
    SELECT count(*) FILTER (WHERE n.organization_id <> p.demo_org_id) = 0
    FROM public.notifications n
    CROSS JOIN params p
    WHERE n.related_type = 'appointment'
      AND n.related_id IN (
        SELECT a.id FROM public.appointments a
        WHERE a.organization_id = p.demo_org_id AND a.source_system = p.source_system
      )
  ),

  'counts', (
    SELECT json_build_object(
      'orgs_total', b.orgs_total,
      'orgs_non_demo', b.orgs_non_demo,
      'appts_total', b.appts_total,
      'appts_non_demo', b.appts_non_demo,
      'demo_appts', (
        SELECT count(*) FROM public.appointments a, params p
        WHERE a.organization_id = p.demo_org_id AND a.deleted_at IS NULL
      ),
      'note', 'After seed: orgs_non_demo and appts_non_demo must equal pre-seed baseline'
    )
    FROM baseline b
  ),

  'foreign_leak_check_fixed', (
    -- Meaningful: demo appointments whose patient/owner/branch belong elsewhere
    SELECT count(*)
    FROM public.appointments a
    JOIN params p ON a.organization_id = p.demo_org_id AND a.deleted_at IS NULL
    JOIN public.patients pt ON pt.id = a.patient_id
    WHERE pt.organization_id <> a.organization_id
  )
) AS academia_demo_validation;
