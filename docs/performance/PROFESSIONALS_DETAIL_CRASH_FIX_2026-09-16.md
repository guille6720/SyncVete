# Profesionales detail crash + nav instrumentation (2026-09-16)

Branch: `staging/perf-navigation`

## 1. Root cause of digest `1804882475`

**Primary:** `/profesionales/[id]` unconditionally awaited `getAssignableStaff()`, which called `requirePermission('appointments:read')` and **threw `PermissionError`** when the signed-in role could read professionals but lacked appointments read. That unhandled throw became the Next.js server exception (digest).

**Amplifiers:**
- Same page blocked on settlements RPC, compensation schemes/rules, schedules, org, branches, audit — all before first paint (~4s skeleton then crash).
- Optional DB/RPC failures in that `Promise.all` also took down the whole route.

## 2. Files changed

- `apps/web/src/actions/appointments.ts` — soft-fail assignable staff (no PermissionError)
- `apps/web/src/app/(clinic)/profesionales/[id]/page.tsx` — critical identity only + Suspense
- `apps/web/src/app/(clinic)/profesionales/[id]/loading.tsx` — detail loading
- `apps/web/src/components/professionals/professional-detail-body.tsx` — streamed secondary data + soft optional loads
- `apps/web/src/components/professionals/professional-history-panel.tsx` — audit soft-fail
- `apps/web/src/actions/professionals.ts` — summary list schema soft-fail + timing
- `apps/web/src/actions/professional-settlements.ts` — missing RPC → empty page
- `apps/web/src/lib/perf/nav-timing.ts` — `svPerfOperation` log format
- Instrumentation on dashboard, agenda, pacientes, sala-espera, profesionales list
- `docs/performance/STAGING_SCHEMA_PROFESSIONALS_CHECK.md`

## 3. Queries/RPCs that were blocking navigation (detail)

| Operation | Class after fix |
|---|---|
| `canReadProfessionals` / `getProfessional` | **A** critical |
| `getAssignableStaff` (was throwing) | **B** soft, streamed |
| `getUserBranches`, `listProfessionalBranches` | **B** streamed |
| `getProfessionalAccessState` | **B** streamed |
| `getProfessionalSettlementSummary` | **B** streamed |
| `listCompensationSchemes` + N rules | **B** streamed |
| `list_professional_settlements` RPC | **B** streamed / empty if missing |
| schedules / time blocks | **B** streamed |
| audit history | **B** nested Suspense |

## 4. Before / after (est.)

| Metric | Before | After |
|---|---|---|
| Detail crash | yes (digest) | no — empty sections if optional fails |
| Time to identity on warm nav | ~4s then error | target &lt;500ms shell (getProfessional only) |
| Full secondary payload | blocked first paint | streams after shell |

Fill live numbers from Preview `[SV_PERF] route=/profesionales/[id] operation=…`.

## 5. Staging migrations

No new migration required for the crash fix (app-side). Ensure Staging has objects listed in `STAGING_SCHEMA_PROFESSIONALS_CHECK.md`. Existing migrations to apply if missing:

- `20260915000000_professionals_profile_fields.sql`
- `20260915010000_professional_settlement_snapshot.sql`
- `20260827200000_expire_subscriptions_job.sql`
- `20260827210000_session_bootstrap_rpc.sql`

## 6. Remaining bottlenecks

- Clinic layout still loads entitled hrefs on every hop
- Double `getUser` (middleware + RSC)
- Heavy module loaders (agenda bootstrap, WR board, professionals summary aggregations)
- Compensation rules still N+1 per scheme (streamed, not on critical path)

## 7. Security

- Authz for professionals remains fail-closed (`canReadProfessionals` / `requirePermissionAndFeature` on writes)
- Assignable staff returns `[]` without appointments:read (no privilege escalation)
- No service-role exposure
