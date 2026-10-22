'use client';

import { useEffect, useMemo, useRef } from 'react';
import type { TutorialEngineApi } from '@/components/tutorials/use-tutorial-engine';
import { TutorialPlaybackBar } from '@/components/tutorials/tutorial-playback-bar';
import { useTutorialNarration } from '@/components/tutorials/use-tutorial-narration';
import { TutorialIntroLogo } from '@/components/tutorials/animation/tutorial-intro-logo';
import { TutorialCursor } from '@/components/tutorials/animation/tutorial-cursor';
import { DemoMockAppointment } from '@/components/tutorials/animation/demo-mock-appointment';
import { DemoStatusCycle } from '@/components/tutorials/animation/demo-status-cycle';
import { useTutorialAnimation } from '@/components/tutorials/animation/use-tutorial-animation';
import { AGENDA_NARRATION_CLIP_IDS } from '@sincvete/shared';
import { getNarrationController } from '@/lib/tutorials/narration-controller';
import { resolveStepDemoScene } from '@/lib/tutorials/animation/resolve-demo-scene';
import { cn } from '@/lib/utils';

interface TutorialOverlayProps {
  engine: TutorialEngineApi;
}

function resolveNarrationText(engine: TutorialEngineApi): string | null {
  const { state } = engine;
  if (!state.tutorial || !state.step) return null;
  if (state.phase === 'intro') {
    return 'Bienvenido a Tutoriales SyncVete. Esta demostración usa solo datos ficticios.';
  }

  if (state.mode === 'demo') {
    const scene = resolveStepDemoScene(state.tutorial, state.step);
    if (scene?.narration?.trim()) return scene.narration.trim();
  }

  return state.step.narration?.trim() || state.step.body;
}

function resolveClipId(engine: TutorialEngineApi): string | null {
  const { state } = engine;
  if (!state.tutorial || !state.step) return null;
  if (state.phase === 'intro') return 'demo-welcome';
  if (state.mode === 'demo') {
    const scene = resolveStepDemoScene(state.tutorial, state.step);
    if (scene?.id) return scene.id;
  }
  return state.step.id;
}

export function TutorialOverlay({ engine }: TutorialOverlayProps) {
  const {
    state,
    next,
    skip,
    pause,
    resume,
    skipIntro,
    goTo,
  } = engine;
  const chromeRef = useRef<HTMLDivElement | null>(null);

  const animation = useTutorialAnimation({
    tutorial: state.tutorial,
    step: state.step,
    stepIndex: state.stepIndex,
    mode: state.mode,
    active: state.active,
    paused: state.paused,
    navigating: state.navigating,
    phase: state.phase,
    replayToken: state.animationReplayToken,
  });

  const narrationText = useMemo(
    () => resolveNarrationText(engine),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional granular deps
    [
      state.mode,
      state.stepIndex,
      state.demoSceneIndex,
      state.phase,
      state.step?.id,
      state.step?.narration,
      state.tutorial?.id,
    ]
  );

  const clipId = useMemo(
    () => resolveClipId(engine),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional granular deps
    [state.mode, state.stepIndex, state.demoSceneIndex, state.phase, state.step?.id, state.tutorial?.id]
  );

  const preloadClipIds = useMemo(() => {
    if (state.tutorial?.id !== 'agenda-basico') return [] as string[];
    return [...AGENDA_NARRATION_CLIP_IDS];
  }, [state.tutorial?.id]);

  const narrationReady =
    state.active &&
    !state.navigating &&
    Boolean(narrationText) &&
    (state.phase === 'intro' || state.phase === 'guide');

  const narration = useTutorialNarration({
    text: narrationText,
    ready: narrationReady,
    active: state.active,
    paused: state.paused,
    tutorialId: state.tutorial?.id ?? null,
    clipId,
    preloadClipIds,
  });

  useEffect(() => {
    if (!state.active || state.navigating) {
      getNarrationController().stop();
    }
  }, [state.active, state.navigating, state.stepIndex, state.phase]);

  if (!state.active || !state.tutorial || !state.step) return null;

  const rect = state.targetRect;
  const reduceMotion = animation.reducedMotion;
  const hole = rect
    ? {
        top: Math.max(0, rect.top - 6),
        left: Math.max(0, rect.left - 6),
        width: rect.width + 12,
        height: rect.height + 12,
      }
    : null;

  const demoScene = animation.demoScene;

  const handleClose = () => {
    narration.stop();
    skip();
  };

  const handleTogglePause = () => {
    if (state.paused) {
      resume();
      narration.resume();
      return;
    }
    narration.pause();
    pause();
  };

  const handleSeek = (index: number) => {
    narration.stop();
    goTo(index);
  };

  const handleIntroSkip = () => {
    if (animation.showIntroLogo) {
      skipIntro();
      return;
    }
    if (animation.showOutroLogo) {
      narration.stop();
      next();
    }
  };

  const fallbackPanel =
    state.demoFallbackActive && state.step.allowDemoFallback ? (
      <div className="rounded-lg border border-dashed border-amber-500/50 bg-amber-50/90 p-3 text-sm shadow-lg dark:bg-amber-950/40">
        <p className="font-medium text-amber-900 dark:text-amber-200">
          Demostración etiquetada (sin datos reales)
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Ejemplo ficticio: Luna · María Ejemplo · Dra. Ana Demo. No se modifica ninguna cita real.
        </p>
      </div>
    ) : null;

  const animatedDemoPanel =
    state.phase === 'guide' &&
    (animation.preset === 'mock-appointment-create' || animation.preset === 'status-cycle') ? (
      animation.preset === 'mock-appointment-create' ? (
        <DemoMockAppointment
          fields={animation.mockFields}
          durationMs={animation.durationMs}
          reducedMotion={reduceMotion}
          paused={state.paused}
          playKey={animation.playKey}
        />
      ) : (
        <DemoStatusCycle
          statuses={animation.statusSequence}
          durationMs={animation.durationMs}
          reducedMotion={reduceMotion}
          paused={state.paused}
          playKey={animation.playKey}
        />
      )
    ) : null;

  const staticDemoPanel =
    state.mode === 'demo' &&
    demoScene &&
    animation.preset !== 'mock-appointment-create' &&
    animation.preset !== 'status-cycle' ? (
      <div className="rounded-lg border border-dashed bg-background/95 p-3 text-sm shadow-lg">
        <p className="font-medium">{demoScene.headline}</p>
        <p className="mt-1 text-xs text-muted-foreground">{demoScene.body}</p>
      </div>
    ) : null;

  const floatingDemo =
    fallbackPanel || animatedDemoPanel || staticDemoPanel ? (
      <div className="pointer-events-auto fixed bottom-[11.5rem] left-1/2 z-[65] w-[min(100vw-1.5rem,540px)] -translate-x-1/2 space-y-2">
        {fallbackPanel}
        {animatedDemoPanel}
        {staticDemoPanel}
      </div>
    ) : null;

  return (
    <div className="pointer-events-none fixed inset-0 z-[60]">
      <div
        className={cn(
          'pointer-events-none absolute inset-0 bg-slate-900/20',
          reduceMotion ? '' : 'transition-opacity duration-300'
        )}
        aria-hidden
      />
      {hole && !state.navigating && state.phase === 'guide' && !animation.showOutroLogo ? (
        <div
          className={cn(
            'pointer-events-none absolute rounded-md ring-2 ring-primary ring-offset-2 ring-offset-background',
            reduceMotion ? '' : 'transition-[top,left,width,height] duration-500 ease-out',
            animation.spotlightPulse ? 'sv-tutorial-spotlight-pulse' : ''
          )}
          style={{
            top: hole.top,
            left: hole.left,
            width: hole.width,
            height: hole.height,
            ...(animation.spotlightPulse
              ? {}
              : { boxShadow: '0 0 0 9999px rgba(15, 23, 42, 0.22)' }),
          }}
          aria-hidden
          data-tutorial-spotlight="true"
        />
      ) : null}

      <TutorialCursor
        targetRect={state.targetRect}
        active={animation.showCursor}
        reducedMotion={reduceMotion}
        playKey={animation.playKey}
        paused={state.paused}
      />

      <TutorialIntroLogo
        visible={animation.showIntroLogo || animation.showOutroLogo}
        reducedMotion={reduceMotion}
        variant={animation.showOutroLogo ? 'outro' : 'intro'}
        onSkip={
          animation.showIntroLogo || animation.showOutroLogo ? handleIntroSkip : undefined
        }
      />

      <div className="pointer-events-none" ref={chromeRef}>
        {state.phase === 'intro' || animation.showOutroLogo ? null : state.navigating ? (
          <div
            role="status"
            aria-live="polite"
            className="pointer-events-auto fixed bottom-[11.5rem] left-1/2 z-[70] w-[min(100vw-1.5rem,320px)] -translate-x-1/2 rounded-lg border bg-background p-4 text-center shadow-lg"
          >
            <p className="text-sm font-medium">Cargando el siguiente paso…</p>
            <p className="mt-1 text-xs text-muted-foreground">
              La explicación continúa sola cuando la pantalla esté lista.
            </p>
          </div>
        ) : (
          <>
            {floatingDemo}
            <TutorialPlaybackBar
              title={state.step.title}
              caption={state.step.caption ?? state.step.body}
              stepIndex={state.stepIndex}
              totalSteps={state.tutorial.steps.length}
              paused={state.paused}
              muted={narration.muted}
              rate={narration.rate}
              voiceProfile={narration.voiceProfile}
              femaleAvailable={narration.availability.female.length > 0}
              maleAvailable={narration.availability.male.length > 0}
              onSeek={handleSeek}
              onTogglePause={handleTogglePause}
              onToggleMute={narration.toggleMute}
              onRateChange={narration.setRate}
              onVoiceProfileChange={narration.setVoiceProfile}
              onClose={handleClose}
            />
          </>
        )}
      </div>
    </div>
  );
}
