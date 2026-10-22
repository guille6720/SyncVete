# SyncVete — Global Navigation Performance Baseline (STAGING)

> Audited: 2026-08-27  
> Scope: `apps/web` Next.js App Router, Supabase (anon key + RLS)  
> Methodology: static code audit — no live traces captured yet

---

## Executive Summary

Every authenticated navigation into the `(clinic)` layout triggers a minimum of **11–13 sequential Supabase round-trips** on the critical server path before the first byte of HTML is sent. The dominant bottleneck is `getClinicCommercialShell`, which fires `expire_due_subscriptions` (a write-then-read pattern) as its very first step, serialising 6–8 further RPCs behind it. No `Server-Timing` headers are emitted; no `pg_cron` job offloads expiry; `branch_members` is fetched twice per request.

---

## 1. Middleware

**File:** `apps/web/src/middleware.ts`

### Auth calls
| Call | Method | Note |
|---|---|---|
| `supabase.auth.getUser()` | JWT → Supabase Auth server | 1 network RTT |

- Uses `createServerClient` (anon key, cookie-based) from `@supabase/ssr`.
- **No** `getSession`, **no** `getClaims`, **no** entitlements, **no** `is_platform_admin`.
- Result: redirects unauthenticated requests to `/login`; redirects logged-in users away from `/login`/`/register`.
- `PUBLIC_ROUTES` list bypasses the `getUser` call's redirect logic but **not** the call itself — `getUser()` still executes for every non-static request due to the matcher.

### Matcher
```
/((?!_next/static|_next/image|favicon.ico|sw.js|manifest.webmanifest|icons/|.*\.(svg|png|jpg|jpeg|gif|webp)$).*)
```
All HTML navigation + API routes hit the middleware.

### RTTs: **1** (always sequential)

---

## 2. `getSessionContext`

**File:** `apps/web/src/lib/session.ts` — exported at `apps/web/src/actions/auth.ts:319` as a pass-through

### Cache
`React.cache()` — deduplicated within a single RSC render tree / Server Action invocation. **Not** shared across requests. Safe across multiple callers in the same request.

### Call sequence (staff path — most common)

```
auth.getUser()                          RTT 1  (sequential)
  └─ is_platform_admin RPC              RTT 2  (sequential)
       └─ profiles query                RTT 3  (sequential)
            └─ branch_members query     RTT 4  (sequential)
```

All four are **sequential awaits** — no parallelism.

### Call sequence (portal owner path — rare)

```
auth.getUser()                          RTT 1
  └─ is_platform_admin RPC              RTT 2
       └─ profiles query                RTT 3
            └─ branch_members query     RTT 4  (returns empty)
                 └─ get_portal_owner_id RTT 5
```

### `SessionContext` shape
```ts
{
  userId, organizationId, branchId,
  kind: 'staff' | 'portal',
  role: Role | null,
  permissions: Permission[],
  profile: { id, organization_id, full_name, avatar_url, phone,
             active_branch_id, is_active, created_at, updated_at, deleted_at },
  ownerId: string | null,   // portal only
  isPlatformAdmin: boolean,
}
```

### DB objects touched
| Table / RPC | Filter |
|---|---|
| `auth.getUser()` | JWT claim → Supabase Auth internal |
| `is_platform_admin()` | RLS / platform_admins table |
| `profiles` | `id = user.id AND deleted_at IS NULL` |
| `branch_members` | `user_id = user.id AND is_active = true AND deleted_at IS NULL` |
| `get_portal_owner_id()` | portal path only |

### RTTs: **4** (staff) / **5** (portal), all sequential

---

## 3. Entitlements

**Files:** `apps/web/src/lib/entitlements/index.ts`, `apps/web/src/lib/entitlements/nav.ts`  
`nav.ts` is a pure re-export from `@sincvete/shared` (zero Supabase calls).

---

### 3a. `loadOrganizationEntitlementInput` (line 85)

`React.cache(async (organizationId) => { ... })`

#### Waterfall

```
expire_due_subscriptions(p_org_id) RPC        RTT 1  ← sequential, blocking WRITE
  └─ Promise.all([
       features table,                         \
       organization_subscriptions,              |  RTT 2  (all parallel)
       organization_feature_overrides,          |
       list_own_addon_features() RPC,           /
     ])
       └─ plan_features table                  RTT 3  (conditional — only if active subscription found)
```

**`expire_due_subscriptions` details:**
- Defined in `supabase/migrations/20260818153000_entitlements_phase6_lifecycle.sql` (original) and last updated in `20260818190000_entitlements_phase9_addons.sql`.
- It is a `SECURITY DEFINER` function. Authenticated callers are scoped to their own org automatically.
- **Single call site in application code:** `loadOrganizationEntitlementInput` line 87 only. It is called eagerly, synchronously, on every entitlement resolution.
- **No `pg_cron` job** found in any migration — there is no background scheduler offloading this work.
- Because it is wrapped in `React.cache`, it executes once per `(organizationId, request)`. But the RPC runs every single page load for every org regardless of whether subscriptions actually need expiring.

#### What it returns
```ts
{
  schemaUnavailable: boolean,
  features: FeatureCatalogRow[],         // all active features
  planFeatures: PlanFeatureRow[],        // plan-specific limits (if subscribed)
  addonFeatures: AddonFeatureRow[],      // org add-ons
  overrides: FeatureOverrideRow[],       // per-org overrides
  hasActiveSubscription: boolean,
  planId, subscriptionStatus, planKey, planName, trialEndsAt, endsAt
}
```

### RTTs: **2** (no active sub) / **3** (active sub)

---

### 3b. `getOrganizationEntitlements` (line 246)

`React.cache` wrapper around `loadOrganizationEntitlementInput` + pure `resolveOrganizationEntitlements()`. Adds **0 RTTs** when input is already cached.

---

### 3c. `getClinicCommercialShell` (line 429) ← **critical path bottleneck**

`React.cache(async (organizationId) => { ... })`

Called directly from clinic layout. Full waterfall:

```
loadOrganizationEntitlementInput()              RTTs 1-3 (see §3a, cached on 2nd call)
  └─ list_own_open_checkout_intents() RPC       RTT 4  (sequential)
       └─ [if !hasActiveSubscription]
            organization_subscriptions query    RTT 5  (conditional)
       └─ list_own_addons() RPC                 RTT 5/6 (sequential)
            └─ [if still no banner decision]
                 Promise.all([
                   list_own_seat_usage() RPC,   \
                   feature_usage query,          |  RTT 6/7
                 ])
```

**Conditional branching:**
- If `resolveClinicCommercialBanner` resolves before reaching `list_own_addons`, the addons + seat/metered queries are skipped.
- In the happy path (active subscription, no banner triggered), all branches execute: **~7 RTTs** within `getClinicCommercialShell` alone.
- In the worst path (no active subscription, banner not resolved early), **up to 8 RTTs**.

### RTTs within `getClinicCommercialShell`: **4–8** (sequential chain, not parallel)

---

## 4. Clinic Layout

**File:** `apps/web/src/app/(clinic)/layout.tsx`

### Full server-side waterfall per navigation

```
[MIDDLEWARE]
  auth.getUser()                                RTT  1  (sequential, every request)

[RSC render — (clinic)/layout.tsx]
  getSessionContext()                           RTTs 2–5  (4 sequential, React.cache)
    ├─ auth.getUser()
    ├─ is_platform_admin RPC
    ├─ profiles query
    └─ branch_members query

  [After session check passes — staff only]
  Promise.all([
    getUserBranches(),                          RTTs 6–7  (2 sequential inside)
    countUnreadNotifications(),                 RTT  6    (parallel with branches)
    getClinicCommercialShell(orgId),            RTTs 6–13 (4-8 sequential inside, dominates)
    hasLinkedProfessionalProfile(),             RTT  6+   (parallel start, 1 RTT for professionals)
  ])
```

### `getUserBranches` detail

`cache(async () => { requireSession() → branch_members → branches })`

- **`branch_members` is fetched twice per request**: once in `getSessionContext` (to resolve `activeMembership`) and again here (to enumerate branch IDs for the sidebar selector).
- This is the most concrete duplication opportunity in the codebase.

### `countUnreadNotifications` detail

`cache` → `getSessionContext()` (hits cache) → `count_unread_notifications()` RPC (1 RTT)

### `hasLinkedProfessionalProfile` detail

`getProfessionalForCurrentUser()` → `getSessionContext()` (cache) → `canUseFeature()` → `loadOrganizationEntitlementInput()` (cache) → `professionals` table query (1 RTT, conditional on feature flag)

### Critical-path RTT budget

| Phase | RTTs | Execution |
|---|---|---|
| Middleware `getUser` | 1 | Sequential |
| `getSessionContext` (4 calls chained) | 4 | Sequential |
| `getClinicCommercialShell` | 4–8 | Sequential *within* the function |
| `getUserBranches` (runs in parallel with shell) | 2 | Sequential *within*, parallel *with others* |
| `countUnreadNotifications` | 1 | Parallel with shell |
| `hasLinkedProfessionalProfile` | 1 | Parallel with shell |
| **Total (critical path)** | **11–13** | |

> The critical path is: Middleware (1) → getSessionContext (4) → getClinicCommercialShell sequential chain (6–8).  
> All four Promise.all arms start simultaneously *after* getSessionContext resolves, but `getClinicCommercialShell` is the long pole.

---

## 5. AppShell Prefetch

**File:** `apps/web/src/components/layout/app-shell.tsx` (client component)

### `PREFETCH_HREFS` (lines 22–30)

```ts
const PREFETCH_HREFS = [
  '/dashboard', '/agenda', '/sala-espera', '/pacientes',
  '/historia-clinica', '/consultas', '/farmacia',
] as const;
```

Prefetch is triggered via `useEffect` on shell mount:

```ts
useEffect(() => {
  for (const href of PREFETCH_HREFS) {
    if (isClinicPathEntitled(href, entitledHrefs)) {
      router.prefetch(href);
    }
  }
}, [router, entitledHrefs]);
```

- 7 routes, filtered by entitlement before prefetch — non-entitled routes are skipped.
- Each `router.prefetch(href)` triggers a Next.js App Router RSC payload fetch (GET with `?_rsc=...`). These execute the full server stack (including `getSessionContext` and `getClinicCommercialShell`) **but** React.cache deduplication does not apply across prefetch requests; they are independent HTTP requests with separate render contexts.
- Effective prefetch: **up to 7 concurrent RSC fetches** on shell mount, each consuming 11–13 Supabase RTTs on the server. At low DB latency this is cheap; at 30–50ms/RTT it becomes ~400–650ms server time per prefetch, multiplied by parallelism.

### `CommandPalette` — `PREFETCH_ON_OPEN` (line 112)

```ts
const PREFETCH_ON_OPEN = [
  '/dashboard', '/agenda', '/pacientes', '/historia-clinica',
  '/consultas', '/farmacia', '/pacientes/nuevo', '/agenda/nueva',
  '/farmacia/nueva', '/consultas/nueva', '/historia-clinica/nuevo',
] as const;
```

11 routes prefetched **on first palette open** via the same `router.prefetch` loop.

### Link `prefetch` defaults

- No `prefetch={false}` found on any `<Link>` in the codebase.
- Next.js App Router default: static segments prefetch on viewport entry; dynamic segments prefetch on hover.
- Sidebar `<Link href="/dashboard">` (logo) and all `ClinicSidebarNav` links use default prefetch — they will trigger RSC payload fetches as they enter the viewport.

---

## 6. `getClaims` vs `getUser` vs `getSession`

| Pattern | Found in codebase? | Location |
|---|---|---|
| `supabase.auth.getClaims()` | **No** | — |
| `supabase.auth.getSession()` | **No** | — |
| `supabase.auth.getUser()` | **Yes** | `middleware.ts:56`, `session.ts:21`, `actions/auth.ts:285` |
| `createServerClient` (anon) | Yes, ~80 files | All server actions, lib modules |
| `createServiceClient` (service role) | Yes | `lib/supabase/server.ts`, superadmin actions only |

**`getUser()` is consistently used everywhere** — correct for RLS-enforced server-side code. `getSession()` is not used (it only reads the local cookie without server-side JWT verification).

The `actions/auth.ts:getSessionContext()` re-export (line 319) is a transparent passthrough to `lib/session.ts:getSessionContext` — same `React.cache` instance.

---

## 7. `expire_due_subscriptions` — Call Sites

| Location | Call | Context |
|---|---|---|
| `apps/web/src/lib/entitlements/index.ts:87` | `supabase.rpc('expire_due_subscriptions', { p_organization_id })` | Application hot path — every entitlement load |
| `supabase/migrations/20260818183000_entitlements_phase8_ops.sql:79` | `public.expire_due_subscriptions(NULL)` | Inside `run_subscription_lifecycle_ops` admin function (service-role only) |
| `supabase/migrations/20260818170000_entitlements_phase7_lifecycle.sql:94` | `public.expire_due_subscriptions(NULL)` | Inside `process_subscription_renewal` |
| `supabase/migrations/20260818210000_entitlements_phase11_addon_lifecycle.sql:28,256` | internal | Addon lifecycle functions |
| `supabase/migrations/20260818240000_entitlements_phase14_seat_ops.sql:166,477` | internal | Seat ops functions |
| `supabase/migrations/20260818220000_entitlements_phase12_plan_renewal.sql:97,351` | internal | Plan renewal functions |
| `supabase/migrations/20260818320000_entitlements_phase25_metered_queues.sql:261` | internal | Metered queue functions |

**Key observation:** The only application-level call site is line 87 of `entitlements/index.ts`, inside `loadOrganizationEntitlementInput`. All other call sites are within server-side PL/pgSQL functions invoked by admin operations, not by end-user navigation.

**No `pg_cron` job exists** for scheduling expiry. Expiry is driven entirely by eager application-side calls on the navigation hot path.

---

## 8. `pg_cron` / Scheduled Job Patterns

A full search of all 182 migration files (`supabase/migrations/*.sql`) found **zero occurrences** of:
- `pg_cron`
- `cron.schedule`
- `cron.job`

There are no database-level scheduled jobs. All time-driven side effects (subscription expiry, trial expiry) are triggered on-demand by application code during user navigation.

---

## 9. Server-Timing

A full search of `apps/web/src/**` found **zero occurrences** of:
- `Server-Timing`
- `serverTiming`
- `x-server-timing`

No performance instrumentation headers are currently emitted. Waterfall data must be inferred from Supabase dashboard logs or Vercel function execution logs.

---

## Waterfall Diagram — Clinic Navigation (Staff, Active Subscription)

```
Timeline (each ─ ≈ 1 Supabase RTT, assumed ~10–30ms each)

CLIENT             NEXT.JS MIDDLEWARE         RSC RENDER / LAYOUT            SUPABASE
  │                        │                          │                          │
  │──── GET /agenda ───────►│                          │                          │
  │                        │──── auth.getUser() ───────────────────────────────►│ [RTT 1]
  │                        │◄──────────────────────────────────────────────────│
  │                        │─── pass ──────────────►  │                          │
  │                                                   │─── auth.getUser() ───►  │ [RTT 2]
  │                                                   │◄────────────────────────│
  │                                                   │─── is_platform_admin ──►│ [RTT 3]
  │                                                   │◄────────────────────────│
  │                                                   │─── profiles ───────────►│ [RTT 4]
  │                                                   │◄────────────────────────│
  │                                                   │─── branch_members ─────►│ [RTT 5]
  │                                                   │◄────────────────────────│
  │                                                   │                          │
  │                                          Promise.all starts                  │
  │                                          ┌────────┴──────────────────────┐  │
  │                                          │  getUserBranches              │  │
  │                                          │  │─── branch_members ────────►│  │ [RTT 6 — DUPLICATE]
  │                                          │  │◄──────────────────────────│  │
  │                                          │  │─── branches ──────────────►│  │ [RTT 7]
  │                                          │  │◄──────────────────────────│  │
  │                                          ├────────────────────────────────┤  │
  │                                          │  countUnreadNotifications     │  │
  │                                          │  │─ count_unread_notif ──────►│  │ [RTT 6]
  │                                          ├────────────────────────────────┤  │
  │                                          │  getClinicCommercialShell  ◄──┼── longest pole
  │                                          │  │─ expire_due_subscriptions►│  │ [RTT 6]
  │                                          │  │◄──────────────────────────│  │
  │                                          │  │─ Promise.all([            │  │
  │                                          │  │    features,              │  │
  │                                          │  │    org_subscriptions,     │  │ [RTT 7]
  │                                          │  │    org_feat_overrides,    │  │
  │                                          │  │    list_own_addon_feat,   │  │
  │                                          │  │  ])                       │  │
  │                                          │  │◄──────────────────────────│  │
  │                                          │  │─ plan_features ───────────►│  │ [RTT 8]
  │                                          │  │◄──────────────────────────│  │
  │                                          │  │─ list_own_checkout_intents►│  │ [RTT 9]
  │                                          │  │◄──────────────────────────│  │
  │                                          │  │─ list_own_addons ─────────►│  │ [RTT 10]
  │                                          │  │◄──────────────────────────│  │
  │                                          │  │─ Promise.all([            │  │
  │                                          │  │    list_own_seat_usage,   │  │ [RTT 11]
  │                                          │  │    feature_usage,         │  │
  │                                          │  │  ])                       │  │
  │                                          │  │◄──────────────────────────│  │
  │                                          ├────────────────────────────────┤  │
  │                                          │  hasLinkedProfessionalProfile  │  │
  │                                          │  │─ (entitlements: cached)   │  │
  │                                          │  │─ professionals ───────────►│  │ [RTT 6]
  │                                          └────────────────────────────────┘  │
  │                                                   │                          │
  │◄─────────────────── HTML response ────────────────│                          │
```

**Total sequential RTTs on critical path (middleware + getSessionContext + getClinicCommercialShell):**

| Segment | RTTs | Type |
|---|---|---|
| Middleware `getUser` | 1 | Sequential |
| `getSessionContext` | 4 | Sequential |
| `expire_due_subscriptions` | 1 | Sequential, first step in shell |
| `features + subscriptions + overrides + addons` batch | 1 | Parallel (1 RTT) |
| `plan_features` | 1 | Sequential, conditional |
| `list_own_open_checkout_intents` | 1 | Sequential |
| `list_own_addons` | 1 | Sequential |
| `seat_usage + feature_usage` batch | 1 | Parallel (1 RTT) |
| **Total** | **11** (happy path) / **13** (worst) | |

---

## Summary of Issues

| # | Issue | File | Severity |
|---|---|---|---|
| 1 | `expire_due_subscriptions` runs synchronously on every page load — no pg_cron offload | `entitlements/index.ts:87` | High |
| 2 | `getClinicCommercialShell` has 6–8 sequential RTTs internally | `entitlements/index.ts:429` | High |
| 3 | `branch_members` queried twice per request | `session.ts:45–51`, `settings.ts:696–701` | Medium |
| 4 | `getSessionContext` has 4 sequential RPCs (no Promise.all) | `session.ts:17–111` | Medium |
| 5 | All 7 `PREFETCH_HREFS` fire `router.prefetch()` on shell mount — each triggers full 11–13 RTT server render | `app-shell.tsx:79–84` | Medium |
| 6 | No `Server-Timing` headers — no observability on production navigation cost | — | Medium |
| 7 | `list_own_open_checkout_intents`, `list_own_addons`, seat/metered meters always fetched even when subscription is healthy and no banner is needed | `entitlements/index.ts:439–496` | Medium |
| 8 | No pg_cron for subscription expiry means stale states can persist until next navigation | — | Low-Medium |
| 9 | `CommandPalette` fires 11 `router.prefetch()` calls on first open | `command-palette.tsx:163–165` | Low |
| 10 | `hasLinkedProfessionalProfile` is in the Promise.all but itself calls `canUseFeature` → `loadOrganizationEntitlementInput` before the cached copy is guaranteed available (cache warms in parallel) | `professionals.ts:295–299` | Low |

---

## Optimization Directions (not yet implemented)

1. **Add pg_cron for `expire_due_subscriptions`**: schedule `SELECT public.expire_due_subscriptions(NULL)` every 15 minutes for all orgs. Remove the eager call from `loadOrganizationEntitlementInput`.

2. **Parallelize `getSessionContext`**: `is_platform_admin`, `profiles`, and `branch_members` are independent — move to `Promise.all`. Saves 2 RTTs on every request.

3. **Eliminate duplicate `branch_members` fetch**: pass `memberships` from `SessionContext` into `getUserBranches` or extend `SessionContext` to include branch details.

4. **Short-circuit `getClinicCommercialShell`**: move `list_own_open_checkout_intents`, `list_own_addons`, and meter queries into a lazy `Promise.all` keyed on whether a banner is even possible (e.g., no active subscription). Add a fast "is subscription healthy?" check before the full waterfall.

5. **Add `Server-Timing` headers**: instrument `getSessionContext`, `loadOrganizationEntitlementInput`, and `getClinicCommercialShell` with `Date.now()` deltas and emit via `headers()` from the layout.

6. **Reduce prefetch aggressiveness**: in `AppShell`, consider `prefetch={false}` on sidebar links not in `PREFETCH_HREFS`, or delay the `useEffect` to `requestIdleCallback`.

---

*Baseline captured from source — no live Supabase traces. Actual RTT values will depend on Vercel region ↔ Supabase region latency (typically 5–50ms per round-trip on same-continent deployments).*
