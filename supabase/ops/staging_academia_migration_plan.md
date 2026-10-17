# Academia — plan de migración staging (NO APLICAR aún)

**Proyecto:** `owmcrqvnfubyjxrlyhlc` (SyncVete-Staging)  
**Archivo:** `supabase/migrations/20261017120000_tutorial_progress.sql`  
**Estado preflight:** tabla/RPC **aún no existen** en staging (verificado read-only).

## Precondiciones

1. Confirmar `project-ref = owmcrqvnfubyjxrlyhlc` (nunca producción `lhdksiptpsubktikdses`).
2. Backup lógico opcional: dump solo de schema `public` o snapshot de proyecto.
3. Vercel Preview `sync-vete-staging` con `NEXT_PUBLIC_SUPABASE_URL` → staging.
4. **No** habilitar Academia en el proyecto Vercel `sync-vete` (producción) hasta verificar su Preview.

## Ejecución (cuando se apruebe)

```bash
# Desde el repo, apuntando explícitamente a staging:
npx supabase db query --linked --project-ref owmcrqvnfubyjxrlyhlc \
  -f supabase/migrations/20261017120000_tutorial_progress.sql
```

Post-apply (read-only checks):

- `to_regclass('public.tutorial_progress')` → not null
- Existe `upsert_tutorial_progress` / `get_my_tutorial_progress`
- `has_table_privilege` / RLS enabled
- `REVOKE` efectivo: anon **sin** EXECUTE (re-verificar; default privileges de Supabase pueden reabrir EXECUTE)

Endurecimiento recomendado post-apply:

```sql
REVOKE ALL ON FUNCTION public.upsert_tutorial_progress(TEXT, INT, INT, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_my_tutorial_progress(TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.tutorial_progress_org_id() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_tutorial_progress(TEXT, INT, INT, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_my_tutorial_progress(TEXT) TO authenticated, service_role;
```

## Rollback staging-only

```sql
BEGIN;
DROP FUNCTION IF EXISTS public.get_my_tutorial_progress(TEXT);
DROP FUNCTION IF EXISTS public.upsert_tutorial_progress(TEXT, INT, INT, TEXT);
DROP FUNCTION IF EXISTS public.tutorial_progress_org_id();
DROP TABLE IF EXISTS public.tutorial_progress;
COMMIT;
NOTIFY pgrst, 'reload schema';
```

El progreso en `localStorage` del browser no se revierte (aceptable).

## Fuera de alcance

- No aplicar a producción.
- No merge a `main` con Academia enabled.
