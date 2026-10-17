import { describe, expect, it } from 'vitest';
import {
  AGENDA_BASICO_TUTORIAL,
  TOUR_TARGETS,
  buildAcademyCards,
  getTutorialById,
  listTutorials,
  listTutorialsForRole,
  tourSelector,
} from '../tutorials';

describe('tutorial registry', () => {
  it('registers agenda-basico v2', () => {
    const tutorial = getTutorialById('agenda-basico');
    expect(tutorial).not.toBeNull();
    expect(tutorial?.version).toBe(2);
    expect(tutorial?.moduleId).toBe('agenda');
    expect(tutorial?.steps.length).toBeGreaterThanOrEqual(8);
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
        tutorialVersion: 2,
        currentStepIndex: 2,
        status: 'in_progress',
        startedAt: '2026-10-17T00:00:00.000Z',
        completedAt: null,
        updatedAt: '2026-10-17T00:00:00.000Z',
      },
    });
    expect(cards[0]?.tutorialId).toBe('agenda-basico');
    expect(cards[0]?.progress?.status).toBe('in_progress');
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

  it('omits invented calendar-month steps (UI not on main)', () => {
    const ids = AGENDA_BASICO_TUTORIAL.steps.map((s) => s.id);
    expect(ids).not.toContain('month-view');
    expect(ids).not.toContain('side-panel');
    expect(ids).toContain('week-nav');
    expect(ids).toContain('new-appointment');
  });
});
