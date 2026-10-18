# Academia Demo — disposable dry-run results

## Phase 5C.2 ownership fix — 2026-10-18

**Schema source:** staging `owmcrqvnfubyjxrlyhlc` (reused dump)  
**Script:** `06_dry_run.ps1`  
**Staging writes:** none  
**Machine-readable report:** `dry_run_work/dry_run_report.json` → `result=PASS`

| Check | Result |
|-------|--------|
| Protect marker + registry lock | PASS |
| Role-based marker/registry security tests | PASS |
| Seed + idempotent re-seed | PASS |
| Ownership fixtures + non-adoption re-seed | PASS |
| Demo owner cannot modify registry | PASS |
| Preexisting profile/membership/schedule not adopted | PASS |
| Forged-registry rollback refused | PASS |
| Fail-closed validation assert | PASS |
| Rollback x2 idempotent | PASS |

### Limitations vs live Supabase Auth

- Disposable DB uses schema dump; no GoTrue Auth Admin (stub `auth.users`).
- `SET ROLE authenticated` approximates PostgREST role switch; JWTs are GUC-stubbed.
- No pg_cron / Edge Functions / WhatsApp / payment webhooks.
- Seed owner profile/membership retained on rollback (`LAST_CENTRAL_ADMIN` guard).
