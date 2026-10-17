'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  getTutorialById,
  pathsMatch,
  resolveTutorialRoute,
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
import {
  clearTutorialSession,
  readTutorialSession,
  writeTutorialSession,
} from '@/lib/tutorials/tutorial-session';
import { isEditableKeyboardTarget, waitForTarget } from '@/lib/tutorials/wait-for-target';

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
  navigating: boolean;
  demoFallbackActive: boolean;
}

export interface UseTutorialEngineOptions {
  organizationId?: string | null;
  userId?: string | null;
  permissions?: string[];
  pathname?: string;
  navigate?: (href: string) => void;
  resolveDemoAppointmentId?: () => Promise<string | null>;
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
  const {
    organizationId,
    userId,
    permissions = [],
    pathname = '/',
    navigate,
    resolveDemoAppointmentId,
    onComplete,
  } = options;

  const [tutorialId, setTutorialId] = useState<string | null>(null);
  const [stepIndex, setStepIndex] = useState(0);
  const [mode, setMode] = useState<TutorialMode>('interactive');
  const [active, setActive] = useState(false);
  const [paused, setPaused] = useState(false);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const [targetMissing, setTargetMissing] = useState(false);
  const [demoSceneIndex, setDemoSceneIndex] = useState(0);
  const [navigating, setNavigating] = useState(false);
  const [demoFallbackActive, setDemoFallbackActive] = useState(false);
  const [demoAppointmentId, setDemoAppointmentId] = useState<string | null>(null);

  const demoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const navSeqRef = useRef(0);
  const pendingHrefRef = useRef<string | null>(null);
  const restoredRef = useRef(false);

  const tutorial = useMemo(
    () => (tutorialId ? getTutorialById(tutorialId) : null),
    [tutorialId]
  );
  const step = tutorial?.steps[stepIndex] ?? null;

  const hasPermission = useCallback(
    (permission: string) => permissions.includes(permission),
    [permissions]
  );

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
      if (status === 'in_progress') {
        writeTutorialSession({
          tutorialId: tutorial.id,
          mode,
          stepIndex: nextIndex,
          organizationId,
          userId,
          updatedAt: new Date().toISOString(),
        });
      } else {
        clearTutorialSession();
      }
    },
    [tutorial, organizationId, userId, mode]
  );

  const measureTarget = useCallback(async () => {
    if (!step || navigating) {
      if (!step) {
        setTargetRect(null);
        setTargetMissing(false);
      }
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
    if (demoFallbackActive && step.allowDemoFallback) {
      setTargetRect(null);
      setTargetMissing(false);
      return;
    }
    const waited = await waitForTarget(step.target, { timeoutMs: 2200 });
    if (waited.missing) {
      const { rect, missing } = findTargetRect(step.target);
      setTargetRect(rect);
      setTargetMissing(missing);
      return;
    }
    setTargetRect(waited.rect);
    setTargetMissing(false);
  }, [step, permissions, navigating, demoFallbackActive]);

  const syncRouteForStep = useCallback(
    async (def: TutorialDefinition, nextStep: TutorialStep, nextIndex: number) => {
      const decision = resolveTutorialRoute({
        tutorial: def,
        step: nextStep,
        pathname,
        demoAppointmentId,
        hasPermission,
      });

      if (decision.kind === 'blocked-permission') {
        setDemoFallbackActive(false);
        setNavigating(false);
        pendingHrefRef.current = null;
        setTargetRect(null);
        setTargetMissing(true);
        return;
      }

      if (decision.kind === 'demo-fallback') {
        setDemoFallbackActive(true);
        if (decision.href && !pathsMatch(pathname, decision.href) && navigate) {
          const seq = ++navSeqRef.current;
          pendingHrefRef.current = decision.href;
          setNavigating(true);
          navigate(decision.href);
          // Path sync happens via effect; mark navigating until matched.
          if (seq !== navSeqRef.current) return;
        } else {
          setNavigating(false);
          pendingHrefRef.current = null;
        }
        return;
      }

      setDemoFallbackActive(false);
      if (decision.kind === 'same' || !navigate) {
        setNavigating(false);
        pendingHrefRef.current = null;
        return;
      }

      if (pathsMatch(pathname, decision.href)) {
        setNavigating(false);
        pendingHrefRef.current = null;
        return;
      }

      const seq = ++navSeqRef.current;
      pendingHrefRef.current = decision.href;
      setNavigating(true);
      navigate(decision.href);
      void nextIndex;
      if (seq !== navSeqRef.current) return;
    },
    [pathname, demoAppointmentId, hasPermission, navigate]
  );

  useEffect(() => {
    if (!active || !pendingHrefRef.current) return;
    if (pathsMatch(pathname, pendingHrefRef.current)) {
      pendingHrefRef.current = null;
      setNavigating(false);
    }
  }, [pathname, active]);

  useEffect(() => {
    if (!active || paused || navigating) return;
    void measureTarget();
    const onResize = () => {
      void measureTarget();
    };
    window.addEventListener('resize', onResize);
    window.addEventListener('scroll', onResize, true);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('scroll', onResize, true);
    };
  }, [active, paused, navigating, measureTarget, stepIndex, pathname]);

  const clearDemoTimer = () => {
    if (demoTimerRef.current) {
      clearTimeout(demoTimerRef.current);
      demoTimerRef.current = null;
    }
  };

  const stop = useCallback(
    (status: TutorialProgressStatus = 'skipped') => {
      clearDemoTimer();
      navSeqRef.current += 1;
      pendingHrefRef.current = null;
      if (tutorial) persist(stepIndex, status);
      setActive(false);
      setPaused(false);
      setTutorialId(null);
      setStepIndex(0);
      setDemoSceneIndex(0);
      setTargetRect(null);
      setTargetMissing(false);
      setNavigating(false);
      setDemoFallbackActive(false);
      clearTutorialSession();
    },
    [tutorial, stepIndex, persist]
  );

  const ensureDemoAppointment = useCallback(async () => {
    if (!resolveDemoAppointmentId) return null;
    try {
      const id = await resolveDemoAppointmentId();
      setDemoAppointmentId(id);
      return id;
    } catch {
      setDemoAppointmentId(null);
      return null;
    }
  }, [resolveDemoAppointmentId]);

  const startTutorial = useCallback(
    async (id: string, startMode: TutorialMode = 'interactive', resumeFrom?: number) => {
      const def = getTutorialById(id);
      if (!def) return;
      clearDemoTimer();
      navSeqRef.current += 1;
      pendingHrefRef.current = null;

      let initial = resumeFrom ?? 0;
      if (organizationId && userId && resumeFrom == null) {
        const local = readLocalTutorialProgress(organizationId, userId, id);
        if (local && local.status === 'in_progress' && local.tutorialVersion === def.version) {
          initial = Math.min(local.currentStepIndex, def.steps.length - 1);
        }
      }

      const demoId = await ensureDemoAppointment();
      const nextStep = def.steps[initial] ?? def.steps[0];
      if (!nextStep) return;

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
        writeTutorialSession({
          tutorialId: def.id,
          mode: startMode,
          stepIndex: initial,
          organizationId,
          userId,
          updatedAt: new Date().toISOString(),
        });
        void upsertTutorialProgress({
          tutorialId: def.id,
          tutorialVersion: def.version,
          currentStepIndex: initial,
          status: 'in_progress',
        });
      }

      const decision = resolveTutorialRoute({
        tutorial: def,
        step: nextStep,
        pathname,
        demoAppointmentId: demoId,
        hasPermission,
      });

      if (decision.kind === 'demo-fallback') {
        setDemoFallbackActive(true);
      } else {
        setDemoFallbackActive(false);
      }

      if (
        (decision.kind === 'navigate' || decision.kind === 'demo-fallback') &&
        decision.href &&
        !pathsMatch(pathname, decision.href) &&
        navigate
      ) {
        pendingHrefRef.current = decision.href;
        setNavigating(true);
        navigate(decision.href);
      } else if (decision.kind === 'blocked-permission') {
        setTargetMissing(true);
        setNavigating(false);
      } else {
        setNavigating(false);
      }
    },
    [organizationId, userId, ensureDemoAppointment, pathname, hasPermission, navigate]
  );

  // Resume after refresh while still in the clinic shell.
  useEffect(() => {
    if (restoredRef.current || !organizationId || !userId || active) return;
    restoredRef.current = true;
    const snap = readTutorialSession(organizationId, userId);
    if (!snap) return;
    void startTutorial(snap.tutorialId, snap.mode, snap.stepIndex);
  }, [organizationId, userId, active, startTutorial]);

  const goTo = useCallback(
    async (index: number) => {
      if (!tutorial) return;
      const nextIndex = Math.max(0, Math.min(index, tutorial.steps.length - 1));
      const nextStep = tutorial.steps[nextIndex];
      if (!nextStep) return;
      setStepIndex(nextIndex);
      persist(nextIndex, 'in_progress');
      await syncRouteForStep(tutorial, nextStep, nextIndex);
    },
    [tutorial, persist, syncRouteForStep]
  );

  const next = useCallback(() => {
    if (!tutorial || navigating) return;
    if (stepIndex >= tutorial.steps.length - 1) {
      persist(stepIndex, 'completed');
      onComplete?.(tutorial.id);
      stop('completed');
      return;
    }
    void goTo(stepIndex + 1);
  }, [tutorial, stepIndex, goTo, persist, stop, onComplete, navigating]);

  const previous = useCallback(() => {
    if (stepIndex <= 0 || navigating) return;
    void goTo(stepIndex - 1);
  }, [stepIndex, goTo, navigating]);

  const skip = useCallback(() => stop('skipped'), [stop]);
  const restart = useCallback(() => {
    if (!tutorialId) return;
    void startTutorial(tutorialId, mode, 0);
  }, [tutorialId, mode, startTutorial]);

  const pause = useCallback(() => {
    setPaused(true);
    clearDemoTimer();
  }, []);
  const resume = useCallback(() => setPaused(false), []);

  // Demo auto-advance: fictional scenes only — never writes appointments.
  useEffect(() => {
    clearDemoTimer();
    if (!active || paused || navigating || mode !== 'demo' || !tutorial) return;
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
  }, [active, paused, navigating, mode, tutorial, demoSceneIndex, next]);

  useEffect(() => {
    if (!active) return;
    const onKey = (event: KeyboardEvent) => {
      if (isEditableKeyboardTarget(event.target)) return;
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
    navigating,
    demoFallbackActive,
  };

  return {
    state,
    start: (id: string, startMode?: TutorialMode, resumeFrom?: number) => {
      void startTutorial(id, startMode, resumeFrom);
    },
    next,
    previous,
    skip,
    restart,
    pause,
    resume,
    goTo: (index: number) => {
      void goTo(index);
    },
    stop,
    /** Marker for tests: demo path never mutates appointments. */
    demoWritesDatabase: false as const,
  };
}

export type TutorialEngineApi = ReturnType<typeof useTutorialEngine>;
