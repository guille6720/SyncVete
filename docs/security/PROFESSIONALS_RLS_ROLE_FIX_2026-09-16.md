# Professional create RLS / role consistency (2026-09-16)

Branch: `staging/perf-navigation`  
Environment: SyncVete-Staging only

## 1. Exact root cause

Two layers:

1. **RLS denial:** `professionals_insert` requires `has_permission('professionals:write')`. Veterinarian role defaults do **not** include that permission (correct).
2. **Session ↔ RLS membership mismatch:** App session picked membership via `profiles.active_branch_id`, while PostgreSQL `has_permission` used **oldest** `branch_members` row (`ORDER BY created_at ASC LIMIT 1`) and ignored active branch. That made the UI/app authz and RLS disagree whenever memberships differed across branches/time.

Canonical source of truth for staff role: **active branch membership** (`profiles.active_branch_id`), else earliest membership — now shared by session helpers and `has_permission`.

Clinic signup (`handle_new_user_signup`) already inserts `owner`. Mis-tagged founders with `veterinarian` and **zero owners in the org** are repaired deterministically (earliest profile with a membership → `owner`). Ambiguous orgs stay listed in `ops_orgs_missing_owner` for manual review.

## 2. Affected rows (staging)

After applying `20260916180000_align_has_permission_active_branch.sql`:

```sql
SELECT * FROM public.ops_orgs_missing_owner;
-- plus inspection queries in supabase/ops/staging_inspect_owner_role_mismatch.sql
```

Rows auto-repaired: memberships updated to `owner` only when the org had **no** owner and the earliest profile was a clear founder candidate. Veterinarians in healthy orgs (already have an owner) are **not** promoted.

## 3. Files changed

- `supabase/migrations/20260916180000_align_has_permission_active_branch.sql`
- `supabase/ops/staging_inspect_owner_role_mismatch.sql`
- `apps/web/src/lib/session.ts`
- `apps/web/src/actions/professionals.ts` (Spanish RLS errors + compensating cleanup)
- `packages/shared/src/utils/permissions-membership.ts`
- `packages/shared/src/index.ts`
- `packages/shared/src/__tests__/permissions-membership.test.ts`
- `packages/db/src/__tests__/professionals-insert-rls.integration.test.ts`
- this doc

## 4. Migrations

| Migration | Purpose |
|---|---|
| `20260916180000_align_has_permission_active_branch.sql` | Align `has_permission` + founder repair + bootstrap `created_at` + ops view |

Apply on **Staging only**. Do not apply to production without separate sign-off.

## 5. Before / after authorization

| Actor | Before | After |
|---|---|---|
| Owner (active) | Insert OK if oldest membership also allowed | Insert OK; RLS uses active membership |
| Admin | Insert OK | Insert OK |
| Veterinarian default | RLS deny (and app should deny) | Deny; Spanish message |
| Veterinarian + custom `professionals:write` | Allowed by SQL custom perms | Allowed |
| Other org | Deny | Deny |
| Failed onboarding after auth create | Ghost users possible | Compensating delete/soft-delete |

## 6. Regression tests

- Unit: `packages/shared/src/__tests__/permissions-membership.test.ts`
- Integration (needs Staging env): `packages/db/src/__tests__/professionals-insert-rls.integration.test.ts`

## 7. Security

- RLS not weakened; veterinarian defaults unchanged
- No service_role in browser
- Fail-closed on authz
