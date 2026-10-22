import { describe, expect, it } from 'vitest';
import {
  AGENDA_BASICO_TUTORIAL,
  CLINIC_MODULE_TUTORIALS,
  TOUR_TARGETS,
  buildAcademyCards,
  getTutorialById,
  listTutorials,
  listTutorialsForRole,
  moduleTourTargets,
  tourSelector,
} from '../tutorials';

describe('tutorial registry', () => {
  it('registers agenda-basico v3', () => {
    const tutorial = getTutorialById('agenda-basico');
    expect(tutorial).not.toBeNull();
    expect(tutorial?.version).toBe(3);
    expect(tutorial?.moduleId).toBe('agenda');
    expect(tutorial?.steps.length).toBeGreaterThanOrEqual(8);
  });

  it('registers standard tutorials for clinic modules including dashboard', () => {
    expect(getTutorialById('dashboard-basico')).not.toBeNull();
    expect(CLINIC_MODULE_TUTORIALS.length).toBeGreaterThanOrEqual(20);
    const ids = listTutorials().map((t) => t.moduleId);
    expect(ids).toContain('dashboard');
    expect(ids).toContain('pacientes');
    expect(ids).not.toContain('configuracion');
    expect(ids).not.toContain('academia');
    expect(ids).not.toContain('superadmin');
    for (const tutorial of CLINIC_MODULE_TUTORIALS) {
      expect(tutorial.version).toBe(3);
      expect(tutorial.videoScenes.length).toBeGreaterThan(0);
      expect(tutorial.steps.every((s) => (s.narration?.trim().length ?? 0) > 20)).toBe(true);
      expect(tutorial.steps[0]?.target).toBe(moduleTourTargets(tutorial.moduleId).header);
      const actionSteps = tutorial.steps.filter(
        (s) => s.id !== 'welcome' && s.id !== 'closing'
      );
      expect(actionSteps.length).toBeGreaterThanOrEqual(3);
      for (const step of actionSteps) {
        expect(step.target).toBe(`${tutorial.moduleId}-${step.id}`);
        expect(step.body.length).toBeGreaterThan(40);
        expect(step.narration?.trim().length).toBeGreaterThan(60);
      }
    }
  });

  it('lists tutorials and filters by role', () => {
    expect(listTutorials().some((t) => t.id === 'agenda-basico')).toBe(true);
    expect(listTutorialsForRole('receptionist').length).toBeGreaterThan(0);
    expect(listTutorialsForRole('owner')).toEqual(listTutorials());
  });

  it('builds academy cards with progress', () => {
    const cards = buildAcademyCards('admin', {
      'agenda-basico': {
        tutorialId: 'agenda-basico',
        tutorialVersion: 3,
        currentStepIndex: 2,
        status: 'in_progress',
        startedAt: '2026-10-17T00:00:00.000Z',
        completedAt: null,
        updatedAt: '2026-10-17T00:00:00.000Z',
      },
    });
    const agenda = cards.find((c) => c.tutorialId === 'agenda-basico');
    expect(cards[0]?.tutorialId).toBe('dashboard-basico');
    expect(agenda?.progress?.status).toBe('in_progress');
  });

  it('uses stable tour selectors', () => {
    expect(tourSelector(TOUR_TARGETS.AGENDA_HEADER)).toBe('[data-tour="agenda-header"]');
  });

  it('includes video and demo metadata for production pipeline', () => {
    expect(AGENDA_BASICO_TUTORIAL.videoScenes.length).toBeGreaterThan(0);
    expect(AGENDA_BASICO_TUTORIAL.demoScenes.every((s) => s.body.includes('No') || s.body.length > 0)).toBe(
      true
    );
    expect(AGENDA_BASICO_TUTORIAL.demoScenes[0]?.mockLabels?.profesional).toMatch(/Demo/i);
  });

  it('provides Argentine Spanish narration for every agenda step and demo scene', () => {
    expect(AGENDA_BASICO_TUTORIAL.steps).toHaveLength(10);
    for (const step of AGENDA_BASICO_TUTORIAL.steps) {
      expect(step.narration?.trim().length).toBeGreaterThan(40);
    }
    expect(AGENDA_BASICO_TUTORIAL.steps[0]?.narration).toMatch(/Bienvenido a la Agenda de SyncVete/i);
    for (const scene of AGENDA_BASICO_TUTORIAL.demoScenes) {
      expect(scene.narration?.trim().length).toBeGreaterThan(20);
    }
  });

  it('omits invented calendar-month steps (UI not on main)', () => {
    const ids = AGENDA_BASICO_TUTORIAL.steps.map((s) => s.id);
    expect(ids).not.toContain('month-view');
    expect(ids).not.toContain('side-panel');
    expect(ids).toContain('week-nav');
    expect(ids).toContain('new-appointment');
  });

  it('declares reusable animation presets for Agenda demo choreography', () => {
    const create = AGENDA_BASICO_TUTORIAL.demoScenes.find((s) => s.id === 'demo-create');
    const status = AGENDA_BASICO_TUTORIAL.demoScenes.find((s) => s.id === 'demo-status');
    expect(create?.animation?.preset).toBe('mock-appointment-create');
    expect(status?.animation?.preset).toBe('status-cycle');
    expect(create?.animation?.mockFields?.some((field) => /Luna/i.test(field.value))).toBe(true);
    expect(create?.animation?.mockFields?.some((field) => /Ejemplo/i.test(field.value))).toBe(true);
    for (const step of AGENDA_BASICO_TUTORIAL.steps) {
      expect(step.animation?.preset).toBeTruthy();
    }
  });
});
