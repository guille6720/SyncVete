# App de propietarios: staging

## Estado

Implementacion en `codex/owner-pwa-staging`, basada en el checkout limpio `feature/interconsultas-staging` (`fd3e1dc`). El checkout original de `E:\SYNC-VETE\SyncVete-Staging-work` solo tiene permiso de lectura; se preparo una copia editable en el espacio de este chat. Su remoto apunta exclusivamente a `guille6720/SyncVete-Staging`.

Las dos migraciones se aplicaron en **SyncVete-Staging**, proyecto `owmcrqvnfubyjxrlyhlc`. El cron `owner-app-reminders-staging` esta activo cada minuto; su primera ejecucion verificada fue exitosa. Ninguna veterinaria se habilito automaticamente. No se modifico el repositorio ni la base de produccion.

La publicacion del codigo sigue pendiente: el conector GitHub no puede leer el remoto de staging y Vercel responde `Project not found` para el proyecto vinculado `sync-vete-staging`. La implementacion y sus pruebas estan disponibles localmente.

## Flujo

1. Un administrador habilita la app desde Configuracion > Clinica > App de propietarios, con el nombre, logo, color y bienvenida de su veterinaria; por ejemplo, `app-IMILVET`. El telefono y email se reutilizan de los datos existentes de la clinica.
2. En la ficha del propietario, Invitar al portal reutiliza el token seguro existente: 32 bytes aleatorios, hash SHA-256, vencimiento de siete dias, aceptacion unica, email coincidente y revocacion. El enlace se puede compartir; si Resend esta configurado, tambien se envia por email. La interfaz informa si el envio no se realizo.
3. El propietario confirma su email si Auth lo requiere, activa su acceso y abre `/portal`. Puede instalar la PWA desde Android o desde Compartir > Agregar a inicio en Safari. La invitacion no aparece en el manifest ni en el enlace de inicio de la app instalada.
4. El portal muestra mascotas, calendario de vacunacion, proximos turnos, diagnosticos, tratamientos y planes registrados por la clinica. Las reservas crean turnos reales en la agenda. El propietario puede cancelar sus propias reservas futuras.
5. Los recordatorios aparecen en la app el dia anterior y el mismo dia a las 08:00 de la zona horaria de la veterinaria. El chequeo ocurre cada minuto, con recuperacion durante el mismo dia si una ejecucion falla. Los turnos ya iniciados o cancelados y las dosis reemplazadas no generan avisos nuevos. El envio por email revalida el evento y utiliza leases, reintentos e idempotencia.

Es una PWA instalable, no un APK ni una publicacion en las tiendas. Los recordatorios fuera de la app se entregan por email; no se implementaron notificaciones push. El seguimiento muestra la evolucion clinica registrada, sin inventar porcentajes ni estados de cumplimiento de medicacion.

## Configuracion del entorno

Configurar solamente en el entorno **preview/staging**:

```dotenv
SYNCVETE_ENV=staging
OWNER_APP_ENABLED=true
NEXT_PUBLIC_SUPABASE_URL=https://owmcrqvnfubyjxrlyhlc.supabase.co
OWNER_APP_STAGING_SUPABASE_URL=https://owmcrqvnfubyjxrlyhlc.supabase.co
OWNER_APP_STAGING_ORIGIN=https://<host-estable-de-staging>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<clave-publica-de-staging>
SUPABASE_SERVICE_ROLE_KEY=<clave-de-servidor-de-staging>
CRON_SECRET=<secreto-del-worker>
OWNER_APP_RESEND_API_KEY=<clave-Resend>
OWNER_APP_EMAIL_FROM=<remitente-verificado>
```

La habilitacion exige el proyecto Supabase de staging verificado y rechaza `VERCEL_ENV=production`. El nombre de una carpeta o de un repositorio no alcanza para habilitarla. No poner claves de servidor en variables `NEXT_PUBLIC_*`.

El cron de la base genera los avisos sin depender de Vercel. Para la entrega de emails, configurar un scheduler externo cada minuto que llame `GET /api/cron/owner-app` en el host de preview con `Authorization: Bearer <CRON_SECRET>`. Si el preview esta protegido por Vercel, el scheduler necesita tambien su acceso de automatizacion. Los crons de Vercel no ejecutan previews; por eso no se altero `vercel.json` de la aplicacion. La entrega real no se probo ni se habilito durante esta tarea, y no se enviaron emails a clientes.

El local usa el puerto 3017 y una clave publica de staging en un `.env.local` ignorado. No incluye claves de envio ni de servicio.

## Turnos

La clinica publica horarios de 30 minutos para el usuario del equipo que los publica, en su sucursal activa. Los profesionales deben publicar sus propios horarios; esta primera version no permite publicar para otro profesional. El intervalo maximo de publicacion es de 90 dias. La reserva bloquea la fila del horario y utiliza los controles existentes de solapamientos, bloqueos y agenda profesional al crear el turno. Los horarios se introducen y muestran en la zona horaria del dispositivo; los recordatorios usan la zona horaria configurada en la clinica.

## Seguridad y datos

- Los nuevos RPC verifican el propietario vinculado o los permisos del equipo. Un propietario solo puede reservar para sus mascotas activas de la misma veterinaria.
- La revocacion existente se verifica en cada consulta; una sesion previa no conserva acceso despues de desvincularse.
- Las tablas nuevas tienen RLS. Settings y slots se acceden mediante RPC y no conceden acceso directo a `anon` ni a `authenticated`. Reminders tiene una politica de lectura por propietario.
- Los RPC anonimos nuevos solo devuelven branding publico o branding asociado a una invitacion vigente. No devuelven propietarios, mascotas ni historia clinica. El advisor los señala como `SECURITY DEFINER` publico de manera esperada. Las otras funciones privilegidas tienen `EXECUTE` revocado de `PUBLIC`, con grants explicitos.
- El advisor informa RLS sin politica para settings y slots. Es intencional: los grants directos estan revocados. No se modificaron advertencias preexistentes de otros modulos. [Descripcion del advisor](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy).
- Las paginas privadas llevan `no-store`, `noindex` y `Referrer-Policy: no-referrer`. El service worker solo almacena una pagina generica sin conexion; nunca almacena datos clinicos.
- Las migraciones nuevas requieren `app.owner_pwa_staging=on` en una sesion previamente verificada; su ejecucion por defecto falla. No incorporarlas a una promocion de produccion.

## Validacion

```powershell
npm run typecheck --workspace @sincvete/web
npm run lint --workspace @sincvete/web
npm run test:unit --workspace @sincvete/web -- --configLoader native
npm run test:unit --workspace @sincvete/shared -- --configLoader native
npm run build --workspace @sincvete/web
```

Las pruebas de base ejecutan las funciones nuevas en Postgres aislado (PGlite), con los controles de disponibilidad existentes y fixtures de identidad. Cubren aislamiento entre veterinarias, mascotas ajenas, doble reserva, cancelacion propia, revocacion, privilegios anonimos, hora local, distintas zonas horarias, deduplicacion, leases, turnos cancelados y dosis reemplazadas. Esta suite no reemplaza una prueba con cuentas reales en staging.

Para repetir las capturas, iniciar el servidor local en 3017 y ejecutar `node scripts/verify-owner-app-ui.mjs` desde la raiz. El script crea y elimina una ruta temporal de fixtures; usa Chrome local. Revisa 390x844 y 1440x1000, consola, respuestas HTTP, desbordes, imagenes y navegacion del calendario. No reserva turnos ni envia emails. Las capturas muestran un logo de prueba; cada veterinaria debe configurar su logo real, preferentemente PNG cuadrado de 512px.

Se verificaron tambien los grants y RLS del proyecto real de staging y una ejecucion exitosa del cron. Quedan pendientes la publicacion, la habilitacion de una veterinaria de prueba, y la prueba completa invitacion-email-activacion-reserva con usuarios de staging. La instalacion nativa debe confirmarse en un Android y en Safari/iPhone.

## Deshabilitar

Desactivar `OWNER_APP_ENABLED`, o desmarcar Habilitar app para una veterinaria. Esto conserva los turnos y la historia clinica. Para detener la generacion en toda la base de staging:

```sql
SELECT cron.unschedule('owner-app-reminders-staging');
```

No eliminar tablas con reservas o avisos para hacer rollback. Las reservas creadas siguen siendo turnos normales de SyncVete.

Referencias: [PWA en Next.js](https://nextjs.org/docs/app/guides/progressive-web-apps), [RLS en Supabase](https://supabase.com/docs/guides/database/postgres/row-level-security), [Supabase Cron](https://supabase.com/docs/guides/cron/quickstart).
