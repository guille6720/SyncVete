# Academia Demo — disposable dry-run results

**Date (UTC):** 2026-10-17T20:59:53Z  
**Schema source:** staging `owmcrqvnfubyjxrlyhlc` (`supabase db dump --schema public`)  
**Script:** `06_dry_run.ps1`  
**Staging writes:** none  
**Auth Admin on staging:** not executed

## Results

| Check | Result |
|-------|--------|
| Schema dump restore (core tables) | PASS (`appointments` present) |
| Protect marker apply | PASS |
| Seed pass 1 | PASS (`ACADEMIA_DEMO seed OK`) |
| Seed pass 2 (idempotent) | PASS |
| Active demo appointments = 5 | PASS |

## Differences vs live staging

1. No GoTrue — `auth.users` stubbed with fixed UUIDs for the three QA emails.
2. No `pg_cron` runner — `queue_owner_app_reminders` not auto-invoked.
3. No Edge Functions / WhatsApp / payment webhooks.
4. Some GRANT/RLS lines fail without full Supabase roles until stub creates `anon` / `authenticated` / `service_role` (restore still yields core tables).
5. `auth.jwt()` / `auth.uid()` stubbed — RLS not fully exercised as a clinic JWT actor.

## Conclusion

Seed SQL is compatible with the **real staging public schema** (constraints, enums including `completada`, subscription trigger, appointment notify → in-app only).  
Safe to authorize staging Auth + seed separately; dry-run is not a substitute for post-apply validation on staging.
