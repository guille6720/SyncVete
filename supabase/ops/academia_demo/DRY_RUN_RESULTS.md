# Academia Demo — disposable dry-run results

## Phase 5C.2 (final security remediation) — 2026-10-18

**Schema source:** staging `owmcrqvnfubyjxrlyhlc` (reused dump)  
**Script:** `06_dry_run.ps1`  
**Staging writes:** none  
**Machine-readable report:** `dry_run_work/dry_run_report.json` → `result=PASS`

| Check | Result |
|-------|--------|
| Protect marker apply (CURRENT_USER-first INVOKER) | PASS |
| authenticated cannot INSERT marker | PASS |
| authenticated cannot UPDATE marker | PASS |
| Normal org without marker | PASS |
| service_role can INSERT marker | PASS |
| JWT claim forgery cannot escalate authenticated | PASS |
| Auth/profile collision detectible | PASS |
| Marker helpers SECURITY INVOKER | PASS |
| Seed + approval gate | PASS |
| Idempotent re-seed | PASS |
| Fail-closed `03_validation_assert.sql` (RAISE on fail) | PASS |
| Seed-managed appointments = 5 (status mix) | PASS |
| Rollback pass 1 | PASS |
| Rollback pass 2 (idempotency) | PASS |

### Limitations vs live Supabase Auth

- Disposable DB uses schema dump; no GoTrue Auth Admin (stub `auth.users`).
- `SET ROLE authenticated` approximates PostgREST role switch; JWTs are GUC-stubbed.
- No pg_cron / Edge Functions / WhatsApp / payment webhooks.
- Seed owner profile/membership retained on rollback (`LAST_CENTRAL_ADMIN` guard); under soft-deleted org they are inert.

## Phase 5C.1 (security hardening) — prior

See git history. Baseline commit for 5C.2: `448a496`.
