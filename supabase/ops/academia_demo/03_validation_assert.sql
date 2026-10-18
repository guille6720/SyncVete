-- Academia Demo — FAIL-CLOSED validation (Phase 5C.2)
-- Evaluates assertions and RAISE EXCEPTION on any failure.
-- Emits machine-readable JSON notice + returns row for evidence capture.
-- Safe SELECT-side effects only (no data mutation).

DO $$
DECLARE
  c_org uuid := 'a0a0a0a0-d0e0-4000-8000-000000000001';
  c_branch uuid := 'a0a0a0a0-d0e0-4000-8000-000000000002';
  c_source text := 'academia_demo_seed';
  c_key text := 'sv-academia-demo-v1';
  v jsonb;
  v_fail text[] := ARRAY[]::text[];
  v_statuses jsonb;
  v_qa_count int;
BEGIN
  v := jsonb_build_object(
    'demo_org_unique', (
      SELECT count(*) = 1 FROM public.organizations o
      WHERE o.deleted_at IS NULL
        AND coalesce((o.settings->>'academia_demo')::boolean, false)
        AND o.settings->>'academia_demo_key' = c_key
    ),
    'demo_org_id_match', EXISTS(
      SELECT 1 FROM public.organizations o
      WHERE o.id = c_org AND o.deleted_at IS NULL AND o.settings->>'academia_demo_key' = c_key
    ),
    'branch_ok', EXISTS(
      SELECT 1 FROM public.branches b
      WHERE b.id = c_branch AND b.organization_id = c_org AND b.deleted_at IS NULL AND b.code = 'DEMO'
    ),
    'seed_appts_five', (
      SELECT count(*) = 5 FROM public.appointments a
      WHERE a.organization_id = c_org AND a.source_system = c_source AND a.deleted_at IS NULL
    ),
    'status_completada', (
      SELECT count(*) = 1 FROM public.appointments a
      WHERE a.organization_id = c_org AND a.source_system = c_source AND a.deleted_at IS NULL AND a.status = 'completada'
    ),
    'status_confirmada', (
      SELECT count(*) = 1 FROM public.appointments a
      WHERE a.organization_id = c_org AND a.source_system = c_source AND a.deleted_at IS NULL AND a.status = 'confirmada'
    ),
    'status_programada', (
      SELECT count(*) = 2 FROM public.appointments a
      WHERE a.organization_id = c_org AND a.source_system = c_source AND a.deleted_at IS NULL AND a.status = 'programada'
    ),
    'status_cancelada', (
      SELECT count(*) = 1 FROM public.appointments a
      WHERE a.organization_id = c_org AND a.source_system = c_source AND a.deleted_at IS NULL AND a.status = 'cancelada'
    ),
    'no_foreign_seed_appts', (
      SELECT count(*) = 0 FROM public.appointments a
      WHERE a.source_system = c_source AND a.deleted_at IS NULL AND a.organization_id <> c_org
    ),
    'no_cross_tenant_fk', (
      SELECT count(*) = 0
      FROM public.appointments a
      JOIN public.patients pt ON pt.id = a.patient_id
      JOIN public.owners ow ON ow.id = a.owner_id
      WHERE a.organization_id = c_org AND a.deleted_at IS NULL AND a.source_system = c_source
        AND (pt.organization_id IS DISTINCT FROM c_org OR ow.organization_id IS DISTINCT FROM c_org)
    ),
    'reminders_off', (
      SELECT count(*) = 0 FROM public.appointments a
      WHERE a.organization_id = c_org AND a.source_system = c_source AND a.deleted_at IS NULL
        AND (a.remind_24h OR a.remind_2h OR a.remind_confirmation)
    ),
    'no_owner_app_settings', (
      SELECT count(*) = 0 FROM public.owner_app_settings s WHERE s.organization_id = c_org
    ),
    'no_whatsapp', (
      SELECT count(*) = 0 FROM public.whatsapp_messages w
      WHERE w.organization_id = c_org AND w.deleted_at IS NULL
    ),
    'no_reminder_logs', (
      SELECT count(*) = 0 FROM public.reminder_logs r
      WHERE r.organization_id = c_org AND r.deleted_at IS NULL
    ),
    'qa_three', (
      SELECT count(*) = 3
      FROM auth.users u
      JOIN public.profiles pr ON pr.id = u.id AND pr.deleted_at IS NULL AND pr.organization_id = c_org
      JOIN public.branch_members bm ON bm.user_id = u.id AND bm.organization_id = c_org
        AND bm.deleted_at IS NULL AND bm.is_active
      WHERE u.email IN (
        'owner.demo@academia-demo.invalid',
        'vet.demo@academia-demo.invalid',
        'recepcion.demo@academia-demo.invalid'
      )
    ),
    'qa_not_foreign', (
      SELECT count(*) = 0
      FROM auth.users u
      JOIN public.profiles pr ON pr.id = u.id AND pr.deleted_at IS NULL
      WHERE u.email IN (
        'owner.demo@academia-demo.invalid',
        'vet.demo@academia-demo.invalid',
        'recepcion.demo@academia-demo.invalid'
      ) AND pr.organization_id IS DISTINCT FROM c_org
    ),
    'registry_present', EXISTS(
      SELECT 1 FROM public.organizations o
      WHERE o.id = c_org AND o.settings ? 'academia_demo_registry'
        AND o.settings->'academia_demo_registry'->>'source' = c_source
    ),
    'marker_trigger', EXISTS(
      SELECT 1 FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'organizations'
        AND t.tgname = 'trg_protect_academia_demo_marker' AND NOT t.tgisinternal
    ),
    'foreign_leak_count', (
      SELECT count(*) FROM public.appointments a
      JOIN public.patients pt ON pt.id = a.patient_id
      WHERE a.organization_id = c_org AND a.deleted_at IS NULL
        AND pt.organization_id <> a.organization_id
    )
  );

  -- Fail-closed: every boolean assertion must be true; leak count must be 0
  IF coalesce((v->>'demo_org_unique')::boolean, false) IS NOT TRUE THEN v_fail := array_append(v_fail, 'demo_org_unique'); END IF;
  IF coalesce((v->>'demo_org_id_match')::boolean, false) IS NOT TRUE THEN v_fail := array_append(v_fail, 'demo_org_id_match'); END IF;
  IF coalesce((v->>'branch_ok')::boolean, false) IS NOT TRUE THEN v_fail := array_append(v_fail, 'branch_ok'); END IF;
  IF coalesce((v->>'seed_appts_five')::boolean, false) IS NOT TRUE THEN v_fail := array_append(v_fail, 'seed_appts_five'); END IF;
  IF coalesce((v->>'status_completada')::boolean, false) IS NOT TRUE THEN v_fail := array_append(v_fail, 'status_completada'); END IF;
  IF coalesce((v->>'status_confirmada')::boolean, false) IS NOT TRUE THEN v_fail := array_append(v_fail, 'status_confirmada'); END IF;
  IF coalesce((v->>'status_programada')::boolean, false) IS NOT TRUE THEN v_fail := array_append(v_fail, 'status_programada'); END IF;
  IF coalesce((v->>'status_cancelada')::boolean, false) IS NOT TRUE THEN v_fail := array_append(v_fail, 'status_cancelada'); END IF;
  IF coalesce((v->>'no_foreign_seed_appts')::boolean, false) IS NOT TRUE THEN v_fail := array_append(v_fail, 'no_foreign_seed_appts'); END IF;
  IF coalesce((v->>'no_cross_tenant_fk')::boolean, false) IS NOT TRUE THEN v_fail := array_append(v_fail, 'no_cross_tenant_fk'); END IF;
  IF coalesce((v->>'reminders_off')::boolean, false) IS NOT TRUE THEN v_fail := array_append(v_fail, 'reminders_off'); END IF;
  IF coalesce((v->>'no_owner_app_settings')::boolean, false) IS NOT TRUE THEN v_fail := array_append(v_fail, 'no_owner_app_settings'); END IF;
  IF coalesce((v->>'no_whatsapp')::boolean, false) IS NOT TRUE THEN v_fail := array_append(v_fail, 'no_whatsapp'); END IF;
  IF coalesce((v->>'no_reminder_logs')::boolean, false) IS NOT TRUE THEN v_fail := array_append(v_fail, 'no_reminder_logs'); END IF;
  IF coalesce((v->>'qa_three')::boolean, false) IS NOT TRUE THEN v_fail := array_append(v_fail, 'qa_three'); END IF;
  IF coalesce((v->>'qa_not_foreign')::boolean, false) IS NOT TRUE THEN v_fail := array_append(v_fail, 'qa_not_foreign'); END IF;
  IF coalesce((v->>'registry_present')::boolean, false) IS NOT TRUE THEN v_fail := array_append(v_fail, 'registry_present'); END IF;
  IF coalesce((v->>'marker_trigger')::boolean, false) IS NOT TRUE THEN v_fail := array_append(v_fail, 'marker_trigger'); END IF;
  IF coalesce((v->>'foreign_leak_count')::int, -1) <> 0 THEN v_fail := array_append(v_fail, 'foreign_leak_count'); END IF;

  v := v || jsonb_build_object(
    'result', CASE WHEN array_length(v_fail, 1) IS NULL THEN 'PASS' ELSE 'FAIL' END,
    'failed_assertions', to_jsonb(v_fail),
    'evaluated_at', timezone('utc', now())
  );

  RAISE NOTICE 'ACADEMIA_DEMO_VALIDATION %', v::text;

  IF array_length(v_fail, 1) IS NOT NULL THEN
    RAISE EXCEPTION 'ACADEMIA_DEMO_VALIDATION_FAILED: %', array_to_string(v_fail, ',');
  END IF;
END $$;

-- Evidence row for clients that capture query results
SELECT jsonb_build_object(
  'result', 'PASS',
  'note', 'Assertions evaluated inside DO block; failure raises before this SELECT'
) AS academia_demo_validation_evidence;
