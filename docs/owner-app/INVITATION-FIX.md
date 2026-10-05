# Owner invitation installation correction

The recorded WhatsApp message used the `codex/owner-pwa-staging` preview origin. That branch still pointed to the older build, even though the mobile implementation had been deployed on `codex/owner-portal-mobile`. Both staging branches must point to the corrected mobile tree so the configured invitation origin serves the owner app.

Existing-account sign-in now stays inside the branded invitation page. It preserves the invitation token for account linking and does not offer clinic registration. Invalid invitations ask the owner to request a replacement instead of linking to the administrative login. Installed apps continue to launch the clinic-specific public owner installation page, without an invitation token in the manifest.

Verification: typecheck, lint, 470 tests and local build passed. Eight mobile/desktop fixture checks passed at 390 and 1440 pixels, including switching between activation and existing-account login, retaining the invitation URL, absence of clinic registration/SyncVete installation, and exactly one clinic-specific manifest. These fixture checks do not create accounts or send invitations. Font responses and Supabase configuration used local verification values only; no credentials or test routes are published.

No production branch, production database or production domain is changed. Real-account invitation activation and native Android/iPhone installation still require verification. External reminder delivery remains outside this correction.

## Owner active checkbox correction

The edit form submits a hidden `isActive=false` before the checked `isActive=true`. Reading only the first value silently deactivated owners even with the checkbox checked. Saving now reads all values and respects the checked state. Regression tests exercise the actual update action for both checked and unchecked forms. The integrated app invitation action refuses inactive owners before issuing or rotating tokens, with a message directing staff to activate the owner in their record.

The affected staging test owner was restored to active. The invitation from the reported screenshot was verified directly against `preview_owner_portal_invite` and returned `valid=true`; its token and personal details are not included in this report. No other owners were changed.
