# SyncVete UI V2 — checklist de PR (anti-rebrand)

Usar en todo PR que toque shell, dashboard, navegación, cards, tablas o componentes nuevos de la **UI clínica**.

## Marca

- [ ] Default de producto sigue siendo teal (`DEFAULT_THEME.accent === 'teal'`).
- [ ] Logo SyncVete y tipografías DM Sans / Fraunces sin reemplazo.
- [ ] Light y dark siguen funcionando (`.dark` + `data-accent`).
- [ ] Colores nuevos heredan tokens (`bg-primary`, `--clinic`, etc.) — no paleta MyVete.

## Anti-purple (look V2)

En archivos **nuevos o rediseñados** de UI clínica staff, verificar que no se introduzca purple como tema por defecto:

```bash
# Desde apps/web — revisar diffs / archivos tocados (ajustar paths del PR)
rg -n "#7c3aed|#8b5cf6|purple-on|from-purple|to-violet|bg-violet-600|text-violet-700" src/components src/app/\(clinic\) src/app/globals.css
```

- [ ] Sin overrides hardcodeados MyVete purple como look principal.
- [ ] Sin gradientes purple/violet como tema de shell/dashboard V2.
- [ ] Uso de `violet-*` solo si es status puntual existente, preset de usuario, o código legacy no introducido por este PR.

## Alcance UX (MyVete como referencia)

- [ ] Cambios de navegación / densidad / flujo inspirados en MyVete **no** arrastran su paleta.
- [ ] Portal owner-app / white-label no se usa como plantilla de color de la UI clínica.

## Tests

- [ ] `apps/web` unit: `theme-brand.test.ts` (default teal) en verde.
- [ ] Smoke visual light + dark en pantallas tocadas.
