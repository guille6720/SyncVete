# SyncVete Staging — Custom SMTP & team access emails

## Product behavior

| Case | Auth user | Email |
|---|---|---|
| New email | `inviteUserByEmail` (Supabase Auth) | Auth invite via **Supabase Custom SMTP** |
| Existing email | Link via `add_team_member` only | Transactional notification via **Resend or app SMTP** |

Sender (transactional + Auth):

- Name: `SyncVete`
- Address: `soporte@opusorg.com`

Do not set a different From in the browser. Configure the verified sender in the provider.

## Supabase Auth → SMTP (SyncVete-Staging)

Dashboard → **Authentication → Emails → SMTP Settings** (Custom SMTP):

| Field | Staging value |
|---|---|
| Host | Your provider SMTP host (e.g. `smtp.resend.com` / Google / SES) |
| Port | `587` (STARTTLS) or `465` (SSL) |
| Username | Provider SMTP user |
| Password | Provider SMTP password / API SMTP pass |
| Sender email | `soporte@opusorg.com` |
| Sender name | `SyncVete` |

Also set Auth email templates redirect URLs to the staging app origin (`NEXT_PUBLIC_APP_URL`).

### Domain verification (opusorg.com)

Confirm at your DNS / email provider:

- **SPF** includes the SMTP provider
- **DKIM** records for the provider
- **DMARC** (recommended) `v=DMARC1; p=none` or stricter once stable

Without SPF/DKIM, invites land in spam or fail.

## App env (Vercel Preview / Staging) — transactional existing-user mail

Either:

```bash
RESEND_API_KEY=re_xxx
MAIL_FROM_EMAIL=soporte@opusorg.com
MAIL_FROM_NAME=SyncVete
NEXT_PUBLIC_APP_URL=https://<staging-preview-host>
```

Or SMTP (can mirror Supabase Custom SMTP credentials — **server-only**):

```bash
SMTP_HOST=...
SMTP_PORT=587
SMTP_USER=...
SMTP_PASS=...
MAIL_FROM_EMAIL=soporte@opusorg.com
MAIL_FROM_NAME=SyncVete
NEXT_PUBLIC_APP_URL=https://<staging-preview-host>
```

Never put SMTP/Resend secrets in `NEXT_PUBLIC_*`.

## Code path that previously skipped email

`inviteTeamMember` → `if (existingUser) { add_team_member; return mode: 'existing_added' }`  
with **no** send. UI text: “No se envía mail”.

Now: after link, send `existing_access` notification; return  
`existing_notified` | `existing_linked_email_failed`.

## Manual staging QA

1. Apply migration `20260916200000_team_access_email_log.sql`.
2. Configure Supabase Custom SMTP + Vercel env (`RESEND_API_KEY` or SMTP_*).
3. Invite **new** email from Profesional → expect Auth invite email; UI “Invitación enviada”.
4. Invite **existing** SyncVete user → expect notification email; UI “vinculado y enviamos notificación”.
5. Break API key temporarily → membership still created; UI “agregado… no pudimos enviar el email”.
6. Confirm From is SyncVete / soporte@opusorg.com; body has staging login URL; no plaintext password.
