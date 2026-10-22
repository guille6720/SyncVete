import type { DemoScene, TutorialDefinition, TutorialStep } from '@sincvete/shared';

/** Resolve the demo scene linked to a step via `demoSceneId`. */
export function resolveStepDemoScene(
  tutorial: TutorialDefinition | null | undefined,
  step: TutorialStep | null | undefined
): DemoScene | null {
  if (!tutorial || !step?.demoSceneId) return null;
  return tutorial.demoScenes.find((scene) => scene.id === step.demoSceneId) ?? null;
}

/** Index of the linked demo scene within `tutorial.demoScenes`, or -1. */
export function resolveDemoSceneIndex(
  tutorial: TutorialDefinition | null | undefined,
  step: TutorialStep | null | undefined
): number {
  if (!tutorial || !step?.demoSceneId) return -1;
  return tutorial.demoScenes.findIndex((scene) => scene.id === step.demoSceneId);
}

/**
 * Effective animation spec: scene animation wins when present, else step animation.
 * Keeps modules declarative while allowing scene-specific mock choreography.
 */
export function resolveStepAnimation(
  tutorial: TutorialDefinition | null | undefined,
  step: TutorialStep | null | undefined
) {
  const scene = resolveStepDemoScene(tutorial, step);
  return scene?.animation ?? step?.animation ?? null;
}
