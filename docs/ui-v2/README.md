# SyncVete UI V2

Documentación de evolución de interfaz **sin rebrand**.

| Doc | Contenido |
|-----|-----------|
| [BRAND.md](./BRAND.md) | Tokens, tipografía, logo, default teal, light/dark |
| [PR-CHECKLIST.md](./PR-CHECKLIST.md) | Checklist anti-purple / anti-MyVete palette en PRs |

Regla Cursor: `.cursor/rules/syncvete-brand-ui-v2.mdc`  
Test de marca: `apps/web/src/lib/theme-brand.test.ts`  
Flag: `NEXT_PUBLIC_UI_V2_ENABLED` (off por defecto) — shell + dashboard V2  
Staging visual review: enable the flag on the isolated staging preview only; use authenticated `/dashboard` (no public auth bypass).

## Screenshots (shell + dashboard)

| Viewport | Archivo |
|----------|---------|
| 1440×900 | [screenshots/ui-v2-dashboard-1440.png](./screenshots/ui-v2-dashboard-1440.png) |
| 390×844 | [screenshots/ui-v2-dashboard-390.png](./screenshots/ui-v2-dashboard-390.png) |
