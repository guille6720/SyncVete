# Interconsultas — Security Notes (Staging)

## Cross-tenant

- All clinic tables: `organization_id = get_user_organization_id()` + FORCE RLS.
- App never trusts browser `organization_id`; stamps `session.organizationId`.

## External token

- Raw token only in URL; DB stores SHA-256 hex.
- RPCs: `get_interconsultation_by_token`, `submit_interconsultation_quote_by_token`, `submit_interconsultation_response_by_token`.
- Invalid / expired / cancelled tokens return safe Spanish errors without leaking existence of other rows.

## Billing / settlement claims

- Unique partial indexes on active billing and settlement links.
- Settlement also uses `professional_settlement_source_claims (organization_id, source_type, source_id)`.

## Permissions

Dedicated keys; see README. Approve and billing are narrower than write.
