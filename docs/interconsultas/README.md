# Interconsultas

Isolated module for requesting opinions/services from internal or external professionals.

**Route:** `/interconsultas` (clinic) · `/interconsulta/responder/[token]` (external)  
**Feature key:** `professionals.interconsultations`  
**Environment:** Staging only until explicitly promoted.

## Architecture

- Does **not** reuse `/consultas` or clinical consultation tables.
- Lives under the Professionals sidebar group.
- Organization tenancy via session `organizationId` + FORCE RLS.
- External access via opaque token (SHA-256 hash stored; raw token never persisted).

## Tables

| Table | Purpose |
|-------|---------|
| `interconsultations` | Header / clinical ask / commercial totals |
| `interconsultation_requests` | One row per invited professional |
| `interconsultation_quotes` | Quotes per request |
| `interconsultation_responses` | Professional clinical response |
| `interconsultation_billing_links` | Pending → invoiced claim |
| `interconsultation_settlement_links` | Pending → linked settlement claim |

Migration: `supabase/migrations/20260831120000_interconsultations_module.sql`

## Statuses

**Interconsultation:** draft → requesting → quotes_received → approved → in_progress → completed (or cancelled)

**Request:** pending → sent → viewed → quoted → accepted | declined | expired | cancelled

**Quote:** pending → submitted → accepted | rejected | withdrawn

## Permissions

| Permission | Roles (default) |
|------------|-----------------|
| `interconsultations:read` | owner, admin, veterinarian, nurse, receptionist, cashier, readonly |
| `interconsultations:write` | owner, admin, veterinarian |
| `interconsultations:approve` | owner, admin |
| `interconsultations:billing` | owner, admin, cashier |

## Entitlements

- Feature: `professionals.interconsultations`
- Enabled on all **active** plans in the migration (Staging QA).
- Nav href `/interconsultas` mapped in `NAV_FEATURE_BY_HREF`.
- Module layout uses `FeatureModuleLayout`.

## Workflow

1. Clinic creates interconsultation (patient + motive + markup).
2. Sends to one/many professionals (internal and/or external).
3. Secure links generated; WhatsApp/email are **prepared**, not auto-sent.
4. Professionals submit quotes via token portal.
5. Clinic compares quotes and accepts one (others rejected/cancelled).
6. Accepted professional submits response.
7. Clinic marks completed → pending billing + pending settlement (internal pro).
8. Clinic explicitly “Agregar a facturación” (draft invoice only).
9. Clinic explicitly links pending settlement to a **draft** settlement.

## Billing integration

- Completing creates `interconsultation_billing_links` status `pending`.
- Attach adds an invoice item via existing `invoice_items` + `recalc_invoice_totals`.
- Only `borrador` invoices; unique active link prevents double billing.

## Settlement integration

- Completing with internal professional creates pending settlement link.
- Attach adds `professional_settlement_adjustments` bonus to a **draft** settlement.
- `professional_settlement_source_claims` with `source_type = interconsultation` prevents double settlement.
- Never mutates approved / partially_paid / paid settlements.

## External token security

- `randomBytes(32)` base64url token.
- Store `sha256` hex only.
- TTL default 14 days.
- SECURITY DEFINER RPCs scoped to the single request/token.
- No clinic dashboard access; no enumeration of other records.

## WhatsApp

Compatible with existing compose/deep-link architecture only:

- Prepared message bodies on send/resend.
- Copy-to-clipboard in UI.
- No fake Business API integration.

## Performance

- No extra blocking query in clinic layout (uses existing entitled-hrefs resolve).
- No global prefetch of Interconsultas.
- List selects explicit columns; KPIs are count heads; detail loads related rows in `Promise.all`.
- Indexes on org/status/created_at, patient, request/quote statuses, billing/settlement pending.

## Rollback

1. Remove nav item / feature flag from app deploy.
2. Optionally disable `plan_features` for `professionals.interconsultations`.
3. Tables are additive; drop only after confirming no production dependency:

```sql
-- destructive — Staging only
DROP TABLE IF EXISTS public.interconsultation_settlement_links CASCADE;
DROP TABLE IF EXISTS public.interconsultation_billing_links CASCADE;
DROP TABLE IF EXISTS public.interconsultation_responses CASCADE;
DROP TABLE IF EXISTS public.interconsultation_quotes CASCADE;
DROP TABLE IF EXISTS public.interconsultation_requests CASCADE;
DROP TABLE IF EXISTS public.interconsultations CASCADE;
```

Do **not** run rollback on production.
