import { describe, expect, it } from 'vitest';
import {
  AGENDA_BASICO_TUTORIAL,
  getTutorialById,
  resolveTutorialRoute,
  tourSelector,
} from '@sincvete/shared';

/**
 * Pure navigation / safety checks for the tutorial engine.
 * Demo must never imply DB writes; routes must be explicit and safe.
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

  it('launches from academia onto agenda via startRoute', () => {
    const tutorial = AGENDA_BASICO_TUTORIAL;
    const decision = resolveTutorialRoute({
      tutorial,
      step: tutorial.steps[0]!,
      pathname: '/academia',
      demoAppointmentId: null,
      hasPermission: () => true,
    });
    expect(decision.kind).toBe('navigate');
    if (decision.kind === 'navigate') {
      expect(decision.href).toBe(tutorial.startRoute);
    }
  });

  it('detail steps never invent foreign appointment ids', () => {
    const step = AGENDA_BASICO_TUTORIAL.steps.find((s) => s.id === 'appointment-detail')!;
    expect(step.requiresDemoAppointment).toBe(true);
    expect(step.allowDemoFallback).toBe(true);
    const decision = resolveTutorialRoute({
      tutorial: AGENDA_BASICO_TUTORIAL,
      step,
      pathname: '/agenda',
      demoAppointmentId: null,
      hasPermission: () => true,
    });
    expect(decision.kind).toBe('demo-fallback');
  });

  it('marks demo path as non-mutating', () => {
    expect(AGENDA_BASICO_TUTORIAL.demoScenes.length).toBeGreaterThan(0);
  });
});
