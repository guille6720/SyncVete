import type { Role } from '../constants';
import { AGENDA_BASICO_TUTORIAL } from './definitions/agenda';
import { CLINIC_MODULE_TUTORIALS } from './definitions/clinic-modules';
import type { AcademyModuleCard, TutorialDefinition, TutorialProgress } from './types';

/** Agenda (detailed) + standard clinic-module tutorials. No config / academia / superadmin. */
const TUTORIALS: TutorialDefinition[] = [
  ...CLINIC_MODULE_TUTORIALS.filter((t) => t.moduleId === 'dashboard'),
  AGENDA_BASICO_TUTORIAL,
  ...CLINIC_MODULE_TUTORIALS.filter((t) => t.moduleId !== 'dashboard'),
];

const byId = new Map(TUTORIALS.map((t) => [t.id, t]));

export function listTutorials(): TutorialDefinition[] {
  return [...TUTORIALS];
}

export function getTutorialById(id: string): TutorialDefinition | null {
  return byId.get(id) ?? null;
}

export function listTutorialsForRole(role: Role): TutorialDefinition[] {
  return TUTORIALS.filter((t) => t.audienceRoles.includes(role));
}

export function listTutorialsByModule(moduleId: string): TutorialDefinition[] {
  return TUTORIALS.filter((t) => t.moduleId === moduleId);
}

export function buildAcademyCards(
  role: Role,
  progressByTutorial: Record<string, TutorialProgress | undefined>
): AcademyModuleCard[] {
  return listTutorialsForRole(role).map((tutorial) => ({
    tutorialId: tutorial.id,
    moduleId: tutorial.moduleId,
    title: tutorial.title,
    description: tutorial.description,
    estimatedMinutes: tutorial.estimatedMinutes,
    difficulty: tutorial.difficulty,
    startRoute: tutorial.startRoute,
    progress: progressByTutorial[tutorial.id] ?? null,
  }));
}

export { AGENDA_BASICO_TUTORIAL, CLINIC_MODULE_TUTORIALS };
