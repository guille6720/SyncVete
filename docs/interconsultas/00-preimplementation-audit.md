# Interconsultas — Pre-implementation Audit

**Date:** 2026-08-31  
**Base branch:** `staging/perf-phase-2-session`  
**Feature branch:** `feature/interconsultas-staging`  
**Environment:** STAGING ONLY — production Supabase untouched

## Verdict of audit

Safe to proceed with an **additive, isolated** module. No existing `interconsulta` / referral code found. Closest seams: Profesionales (nav/permissions/feature), Facturación (draft invoice items), Liquidaciones (source claims + locked statuses), WhatsApp (compose deep-link, not server send API).

---

## 1. Branch / environment

| Check | Result |
|-------|--------|
| Current base | `staging/perf-phase-2-session` @ `e77ccf5` |
| Feature branch | `feature/interconsultas-staging` (created from base) |
| Production work | Forbidden |
| Existing interconsulta refs | None |

---

## 2. Professionals permissions

| Item | Location |
|------|----------|
| Permission keys | `packages/shared/src/constants/index.ts` → `PERMISSIONS` |
| Role map | `ROLE_PERMISSIONS` |
| App gate | `apps/web/src/lib/permissions.ts` → `requirePermission` / `requirePermissionAndFeature` |
| DB gate | `public.has_permission(text)` (SECURITY DEFINER; updated in professionals phase1) |
| Labels | `packages/shared/src/constants/settings.ts` → `PERMISSION_LABELS` |

**Existing professionals-related keys:**

- `professionals:read` / `professionals:write`
- `professional_compensation:read` / `professional_compensation:write`
- `professional_settlements:read` / `professional_settlements:approve` / `professional_settlements:pay`

**Decision for Interconsultas:** introduce dedicated keys (not only map to professionals write):

- `interconsultations:read`
- `interconsultations:write`
- `interconsultations:approve`
- `interconsultations:billing`

Assigned to: owner/admin (all); veterinarian (read/write); receptionist (read); cashier (read + billing, with `billing:write` for invoice attach).

---

## 3. Entitlements

| Item | Detail |
|------|--------|
| Professionals feature today | `professionals.settlements` (`FEATURES.PROFESSIONALS_SETTLEMENTS`) |
| Nav map | `NAV_FEATURE_BY_HREF` in `packages/shared/src/constants/features.ts` |
| Layout filter | `getClinicEntitledHrefs` → sidebar filter (no global blocking query beyond existing entitlements resolve) |

**Decision:** new feature key `professionals.interconsultations` (`FEATURES.PROFESSIONALS_INTERCONSULTATIONS`).  
Enable on active staging plans (same pattern as settlements). Map `/interconsultas` in `NAV_FEATURE_BY_HREF`. Module layout via `FeatureModuleLayout`.

---

## 4. Sidebar / navigation

| File | Role |
|------|------|
| `apps/web/src/components/layout/clinic-sidebar-nav-catalog.ts` | Item catalog |
| `apps/web/src/components/dashboard/dashboard-nav-catalog.ts` | Groups (`professionals`) |
| `apps/web/src/components/layout/clinic-sidebar-nav.tsx` | Client UI |
| `apps/web/src/app/(clinic)/layout.tsx` | Entitled hrefs + my-settlements flag |

**Current Professionals children:** Profesionales, Liquidaciones, Mis liquidaciones.

**Target insert:** Interconsultas between Profesionales and Liquidaciones. Additive catalog entry only — no sidebar rewrite.

---

## 5. Supabase server client / tenancy

| Symbol | Path |
|--------|------|
| `createServerClient` | `apps/web/src/lib/supabase/server.ts` (cookie session) |
| `createServiceClient` | same (service role; cron/admin/external-token only) |
| `getSessionContext` | `apps/web/src/lib/session.ts` |

Session stamps `organizationId` / `branchId`. Never trust browser `organization_id`. Inserts always use `session.organizationId`. RLS uses `get_user_organization_id()`.

---

## 6. RLS helpers (reuse)

- `auth.uid()`
- `public.get_user_organization_id()`
- `public.has_permission(text)`
- `public.user_has_branch_access(uuid)`
- `public.is_clinic_staff()`

Professionals tables use **ENABLE + FORCE ROW LEVEL SECURITY**. Interconsultas tables will match.

---

## 7. Audit

- Table: `public.audit_logs`
- Writer: trigger `public.audit_log_changes()` on INSERT/UPDATE/DELETE
- Domain “events” are CRUD entity changes; summaries via `audit_event_summary`
- Will attach audit triggers on interconsulta tables (no full clinical payloads beyond existing summary policy)

---

## 8. Notifications

- Emitter: `public.emit_notification(...)`
- Optional for quote accepted / completed; not required for MVP if audit + UI status suffice
- Kind `liquidacion` already exists for settlements

---

## 9. WhatsApp

**Architecture:** compose + log + `wa.me` deep link — **not** a server WhatsApp Business API.

| Layer | Path |
|-------|------|
| Templates | `packages/shared/src/constants/whatsapp.ts` |
| Actions | `apps/web/src/actions/whatsapp.ts` → `logWhatsAppMessage` |

**Decision:** add prepared templates / `mensaje_libre` bodies for request/accepted/completed; return deep-link URL. Do **not** fake automatic delivery.

---

## 10. Facturación

| Piece | Detail |
|-------|--------|
| Tables | `invoices`, `invoice_items`, `payments` |
| Mutable status | `borrador` only for item edits |
| Recalc | RPC `recalc_invoice_totals` |
| Actions | `apps/web/src/actions/billing.ts` |

**Decision:** `interconsultation_billing_links` with `pending` → clinic action “Agregar a facturación” creates/attaches line to a **draft** invoice only. Never mutate `emitida` / `pagada` / `anulada`. Unique claim on `interconsultation_id` prevents double billing.

---

## 11. Professional settlements

| Piece | Detail |
|-------|--------|
| Locked statuses | `approved`, `partially_paid`, `paid` (`SETTLEMENT_LOCKED_STATUSES`) |
| Double-claim | `professional_settlement_source_claims` |
| Source enum | `settlement_item_source_type` (extend with `interconsultation`) |

**Decision:** on complete → `interconsultation_settlement_links` status `pending`. Attach only to **draft** settlements via adjustment/item + source claim. Never auto-edit locked settlements.

---

## 12. Isolation from Consultas

| Rule | Enforcement |
|------|-------------|
| No reuse of `/consultas` | New route `/interconsultas` |
| No reuse of consultations tables | New `interconsultation_*` tables |
| No layout critical-path queries | Feature already in entitled-hrefs resolve; no extra layout fetch |
| No global prefetch | Do not add to app-shell prefetch list |

---

## 13. Risks / open product decisions (documented)

| ID | Topic | Safe default |
|----|-------|--------------|
| P1 | Veterinarian can write but not approve quotes | `interconsultations:approve` = owner/admin only |
| P1 | External portal auth | Token hash + expiry; service-role RPC scoped to one request |
| P2 | Settlement auto-calc inclusion | Manual attach first; enum value reserved for later calculate rules |
| P2 | WhatsApp auto-send | Deep link only |

---

## 14. Implementation order

1. Migration (tables, RLS, feature, permissions, token RPCs)
2. Shared constants / schemas / types
3. Server actions
4. Clinic UI + sidebar + entitlement
5. External responder route
6. Billing + settlement attach actions
7. WhatsApp prepare helpers
8. Tests + docs + quality gates
