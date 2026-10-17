# Tutorial progress DELETE revoke — isolated apply plan

**File:** `supabase/ops/20261017163000_tutorial_progress_revoke_delete.sql`  
**Target:** `owmcrqvnfubyjxrlyhlc` only  
**Status:** Ready — **DO NOT EXECUTE** until authorized.

## Compatibility

Tutorial RPCs and UI use SELECT / INSERT / UPDATE only (`upsert_tutorial_progress`, `get_my_tutorial_progress`).  
No client path issues `DELETE FROM tutorial_progress`.  
RLS already has no DELETE policy for clinic users.

## Apply pattern (same as Phase 4B)

1. Use disposable workspace `_sv-academia-isolated-deploy`.
2. Confirm `project-ref == owmcrqvnfubyjxrlyhlc`.
3. Dry-run / apply **only** the single SQL file via `db query` or isolated push of one versioned migration copied into that workspace.
4. Verify: `has_table_privilege('authenticated','public.tutorial_progress','DELETE') = false`.
5. Smoke: upsert + get progress still works for authenticated staging QA user.

## Do not

- Run repo-wide `db push --include-all`
- Run `migration repair`
- Apply to production
