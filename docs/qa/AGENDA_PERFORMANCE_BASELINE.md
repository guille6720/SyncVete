# Agenda performance baseline (pre-optimization)

**Repo:** guille6720/SyncVete  
**Scope:** Appointment / Agenda module (`/agenda`)  
**Environment target:** Staging only  
**Date:** 2026-08-27  
**Branch context:** `staging/perf-phase-2-session`

## Goal of this document

Capture the measured architecture **before** performance changes so later results can be compared without optimizing blindly.

## Entry points

| Path | Role |
|------|------|
| `apps/web/src/app/(clinic)/agenda/page.tsx` | Server Component: parses `searchParams`, loads all Agenda data |
| `apps/web/src/app/(clinic)/agenda/loading.tsx` | Full-route `RouteLoading` board skeleton on segment navigation |
| `apps/web/src/app/(clinic)/agenda/layout.tsx` | Feature entitlement gate only |
| `apps/web/src/components/appointments/appointments-agenda.tsx` | Client UI: filters + `router.push` + `useTransition` |
| `apps/web/src/components/appointments/appointments-week-nav.tsx` | Prev/next via `<Link>` (full soft navigation) |
| `apps/web/src/components/appointments/appointments-calendar-views.tsx` | Day/week/month; month cells use `<Link>` |

## Request waterfall — open `/agenda`

```
middleware (auth cookie refresh)
└─ (clinic)/layout
     ├─ getSessionContext              [MISS: auth + profile + memberships + is_platform_admin]
     ├─ getUserBranches                [MISS: branch_members + branches]
     ├─ entitlements shell             [MISS: expire RPC + features/subs/overrides/addons]
     └─ extras (notifications, professional link)
        └─ agenda/layout FeatureModuleLayout (session + appointments feature HIT)
           └─ agenda/page.tsx
                ├─ getSessionContext [HIT]
                ├─ Promise.all
                │    ├─ listAppointmentsCalendar → RPC list_appointments_calendar   ← HOT
                │    ├─ getAssignableStaff → branch_members + profiles
                │    ├─ getUserBranches [HIT]
                │    ├─ canReadWaitingRoom
                │    ├─ canManageWaitingRoom
                │    ├─ canManageConsultations
                │    ├─ canReadBilling
                │    └─ canReadVaccinations
                └─ await listWaitingRoom({ date })   ← SEQUENTIAL WATERFALL
                     → RPC list_waiting_room (full joined queue ~20 columns)
```

### Estimated unique Supabase round-trips (cold Agenda entry)

| Bucket | Approx calls | Notes |
|--------|--------------|-------|
| Session | 3–4 | Deduped per request via `React.cache` |
| Entitlements | 5–6 | Deduped after first layout load |
| Branches | 2 | Deduped if layout already loaded |
| Calendar RPC | 1 | Dominant payload |
| Assignable staff | 2 | Not reused across navigations (cache resets) |
| 5× `can*` | ~0 after cache | Still sequential async wrappers |
| Waiting room | 1 | **After** Promise.all — waterfall |
| **Total cold** | **~16–20** | Layout + page |
| **Page-local meaningful** | **~8–10** | Calendar + staff + WR + permission wrappers |

## Navigation cost — Day ↔ Week ↔ Month / Prev ↔ Next / Filters

**Mechanism today**

1. Client builds new query string (`date`, `week`, `month`, `view`, `status`, `assigned`, `branch`, `q`).
2. `startTransition(() => router.push(...))` **or** `<Link href=...>`.
3. Next.js soft-navigates → **re-runs** `agenda/page.tsx` RSC.
4. `agenda/loading.tsx` can blank the board (`RouteLoading`).
5. React `cache()` **does not** survive across requests → session/entitlements/staff reload.

**Result:** every calendar interaction feels like a full page data reload even though toolbar markup is similar.

| Interaction | Server re-fetch? | Static metadata reloaded? | Dynamic only? |
|-------------|------------------|---------------------------|---------------|
| Open `/agenda` | Yes | Yes | Yes |
| Change day | Yes | Yes (staff, branches, 5× can*) | Yes |
| Change week/month | Yes | Yes | Yes |
| Filter professional/branch/status/q | Yes | Yes | Yes |

## Static vs dynamic classification (baseline)

### Effectively static during an Agenda session

- `canWrite` (`appointments:write` + appointments feature)
- `canStartConsultation` (`clinical:write` + consultations feature)
- `canCheckInWaitingRoom` / `canReadWaitingRoom`
- `canBilling` / `canVaccination`
- Assignable staff list
- User branches

### Dynamic (must refetch on date/view/filter)

- Appointments for selected range (`list_appointments_calendar`)
- Waiting-room status map / waiting count for selected day

## Duplicated / wasteful work

1. **Sequential WR after calendar** — independent of appointments list; should be parallel.
2. **Full WR queue RPC** for Agenda badges — only needs `appointment_id` + `waiting_room_status` (+ waiting count).
3. **Five separate `can*` server actions** — each re-enters permission/feature helpers; RBAC half already on `session.permissions`, feature half already in cached entitlements.
4. **Staff + branches reloaded** on every `searchParams` change.
5. **Suspense around `AppointmentsAgenda` is a no-op** — page awaits all data before render.
6. **`loading.tsx` full board** amplifies perceived reload.
7. **Fallback `listAppointments`** ignores `query` / day-accurate range when calendar RPC fails.

## RPC / SQL notes

### `list_appointments_calendar`

- Migration: `supabase/migrations/20260827010000_appointments_module_complete_phase1.sql`
- Filters: org, date range (Argentina TZ), optional branch/status/assignee/query
- Returns joined patient/owner/assignee + reminder/payment/room fields
- No `select('*')` in app path (RPC)

### Indexes already present (appointments)

- `(organization_id, starts_at) WHERE deleted_at IS NULL`
- `(branch_id, starts_at) WHERE deleted_at IS NULL`
- `(assigned_user_id, starts_at) WHERE …`
- `(organization_id, status, starts_at) WHERE deleted_at IS NULL`
- Overlap helper index on assignee range

**Baseline verdict on indexes:** coverage for Agenda hot filters is adequate; no blind new index without EXPLAIN evidence.

### `list_waiting_room`

- Returns full board row shape (~20 columns)
- Agenda only maps `appointment_id` → `waiting_room_status`

## Security constraints (must preserve)

- RLS / tenant isolation
- Feature entitlements (not permission-only shortcuts that skip plan gates)
- No global PHI cache across requests/tenants
- Request-scoped `React.cache` only

## Optimization plan (next phases)

1. Split shell (static) vs dynamic loaders.
2. Resolve Agenda capability flags from `session.permissions` + cached entitlements snapshot (keep feature checks).
3. Parallelize WR with calendar; slim WR status query/RPC.
4. Client-owned navigation: immediate UI update + localized calendar pending; sync URL without full RSC refetch for day/week/month/filters.
5. Prefetch adjacent day/week lightly.
6. Tests + staging QA report.

## Baseline verdict

**FAIL for “nearly instant” navigation** — architecture forces full RSC + static metadata reload on every Agenda interaction. Ready for Phase 2+ changes on **staging only**.
