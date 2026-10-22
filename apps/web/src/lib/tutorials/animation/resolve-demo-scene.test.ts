import { describe, expect, it } from 'vitest';
import { AGENDA_BASICO_TUTORIAL } from '@sincvete/shared';
import {
  resolveDemoSceneIndex,
  resolveStepAnimation,
  resolveStepDemoScene,
} from '@/lib/tutorials/animation/resolve-demo-scene';

describe('resolve demo scene / animation', () => {
  it('links agenda steps to demo scenes via demoSceneId', () => {
    const create = AGENDA_BASICO_TUTORIAL.steps.find((s) => s.id === 'new-appointment')!;
    const scene = resolveStepDemoScene(AGENDA_BASICO_TUTORIAL, create);
    expect(scene?.id).toBe('demo-create');
    expect(resolveDemoSceneIndex(AGENDA_BASICO_TUTORIAL, create)).toBeGreaterThanOrEqual(0);
    expect(resolveStepAnimation(AGENDA_BASICO_TUTORIAL, create)?.preset).toBe(
      'mock-appointment-create'
    );
  });

  it('falls back to step animation when no demo scene is linked', () => {
    const week = AGENDA_BASICO_TUTORIAL.steps.find((s) => s.id === 'week-nav')!;
    expect(resolveStepDemoScene(AGENDA_BASICO_TUTORIAL, week)).toBeNull();
    expect(resolveStepAnimation(AGENDA_BASICO_TUTORIAL, week)?.preset).toBe('cursor-highlight');
  });
});
