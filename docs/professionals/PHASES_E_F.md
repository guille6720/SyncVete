# Profesionales — fases posteriores (E/F)

Documento de alcance diferido del MVP staging. **No implementar en este ciclo.**

## Fase E — Permisos granulares + plantillas

1. Editor UI sobre `branch_members.permissions` (JSONB override ya soportado en SQL `has_permission`).
2. Plantillas preset:
   - Veterinario
   - Veterinario administrador
   - Especialista
   - Cirujano
   - Profesional externo
3. Tab **Permisos** en `/profesionales/[id]` solo si hay `user_id`.
4. Mantener enforcement en backend (`requirePermission` + RLS); no confiar solo en ocultar botones.

## Fase F — Dashboard del profesional + auth avanzada

1. Home del veterinario: próximos turnos, sala de espera “míos”, consultas pendientes, mis liquidaciones — compuesto de RPCs existentes.
2. Auth avanzada vía Supabase Admin API:
   - Contraseña temporal
   - Forzar cambio en próximo login (`app_metadata` / flag en `profiles`)
   - Bloquear usuario auth
   - Revocar sesiones activas
3. Evaluar `professional_service_records` **solo si** aparece requisito legal/contable de ledger independiente del motor `calculate_professional_settlement`.

## Recordatorio MVP actual

- Liquidaciones se alimentan al calcular desde fuentes clínicas existentes (sin tabla service_records).
- Acceso básico = invitar/vincular + activar/desactivar membresía.
- Snapshot `calculation_snapshot` se congela al aprobar.
