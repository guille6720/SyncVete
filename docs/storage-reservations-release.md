# Reservas de almacenamiento

Las cinco rutas de carga usan `uploadWithStorageReservation`: comprueba permiso y organización, reserva capacidad, copia los bytes, calcula SHA256, sube sin reemplazo, vuelve a descargar y verifica el hash antes de completar. Un reintento idéntico recupera el comprobante; un conflicto de ruta/contenido falla. Las respuestas inciertas conservan la reserva y requieren conciliación, sin vencimiento automático que permita exceder capacidad.

La capacidad se serializa mediante la fila de cuota de cada organización. El trigger de Storage exige un comprobante pendiente con el tamaño correcto incluso para `service_role`. Las políticas restrictivas cierran las rutas directas de clientes ordinarios. Se conservan las lecturas y las fotos públicas existentes.

## Entornos

- Staging: Supabase `owmcrqvnfubyjxrlyhlc`, Vercel `sync-vete-staging`. Identidad técnica limitada provisionada exclusivamente allí. Las cuotas ficticias permanecen con `sync_entitlements=false`.
- Producción: Supabase `lhdksiptpsubktikdses`, Vercel `sync-vete`, proyecto `prj_Inb0VWS9TnRW0jDohy3vvVjpSgtZ`. El helper exige también `VERCEL_ENV=production` y `STORAGE_RESERVATIONS_ENABLED=true`. Usa el cliente de servicio existente, sujeto al mismo trigger de reservas; no copia la contraseña ni la cuenta técnica de staging. No activar `STORAGE_LIMITED_WRITER_ENABLED` en producción sin provisionar y validar una identidad propia.

La capacidad productiva deriva de `storage.max_mb` y sus derechos existentes, en MiB: plan vigente, adicionales, ventanas de validez y excepciones. Los valores preliminares y precios del catálogo sandbox nunca se utilizan para producción. No se crean pagos ni se cambian contratos. Las cuentas ilimitadas conservan esa condición. Las excepciones activas superpuestas fallan explícitamente y deben resolverse administrativamente.

El cálculo se actualiza bajo bloqueo antes de reservar o consultar el estado. Cubre altas, cambios de plan y vencimientos sin depender del cron. No se consume además el antiguo contador mensual al cargar fotos/imágenes/adjuntos. Sus registros históricos no se eliminan; el panel de almacenamiento muestra uso físico, reservas pendientes y capacidad comprometida.

## Orden de liberación

1. Revisar Git y los historiales reales. Nunca aplicar automáticamente todos los archivos pendientes sobre una base con historial distinto.
2. Si producción no tiene ninguna de las tablas nuevas, aplicar exclusivamente `supabase/ops/storage-production-bootstrap.sql` como migración de liberación. Aborta si encuentra el esquema instalado; mantiene el bloqueo global apagado y no crea usuarios.
3. Aplicar la migración de readiness. En producción, activar `sync_entitlements`, actualizar las cuotas y comprobar ausencia de cuotas faltantes y metadatos sin tamaño. En staging conservar las cuotas ficticias.
4. Confirmar consumidores privilegiados externos y trabajos en curso antes del cierre global. Preparar el build productivo con `--skip-domain`; `scripts/storage-production-preflight.mjs` valida el destino y los permisos sin crear usuarios ni archivos.
5. Incorporar mediante solicitud de staging a `main`, probar la candidata, publicar la versión compatible y solo entonces activar `write_enforcement.enabled`. Comprobar las cargas y los accesos después del cambio.

Historial aplicado el 2/11/2026: staging readiness `20261102151820`; producción bootstrap `20261102151842`, readiness `20261102151907`. Los dos últimos registros contienen los SQL de liberación revisados; no son autorización para repetirlos.

## Reversión y límites

Antes de devolver el sitio a una versión sin reservas, apagar `storage_control.write_enforcement.enabled` en la base correspondiente. Las organizaciones en `enforced_organizations` siguen protegidas. Conservar cuotas y comprobantes; no liberar reservas inciertas por antigüedad ni borrar datos para recuperar espacio. La capacidad conserva los derechos existentes mientras `sync_entitlements` esté activo.

Las fotos públicas, las reservas inciertas que requieren conciliación y los avisos previos de dependencias no quedan resueltos por esta liberación. Los triggers en el esquema gestionado de Storage requieren revisar compatibilidad con futuras actualizaciones del proveedor. Los permisos del propietario de la base siguen siendo administrativos; este mecanismo no pretende proteger frente a quien puede retirar el trigger.

Pruebas: 45 casos de almacenamiento en 11 archivos; PostgreSQL 17.11 real para bootstrap y sincronización; ocho conexiones concurrentes con un ganador, siete rechazos por capacidad y comprobante estable en el reintento. QA HTTP de staging cubre SHA256, aislamiento, INSERT/UPDATE, copy/move y tokens de subida emitidos antes del cierre. La comprobación de producción debe registrarse por separado, sin presentar las pruebas de staging como pruebas productivas.
