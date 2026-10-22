# Owner mobile app — staging update

The prior implementation already contained secure owner invitations, owner-scoped clinical data, vaccination calendars, appointment slots, branding, and reminder generation. This update completes the mobile presentation and installation entry point inside SyncVete.

## User flow

1. In SyncVete, open **Propietarios → owner → App del propietario → Enviar app por WhatsApp**. The system prepares a message; the staff member sends it in WhatsApp.
2. An invited owner opens the private link, sees the clinic branding and activates the account. Activation comes before installation so the installed app never needs to retain an invitation token.
3. Inside the portal, install the clinic app. The manifest keeps its clinic-specific identity and opens `/portal/instalar/<organization>` on launch. This public page shows installation instructions and a branded owner login, without displaying clinical data.
4. The owner uses **Inicio, Mascotas, Salud, Turnos, Avisos**. Data comes from the existing owner-scoped RPCs; no pets or clinical records are duplicated.
5. For owners with active access, sharing the app sends the installation URL and does not rotate an invitation. Revocation remains available in the existing Portal del tutor card.

The install name, logo, main color and welcome text use the clinic's existing App de propietarios settings. Clinic contact information comes from its existing profile. The fallback icon contains a paw and clinic initials. Android uses its native installation prompt when available, with manual guidance otherwise; iPhone uses Safari's Add to Home Screen. The footer reads **Hecho por OpusOrg**.

## Screens and limits

- Dashboard: pets, next appointment, vaccines, quick actions and clinic contact details.
- Pets: existing clinical/pet detail pages.
- Health: vaccine calendar plus a read-only treatment/evolution timeline from actual clinical records. No fabricated progress percentages, treatment duration, or medication schedules.
- Appointments: book and cancel slots explicitly published by the veterinarian. Professional selection, reason-based booking and rescheduling are not added in this update.
- Notices: existing durable reminder records. The staging database scheduler is active. Notices are generated at 08:00 in the clinic timezone on the previous day and on the event day.
- External delivery: existing email worker still requires its sender/API key and authenticated delivery scheduler. Web Push subscriptions and push delivery are **not implemented**. Automatic WhatsApp reminders are **not implemented**. Preparing a WhatsApp invitation is distinct from automatic sending.

## Verification

- Types and lint pass. Unit/isolated database suite: 470 tests pass (427 shared + 43 web), including tenant isolation, revocation, conflicting reservations, reminder timezone/idempotency, safe login redirects and active-owner sharing.
- Production build passed locally with Google Fonts mocked because this runtime cannot resolve `fonts.googleapis.com`. No font mocks or verification credentials are committed.
- Playwright verified home, installation and agenda/calendar fixtures at 390×844 and 1440×844: no console errors or horizontal overflow, mobile navigation and installation guidance rendered, calendar navigation worked, clinic-registration controls were absent from owner login. These are demo fixtures, not real owner accounts. Agent-browser was attempted but its daemon could not start in the runtime; Playwright used the same dev server process context.
- Public installation grants no pet data. Session and owner checks remain in the protected portal and existing database RPCs. New app-only pages are gated to the explicitly enabled staging environment.
- Real Android/iPhone installation, email receipt and the full invitation/authentication/reservation flow still require a staging account/device check.
- The Vercel connector lists the staging project but rejects project/deployment detail reads (404/403); deployment readiness cannot be claimed from that connector.
- No production database, main branch, production domain or Production environment settings were changed.

## Run locally

```bash
npm ci
# Configure apps/web/.env.local from .env.example with staging credentials.
# Keep SYNCVETE_ENV=staging, OWNER_APP_ENABLED=true and both Supabase URL
# settings pointing to https://owmcrqvnfubyjxrlyhlc.supabase.co.
# Set OWNER_APP_STAGING_ORIGIN to your reachable staging origin.
npm run dev --workspace=@sincvete/web
npm run typecheck
npm run lint
npm run test:unit
npm run build
```

Enable **Configuración → App de propietarios** for the staging test clinic; use a test owner with email and WhatsApp phone. Do not rename a real clinic to IMILVET: IMILVET is only the visual fixture.

For visual fixture checks, set `OWNER_APP_CHROME_PATH` when your browser executable is not Playwright's default and run `node scripts/verify-owner-mobile.mjs`. The script creates an ephemeral development-only route and removes it afterward. It does not send messages or modify clinical data.

## Publication status

The candidate publication to `guille6720/SyncVete` was blocked by automatic approval review at the Git tree creation step. Stated reason: the upload includes substantial internal source code and generated artifacts, and the reviewer requires an explicit user-authored authorization to publish that payload to the repository. No remote branch, commit, pull request or deployment was updated in this turn. Local changes remain staged on `codex/owner-portal-mobile`, based on `codex/owner-pwa-staging` at `773f60181fe8b4c34094761815fc253fd345d860`.

## New source files

- `apps/web/src/__tests__/owner-app-navigation.test.ts`
- `apps/web/src/app/portal/(session)/avisos/page.tsx`
- `apps/web/src/app/portal/(session)/mascotas/page.tsx`
- `apps/web/src/app/portal/(session)/salud/page.tsx`
- `apps/web/src/app/portal/(session)/turnos/page.tsx`
- `apps/web/src/app/portal/instalar/[organizationId]/page.tsx`
- `apps/web/src/components/portal/owner-app-dashboard.tsx`
- `apps/web/src/components/portal/owner-app-install.tsx`
- `apps/web/src/components/portal/owner-app-mobile-nav.tsx`
- `apps/web/src/components/portal/owner-pet-icon.tsx`
- `apps/web/src/lib/owner-app-metadata.ts`
- `apps/web/src/lib/owner-app-navigation.ts`
- `docs/owner-app/MOBILE-REPORT.md`
- `docs/owner-app/screenshots/owner-all-1440.png`
- `docs/owner-app/screenshots/owner-all-390.png`
- `docs/owner-app/screenshots/owner-home-1440.png`
- `docs/owner-app/screenshots/owner-home-390.png`
- `docs/owner-app/screenshots/owner-install-1440.png`
- `docs/owner-app/screenshots/owner-install-390.png`
- `scripts/verify-owner-mobile.mjs`
