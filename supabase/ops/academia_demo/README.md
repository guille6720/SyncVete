# Academia Demo SyncVete — production-ready seed package (STAGING ONLY)

**Project:** `owmcrqvnfubyjxrlyhlc`  
**Production (`lhdksiptpsubktikdses`):** never apply.  
**Status:** Phase 5C.2 remediated — **DO NOT EXECUTE** staging writes until explicit authorization.  
**Branch:** `feat/tutorial-academy-agenda`

## Goal

Isolated fictional clinic for Agenda video + Academia tours, with:

- Explicit org marker (not name-based)
- Auth Admin QA users (no `auth.users` inserts)
- Side-effect isolation (no WhatsApp/email/SMS/billing outbound)
- Idempotent seed + scoped rollback + fail-closed validation
- Disposable dry-run against real staging schema dump

## Dataset

| Entity | Value |
|--------|--------|
| Org id | `a0a0a0a0-d0e0-4000-8000-000000000001` |
| Org name | Academia Demo SyncVete |
| Slug | `academia-demo-syncvete` |
| Marker | `settings.academia_demo=true`, `settings.academia_demo_key=sv-academia-demo-v1` |
| Branch | Sucursal Demo (`DEMO`) |
| Professional | Dra. Ana Demo (vet.demo) |
| Owner | Maria Ejemplo (no portal / no WhatsApp) |
| Patient | Luna (Canino) |
| Appointments | 5 (`completada`, `confirmada`, `programada`x2, `cancelada`) |
| QA emails | `owner.demo@`, `vet.demo@`, `recepcion.demo@` + `academia-demo.invalid` |

Appointment status enum uses **`completada`** (never `completed`).

## Artifacts

| File | Purpose |
|------|---------|
| `00_constants.sql` | Documented IDs / emails |
| `01_seed_data.sql` | Idempotent public-schema seed (registry + INSERT-only profiles) |
| `02_auth_users.ps1` | Strict Auth ownership (metadata trust; no email-only reuse) |
| `03_validation_queries.sql` | Advisory JSON evidence |
| `03_validation_assert.sql` | Fail-closed DO block (RAISE on any failed assertion) |
| `04_rollback.sql` | Registry-scoped soft-delete; refuses ambiguous ownership |
| `05_protect_demo_marker.sql` | CURRENT_USER-first marker lock (INVOKER) |
| `06_dry_run.ps1` | Disposable Postgres + security + seed + assert + rollback x2 |
| `07_run_staging_gated.ps1` | Prepare / DrySql / Commit gate (assert before COMMIT; no auto-write) |
| `08_security_tests.sql` | Distinct DB roles + JWT escalation fail-closed |
| `HARDEN_DELETE_PLAN.md` | Separate `tutorial_progress` DELETE revoke |
| `credentials.local.json` | **gitignored** secrets from Auth Admin |

App routing: `apps/web/src/actions/academia-demo.ts` + `lib/academia-demo-marker.ts`.

## Phase 5C.2 ownership rules

1. Reserved `@academia-demo.invalid` email alone does **not** authorize reuse.
2. Existing Auth accounts require `app_metadata.academia_demo=true` and `academia_demo_managed_by=syncvete_ops`.
3. Seed tracks ownership via `source_system=academia_demo_seed` + `settings.academia_demo_registry`.
4. Profiles/memberships are INSERT-only; never overwrite independent records.
5. `owner_app_settings`: abort if incompatible rows exist (never DELETE).
6. Approval GUC is an operator foot-gun only — **not** authentication.
7. Rollback preserves tester-created demo-org rows and unrelated schedules; retains last seed owner under `LAST_CENTRAL_ADMIN`.

## Authorized execution order (when approved)

1. Confirm CLI `--project-ref owmcrqvnfubyjxrlyhlc`.
2. `02_auth_users.ps1 -Execute` (add `-AllowPasswordReset` only if rotating QA passwords).
3. Apply via `07_run_staging_gated.ps1 -Mode DrySql` then `-Mode Commit -IAuthorizeStagingSeed` (manual apply of generated bundle).
4. Bundle order: protect marker → seed → **assert** → advisory validation → COMMIT (assert blocks COMMIT on failure).
5. Smoke login as QA users on Preview Academia (password from local credentials file).

**DELETE harden** (`ops/20261017163000_tutorial_progress_revoke_delete.sql`) stays a **separate** authorization.

## Side-effect isolation (summary)

| Mechanism | Demo control |
|-----------|----------------|
| `trg_notify_appointment` | In-app `notifications` only (org-scoped) |
| `queue_owner_app_reminders` (cron) | Requires `owner_app_settings.brand.enabled` + `owners.portal_user_id` — both absent |
| Appointment remind flags | Forced `false` |
| WhatsApp / reminder_logs | No rows; QA perms omit `whatsapp:send` |
| `ensure_default_organization_subscription` | Trial row expected; metadata tagged `academia_demo` |
| Billing / webhooks | No payment objects created |

## Safety rules

1. Never modify other clinics.
2. Never detect demo by org name alone.
3. Tutorial must not auto-change appointment statuses (resolver only reads id).
4. No Academia feature-flag changes in this package.
5. Stop before remote writes until authorization.
