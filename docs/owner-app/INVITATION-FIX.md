# Owner invitation installation correction

The recorded WhatsApp message used the `codex/owner-pwa-staging` preview origin. That branch still pointed to the older build, even though the mobile implementation had been deployed on `codex/owner-portal-mobile`. Both staging branches must point to the corrected mobile tree so the configured invitation origin serves the owner app.

Existing-account sign-in now stays inside the branded invitation page. It preserves the invitation token for account linking and does not offer clinic registration. Invalid invitations ask the owner to request a replacement instead of linking to the administrative login. Installed apps continue to launch the clinic-specific public owner installation page, without an invitation token in the manifest.

Verification: typecheck, lint, 470 tests and local build passed. Eight mobile/desktop fixture checks passed at 390 and 1440 pixels, including switching between activation and existing-account login, retaining the invitation URL, absence of clinic registration/SyncVete installation, and exactly one clinic-specific manifest. These fixture checks do not create accounts or send invitations. Font responses and Supabase configuration used local verification values only; no credentials or test routes are published.

No production branch, production database or production domain is changed. Real-account invitation activation and native Android/iPhone installation still require verification. External reminder delivery remains outside this correction.
