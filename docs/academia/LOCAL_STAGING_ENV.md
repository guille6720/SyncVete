# Entorno local → Staging (Academia)

## Comportamiento de Next.js

Next carga automáticamente (en este orden, con override):

1. `.env`
2. `.env.local` (**sí se carga** en `next dev` / `next start`)
3. `.env.development` / `.env.production`
4. `.env.development.local` / `.env.production.local`

**No** carga `.env.staging.local` a menos que se use un loader custom.  
Por eso el desarrollo local con staging usa **`apps/web/.env.local`**.

## Archivos (gitignored)

| Archivo | Uso |
|---------|-----|
| `apps/web/.env.local` | Activo: **solo staging** (`owmcrqvnfubyjxrlyhlc`) |
| `apps/web/.env.local.production.backup` | Backup del env de producción previo (no commit) |

`NEXT_PUBLIC_ACADEMIA_ENABLED=false` hasta completar migración + checks.

## CLI Supabase

- `supabase/.temp/project-ref` debe ser `owmcrqvnfubyjxrlyhlc`
- Preferir siempre `--project-ref owmcrqvnfubyjxrlyhlc` en comandos `db query`

## Restaurar producción local (si hace falta)

```powershell
Copy-Item apps/web/.env.local.production.backup apps/web/.env.local -Force
```

No usar ese backup para Academia ni migraciones.
