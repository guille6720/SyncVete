import type { TutorialDefinition } from '../types';
import { TOUR_TARGETS } from '../targets';

/**
 * Agenda básico v1 — adapted to the Agenda UI on main:
 * day list, status/professional filters, week nav, nueva cita, form, detail/status.
 *
 * Omitted vs product brief (UI not present on this branch):
 * - Day/week/month calendar toggle
 * - Side panel for appointments
 * - Search box / branch filter / waitlist / availability boards
 */
export const AGENDA_BASICO_TUTORIAL: TutorialDefinition = {
  id: 'agenda-basico',
  moduleId: 'agenda',
  version: 1,
  title: 'Agenda: primeros pasos',
  description:
    'Aprendé a navegar la semana, filtrar turnos, crear una cita y gestionar su estado.',
  audienceRoles: [
    'owner',
    'admin',
    'veterinarian',
    'nurse',
    'receptionist',
    'cashier',
    'lab_tech',
    'readonly',
  ],
  estimatedMinutes: 6,
  difficulty: 'basico',
  startRoute: '/agenda',
  demoScenes: [
    {
      id: 'demo-welcome',
      headline: 'Demostración segura',
      body: 'Esta demo usa datos ficticios. No crea ni modifica turnos reales.',
      mockLabels: {
        clinica: 'Clínica Demo SyncVete',
        profesional: 'Dra. Ana Demo',
      },
      durationMs: 3500,
    },
    {
      id: 'demo-create',
      headline: 'Alta de turno (simulada)',
      body: 'Demostración simulada: en un caso real elegirías paciente y horario. Acá no se guarda nada.',
      mockLabels: {
        paciente: 'Luna (canino)',
        tutor: 'María Ejemplo',
        horario: 'Martes 10:30',
      },
      durationMs: 4000,
    },
    {
      id: 'demo-status',
      headline: 'Estados del turno (simulados)',
      body: 'Demostración: Programada → Confirmada → En curso → Completada. No se guarda ningún cambio real.',
      mockLabels: {
        estado: 'confirmada',
      },
      durationMs: 4000,
    },
  ],
  videoScenes: [
    {
      id: 'v-intro',
      order: 1,
      title: 'Introducción',
      narration:
        'Bienvenida a la Agenda de SyncVete. En pocos minutos vas a ver cómo organizar los turnos del día.',
      caption: 'Agenda SyncVete — primeros pasos',
      durationSec: 8,
      layoutNotes: 'Logo SyncVete centrado, fondo corporativo.',
    },
    {
      id: 'v-overview',
      order: 2,
      title: 'Vista del día',
      narration:
        'La Agenda muestra los turnos del día seleccionado, con el paciente, el tutor y el estado de cada cita.',
      caption: 'Lista de turnos del día',
      durationSec: 12,
    },
    {
      id: 'v-nav',
      order: 3,
      title: 'Navegación semanal',
      narration:
        'Con las flechas cambiás de semana y con Hoy volvés al día actual. Tocá un día de la tira para filtrar.',
      caption: 'Navegá la semana y volvé a Hoy',
      durationSec: 12,
    },
    {
      id: 'v-filters',
      order: 4,
      title: 'Filtros',
      narration:
        'Filtrá por estado o por profesional para enfocarte en lo que necesitás ver ahora.',
      caption: 'Filtros por estado y profesional',
      durationSec: 10,
    },
    {
      id: 'v-create',
      order: 5,
      title: 'Nueva cita',
      narration:
        'Con Nueva cita abrís el formulario: paciente, fecha y hora, duración, tipo y profesional asignado.',
      caption: 'Creá un turno paso a paso',
      durationSec: 18,
    },
    {
      id: 'v-detail',
      order: 6,
      title: 'Detalle y estados',
      narration:
        'Desde el detalle confirmás, iniciás o completás el turno, según el estado actual.',
      caption: 'Gestioná el estado del turno',
      durationSec: 14,
    },
    {
      id: 'v-outro',
      order: 7,
      title: 'Cierre',
      narration:
        'Listo. Practicá en Academia SyncVete cuando quieras. ¡Gracias por usar SyncVete!',
      caption: 'Academia SyncVete',
      durationSec: 8,
      layoutNotes: 'Outro con logo y CTA a Academia.',
    },
  ],
  steps: [
    {
      id: 'welcome',
      title: 'Bienvenida a la Agenda',
      body: 'Este recorrido te muestra cómo usar la Agenda de SyncVete sin inventar pantallas: solo lo que ya tenés en el sistema.',
      target: TOUR_TARGETS.AGENDA_HEADER,
      placement: 'bottom',
      route: '/agenda',
      demoSceneId: 'demo-welcome',
      videoSceneId: 'v-intro',
      narration:
        'Bienvenida a la Agenda de SyncVete. Vamos a recorrer juntos las herramientas del día a día.',
      caption: 'Bienvenida a la Agenda',
    },
    {
      id: 'day-overview',
      title: 'Turnos del día',
      body: 'Acá ves las citas del día elegido: horario, paciente, estado y profesional. Si no hay turnos, podés agendar uno nuevo.',
      target: TOUR_TARGETS.AGENDA_DAY_LIST,
      placement: 'top',
      videoSceneId: 'v-overview',
      narration:
        'La lista del día concentra todos los turnos. Cada tarjeta te lleva al detalle.',
      caption: 'Lista de turnos del día',
    },
    {
      id: 'week-nav',
      title: 'Navegación de fechas',
      body: 'Usá las flechas para cambiar de semana, Hoy para volver al día actual, o tocá un día de la tira semanal.',
      target: TOUR_TARGETS.AGENDA_WEEK_NAV,
      placement: 'bottom',
      videoSceneId: 'v-nav',
      narration: 'Movete entre días y semanas sin perder los filtros activos.',
      caption: 'Navegación semanal',
    },
    {
      id: 'filter-professional',
      title: 'Filtro por profesional',
      body: 'Elegí un profesional para ver solo sus turnos. Ideal cuando hay varias agendas en la misma clínica.',
      target: TOUR_TARGETS.AGENDA_FILTER_PROFESSIONAL,
      placement: 'bottom',
      videoSceneId: 'v-filters',
      narration: 'Filtrá por profesional para enfocarte en una agenda.',
      caption: 'Filtro por profesional',
    },
    {
      id: 'filter-status',
      title: 'Filtro por estado',
      body: 'Podés mostrar solo programadas, confirmadas, en curso u otros estados.',
      target: TOUR_TARGETS.AGENDA_FILTER_STATUS,
      placement: 'bottom',
      narration: 'El filtro de estado te ayuda a priorizar lo pendiente.',
      caption: 'Filtro por estado',
    },
    {
      id: 'new-appointment',
      title: 'Crear un turno',
      body: 'Si tenés permiso de escritura, Nueva cita abre el formulario de alta. En la demo no se guarda nada.',
      target: TOUR_TARGETS.AGENDA_NEW_BUTTON,
      placement: 'left',
      validation: { requirePermission: 'appointments:write' },
      demoSceneId: 'demo-create',
      videoSceneId: 'v-create',
      narration: 'Con Nueva cita empezás el alta de un turno.',
      caption: 'Botón Nueva cita',
    },
    {
      id: 'appointment-form',
      title: 'Formulario de la cita',
      body: 'Completá paciente, fecha y hora, duración, tipo, profesional y sucursal. Guardá solo cuando los datos estén correctos.',
      target: TOUR_TARGETS.AGENDA_FORM,
      placement: 'right',
      route: '/agenda/nueva',
      validation: { requirePermission: 'appointments:write' },
      narration:
        'El formulario reúne paciente, horario y profesional asignado.',
      caption: 'Formulario de nueva cita',
    },
    {
      id: 'appointment-detail',
      title: 'Detalle del turno',
      body: 'Al tocar un turno abrís su detalle: datos del paciente, tipo, notas y acciones disponibles.',
      target: TOUR_TARGETS.AGENDA_DETAIL,
      placement: 'top',
      videoSceneId: 'v-detail',
      narration: 'El detalle concentra la información y las acciones del turno.',
      caption: 'Detalle del turno',
    },
    {
      id: 'status-actions',
      title: 'Estados del turno',
      body: 'Según el estado actual podés confirmar, iniciar, completar, marcar ausente o cancelar. Cada cambio queda registrado.',
      target: TOUR_TARGETS.AGENDA_DETAIL_STATUS,
      placement: 'bottom',
      demoSceneId: 'demo-status',
      narration: 'Gestioná el ciclo de vida del turno desde el detalle.',
      caption: 'Acciones de estado',
    },
    {
      id: 'closing',
      title: 'Listo para practicar',
      body: 'Podés reiniciar este tutorial desde Academia SyncVete cuando quieras. ¡Éxitos con la Agenda!',
      target: TOUR_TARGETS.AGENDA_HEADER,
      placement: 'bottom',
      route: '/agenda',
      videoSceneId: 'v-outro',
      narration: 'Fin del recorrido. Seguimos en Academia SyncVete.',
      caption: 'Tutorial completado',
    },
  ],
};
