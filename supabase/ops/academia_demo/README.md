# Academia Demo SyncVete — seed plan (STAGING ONLY)

**Project:** `owmcrqvnfubyjxrlyhlc`  
**Status:** PREPARED — **DO NOT EXECUTE** until explicit authorization.  
**Production (`lhdksiptpsubktikdses`):** never apply.

## Goal

Isolated fictional clinic for Agenda video recording and Academia tours.

## Fictional scenario

| Entity | Value |
|--------|--------|
| Organization | Academia Demo SyncVete |
| Branch | Sucursal Demo |
| Professional | Dra. Ana Demo |
| Owner / tutor | María Ejemplo |
| Pet | Luna (canino) |
| Emails | `owner.demo@academia-demo.invalid`, `vet.demo@academia-demo.invalid`, `recepcion.demo@academia-demo.invalid` |

Reserved domain `@academia-demo.invalid` is non-deliverable (RFC 2606 style). No real SMTP/WhatsApp/notifications.

## Appointment week (relative to “today” when seeding)

| Day offset | Time | Status | Notes |
|------------|------|--------|-------|
| -1 | 09:30 | completed | Control Luna |
| 0 | 10:30 | confirmada | Consulta general Luna |
| 0 | 16:00 | programada | Vacunación (simulada) |
| +1 | 11:00 | programada | Control |
| +2 | 15:00 | cancelada | Ejemplo de cancelación |

## Safety rules

1. Confirm CLI `--project-ref owmcrqvnfubyjxrlyhlc` before any write.
2. Create auth users via Auth Admin API (not raw `auth.users` inserts).
3. Additive only — never update/delete other clinics.
4. Disable notification / WhatsApp side effects for demo users if triggers exist.
5. Wrap SQL in a transaction; keep `ROLLBACK` until authorized `COMMIT`.
6. Prefer isolated workspace migration apply pattern (Phase 4B), not repo-wide `db push`.

## Artifacts

- `01_seed_plan.sql` — schema-shaped outline (still `ROLLBACK`)
- `02_auth_users.ps1` — Auth Admin createUser sketch (staging service role; not run)
- `03_validation_queries.sql` — read-only checks after a future apply

## Authorization gate

Wait for explicit “execute Academia Demo seed on staging” before any database write.
