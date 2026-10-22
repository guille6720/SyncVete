'use client';

import { useEffect, useMemo, useState } from 'react';
import type { TutorialAnimationSpec, TutorialDefinition, TutorialStep } from '@sincvete/shared';
import {
  resolveDemoSceneIndex,
  resolveStepAnimation,
  resolveStepDemoScene,
} from '@/lib/tutorials/animation/resolve-demo-scene';
import { subscribePrefersReducedMotion } from '@/lib/tutorials/animation/prefers-reduced-motion';
import { resolveAnimationDurationMs } from '@sincvete/shared';

export type TutorialGuidePhase = 'intro' | 'guide';

export interface UseTutorialAnimationOptions {
  tutorial: TutorialDefinition | null;
  step: TutorialStep | null;
  stepIndex: number;
  mode: 'interactive' | 'demo';
  active: boolean;
  paused: boolean;
  navigating: boolean;
  phase: TutorialGuidePhase;
  /** Bumped by engine/narration replay to restart visual cues. */
  replayToken?: number;
}

export interface TutorialAnimationRuntime {
  reducedMotion: boolean;
  phase: TutorialGuidePhase;
  animation: TutorialAnimationSpec | null;
  demoScene: ReturnType<typeof resolveStepDemoScene>;
  demoSceneIndex: number;
  durationMs: number;
  showIntroLogo: boolean;
  showOutroLogo: boolean;
  showCursor: boolean;
  spotlightPulse: boolean;
  playKey: string;
  mockFields: NonNullable<TutorialAnimationSpec['mockFields']>;
  statusSequence: string[];
  preset: TutorialAnimationSpec['preset'] | 'none';
}

/**
 * Resolves declarative animation specs into a runtime view-model for overlays.
 * Reusable across future Academia modules — only the definition changes.
 */
export function useTutorialAnimation(
  options: UseTutorialAnimationOptions
): TutorialAnimationRuntime {
  const {
    tutorial,
    step,
    stepIndex,
    mode,
    active,
    paused,
    navigating,
    phase,
    replayToken = 0,
  } = options;

  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => subscribePrefersReducedMotion(setReducedMotion), []);

  const demoScene = useMemo(
    () => resolveStepDemoScene(tutorial, step),
    [tutorial, step]
  );
  const demoSceneIndex = useMemo(
    () => resolveDemoSceneIndex(tutorial, step),
    [tutorial, step]
  );
  const animation = useMemo(
    () => resolveStepAnimation(tutorial, step),
    [tutorial, step]
  );

  const durationMs = resolveAnimationDurationMs(
    animation ?? undefined,
    demoScene?.durationMs,
    reducedMotion
  );

  const preset = animation?.preset ?? 'none';
  const showIntroLogo = active && !navigating && phase === 'intro';
  const showOutroLogo =
    active &&
    mode === 'demo' &&
    !navigating &&
    phase === 'guide' &&
    preset === 'intro-logo' &&
    step != null &&
    stepIndex >= (tutorial?.steps.length ?? 1) - 1;

  // Cursor choreography for continuous demo playback (no click-to-advance).
  const showCursor =
    active &&
    mode === 'demo' &&
    !navigating &&
    phase === 'guide' &&
    !showOutroLogo &&
    Boolean(animation?.cursor);

  const spotlightPulse =
    active &&
    !navigating &&
    phase === 'guide' &&
    !showOutroLogo &&
    Boolean(animation?.spotlightPulse) &&
    !reducedMotion &&
    !paused;

  const playKey = `${tutorial?.id ?? 'none'}:${step?.id ?? 'none'}:${phase}:${replayToken}`;

  return {
    reducedMotion,
    phase,
    animation,
    demoScene,
    demoSceneIndex,
    durationMs,
    showIntroLogo,
    showOutroLogo,
    showCursor,
    spotlightPulse,
    playKey,
    mockFields: animation?.mockFields ?? [],
    statusSequence: animation?.statusSequence ?? [],
    preset,
  };
}
