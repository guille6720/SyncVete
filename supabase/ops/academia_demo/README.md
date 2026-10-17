# Academia Demo SyncVete — production-ready seed package (STAGING ONLY)

**Project:** `owmcrqvnfubyjxrlyhlc`  
**Production (`lhdksiptpsubktikdses`):** never apply.  
**Status:** Package ready — **DO NOT EXECUTE** staging writes until explicit authorization.  
**Branch:** `feat/tutorial-academy-agenda`

## Goal

Isolated fictional clinic for Agenda video + Academia tours, with:

- Explicit org marker (not name-based)
- Auth Admin QA users (no `auth.users` inserts)
- Side-effect isolation (no WhatsApp/email/SMS/billing outbound)
- Idempotent seed + rollback + validation
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
| Owner | María Ejemplo (no portal / no WhatsApp) |
| Patient | Luna (Canino) |
| Appointments | 5 (`completada`, `confirmada`, `programada`×2, `cancelada`) |
| QA emails | `owner.demo@`, `vet.demo@`, `recepcion.demo@` + `academia-demo.invalid` |

Appointment status enum uses **`completada`** (never `completed`).

## Artifacts

| File | Purpose |
|------|---------|
| `00_constants.sql` | Documented IDs / emails |
| `01_seed_data.sql` | Idempotent public-schema seed |
| `02_auth_users.ps1` | Auth Admin create/update (password login, no invite) |
| `03_validation_queries.sql` | Assertions + before/after counts |
| `04_rollback.sql` | Soft-delete compensating cleanup |
| `05_protect_demo_marker.sql` | Lock marker to service_role |
| `06_dry_run.ps1` | Disposable Postgres + staging schema dump |
| `07_run_staging_gated.ps1` | Prepare / DrySql / Commit gate (no auto-write) |
| `HARDEN_DELETE_PLAN.md` | Separate `tutorial_progress` DELETE revoke |
| `credentials.local.json` | **gitignored** secrets from Auth Admin |

App routing: `apps/web/src/actions/academia-demo.ts` + `lib/academia-demo-marker.ts`.

## Authorized execution order (when approved)

1. Confirm CLI `--project-ref owmcrqvnfubyjxrlyhlc`.
2. `02_auth_users.ps1 -Execute` → writes `credentials.local.json` (do not commit).
3. Apply `05_protect_demo_marker.sql`.
4. Capture pre-seed counts via `03_validation_queries.sql`.
5. Apply `01_seed_data.sql` inside a transaction; `COMMIT` only after validation OK.
6. Re-run `03_validation_queries.sql`; compare `orgs_non_demo` / `appts_non_demo` unchanged.
7. Smoke login as QA users on Preview Academia (password from local credentials file).

**DELETE harden** (`ops/20261017163000_tutorial_progress_revoke_delete.sql`) stays a **separate** authorization.

## Side-effect isolation (summary)

| Mechanism | Demo control |
|-----------|----------------|
| `trg_notify_appointment` | In-app `notifications` only (org-scoped) |
| `queue_owner_app_reminders` (cron * * * * *) | Requires `owner_app_settings.brand.enabled` + `owners.portal_user_id` — both absent |
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
