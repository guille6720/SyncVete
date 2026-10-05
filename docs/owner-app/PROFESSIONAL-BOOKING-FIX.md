# Reserva con agenda profesional — staging

El portal `/portal/turnos` consultaba solamente `owner_app_slots`, una lista de horarios publicados manualmente. Ahora muestra los profesionales activos de la clínica y genera horarios a partir de `professional_schedules`, respetando duración, día semanal, sucursal, consultas permitidas, turnos ocupados y bloqueos.

El propietario elige profesional, fecha (hasta 30 días), mascota y horario. La reserva vuelve a validar disponibilidad y guarda un turno `programada` en `appointments`, con el mismo profesional que usa `/agenda`. Mantiene el vínculo con `owner_app_slots` para consultar/cancelar reservas y conservar los recordatorios existentes. Todos los escritores de turnos comparten un bloqueo por profesional antes de validar superposiciones.

## Verificación

- 474 pruebas unitarias y de contratos SQL: generación de horarios, exclusión de reservas/bloqueos, rechazo de horarios adulterados, mascota y agenda ajenas, reserva duplicada, cancelación y acceso anónimo.
- Typecheck, lint y build local correctos. Build usa fuentes simuladas por restricciones de red del entorno.
- Pantalla real de reserva comprobada a 390 y 1440 px mediante `scripts/verify-owner-booking.mjs`: selección de profesional, datos enviados al confirmar, mensaje de éxito, sin desbordamiento ni errores JavaScript. El servidor está simulado en esta prueba de interfaz; los contratos SQL se prueban por separado.
- Supabase staging: cuatro profesionales y doce horarios disponibles para el 6 de octubre de 2026. Reserva comprobada dentro de una transacción revertida: estado programada, profesional asignado, mascota correcta y vínculo con el portal. No queda un turno ficticio.
- Funciones de disponibilidad/reserva: acceso anónimo revocado explícitamente, además de validación del propietario y su organización. Función del trigger sin permisos de ejecución para clientes.

Cambios exclusivos de las ramas de staging `codex/owner-pwa-staging` y `codex/owner-portal-mobile` y del proyecto Supabase staging. No se promueve producción.
