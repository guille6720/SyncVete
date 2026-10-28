# Entornos y ramas de SyncVete

## Configuración vigente

El repositorio `guille6720/SyncVete` tiene dos ramas de trabajo. ChatGPT/Codex y Cursor comparten la misma rama de staging; no se crean ramas por tarea o herramienta.

| Uso               | Rama                                    | Cuenta para ingresar      | Vercel              | Supabase               |
| ----------------- | --------------------------------------- | ------------------------- | ------------------- | ---------------------- |
| Staging y pruebas | `feature/ui-v2-shell-dashboard-staging` | `micuenta66667@gmail.com` | `sync-vete-staging` | `owmcrqvnfubyjxrlyhlc` |
| Producción        | `main`                                  | `guille67c@gmail.com`     | `sync-vete`         | `lhdksiptpsubktikdses` |

Se conserva el nombre existente de staging para mantener su dirección estable:

<https://sync-vete-staging-git-feature-ui-v2-shel-78b6a4-guillermo-c-bmw.vercel.app/dashboard>

Producción conserva su despliegue y sus datos. Estos correos identifican cuentas de la aplicación; no determinan el autor de los commits y no limitan el acceso del personal autorizado de cada veterinaria.

## Trabajo compartido

1. Abrir la carpeta de trabajo compartida y verificar que la rama activa sea la de staging.
2. Revisar los cambios locales antes de actualizar. Con el árbol limpio, ejecutar `git pull --ff-only`. No descartar cambios de la otra herramienta.
3. Implementar, probar y guardar cambios directamente en staging. Coordinar ediciones simultáneas del mismo archivo y volver a revisar las novedades remotas antes de publicar.
4. Publicar únicamente a `origin/feature/ui-v2-shell-dashboard-staging`, sin force push. Si otro cambio llegó primero, integrarlo y repetir las comprobaciones afectadas.
5. Para liberar una versión, solicitar autorización expresa del usuario y preparar una solicitud desde staging a `main`. No eliminar staging al incorporarla a producción.

La rama predeterminada del repositorio es staging. Las reglas de GitHub impiden crear otras ramas, borrar las dos conservadas o reescribir su historial. Producción requiere una solicitud de incorporación. Las instrucciones para ambas herramientas están en `AGENTS.md` y `.cursor/rules/shared-staging.mdc`.

En cada clon de trabajo nuevo, configurar `git config core.hooksPath .githooks` para activar la comprobación local de publicaciones. Las reglas del servidor se aplican aunque un clon no tenga ese hook. No compartir contraseñas ni guardar credenciales en Git.

## Despliegues

Cada proyecto de Vercel tiene un filtro de compilación por rama: staging compila la rama compartida; producción compila `main`. La configuración por sí sola no publica una versión nueva en producción. Una publicación manual puede omitir estos filtros, por lo que siempre se debe verificar proyecto, entorno y base de datos antes de desplegar.

No ejecutar migraciones de staging sobre producción ni aplicar a ciegas todo el historial de migraciones. Revisar el registro de cada base de datos antes de cualquier liberación autorizada.

## Recuperación del trabajo anterior

Antes de eliminar las ramas sobrantes se guarda un archivo Git completo y verificado, con un manifiesto de sus nombres y commits, las propuestas abiertas y parches de cambios locales. Los archivos locales sin seguimiento permanecen en sus carpetas originales. El respaldo se conserva fuera del repositorio público, en la carpeta `branch-consolidation` del proyecto local de ChatGPT.

Las funciones antiguas que no estaban incorporadas en staging quedan archivadas; no se publican automáticamente. Para retomarlas, consultar `manifest.json`, revisar el commit en `archive.git` y recuperar únicamente los cambios necesarios en la rama compartida. No volver a publicar las ramas archivadas.

La consolidación no cambia contraseñas, usuarios, permisos de veterinarias ni datos de producción.
