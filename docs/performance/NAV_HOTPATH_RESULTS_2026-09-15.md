# SyncVete — Navigation hot-path results (2026-09-15)

> Branch: `staging/perf-navigation` (merged latest `main` product work)  
> Scope: remove measured global bottlenecks from clinic navigation  
> Live wall-clock: use Preview with `?perf=1` / `SV_PERF` overlay; server emits `[SV_PERF]` JSON on Preview

---

## 1. Root cause (validated)

Hypothesis **confirmed against current `main`**:

Every soft navigation re-ran `(clinic)/layout.tsx`, which blocked AppShell on:

1. `getSessionContext()` (middleware already called `getUser`; layout called it again — necessary for RSC, but then sequential profile/admin/memberships on main)
2. `Promise.all(branches, unreadNotifications, getClinicCommercialShell)`
3. Inside commercial shell: **`expire_due_subscriptions` write**, then features/subscription/overrides/addons, then checkout intents / meters for banners
4. Eager prefetch of **7+ modules**, each repeating the same expensive layout stack

Opening `/pacientes` therefore waited on billing lifecycle + banner math unrelated to patients.

`staging/perf-navigation` already had most fixes; this pass finished remaining hot-path leaks after merging `main`.

---

## 2. Before / after (critical path)

### Server work blocking shell (per clinic navigation)

| Stage | `main` (before) | `staging/perf-navigation` (after) |
|---|---|---|
| Middleware | `getUser` | `getUser` + optional `Server-Timing: mw-auth` |
| Session | getUser → admin → profile → memberships (sequential) | getUser → **`get_session_bootstrap`** (1 RPC; parallel fallback) |
| Layout await | branches + **unread** + **commercial shell** | branches + **entitled hrefs only** |
| Entitlements | expire write + full shell | **no expire**; hrefs critical; banner streamed |
| Settlements nav | (later linked check on hot path) | **streamed** via Suspense |
| Prefetch | 7 modules on mount | idle **dashboard + agenda** only |
| Dashboard page | awaited `getClinicCommercialShell` (banner+hrefs) | `getClinicEntitledHrefs` only (cached w/ layout) |

### Estimated warm soft-nav (shell-critical)

| Transition | Before (main est.) | After (est.) | Notes |
|---|---|---|---|
| Dashboard → Pacientes | 1.5–2.2s | **350–700ms** | Layout no longer waits commercial/expire/unread |
| Pacientes → Agenda | 1.6–2.3s | **400–800ms** | Agenda data still dominant |
| Agenda → Sala de espera | 1.4–2.0s | **400–900ms** | Board queries remain |
| WR → Profesionales | 1.5–2.1s | **400–800ms** | List + seats |
| Profesionales → Config | 1.4–2.0s | **450–900ms** | Settings payload heavy |
| Config → Dashboard | 1.6–2.4s | **400–800ms** | Dashboard streams widgets |

Fill wall-clock from Preview `SV_PERF` (`clientClickToShellMs`, `layout.total`, marks).

### Round-trips (typical staff nav, shell-critical)

| | Before | After |
|---|---|---|
| Middleware auth | 1 | 1 |
| Session | 4 sequential | **2** (getUser + bootstrap) |
| Branches | 2 | 2 (React.cache) |
| Unread notifications | 1 **blocking** | 0 blocking (streamed) |
| Entitlement input | 4 + **expire write** | 4 parallel, **no write** |
| Banner / checkout / meters | **blocking** | streamed |
| Professional link check | blocking (perf branch) | streamed |
| Prefetch storm peers | 5–7 extra RSC trees | 0–2 idle |

---

## 3. Files modified (this continuation)

- `apps/web/src/app/(clinic)/layout.tsx` — critical await = branches + entitled hrefs; stream banner, notifications, settlements flag
- `apps/web/src/components/layout/app-shell.tsx` — SettlementsNavProvider + flag slot
- `apps/web/src/components/layout/settlements-nav-context.tsx` — streamed flag context
- `apps/web/src/components/layout/clinic-settlements-nav-flag.tsx`
- `apps/web/src/components/layout/clinic-sidebar-nav.tsx` / `command-palette.tsx` — consume streamed flag
- `apps/web/src/components/dashboard/dashboard-view.tsx` — drop commercial shell await
- `apps/web/src/app/(clinic)/pacientes/[id]/page.tsx` — entitled hrefs only
- `apps/web/src/app/(clinic)/propietarios/[id]/page.tsx` — entitled hrefs only
- `packages/shared/src/utils/waiting-room.ts` — merge conflict resolution with main
- Docs: `NAV_PERF_INSTRUMENTATION.md`, this file

Already on branch (reused, not rewritten): entitlements split, expire removal, session bootstrap, middleware timing, narrow prefetch, billing/notification Suspense slots, `nav-timing` / `perf-nav-probe`.

---

## 4. Staging performance changes reused

| Change | Source | Status |
|---|---|---|
| Remove expire from entitlement reads | `staging/perf-navigation` | Kept |
| `expire_due_subscriptions_job` + cron ops | migrations `20260827200000_*` | Kept |
| `get_session_bootstrap` RPC | `20260827210000_*` | Kept |
| Split entitled hrefs vs commercial banner | same | Kept |
| Stream billing banner + unread bell | same | Kept + extended |
| Narrow idle prefetch | same | Kept |
| SV_PERF instrumentation | same | Kept |
| Trial / WR Suspense / host redirects from main | merge | Kept |

---

## 5. Staging changes rejected / not blindly merged

| Item | Why |
|---|---|
| Whole `staging/perf-phase-2-session` merge | Diverged; cherry-pick/reuse only still-valid pieces |
| Cross-request `unstable_cache` for entitlements | Tenant poisoning risk |
| Removing middleware `getUser` | Cookie refresh + revocation required |
| Skeletons-as-fix | Explicitly out of scope |
| Speculative DB indexes | Wait for measured slow queries |

---

## 6. Migrations

| Migration | Purpose |
|---|---|
| `20260827200000_expire_subscriptions_job.sql` | Service-role expiry job; revoke authenticated EXECUTE |
| `20260827210000_session_bootstrap_rpc.sql` | Single-RPC session bootstrap |
| Ops: `supabase/ops/staging_enable_expire_cron.sql` | Enable pg_cron on **Staging only** |

Ensure Staging DB has both migrations applied and cron enabled per `docs/performance/EXPIRE_SUBSCRIPTIONS_CRON.md`.

---

## 7. Security verification

| Check | Result |
|---|---|
| RLS | Unchanged; all reads via anon/authenticated clients |
| Multi-tenant | Org/branch still from session (`auth.uid()` / bootstrap), never client org id |
| Permissions | Staff gate in layout unchanged |
| Entitlements | Route gate still uses `getClinicEntitledHrefs`; access not removed |
| Expiry | Still runs via scheduled job; not deleted |
| Service role | Not exposed to browser |

---

## 8. Remaining bottlenecks

1. **Double `getUser`** (middleware + RSC) — intentional; largest remaining auth cost (~50–150ms each).
2. **`getClinicEntitledHrefs` / entitlement input** still ~4 parallel queries on every layout (required for nav gating).
3. **`getUserBranches`** still 2 queries (memberships + branches).
4. **Heavy page loaders** (agenda range, WR board, configuración, profesionales seats) dominate once shell is fast.
5. **Cron must be live on Staging** or expired trials lag until job runs (correctness SLA, not nav latency).

---

## 9. How to capture live before/after on Preview

1. Deploy this branch Preview.
2. `?perf=1` → navigate the QA sequence three times (cold / warm / repeat).
3. Record `clientClickToShellMs`, `layout.total`, `session.total`, `entitlements.*`, `mw-auth`.
4. Paste numbers into the table in §2.
