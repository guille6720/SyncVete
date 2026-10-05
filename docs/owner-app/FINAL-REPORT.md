# Informe de implementacion

- Rama: `codex/owner-pwa-staging`.
- Base auditada: `feature/interconsultas-staging`, commit `fd3e1dc`, checkout limpio.
- Arquitectura: monorepo npm/Turbo; Next.js 15 App Router, React 19, Supabase, shared schemas, permisos y entitlements existentes.
- Se reutilizaron `owner_portal_invites`, el alta y revocacion del portal, la agenda y la historia clinica. No se agrego una aplicacion separada.
- Se agregaron branding configurable, manifest e iconos por veterinaria, calendario mensual, reserva/cancelacion de horarios publicados, avisos y entrega opcional por email, con el pie `Hecho por OpusOrg`.
- Las migraciones locales coinciden con las versiones aplicadas en staging: `20261005014349_owner_pwa_staging` y `20261005015326_owner_app_staging_schedule`.
- El cron de staging quedo activo cada minuto. Ejecucion verificada: `2026-10-05 01:54:00 UTC`, estado `succeeded`.
- RLS verificado en las tres tablas nuevas. `anon` no puede reservar; `authenticated` no puede ejecutar el cron; `service_role` si puede. Hay cero veterinarias habilitadas automaticamente.
- Pruebas: 34 de web y 427 de shared pasaron (461 en total). Incluyen Postgres aislado, revocacion, aislamiento, reserva duplicada, zonas horarias y entrega con idempotencia.
- ESLint, chequeo de tipos y compilacion completa pasaron. Se fijo la raiz del monorepo para que Next no tome un lockfile externo al repositorio. El config de Vitest ahora soporta carga nativa en este entorno.
- Playwright verificado en 390x844 y 1440x1000: sin errores de consola o HTTP, sin desbordes ni imagenes rotas. Se probo la navegacion del calendario. Las capturas usan fixtures de prueba, no datos ni sesiones reales.
- Se corrigio la activacion existente cuando Auth requiere confirmar el email y no devuelve sesion, y el matcher de rutas publicas que consideraba publicas todas las rutas por el prefijo `/`.
- El checkout original y produccion permanecen sin cambios. No se enviaron emails reales.

## Pendientes para la prueba real

El codigo aun no se publico en GitHub ni en Vercel. En la segunda auditoria se verifico mediante la sesion del navegador que `sync-vete-staging` existe y esta vinculado a `guille6720/SyncVete`. El remoto `SyncVete-Staging` de la copia original no es el repositorio vinculado a Vercel. El conector Vercel sigue respondiendo 404, pero la sesion del navegador permite revisar y configurar el proyecto.

Se integro la rama remota `feature/interconsultas-staging` en el commit local `db7824f`, incluyendo los cambios hasta `866fece1ad75135f687808fafbbc48487827e27d`. Se conservaron los cambios de profesionales, pacientes y el boton de WhatsApp. En staging habilitado ese boton genera una invitacion del portal integrado, sin enviar email ni usar la conexion externa. Fuera de staging habilitado se conserva el puente externo existente. El enlace requiere email y telefono validos, permisos y una veterinaria habilitada.

Verificacion posterior a la integracion: 39 pruebas web y 427 compartidas (466 en total), tipos, lint y diff sin errores. No se repitio la compilacion completa ni la prueba visual tras esta integracion.

Se guardaron en Vercel, exclusivamente para Preview de `sync-vete-staging`, `SYNCVETE_ENV=staging`, `OWNER_APP_ENABLED=true` y `OWNER_APP_STAGING_SUPABASE_URL=https://owmcrqvnfubyjxrlyhlc.supabase.co`. Se verifico que la URL publica de Supabase de Preview apunta a ese proyecto. No se modificaron variables de Production ni se ejecuto una publicacion.

El usuario autorizo instalar ChatGPT Codex Connector solo para `SyncVete`. Se preparo esa seleccion en GitHub; la confirmacion de contrasena de GitHub esta pendiente. El conector devolvio 403 al intentar crear un objeto y el envio por Git no se completo. Ninguna rama remota se modifico. La URL publica definitiva (`OWNER_APP_STAGING_ORIGIN`) sigue pendiente hasta disponer del preview.

Despues de publicar un preview, configurar el remitente de Resend, la clave de servidor de staging y el scheduler de entrega de emails. Habilitar una veterinaria y usar cuentas de prueba para verificar el recorrido completo de invitacion, confirmacion, instalacion y reserva. La instalacion debe comprobarse en Android y Safari/iPhone.

La primera version publica horarios para el profesional que los crea; no permite publicar para otro miembro. Los recordatorios externos son emails, no notificaciones push. Los detalles de configuracion, seguridad y deshabilitacion estan en [README](README.md).
