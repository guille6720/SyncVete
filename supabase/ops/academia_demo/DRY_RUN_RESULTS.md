# Academia Demo — disposable dry-run results

## Phase 5C.1 (security hardening) — 2026-10-18

**Schema source:** staging `owmcrqvnfubyjxrlyhlc` (reused dump)  
**Script:** `06_dry_run.ps1`  
**Staging writes:** none  

| Check | Result |
|-------|--------|
| Protect marker apply | PASS |
| Unauthorized marker INSERT blocked | PASS |
| Unauthorized marker UPDATE blocked | PASS |
| Auth/profile collision detectible | PASS |
| Maintainer marker INSERT allowed | PASS |
| Seed + approval gate | PASS |
| Idempotent re-seed | PASS |
| Active demo appointments = 5 | PASS |

## Prior Phase 5C baseline

See git history / previous package notes. Fresh-install differences vs live staging unchanged (no GoTrue/cron/webhooks; JWT stubbed).
