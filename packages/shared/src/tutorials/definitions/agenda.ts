import type { TutorialDefinition } from '../types';
import { TOUR_TARGETS } from '../targets';
import {
  DEFAULT_DEMO_APPOINTMENT_FIELDS,
  DEFAULT_DEMO_STATUS_SEQUENCE,
} from '../animation';

/**
 * Agenda básico v3 — adapted to the Agenda UI on main:
 * day list, status/professional filters, week nav, nueva cita, form, detail/status.
 *
 * Narration scripts are Argentine Spanish for the Academia voice-over engine.
 * Animation presets drive the reusable Academia motion runtime (logo intro,
 * cursor, mock create, status cycle) without touching real clinical data.
 *
 * Omitted vs product brief (UI not present on this branch):
 * - Day/week/month calendar toggle
 * - Side panel for appointments
 * - Search box / branch filter / waitlist / availability boards
 */
export const AGENDA_BASICO_TUTORIAL: TutorialDefinition = {
  id: 'agenda-basico',
  moduleId: 'agenda',
  version: 3,
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
      durationMs: 4200,
      narration:
        'Esta es una demostración segura de Tutoriales SyncVete. Todo lo que vas a ver es ficticio: no se crea ni se modifica ningún turno real de tu clínica.',
      animation: {
        preset: 'cursor-highlight',
        durationMs: 2800,
        cursor: true,
        spotlightPulse: true,
      },
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
      durationMs: 5200,
      narration:
        'En un alta real elegirías paciente, tutor y horario. Acá lo simulamos con Luna, María Ejemplo y un turno el martes a las diez y media. No se guarda nada.',
      animation: {
        preset: 'mock-appointment-create',
        durationMs: 4800,
        cursor: true,
        spotlightPulse: true,
        mockFields: [...DEFAULT_DEMO_APPOINTMENT_FIELDS],
      },
    },
    {
      id: 'demo-status',
      headline: 'Estados del turno (simulados)',
      body: 'Demostración: Programada → Confirmada → En curso → Completada. No se guarda ningún cambio real.',
      mockLabels: {
        estado: 'confirmada',
      },
      durationMs: 5200,
      narration:
        'Los estados del turno te permiten seguir el ciclo de atención: programada, confirmada, en curso y completada. En la demo solo lo mostramos; no cambia ningún registro real.',
      animation: {
        preset: 'status-cycle',
        durationMs: 4800,
        cursor: true,
        spotlightPulse: true,
        statusSequence: [...DEFAULT_DEMO_STATUS_SEQUENCE],
      },
    },
  ],
  videoScenes: [
    {
      id: 'v-intro',
      order: 1,
      title: 'Introducción',
      narration:
        '¡Bienvenido a la Agenda de SyncVete! En este recorrido vas a aprender cómo organizar los turnos de tu veterinaria.',
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
        'Listo. Practicá en Tutoriales SyncVete cuando quieras. ¡Gracias por usar SyncVete!',
      caption: 'Tutoriales SyncVete',
      durationSec: 8,
      layoutNotes: 'Outro con logo y CTA a Tutoriales.',
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
        '¡Bienvenido a la Agenda de SyncVete! En este recorrido vas a aprender cómo organizar los turnos de tu veterinaria, consultar las citas y administrar la atención de tus pacientes.',
      caption: 'Bienvenida a la Agenda',
      animation: {
        preset: 'cursor-highlight',
        durationMs: 2800,
        cursor: true,
        spotlightPulse: true,
      },
    },
    {
      id: 'day-overview',
      title: 'Turnos del día',
      body: 'Acá ves las citas del día elegido: horario, paciente, estado y profesional. Si no hay turnos, podés agendar uno nuevo.',
      target: TOUR_TARGETS.AGENDA_DAY_LIST,
      placement: 'top',
      route: '/agenda',
      videoSceneId: 'v-overview',
      narration:
        'Esta es la lista de turnos del día. Acá ves el horario, el paciente, el estado y el profesional de cada cita. Si tocás una tarjeta, abrís el detalle del turno.',
      caption: 'Lista de turnos del día',
      animation: {
        preset: 'cursor-highlight',
        durationMs: 3000,
        cursor: true,
        spotlightPulse: true,
      },
    },
    {
      id: 'week-nav',
      title: 'Navegación de fechas',
      body: 'Usá las flechas para cambiar de semana, Hoy para volver al día actual, o tocá un día de la tira semanal.',
      target: TOUR_TARGETS.AGENDA_WEEK_NAV,
      placement: 'bottom',
      route: '/agenda',
      videoSceneId: 'v-nav',
      narration:
        'Con la navegación de fechas te movés entre días y semanas. Usá las flechas para cambiar de semana, el botón Hoy para volver al día actual, o tocá un día de la tira semanal. Los filtros que tengas activos se mantienen.',
      caption: 'Navegación semanal',
      animation: {
        preset: 'cursor-highlight',
        durationMs: 3200,
        cursor: true,
        spotlightPulse: true,
      },
    },
    {
      id: 'filter-professional',
      title: 'Filtro por profesional',
      body: 'Elegí un profesional para ver solo sus turnos. Ideal cuando hay varias agendas en la misma clínica.',
      target: TOUR_TARGETS.AGENDA_FILTER_PROFESSIONAL,
      placement: 'bottom',
      route: '/agenda',
      videoSceneId: 'v-filters',
      narration:
        'Con el filtro por profesional podés ver solo la agenda de un veterinario o de un integrante del equipo. Es ideal cuando hay varias agendas en la misma clínica.',
      caption: 'Filtro por profesional',
      animation: {
        preset: 'cursor-highlight',
        durationMs: 2800,
        cursor: true,
        spotlightPulse: true,
      },
    },
    {
      id: 'filter-status',
      title: 'Filtro por estado',
      body: 'Podés mostrar solo programadas, confirmadas, en curso u otros estados.',
      target: TOUR_TARGETS.AGENDA_FILTER_STATUS,
      placement: 'bottom',
      route: '/agenda',
      narration:
        'El filtro por estado te ayuda a priorizar. Podés mostrar solo las citas programadas, confirmadas, en curso u otros estados según lo que necesites atender ahora.',
      caption: 'Filtro por estado',
      animation: {
        preset: 'cursor-highlight',
        durationMs: 2800,
        cursor: true,
        spotlightPulse: true,
      },
    },
    {
      id: 'new-appointment',
      title: 'Crear un turno',
      body: 'Si tenés permiso de escritura, Nueva cita abre el formulario de alta. En la demo no se guarda nada.',
      target: TOUR_TARGETS.AGENDA_NEW_BUTTON,
      placement: 'left',
      route: '/agenda',
      validation: { requirePermission: 'appointments:write' },
      demoSceneId: 'demo-create',
      videoSceneId: 'v-create',
      narration:
        'El botón Nueva cita abre el alta de un turno. Si estás en la demostración de Tutoriales, no se guarda ningún dato real: solo practicamos el recorrido.',
      caption: 'Botón Nueva cita',
      animation: {
        preset: 'mock-appointment-create',
        durationMs: 4800,
        cursor: true,
        spotlightPulse: true,
        mockFields: [...DEFAULT_DEMO_APPOINTMENT_FIELDS],
      },
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
        'En el formulario completás paciente, fecha y hora, duración, tipo de atención, profesional y sucursal. Revisá bien los datos antes de guardar.',
      caption: 'Formulario de nueva cita',
      animation: {
        preset: 'mock-appointment-create',
        durationMs: 4200,
        cursor: true,
        spotlightPulse: true,
        mockFields: [...DEFAULT_DEMO_APPOINTMENT_FIELDS],
      },
    },
    {
      id: 'appointment-detail',
      title: 'Detalle del turno',
      body: 'Al tocar un turno abrís su detalle: datos del paciente, tipo, notas y acciones disponibles. Si aún no hay turno demo, verás una demostración etiquetada sin datos reales.',
      target: TOUR_TARGETS.AGENDA_DETAIL,
      placement: 'top',
      route: '/agenda',
      requiresDemoAppointment: true,
      allowDemoFallback: true,
      demoSceneId: 'demo-status',
      videoSceneId: 'v-detail',
      narration:
        'El detalle del turno concentra la información del paciente, el tipo de atención, las notas y las acciones disponibles. Si todavía no hay un turno demo, vas a ver una demostración etiquetada sin datos reales.',
      caption: 'Detalle del turno',
      animation: {
        preset: 'status-cycle',
        durationMs: 4000,
        cursor: true,
        spotlightPulse: true,
        statusSequence: [...DEFAULT_DEMO_STATUS_SEQUENCE],
      },
    },
    {
      id: 'status-actions',
      title: 'Estados del turno',
      body: 'Según el estado actual podés confirmar, iniciar, completar, marcar ausente o cancelar. El tutorial nunca cambia el estado automáticamente.',
      target: TOUR_TARGETS.AGENDA_DETAIL_STATUS,
      placement: 'bottom',
      route: '/agenda',
      requiresDemoAppointment: true,
      allowDemoFallback: true,
      demoSceneId: 'demo-status',
      narration:
        'Desde acá gestionás el ciclo de vida del turno: confirmar, iniciar, completar, marcar ausente o cancelar, según el estado actual. El tutorial nunca cambia el estado solo: vos decidís cuándo hacerlo.',
      caption: 'Acciones de estado',
      animation: {
        preset: 'status-cycle',
        durationMs: 4800,
        cursor: true,
        spotlightPulse: true,
        statusSequence: [...DEFAULT_DEMO_STATUS_SEQUENCE],
      },
    },
    {
      id: 'closing',
      title: 'Listo para practicar',
      body: 'Podés reiniciar este tutorial desde Tutoriales SyncVete cuando quieras. ¡Éxitos con la Agenda!',
      target: TOUR_TARGETS.AGENDA_HEADER,
      placement: 'bottom',
      route: '/agenda',
      videoSceneId: 'v-outro',
      narration:
        '¡Listo! Ya recorriste lo esencial de la Agenda. Podés volver a Tutoriales SyncVete y reiniciar este tutorial cuando quieras practicar. ¡Éxitos con la atención de tus pacientes!',
      caption: 'Tutorial completado',
      animation: {
        preset: 'intro-logo',
        durationMs: 2600,
        cursor: false,
        spotlightPulse: false,
      },
    },
  ],
};
