# Subscription expiry — scheduled job (not navigation)

## Why

`expire_due_subscriptions` writes subscription/add-on state. Calling it from
`loadOrganizationEntitlementInput` made every clinic page navigation a
write-then-read path.

## Staging

1. Apply migration `20260827200000_expire_subscriptions_job.sql`.
2. In **SyncVete-Staging** SQL editor, run `supabase/ops/staging_enable_expire_cron.sql`.
3. Confirm `SELECT * FROM cron.job WHERE jobname = 'syncvete_expire_due_subscriptions';`
4. Confirm job runs: check `cron.job_run_details` (or Dashboard cron UI).

## Production

**Do not enable automatically.** After staging validation:

1. Apply the same migration on Production.
2. Manually schedule with the same ops SQL (or Dashboard cron calling
   `SELECT public.expire_due_subscriptions_job();` every 15 minutes).
3. Keep `authenticated` without EXECUTE on `expire_due_subscriptions`.

## Security

- Browser / anon / authenticated sessions cannot call the job wrapper.
- Core `expire_due_subscriptions` is service_role-only for direct EXECUTE;
  SECURITY DEFINER admin RPCs may still invoke it internally.
- Job is idempotent (status filters + due timestamps).
