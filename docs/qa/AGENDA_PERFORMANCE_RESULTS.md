# Agenda performance results (post-optimization)

**Repo:** guille6720/SyncVete  
**Scope:** Appointment / Agenda module (`/agenda`)  
**Environment:** Staging only (no production/main deploy in this workstream)  
**Date:** 2026-08-27  
**Baseline:** `docs/qa/AGENDA_PERFORMANCE_BASELINE.md`

## Verdict

**PASS WITH WARNINGS**

Agenda navigation is ready for **human validation on staging**. Day/week/month and filter changes no longer remount the full RSC page; shell metadata stays client-side; calendar/WR fetch is localized.

Warnings (non-blocking for staging QA):

1. Month view still uses the same `list_appointments_calendar` RPC (not a separate ultra-lite month payload). Acceptable for current UI (side panel needs full row fields).
2. Adjacent day/week prefetch can add 2 background round-trips after settle — capped by an in-memory client cache (24 entries).
3. Lite WR RPC was applied on linked **Staging**; Production was not modified.
4. Manual regression matrix (roles/tenant) still requires human smoke on staging Preview.

## Baseline architecture

- Every `searchParams` change → `router.push` / `<Link>` → full `agenda/page.tsx` RSC reload
- Parallel fan-out of calendar + staff + branches + 5× `can*` then **sequential** `listWaitingRoom`
- Full WR board RPC (~20 columns) for badges
- `loading.tsx` could blank the board during soft nav

## Final architecture

```
SSR /agenda (once per entry)
  getAgendaBootstrap
    session + entitlements (cached)
    Promise.all(staff, branches, calendar RPC, WR statuses lite)

Client Agenda session
  toolbar / filters / view buttons stay mounted
  navigate → immediate local state + history.replaceState
  calendar area shows localized pending
  getAgendaDynamicData(appointments + WR statuses only)
  prefetch prev/next day|week into memory cache
```

## Queries before vs after

| Interaction | Before (meaningful page trips) | After |
|-------------|-------------------------------|-------|
| Open `/agenda` | Calendar + staff + branches + 5× can* + WR sequential (~8–10 page-local) | Bootstrap parallel: staff + branches + calendar + WR lite (~4 dynamic + session/ents cache) |
| Change day/week/month | Full page reload of all of the above | **1–2**: `list_appointments_calendar` + optional WR lite |
| Change filters | Full page reload | Same 1–2 dynamic only |
| Static permissions/staff/branches | Reloaded every nav | Loaded once per Agenda entry (SSR shell props) |

## Waterfalls removed

- Waiting-room fetch no longer waits for calendar Promise.all completion (parallel inside `getAgendaDynamicData`).
- Initial SSR: staff/branches/calendar/WR start together after capability flags from `session.permissions` + cached entitlements.

## Duplicated calls removed

- Removed per-nav `canReadWaitingRoom` / `canManageWaitingRoom` / `canManageConsultations` / `canReadBilling` / `canReadVaccinations` wrappers.
- Capability flags now: `session.permissions.includes(...)` **and** `canUseResolvedFeature(entitlements, …)` (feature gating preserved).

## RPC changes

| Change | File |
|--------|------|
| New lite WR RPC | `supabase/migrations/20260827120000_agenda_waiting_room_status_lite.sql` |
| App caller + fallback | `listWaitingRoomStatusesForAgenda` in `waiting-room.ts` |

Returns only `appointment_id`, `waiting_room_status`. Falls back to mapping full `list_waiting_room` if RPC missing.

## Migrations

- **Created:** `20260827120000_agenda_waiting_room_status_lite.sql` (reversible via `DROP FUNCTION`)
- **Applied:** Staging (linked project) during this workstream
- **Not applied:** Production
- **Indexes:** Inspected existing appointment indexes; **no new index** (coverage adequate for org/branch/starts_at/assignee/status + soft-delete partials)

## Files modified / added (Agenda scope + docs)

**Added**

- `apps/web/src/actions/agenda-data.ts`
- `apps/web/src/components/appointments/agenda-types.ts`
- `apps/web/src/components/appointments/agenda-performance.test.ts`
- `packages/shared/src/__tests__/agenda-range.test.ts`
- `supabase/migrations/20260827120000_agenda_waiting_room_status_lite.sql`
- `docs/qa/AGENDA_PERFORMANCE_BASELINE.md`
- `docs/qa/AGENDA_PERFORMANCE_RESULTS.md`

**Updated**

- `apps/web/src/app/(clinic)/agenda/page.tsx`
- `apps/web/src/app/(clinic)/agenda/loading.tsx` (comment: only for module entry)
- `apps/web/src/components/appointments/appointments-agenda.tsx`
- `apps/web/src/components/appointments/appointments-week-nav.tsx`
- `apps/web/src/components/appointments/appointments-calendar-views.tsx`
- `apps/web/src/actions/waiting-room.ts`
- `packages/shared/src/utils/appointments.ts` (range helpers)

## Tests added

- Shared: day/week/month range resolution, shifts, month bounds
- Web: WR status mapping + shell capability shape

## Quality gates

| Gate | Result |
|------|--------|
| `npm run typecheck --workspace=@sincvete/web` | PASS |
| `npm run typecheck --workspace=@sincvete/shared` | PASS |
| `npm run lint --workspace=@sincvete/web` | PASS |
| `npm run test:unit --workspace=@sincvete/web` | PASS (12) |
| `npm run test:unit --workspace=@sincvete/shared` | PASS (423) |
| `npm run build --workspace=@sincvete/web` | (see CI/local build log) |

## Remaining bottlenecks

1. Cold entry still pays clinic layout session/entitlements cost (out of Agenda-only scope).
2. Month ranges can return larger appointment sets than day/week.
3. Prefetch traffic on rapid scrubbing (mitigated by cache + request id).
4. Client `history.replaceState` means browser back/forward may not re-trigger fetch unless later wired to `popstate`.

## Risks

- Schema drift if Staging has lite RPC and another env does not → fallback path exists.
- Deep-link refresh still SSR-boots correctly; in-session URL updates do not re-run RSC (intentional).

## Recommended next steps

1. Human smoke on staging Preview using Phase 11 checklist.
2. Optional: `popstate` listener to keep back/forward in sync with client Agenda state.
3. Optional: month-lite RPC if month payloads become the next dominant cost.
4. Only after staging sign-off: promote migration + app to production in a dedicated change.

## Staging readiness

**Yes — ready for human validation on staging.** Do not merge to main / deploy production until smoke checklist is signed off.
