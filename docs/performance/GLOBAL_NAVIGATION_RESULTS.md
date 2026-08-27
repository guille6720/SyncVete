# SyncVete — Global Navigation Performance Results (STAGING)

> Date: 2026-08-27  
> Branch: `staging/perf-phase-2-session`  
> Scope: code + migrations prepared for **SyncVete-Staging** only  
> Live wall-clock traces: **not captured in this environment** (no Staging DB credentials in agent). Estimates from call-graph reduction vs `GLOBAL_NAVIGATION_BASELINE.md`.

---

## BEFORE vs AFTER (critical clinic navigation)

| Transition | Backend RTTs before (est.) | Backend RTTs after (est.) | Perceived behavior after | Remaining bottleneck |
|---|---|---|---|---|
| Dashboard → Agenda | 11–13 + prefetch storm peers | **~6–8** | Shell stable; Agenda shell + dynamic | Module data queries |
| Agenda → Patients | 11–13 | **~6–8** | Page title immediate; list streams | `listPatients` query |
| Patients → Clinical History | 11–13 | **~6–8** | Title + Suspense stream | `listClinicalEntries` |
| Clinical History → Consultations | 11–13 | **~6–8** | Queue first; history streams | Queue + history queries |
| Consultations → Waiting Room | 11–13 | **~6–8** | Parallel perms/config | Dual list fetches |

**Eliminated / reduced per navigation (typical):**

| Change | RTTs saved |
|---|---|
| Remove `expire_due_subscriptions` write from entitlement load | **1 write + wait** |
| Session: 3 sequential queries → 1 `get_session_bootstrap` RPC | **~2** |
| Entitlement banner: sequential checkout/closed/addons → `Promise.all` | **~1–2** |
| Prefetch storm (7 modules) → idle 2 light routes | **N competing RSC trees** |
| Commercial banner deferred behind Suspense (not in layout critical await) | **1–3** off TTFB for module HTML |

**Net:** about **4–6 backend round-trips** removed from the critical path, plus removal of speculative multi-module SSR competition.

---

## Authentication

- Middleware still uses **`auth.getUser()`** (cookie refresh + revocation). `getClaims()` not adopted: project still requires server validation semantics; `getUser` remains the safe edge check.
- Preview/Staging can emit `Server-Timing: mw-auth` when `VERCEL_ENV=preview` or `SYNC_VETE_PERF_TIMING=1`.
- Layout/pages continue to use request-scoped `getSessionContext` (React.cache) — no trusting client org IDs.

## Session bootstrap

- New RPC: `public.get_session_bootstrap()` (migration `20260827210000_session_bootstrap_rpc.sql`).
- Derives profile, memberships, `is_platform_admin`, optional portal owner from **`auth.uid()` only**.
- App fallback: parallel `is_platform_admin` + `profiles` + `branch_members` if RPC missing.
- Platform allowlist (`SUPERADMIN_EMAILS`) still applied in app after DB flag.

## Entitlements

- **Removed** `expire_due_subscriptions` from `loadOrganizationEntitlementInput` (no write on read).
- Split:
  - `getClinicEntitledHrefs` — critical nav gating
  - `getClinicCommercialBanner` — checkout / closed plans / add-ons / meters (parallelized)
  - `getClinicCommercialShell` — `Promise.all` of both
- Cross-request `unstable_cache` **not** enabled: caching RLS-backed reads by `organizationId` risks poisoning if a wrong org id is passed under a foreign session. Request-scoped `React.cache` retained.
- Override/plan changes still take effect on next request (no stale global cache).

## Prefetch

- App shell: idle prefetch of **`/dashboard` + `/agenda` only** (was 7 modules).
- Command palette open: 3 light destinations (was 11+).
- Sidebar: viewport prefetch only for dashboard/agenda; other modules `prefetch={false}` (hover still allowed by Next).

## Application shell

- `(clinic)/layout.tsx` awaits **critical** entitled hrefs only; commercial banner streams via Suspense (`ClinicBillingBannerSlot`) and does not block module children.
- Shell persists across module navigations; `loading.tsx` replaces children only.
- Pending href styling retained for immediate click feedback.

## Agenda

- View/filter/date state updates **synchronously** (removed `startTransition` deferral on controls).
- Day/Week/Month: `aria-pressed`.
- Duplicate Month Anterior/Siguiente removed (week nav remains).
- Empty search: “No encontramos turnos para esta búsqueda.” + clear action.
- Terminology: staff UI uses **Agenda** module + **turnos** for appointment items.
- Spanish dates: `formatDashboardDate` → `27 de ago. de 2026`; removed CSS `capitalize` on WR date labels.

## Patients / Clinical History

- Real Suspense: async child fetches inside boundary so shell/title can paint first.

## Consultations / Waiting Room

- Consultations: history loads inside Suspense; queue/perms parallel.
- Waiting Room: `canRead` + `searchParams` parallelized; data batch unchanged after branch resolve.

## Database / RLS

- Migrations (apply on **Staging**):
  - `20260827200000_expire_subscriptions_job.sql`
  - `20260827210000_session_bootstrap_rpc.sql`
- Ops (Staging only): `supabase/ops/staging_enable_expire_cron.sql`
- Docs: `docs/performance/EXPIRE_SUBSCRIPTIONS_CRON.md`
- **No new indexes.** No RLS policy weakening. `expire_due_subscriptions` EXECUTE revoked from `authenticated`.

## Tests

| Suite | Result |
|---|---|
| `agenda-performance.test.ts` | PASS (10) |
| `clinic-sidebar-nav-catalog.test.ts` | PASS (4) |
| `dashboard-utils.test.ts` | PASS (5) |
| `agenda-range.test.ts` | PASS (6) |
| `tsc --noEmit` (apps/web) | PASS |
| Full integration / e2e against Staging DB | **NOT RUN** (no credentials here) |
| Production build | **NOT RUN** in this pass |

## Security validation

| Check | Status |
|---|---|
| Session identity from `auth.getUser` + `auth.uid()` | PASS |
| No client-supplied org trust for session | PASS |
| Expire writes removed from page path | PASS |
| Expire job service_role-only | PASS |
| Entitlements still org-scoped via session org id | PASS |
| Cross-tenant cache not introduced | PASS |
| Staging cron not auto-enabled on Production | PASS (manual ops file) |

---

## PERFORMANCE VERDICT

**PASS WITH WARNINGS**

Warnings:

1. Estimates only — confirm with Staging Preview + Network/Server-Timing.
2. Middleware `getUser` + RSC `getUser` still both run (required for cookie refresh vs React tree); not fully collapsed.
3. Migrations + cron must be applied manually on Staging before full benefit.

## SECURITY VERDICT

**PASS**

No RLS weakening; service-role secrets not exposed; expire job gated; session bootstrap uses `auth.uid()`.

## PRODUCTION RECOMMENDATION

**NOT READY**

Staging validation required first:

1. Apply both migrations on SyncVete-Staging.
2. Run `supabase/ops/staging_enable_expire_cron.sql` on Staging only.
3. Deploy this branch to Vercel Preview (Staging env).
4. Human QA path (Phase 13).
5. Only then schedule Production cron manually per docs.

---

## Manual configuration checklist

### Supabase Staging

- [ ] Apply `20260827200000_expire_subscriptions_job.sql`
- [ ] Apply `20260827210000_session_bootstrap_rpc.sql`
- [ ] Enable `pg_cron` if needed
- [ ] Run `staging_enable_expire_cron.sql`
- [ ] Verify `cron.job` row `syncvete_expire_due_subscriptions`

### Vercel

- [ ] Preview uses Staging Supabase URL/keys (if not already)
- [ ] Optional: `SYNC_VETE_PERF_TIMING=1` for Server-Timing
- [ ] Do **not** promote to Production until QA PASS

### Production (later)

- [ ] Do not enable expire cron until Staging is healthy for several days
- [ ] Apply migrations, then manually schedule job
