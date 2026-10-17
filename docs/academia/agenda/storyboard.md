# Storyboard — Agenda SyncVete

| # | Escena | Pantalla / UI | Acción en cámara | Duración | Caption |
|---|--------|---------------|------------------|----------|---------|
| 0 | Intro marca | Logo SyncVete | Fade in logo | 3 s | SyncVete |
| 1 | Intro módulo | `/agenda` cabecera | Zoom suave al título Agenda | 8 s | Agenda SyncVete — primeros pasos |
| 2 | Lista del día | Lista de turnos | Pan vertical sobre tarjetas | 12 s | Lista de turnos del día |
| 3 | Nav semanal | Flechas + Hoy + tira | Click Hoy, luego un día | 12 s | Navegá la semana y volvé a Hoy |
| 4 | Filtros | Selects estado/profesional | Abrir select profesional | 10 s | Filtros por estado y profesional |
| 5 | Nueva cita | Botón + formulario | Click Nueva cita, recorrer campos | 18 s | Creá un turno paso a paso |
| 6 | Detalle | `/agenda/[id]` | Mostrar badge estado + botones | 14 s | Gestioná el estado del turno |
| 7 | Cierre | Academia card | Mostrar card del tutorial | 8 s | Academia SyncVete |
| 8 | Outro | Logo | Fade out | 3 s | Gracias |

## Layouts

### Horizontal 16:9 (1920×1080)

- Safe area 5% márgenes  
- Captions centrados abajo, tipografía sans-serif legible  
- Highlight del `data-tour` con anillo sutil (mismo criterio que el tour in-app)

### Vertical 9:16 (1080×1920)

- UI centrada; crop lateral del shell si hace falta  
- Captions más grandes, máximo 2 líneas  
- Evitar controles tapados por captions

## Grabación

1. Entorno **staging/demo** con `NEXT_PUBLIC_ACADEMIA_ENABLED=true`.
2. Clínica ficticia; sin PHI real.
3. No enviar formularios reales durante la toma de “Nueva cita” (usar demo overlay o cortar antes del submit).
4. Preferir grabación de la app real + overlays de captions en post.

**MP4:** no generado en este PR.
