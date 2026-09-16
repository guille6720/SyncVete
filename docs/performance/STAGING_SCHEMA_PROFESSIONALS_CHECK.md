# Staging schema checklist — professionals / nav perf (2026-09-16)

Compare SyncVete-Staging against `staging/perf-navigation`. Do **not** apply to production without a separate sign-off.

## Required for professional detail (non-crash)

| Object | Migration | Notes |
|---|---|---|
| `professionals` (+ profile cols) | `20260824170000_*`, `20260915000000_professionals_profile_fields.sql` | phone/email/address/DOB/avatar/created_by |
| `professional_branches` | phase1 | |
| `professional_settlements` | phase1 | |
| `professional_payments` | phase1 | |
| `professional_compensation_schemes` / `_rules` | phase1 | |
| RPC `list_professional_settlements` | phase1 | Used by recent settlements tab |
| `calculation_snapshot` column | `20260915010000_professional_settlement_snapshot.sql` | Optional for list; approve path needs it |
| `get_session_bootstrap` | `20260827210000_session_bootstrap_rpc.sql` | Nav perf |
| `expire_due_subscriptions_job` | `20260827200000_expire_subscriptions_job.sql` | Cron only; revoke authenticated EXECUTE |

## Verify on Staging (SQL editor)

```sql
SELECT to_regprocedure('public.get_session_bootstrap()') IS NOT NULL AS has_bootstrap;
SELECT to_regprocedure('public.list_professional_settlements(uuid, public.settlement_status, date, date, uuid, integer, integer)') IS NOT NULL AS has_list_settlements;
SELECT to_regprocedure('public.expire_due_subscriptions_job()') IS NOT NULL AS has_expire_job;

SELECT column_name
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'professionals'
  AND column_name IN ('phone','email','address','date_of_birth','avatar_url','created_by')
ORDER BY 1;

SELECT column_name
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'professional_settlements'
  AND column_name = 'calculation_snapshot';
```

## App behavior if objects missing

- Missing settlement tables/RPC: detail page now degrades to empty settlements/compensation sections (no crash).
- Missing appointments:read: staff picker returns `[]` (was PermissionError crash — digest root cause).
- Missing profile columns: create path has insert fallback; reads tolerate nulls via `mapProfessional`.
