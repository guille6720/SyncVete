-- Supabase grants EXECUTE on new public functions directly to anon and authenticated, so the
-- earlier "REVOKE ... FROM PUBLIC" did not close them. Re-apply the intended grants.

DO $$
DECLARE
  r RECORD;
BEGIN
  -- Server-only (webhooks, jobs, internal helpers called from SECURITY DEFINER code).
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'append_plan_recommendation_event',
        'billing_apply_paid_addon',
        'billing_apply_paid_plan',
        'billing_attach_paid_grant_ids',
        'billing_begin_event',
        'billing_consume_checkout_intents',
        'billing_extend_paid_plan',
        'billing_finish_event',
        'billing_lookup_paid_grant_from_provider_ids',
        'billing_release_checkout_intents',
        'billing_set_subscription_status',
        'cleanup_expired_data_export_jobs',
        'cleanup_stale_data_import_batches',
        'emit_plan_notification',
        'expire_due_subscriptions_job',
        'touch_data_migration_worker_heartbeat',
        'organization_metered_overages',
        'organization_seat_usage',
        'recommendation_trends_window'
      )
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', r.sig);
  END LOOP;

  -- Signed-in clinic users only.
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        '_billing_expire_checkout_intents',
        'apply_professional_appointment_hourly_rules',
        'apply_professional_lab_pharmacy_vaccination_rules',
        'apply_professional_procedure_shift_rules',
        'appointment_has_overlap',
        'get_recommendation_thresholds',
        'list_public_plan_limits',
        'recalc_invoice_totals',
        'recalculate_professional_settlement_totals',
        'superadmin_end_trial',
        'superadmin_start_trial'
      )
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', r.sig);
  END LOOP;
END;
$$;

NOTIFY pgrst, 'reload schema';
