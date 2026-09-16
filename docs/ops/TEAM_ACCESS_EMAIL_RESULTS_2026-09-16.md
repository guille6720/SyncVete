# Team access email — invite existing users (2026-09-16)

## 1. Code path that skipped email

`apps/web/src/actions/settings.ts` → `inviteTeamMember`:

```ts
if (existingUser) {
  await add_team_member(...)
  return { mode: 'existing_added' } // NO email
}
```

UI (`professional-access-panel.tsx`) showed: “No se envía mail”.

## 2. SMTP (Supabase Staging Auth)

Configure **Authentication → SMTP** with sender `SyncVete <soporte@opusorg.com>`.  
Details: `docs/ops/STAGING_SMTP_TEAM_ACCESS_EMAIL.md`.

Transactional existing-user mail (server env): `RESEND_API_KEY` **or** `SMTP_*` + `MAIL_FROM_*`.

## 3. Files changed

- `apps/web/src/actions/settings.ts` — notify existing users; richer result modes
- `apps/web/src/lib/mail/*` — Resend/SMTP send, origin, rate-limit log
- `apps/web/src/components/professionals/professional-access-panel.tsx`
- `apps/web/src/components/settings/team-panel.tsx`
- `packages/shared/src/utils/team-access-email.ts` + tests
- `supabase/migrations/20260916200000_team_access_email_log.sql`
- `docs/ops/STAGING_SMTP_TEAM_ACCESS_EMAIL.md`

## 4. Provider / API

| Flow | Provider |
|---|---|
| New user | Supabase Auth `inviteUserByEmail` (Custom SMTP) |
| Existing user | Resend HTTP API **or** nodemailer SMTP (server-only) |

## 5. Tests

- `packages/shared/src/__tests__/team-access-email.test.ts`
- `apps/web/src/lib/mail/config.test.ts`

## 6. Manual staging QA

Pending human validation after SMTP/Resend env + migration applied (checklist in ops doc).

## 7. Commit

See git SHA after push.
