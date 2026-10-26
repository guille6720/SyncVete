# SyncVete UI V2 — identidad de marca (fuente de verdad)

MyVete puede inspirar **organización de flujos** (navegación, densidad operativa).  
**Nunca** define colores, tipografía ni logo de SyncVete.

## Fuentes en código

| Artefacto | Ruta |
|-----------|------|
| Tokens CSS / light·dark / acentos | `apps/web/src/app/globals.css` |
| Default + presets de usuario | `apps/web/src/lib/theme.ts` |
| Boot tema (default teal) | `apps/web/src/app/layout.tsx` (`themeBootScript`) |
| Controles de tema | `apps/web/src/components/theme/theme-controls.tsx` |
| Logo | `apps/web/src/components/brand/syncvete-logo` (`BrandLogo`) |
| Cards de dashboard (tonos de estado) | `apps/web/src/components/dashboard/dashboard-stat-cards.tsx` |

## Identidad por defecto (marca SyncVete)

| Rol | Token / valor |
|-----|----------------|
| Primary / clinic | `--sv-primary` / `--clinic` = `#0d9488` (teal-600) |
| Soft / muted clinic | `--clinic-soft` `#f0fdfa`, `--clinic-muted` `#ccfbf1` |
| Background light | `--sv-background`; shell `--shell-bg` `#f3faf7 → #f8fafc → #eef6f3` |
| Background dark | shell `#0b1220 → #0f172a → #0c1a1a` |
| Foreground / muted | shell `#334155` / `#64748b` (dark: `#e2e8f0` / `#94a3b8`) |
| Card / secondary / border | `--sv-card`, `--sv-secondary`, `--sv-border` |
| Destructive | `--sv-destructive` (rojo oklch) |
| Landing | `--land-accent` `#0f766e`, ink `#0c2f2a` |
| Tipografía | DM Sans (`--font-sans`) + Fraunces (`--font-display`) |
| Default tema | `DEFAULT_THEME = { mode: 'light', accent: 'teal' }` |

Light/dark: clase `.dark` + atributo `data-accent` en `<html>`.

## Acentos opcionales del usuario (no son la marca)

Presets en `COLOR_PRESETS`: teal (default), emerald, sky, indigo, violet `#7c3aed`, rose, amber.

El violeta es **preferencia del usuario** vía ThemeControls. No es el look de producto SyncVete ni el default de UI V2.

## Fuera de alcance de marca clínica staff

- Portal owner-app (`owner-app-neon.ts`): acentos neon por módulo (incl. violet) y `primaryColor` white-label por clínica.
- No confundir branding del portal tutor con la UI clínica SyncVete.

## Tokens preferidos en componentes nuevos

Usar clases/tokens del design system:

- `bg-background`, `text-foreground`, `bg-primary`, `text-primary-foreground`
- `bg-card`, `border-border`, `text-muted-foreground`, `bg-secondary`
- `bg-clinic` / `text-clinic` / `var(--clinic)` cuando haga falta acento de clínica
- Utilidades `teal-*` ya usadas en shell/dashboard cuando el patrón existente lo requiera
- Componentes: `Button`, `Card`, `Badge`, etc. (CVA existente)

Evitar hex de MyVete (`#7c3aed`, `#8b5cf6`) como tema principal o “look V2”.
