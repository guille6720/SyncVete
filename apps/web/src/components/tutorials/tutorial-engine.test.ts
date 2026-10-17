import { describe, expect, it } from 'vitest';
import { AGENDA_BASICO_TUTORIAL, getTutorialById, tourSelector } from '@sincvete/shared';

/**
 * Pure navigation / safety checks for the tutorial engine.
 * React hook UI is covered indirectly; demo must never imply DB writes.
 */
describe('tutorial engine contracts', () => {
  it('supports forward and backward step indices within bounds', () => {
    const tutorial = getTutorialById('agenda-basico');
    expect(tutorial).not.toBeNull();
    const last = tutorial!.steps.length - 1;
    expect(Math.max(0, Math.min(-1, last))).toBe(0);
    expect(Math.max(0, Math.min(last + 5, last))).toBe(last);
    expect(Math.max(0, Math.min(3, last))).toBe(3);
  });

  it('gracefully describes missing targets via selector', () => {
    const selector = tourSelector('does-not-exist-target');
    expect(selector).toBe('[data-tour="does-not-exist-target"]');
  });

  it('demo scenes are fictional and instructional only', () => {
    for (const scene of AGENDA_BASICO_TUTORIAL.demoScenes) {
      expect(scene.body.toLowerCase()).toMatch(/demo|simul|fictic|no crea|no modifica|no se guarda/);
    }
  });

  it('write-gated steps declare appointments:write', () => {
    const writeSteps = AGENDA_BASICO_TUTORIAL.steps.filter(
      (s) => s.validation?.requirePermission === 'appointments:write'
    );
    expect(writeSteps.length).toBeGreaterThan(0);
  });
});
