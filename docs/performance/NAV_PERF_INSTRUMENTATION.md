# SyncVete — Navigation perf instrumentation (STAGING)

Temporary measurement only. No behavioral optimizations in this pass.

## How to measure

1. Open Preview / Staging clinic app.
2. Enable overlay: add `?perf=1` to the URL **or** in DevTools console:
   ```js
   localStorage.setItem('sv-perf', '1')
   location.reload()
   ```
3. Click sidebar: Dashboard → Pacientes → Agenda → Sala de espera → Profesionales → Configuración.
4. Read the amber **SV_PERF** panel (bottom-right) and the browser console (`[SV_PERF]` / `console.table`).

## What each mark means

| Mark | Meaning |
|------|---------|
| `clientClickToShellMs` | Click → clinic layout props arrived (perceived shell wait) |
| `mw-auth` | Middleware `getUser` (Server-Timing / `x-sv-mw-auth-ms`) |
| `session.getUser` | Second `getUser` inside RSC session |
| `session.bootstrap` | `get_session_bootstrap` RPC |
| `session.total` | Full session loader |
| `branches.*` | `getUserBranches` (memberships + branches) |
| `entitlements.input` | Features/subscription/overrides/addons load |
| `entitlements.hrefs` | Resolve entitled nav hrefs |
| `professional.linkCheck` | Linked professional row check |
| `layout.parallelShell` | Parallel branches + entitlements + professional |
| `layout.total` | Entire clinic layout critical path |
| `page.dashboard.*` | Extra blocking work on Dashboard only |

## Network check (P0 hard-nav test)

DevTools → Network → click Pacientes:

- Soft nav (expected): RSC/`fetch` to same route, **no** full Document navigation.
- Hard nav (bug): new Document request for `/pacientes`.

Also inspect response header `Server-Timing: mw-auth;dur=…` on Preview.

## Disable

```js
localStorage.removeItem('sv-perf')
```

Or remove `?perf=1`. Server logs still emit on Preview / `SYNC_VETE_PERF_TIMING=1` / local `development`.
