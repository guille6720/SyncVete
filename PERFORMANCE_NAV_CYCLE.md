# PERFORMANCE_NAV_CYCLE — SyncVete (staging only)

**Fecha:** 2026-09-10  
**Rama:** `staging/perf-navigation` (basada en `staging/perf-phase-2-session`)  
**Producción (`main`):** **no modificada**

---

## Contexto

La rama staging ya incluía la mitigación de la causa raíz de Fase 1 (`React.cache` en sesión, bootstrap RPC, `loading.tsx`, streaming dashboard, selects explícitos, índices `00035`–`00038`). Este ciclo atacó **gaps restantes** que seguían frenando la navegación entre módulos del sidebar.

---

## 1. Problemas encontrados (clasificados)

### P0 — crítico / arquitectura

| # | Problema | Causa raíz |
| --- | --- | --- |
| P0.1 | `(clinic)/layout` bloqueaba cada nav con `count_unread_notifications` | Badge de notificaciones en el path crítico junto a branches/entitlements |
| P0.2 *(ya mitigado en staging previo)* | `getSessionContext` sin memoización → 4–8× por hop | Sin `React.cache` / sin RPC bootstrap |
| P0.3 *(ya mitigado)* | Waterfall layout session → branches → unread | Awaits secuenciales |

### P1 — navegación importante

| # | Problema | Causa raíz |
| --- | --- | --- |
| P1.1 | `/configuracion` waterfall: clínica → plan → seats → branches → equipo → feature flags | Fetches secuenciales + `listBranches` duplicado |
| P1.2 | `/consultas` 3× `can*` + cola antes de historial | Permisos vía helpers que re-entran entitlements; historial no stream-first |
| P1.3 | `/sala-espera` dos oleadas: flags/meta luego entries/appointments | Lista del día esperaba a flags |
| P1.4 | Sin `loading.tsx` en Configuración | Pantalla anterior “pegada” hasta RSC |
| P1.5 | `CommandPalette` (cmdk + muchos iconos) en bundle inicial del shell | Import eager |

### P2 — secundario

| # | Problema | Notas |
| --- | --- | --- |
| P2.1 | `getProfessionalForCurrentUser` sin cache + `select('*')` en shell | Afecta nav item liquidaciones |
| P2.2 | `router.refresh()` post-mutación | Correcto; costoso porque re-corre layout (aceptado) |
| P2.3 | Hard reloads solo en settings/update banner | No afectan sidebar |

---

## 2. Causa raíz (síntesis)

La lentitud percibida al navegar **no** era hard reload del browser. Sidebar ya usa `next/link`.

El coste dominante es:

1. **RSC del layout clinic + page** en cada soft-nav.
2. Trabajo **no crítico** (unread RPC, cmdk) en el path que bloquea paint.
3. Páginas que aún serializan fetches independientes (Configuración, Sala de espera).

RLS / multi-tenant / permisos **no** se debilitaron.

---

## 3. Archivos modificados (este ciclo)

- `apps/web/src/app/(clinic)/layout.tsx` — unread fuera del critical path (Suspense)
- `apps/web/src/components/layout/app-shell.tsx` — slot de campana + dynamic `CommandPalette`
- `apps/web/src/components/notifications/clinic-unread-notifications-bell.tsx` — **nuevo**
- `apps/web/src/app/(clinic)/configuracion/page.tsx` — `Promise.all` de tabs
- `apps/web/src/app/(clinic)/configuracion/loading.tsx` — **nuevo**
- `apps/web/src/app/(clinic)/consultas/page.tsx` — permisos desde sesión + historial en Suspense
- `apps/web/src/app/(clinic)/sala-espera/page.tsx` — una sola oleada paralela
- `apps/web/src/app/(clinic)/profesionales/page.tsx` — session en paralelo con canRead
- `apps/web/src/actions/professionals.ts` — `React.cache` en perfil profesional del usuario

---

## 4. Consultas optimizadas

| Antes | Después |
| --- | --- |
| Layout: unread RPC bloqueante cada hop | Unread en Suspense (shell pinta sin esperar RPC) |
| Config: 2× `listBranches` + cadena serial | 1× branches + tabs en paralelo |
| Consultas: `canRead` + `canManage` + `canHistory` (+ feature c/u) | 1 sesión + 1 `canUseFeature` + permisos en memoria |
| Sala espera: meta → luego lista | Meta + lista + agenda semana en un `Promise.all` |
| Shell: professional lookup sin cache | Request-scoped cache |

**Sin cambios de RLS. Sin migraciones nuevas en este ciclo.**

---

## 5. Índices

Ninguno nuevo aquí. Siguen pendientes de aplicar en Supabase **staging** (si no están):

- `00035_cap_active_prescriptions.sql`
- `00036_clinical_list_light_payload.sql`
- `00037_patients_search_perf.sql`
- `00038_performance_hot_path_indexes.sql`
- RPC `get_session_bootstrap` (perf auth previo)

---

## 6. Requests eliminados / evitados (por hop)

| Ruta | Antes (est. en path crítico) | Después |
| --- | --- | --- |
| Layout | session + branches + **unread** + entitlements + professional | session + branches + entitlements + professional (**unread diferido**) |
| Configuración | ~6–10 serial | ~1 oleada paralela (~mismo nº, menos latencia wall-clock) |
| Consultas | 3 can* + queue + history | 1 feature + queue; history stream |
| Sala espera | 2 oleadas | 1 oleada |

---

## 7. Hard reloads eliminados

**0** en sidebar (ya no había). No se agregaron. Settings siguen con `location.reload` puntual (fuera de alcance nav).

---

## 8. Tiempo antes / después (proxy estructural)

*Sin Lighthouse live en este entorno. Proxy = round-trips en path crítico + streaming.*

| Módulo | Antes (Fase 1 / main) | Staging previo | Este ciclo |
| --- | ---: | ---: | --- |
| Layout shell | 11–14 RT serial | ~5–7 paralelo | **~4–6 crítico** + unread stream |
| Dashboard | 25–30 | ~8–12 + stream | sin cambio extra |
| Agenda | 23–30 | ~9–14 bootstrap | sin cambio extra |
| Pacientes | 21–24 | ~7–10 | sin cambio extra |
| Consultas | 26–34 | parcial Suspense | **menos can* + paint cola primero** |
| Sala espera | 2 waves | — | **1 wave** |
| Configuración | serial tabs | serial | **paralelo + loading.tsx** |
| Profesionales | can → luego data | — | can∥session |

Objetivos UX:

- Estructura de pantalla (loading/shell): objetivo **&lt; 300 ms** percibido → `loading.tsx` + progress bar + unread no bloqueante.
- Contenido principal: ideal **&lt; 1 s** con migraciones aplicadas y sesión bootstrap.
- Sin hard reload entre módulos internos: **cumplido**.

---

## 9. Riesgos

- Badge de notificaciones puede aparecer ~100–300 ms después del shell (fallback count=0). Aceptable.
- `CommandPalette` con `ssr: false`: ⌘K no disponible hasta hidratar el chunk (ms). Trigger sigue visible.
- Cancel checkout en Config aún hace un segundo fetch de plan (path raro).
- Medición TTFB real requiere preview Vercel + Network panel.

---

## 10. Recomendaciones siguientes

1. Aplicar migraciones `00035`–`00038` + `get_session_bootstrap` en Supabase **staging**.
2. Deploy preview de `staging/perf-navigation` y medir Network en la secuencia Dashboard → Agenda → Pacientes → HC → Consultas → Sala espera → Profesionales → Dashboard (×3 caliente).
3. Considerar `unstable_cache` / tag **solo** para summary de dashboard no-PHI o TTLs cortos (cuidado multi-tenant).
4. Reducir `router.refresh()` post-mutación a invalidación por tag donde sea seguro.
5. **No mergear a `main`/prod** hasta validar en staging live.
6. Opcional: RPC `get_shell_context` (branches + entitlements + linked-pro flag) en un solo round-trip.

---

## Veredicto

Causa real (sesión repetida + layout waterfall) ya estaba mitigada en staging. Este ciclo **acota el path crítico del layout**, paraleliza Configuración/Sala de espera/Consultas y evita cargar cmdk en el critical JS del shell. Producción intacta.
