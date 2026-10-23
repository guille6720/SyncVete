import type { Role } from '../../constants';
import { ROLES } from '../../constants';
import type { TutorialDefinition, TutorialStep, VideoScene } from '../types';
import { moduleActionTarget, moduleTourTargets } from '../targets';

export interface ModuleActionSpec {
  /** Stable id used in step id, video scene id and data-tour suffix. */
  id: string;
  title: string;
  /** On-screen explanation of how to perform the action. */
  body: string;
  /** Spoken narration — should explain the action step by step. */
  narration: string;
  caption?: string;
  /** Optional route override (e.g. /pacientes/nuevo). Defaults to module startRoute. */
  route?: string;
  placement?: TutorialStep['placement'];
  durationSec?: number;
  durationMs?: number;
}

export interface StandardModuleTutorialSpec {
  moduleId: string;
  startRoute: string;
  titleName: string;
  title?: string;
  description: string;
  /** Detailed how-to actions shown after the welcome step. */
  actions: ModuleActionSpec[];
  estimatedMinutes?: number;
  audienceRoles?: Role[];
}

/**
 * Builds a continuous-playback tutorial with detailed per-action steps
 * (same interaction model as Agenda: spotlight + narration + auto-advance).
 */
export function buildStandardModuleTutorial(
  spec: StandardModuleTutorialSpec
): TutorialDefinition {
  const targets = moduleTourTargets(spec.moduleId);
  const name = spec.titleName;
  const title = spec.title ?? `${name}: primeros pasos`;
  const roles = spec.audienceRoles ?? [...ROLES];
  const minutes = spec.estimatedMinutes ?? Math.max(5, 2 + spec.actions.length);
  const actions = spec.actions;

  const videoScenes: VideoScene[] = [
    {
      id: 'v-intro',
      order: 1,
      title: 'Introducción',
      narration: `Bienvenido a ${name} de SyncVete. En este recorrido vas a ver, paso a paso, cómo realizar cada acción importante del módulo.`,
      caption: `${name} SyncVete — primeros pasos`,
      durationSec: 8,
    },
    ...actions.map((action, index) => ({
      id: `v-${action.id}`,
      order: index + 2,
      title: action.title,
      narration: action.narration,
      caption: action.caption ?? action.title,
      durationSec: action.durationSec ?? 14,
    })),
    {
      id: 'v-outro',
      order: actions.length + 2,
      title: 'Cierre',
      narration: `Listo. Ya viste cómo hacer las acciones principales de ${name}. Volvé a Tutoriales SyncVete cuando quieras practicar de nuevo.`,
      caption: 'Tutoriales SyncVete',
      durationSec: 8,
    },
  ];

  const actionSteps: TutorialStep[] = actions.map((action) => ({
    id: action.id,
    title: action.title,
    body: action.body,
    target: moduleActionTarget(spec.moduleId, action.id),
    placement: action.placement ?? 'top',
    route: action.route ?? spec.startRoute,
    videoSceneId: `v-${action.id}`,
    narration: action.narration,
    caption: action.caption ?? action.title,
    animation: {
      preset: 'cursor-highlight',
      durationMs: action.durationMs ?? 3400,
      cursor: true,
      spotlightPulse: true,
    },
  }));

  return {
    id: `${spec.moduleId}-basico`,
    moduleId: spec.moduleId,
    version: 3,
    title,
    description: spec.description,
    audienceRoles: roles,
    estimatedMinutes: minutes,
    difficulty: 'basico',
    startRoute: spec.startRoute,
    demoScenes: [
      {
        id: 'demo-welcome',
        headline: 'Demostración segura',
        body: `Esta demo de ${name} usa solo datos ficticios. No crea ni modifica registros reales.`,
        mockLabels: {
          clinica: 'Clínica Demo SyncVete',
          modulo: name,
        },
        durationMs: 4200,
        narration: `Esta es una demostración segura de ${name} en Tutoriales SyncVete. Todo lo que vas a ver es ficticio: no se crea ni se modifica ningún dato real de tu clínica.`,
        animation: {
          preset: 'cursor-highlight',
          durationMs: 2800,
          cursor: true,
          spotlightPulse: true,
        },
      },
    ],
    videoScenes,
    steps: [
      {
        id: 'welcome',
        title: `Bienvenida a ${name}`,
        body: `Este recorrido te muestra, acción por acción, cómo usar ${name} en SyncVete. Solo se resalta lo que ya existe en el sistema.`,
        target: targets.header,
        placement: 'bottom',
        route: spec.startRoute,
        demoSceneId: 'demo-welcome',
        videoSceneId: 'v-intro',
        narration: `Bienvenido a ${name} de SyncVete. Ahora te voy a mostrar cómo realizar cada acción del módulo, paso a paso.`,
        caption: `Bienvenida a ${name}`,
        animation: {
          preset: 'cursor-highlight',
          durationMs: 2800,
          cursor: true,
          spotlightPulse: true,
        },
      },
      ...actionSteps,
      {
        id: 'closing',
        title: 'Listo para practicar',
        body: `Ya recorriste las acciones principales de ${name}. Podés reiniciar el tutorial desde Tutoriales SyncVete cuando quieras.`,
        target: targets.header,
        placement: 'bottom',
        route: spec.startRoute,
        videoSceneId: 'v-outro',
        narration: `Listo. Practicá ${name} cuando lo necesites desde Tutoriales SyncVete. Gracias por usar SyncVete.`,
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
}
