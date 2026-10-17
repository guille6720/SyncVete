'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  getTutorialById,
  tourSelector,
  type TutorialDefinition,
  type TutorialMode,
  type TutorialProgressStatus,
  type TutorialStep,
} from '@sincvete/shared';
import { upsertTutorialProgress } from '@/actions/tutorial-progress';
import {
  buildProgressPatch,
  readLocalTutorialProgress,
  writeLocalTutorialProgress,
} from '@/lib/tutorials/local-progress';

export interface TutorialEngineState {
  tutorial: TutorialDefinition | null;
  stepIndex: number;
  step: TutorialStep | null;
  mode: TutorialMode;
  active: boolean;
  targetMissing: boolean;
  targetRect: DOMRect | null;
  demoSceneIndex: number;
  paused: boolean;
}

export interface UseTutorialEngineOptions {
  organizationId?: string | null;
  userId?: string | null;
  permissions?: string[];
  onComplete?: (tutorialId: string) => void;
}

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function findTargetRect(target?: string): { rect: DOMRect | null; missing: boolean } {
  if (!target || typeof document === 'undefined') {
    return { rect: null, missing: Boolean(target) };
  }
  const el = document.querySelector(tourSelector(target));
  if (!el) return { rect: null, missing: true };
  el.scrollIntoView({
    block: 'center',
    inline: 'nearest',
    behavior: prefersReducedMotion() ? 'auto' : 'smooth',
  });
  return { rect: el.getBoundingClientRect(), missing: false };
}

export function useTutorialEngine(options: UseTutorialEngineOptions = {}) {
  const { organizationId, userId, permissions = [], onComplete } = options;
  const [tutorialId, setTutorialId] = useState<string | null>(null);
  const [stepIndex, setStepIndex] = useState(0);
  const [mode, setMode] = useState<TutorialMode>('interactive');
  const [active, setActive] = useState(false);
  const [paused, setPaused] = useState(false);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const [targetMissing, setTargetMissing] = useState(false);
  const [demoSceneIndex, setDemoSceneIndex] = useState(0);
  const demoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const tutorial = useMemo(
    () => (tutorialId ? getTutorialById(tutorialId) : null),
    [tutorialId]
  );

  const step = tutorial?.steps[stepIndex] ?? null;

  const persist = useCallback(
    (nextIndex: number, status: TutorialProgressStatus) => {
      if (!tutorial || !organizationId || !userId) return;
      const previous = readLocalTutorialProgress(organizationId, userId, tutorial.id);
      const patch = buildProgressPatch({
        tutorialId: tutorial.id,
        tutorialVersion: tutorial.version,
        currentStepIndex: nextIndex,
        status,
        previous,
      });
      writeLocalTutorialProgress(organizationId, userId, patch);
      void upsertTutorialProgress({
        tutorialId: tutorial.id,
        tutorialVersion: tutorial.version,
        currentStepIndex: nextIndex,
        status,
      });
    },
    [tutorial, organizationId, userId]
  );

  const measureTarget = useCallback(() => {
    if (!step) {
      setTargetRect(null);
      setTargetMissing(false);
      return;
    }
    if (
      step.validation?.requirePermission &&
      !permissions.includes(step.validation.requirePermission)
    ) {
      setTargetRect(null);
      setTargetMissing(true);
      return;
    }
    const { rect, missing } = findTargetRect(step.target);
    setTargetRect(rect);
    setTargetMissing(missing);
  }, [step, permissions]);

  useEffect(() => {
    if (!active || paused) return;
    measureTarget();
    const onResize = () => measureTarget();
    window.addEventListener('resize', onResize);
    window.addEventListener('scroll', onResize, true);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('scroll', onResize, true);
    };
  }, [active, paused, measureTarget, stepIndex]);

  const clearDemoTimer = () => {
    if (demoTimerRef.current) {
      clearTimeout(demoTimerRef.current);
      demoTimerRef.current = null;
    }
  };

  const stop = useCallback(
    (status: TutorialProgressStatus = 'skipped') => {
      clearDemoTimer();
      if (tutorial) persist(stepIndex, status);
      setActive(false);
      setPaused(false);
      setTutorialId(null);
      setStepIndex(0);
      setDemoSceneIndex(0);
      setTargetRect(null);
      setTargetMissing(false);
    },
    [tutorial, stepIndex, persist]
  );

  const startTutorial = useCallback(
    (id: string, startMode: TutorialMode = 'interactive', resumeFrom?: number) => {
      const def = getTutorialById(id);
      if (!def) return;
      clearDemoTimer();
      let initial = resumeFrom ?? 0;
      if (organizationId && userId && resumeFrom == null) {
        const local = readLocalTutorialProgress(organizationId, userId, id);
        if (local && local.status === 'in_progress' && local.tutorialVersion === def.version) {
          initial = Math.min(local.currentStepIndex, def.steps.length - 1);
        }
      }
      setTutorialId(id);
      setMode(startMode);
      setStepIndex(initial);
      setDemoSceneIndex(0);
      setActive(true);
      setPaused(false);
      if (organizationId && userId) {
        const previous = readLocalTutorialProgress(organizationId, userId, id);
        const patch = buildProgressPatch({
          tutorialId: def.id,
          tutorialVersion: def.version,
          currentStepIndex: initial,
          status: 'in_progress',
          previous,
        });
        writeLocalTutorialProgress(organizationId, userId, patch);
        void upsertTutorialProgress({
          tutorialId: def.id,
          tutorialVersion: def.version,
          currentStepIndex: initial,
          status: 'in_progress',
        });
      }
    },
    [organizationId, userId]
  );

  const goTo = useCallback(
    (index: number) => {
      if (!tutorial) return;
      const nextIndex = Math.max(0, Math.min(index, tutorial.steps.length - 1));
      setStepIndex(nextIndex);
      persist(nextIndex, 'in_progress');
    },
    [tutorial, persist]
  );

  const next = useCallback(() => {
    if (!tutorial) return;
    if (stepIndex >= tutorial.steps.length - 1) {
      persist(stepIndex, 'completed');
      onComplete?.(tutorial.id);
      stop('completed');
      return;
    }
    goTo(stepIndex + 1);
  }, [tutorial, stepIndex, goTo, persist, stop, onComplete]);

  const previous = useCallback(() => {
    if (stepIndex <= 0) return;
    goTo(stepIndex - 1);
  }, [stepIndex, goTo]);

  const skip = useCallback(() => stop('skipped'), [stop]);
  const restart = useCallback(() => {
    if (!tutorialId) return;
    startTutorial(tutorialId, mode, 0);
  }, [tutorialId, mode, startTutorial]);

  const pause = useCallback(() => {
    setPaused(true);
    clearDemoTimer();
  }, []);
  const resume = useCallback(() => setPaused(false), []);

  // Demo auto-advance: fictional scenes only — never writes appointments.
  useEffect(() => {
    clearDemoTimer();
    if (!active || paused || mode !== 'demo' || !tutorial) return;
    const scenes = tutorial.demoScenes;
    if (scenes.length === 0) return;
    const scene = scenes[Math.min(demoSceneIndex, scenes.length - 1)];
    const ms = prefersReducedMotion() ? 800 : (scene?.durationMs ?? 3000);
    demoTimerRef.current = setTimeout(() => {
      if (demoSceneIndex >= scenes.length - 1) {
        next();
        setDemoSceneIndex(0);
      } else {
        setDemoSceneIndex((i) => i + 1);
      }
    }, ms);
    return clearDemoTimer;
  }, [active, paused, mode, tutorial, demoSceneIndex, next]);

  useEffect(() => {
    if (!active) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        skip();
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        next();
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        previous();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active, next, previous, skip]);

  const state: TutorialEngineState = {
    tutorial,
    stepIndex,
    step,
    mode,
    active,
    targetMissing,
    targetRect,
    demoSceneIndex,
    paused,
  };

  return {
    state,
    start: startTutorial,
    next,
    previous,
    skip,
    restart,
    pause,
    resume,
    goTo,
    stop,
    /** Marker for tests: demo path never mutates appointments. */
    demoWritesDatabase: false as const,
  };
}

export type TutorialEngineApi = ReturnType<typeof useTutorialEngine>;
