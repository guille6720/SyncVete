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
import { getNarrationController } from '@/lib/tutorials/narration-controller';
import { waitForDemoSceneAdvance } from '@/lib/tutorials/demo-scene-advance';
import { scrollTargetAwayFromGuidePanel } from '@/lib/tutorials/tutorial-guide-layout';
import {
  resolveDemoSceneIndex,
  resolveStepAnimation,
  resolveStepDemoScene,
} from '@/lib/tutorials/animation/resolve-demo-scene';
import { prefersReducedMotion } from '@/lib/tutorials/animation/prefers-reduced-motion';
import { resolveAnimationDurationMs } from '@sincvete/shared';

export type TutorialGuidePhase = 'intro' | 'guide';

const INTRO_DURATION_MS = 2800;
const INTRO_DURATION_REDUCED_MS = 800;

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
  /** Logo intro before the guide; animations run in `guide`. */
  phase: TutorialGuidePhase;
  /** Bump to restart step visuals (cursor / mock panels) with narration replay. */
  animationReplayToken: number;
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

function findTargetRect(target?: string): { rect: DOMRect | null; missing: boolean } {
  if (!target || typeof document === 'undefined') {
    return { rect: null, missing: Boolean(target) };
  }
  const el = document.querySelector(tourSelector(target));
  if (!el) return { rect: null, missing: true };
  const rect = scrollTargetAwayFromGuidePanel(el);
  return { rect, missing: false };
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
  const [demoSceneIndex, setDemoSceneIndex] = useState(-1);
  const [navigating, setNavigating] = useState(false);
  const [demoFallbackActive, setDemoFallbackActive] = useState(false);
  const [demoAppointmentId, setDemoAppointmentId] = useState<string | null>(null);
  const [phase, setPhase] = useState<TutorialGuidePhase>('intro');
  const [animationReplayToken, setAnimationReplayToken] = useState(0);

  const demoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const introTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const navSeqRef = useRef(0);
  const pendingHrefRef = useRef<string | null>(null);
  const restoredRef = useRef(false);

  const clearIntroTimer = () => {
    if (introTimerRef.current) {
      clearTimeout(introTimerRef.current);
      introTimerRef.current = null;
    }
  };

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
    if (!active || paused || navigating || phase !== 'guide') return;
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
  }, [active, paused, navigating, phase, measureTarget, stepIndex, pathname]);

  // Animated logo intro before the first guided step (demo + interactive).
  useEffect(() => {
    clearIntroTimer();
    if (!active || phase !== 'intro' || navigating) return;
    if (paused) return;
    const ms = prefersReducedMotion() ? INTRO_DURATION_REDUCED_MS : INTRO_DURATION_MS;
    introTimerRef.current = setTimeout(() => {
      setPhase('guide');
    }, ms);
    return () => clearIntroTimer();
  }, [active, phase, navigating, paused]);

  const clearDemoTimer = () => {
    if (demoTimerRef.current) {
      clearTimeout(demoTimerRef.current);
      demoTimerRef.current = null;
    }
  };

  const stop = useCallback(
    (status: TutorialProgressStatus = 'skipped') => {
      clearDemoTimer();
      clearIntroTimer();
      getNarrationController().stop();
      navSeqRef.current += 1;
      pendingHrefRef.current = null;
      if (tutorial) persist(stepIndex, status);
      setActive(false);
      setPaused(false);
      setTutorialId(null);
      setStepIndex(0);
      setDemoSceneIndex(-1);
      setTargetRect(null);
      setTargetMissing(false);
      setNavigating(false);
      setDemoFallbackActive(false);
      setPhase('intro');
      setAnimationReplayToken(0);
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
      clearIntroTimer();
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

      // Fresh starts play the logo intro; mid-tour resumes skip straight to the guide.
      const startPhase: TutorialGuidePhase =
        resumeFrom != null && resumeFrom > 0 ? 'guide' : 'intro';

      setTutorialId(id);
      setMode(startMode);
      setStepIndex(initial);
      setDemoSceneIndex(resolveDemoSceneIndex(def, nextStep));
      setActive(true);
      setPaused(false);
      setPhase(startPhase);
      setAnimationReplayToken(0);

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
      getNarrationController().stop();
      setPhase('guide');
      setStepIndex(nextIndex);
      setDemoSceneIndex(resolveDemoSceneIndex(tutorial, nextStep));
      setAnimationReplayToken((token) => token + 1);
      persist(nextIndex, 'in_progress');
      await syncRouteForStep(tutorial, nextStep, nextIndex);
    },
    [tutorial, persist, syncRouteForStep]
  );

  const skipIntro = useCallback(() => {
    clearIntroTimer();
    setPhase('guide');
  }, []);

  const replayAnimation = useCallback(() => {
    setAnimationReplayToken((token) => token + 1);
  }, []);

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
    getNarrationController().pause();
  }, []);
  const resume = useCallback(() => {
    setPaused(false);
    getNarrationController().resume();
  }, []);

  // Continuous auto-advance (interactive + demo): narration + min hold, no “Siguiente”.
  // Pause does NOT restart the timer — we only defer the final advance while paused.
  // Seeking via the bottom scrubber still jumps immediately via goTo().
  const demoAdvanceSeqRef = useRef(0);
  const pausedRef = useRef(paused);
  pausedRef.current = paused;

  useEffect(() => {
    clearDemoTimer();
    if (!active || navigating || !tutorial || phase !== 'guide') return;
    const currentStep = tutorial.steps[stepIndex];
    if (!currentStep) return;

    const scene = resolveStepDemoScene(tutorial, currentStep);
    const animation = resolveStepAnimation(tutorial, currentStep);
    const reduced = prefersReducedMotion();
    const minMs = resolveAnimationDurationMs(
      animation ?? undefined,
      scene?.durationMs ?? currentStep.animation?.durationMs,
      reduced
    );
    const narrationText =
      mode === 'demo'
        ? scene?.narration?.trim() || currentStep.narration?.trim() || currentStep.body
        : currentStep.narration?.trim() || currentStep.body;
    const seq = ++demoAdvanceSeqRef.current;
    const engine = getNarrationController();
    let cancelled = false;

    const sleep = (ms: number) =>
      new Promise<void>((resolve) => {
        demoTimerRef.current = setTimeout(() => resolve(), ms);
      });

    const run = async () => {
      const shouldAdvance = await waitForDemoSceneAdvance({
        engine,
        minMs,
        waitForNarration:
          engine.isSupported() && !engine.isMuted() && Boolean(narrationText?.trim()),
        isCancelled: () => cancelled || seq !== demoAdvanceSeqRef.current,
        isPaused: () => pausedRef.current,
        sleep,
      });
      if (!shouldAdvance) return;
      next();
    };

    void run();

    return () => {
      cancelled = true;
      clearDemoTimer();
      demoAdvanceSeqRef.current += 1;
    };
  }, [active, navigating, mode, tutorial, stepIndex, phase, next]);

  useEffect(() => {
    if (!active) return;
    const onKey = (event: KeyboardEvent) => {
      if (isEditableKeyboardTarget(event.target)) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        skip();
      } else if (event.key === ' ' || event.key === 'Spacebar') {
        event.preventDefault();
        if (pausedRef.current) resume();
        else pause();
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
  }, [active, next, previous, skip, pause, resume]);

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
    phase,
    animationReplayToken,
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
    skipIntro,
    replayAnimation,
    goTo: (index: number) => {
      void goTo(index);
    },
    stop,
    /** Marker for tests: demo path never mutates appointments. */
    demoWritesDatabase: false as const,
  };
}

export type TutorialEngineApi = ReturnType<typeof useTutorialEngine>;
