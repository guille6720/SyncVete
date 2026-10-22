'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { TutorialEngineApi } from '@/components/tutorials/use-tutorial-engine';
import { TutorialPlaybackBar } from '@/components/tutorials/tutorial-playback-bar';
import { TutorialIntroLogo } from '@/components/tutorials/animation/tutorial-intro-logo';
import { TutorialCursor } from '@/components/tutorials/animation/tutorial-cursor';
import { DemoMockAppointment } from '@/components/tutorials/animation/demo-mock-appointment';
import { DemoStatusCycle } from '@/components/tutorials/animation/demo-status-cycle';
import { useTutorialAnimation } from '@/components/tutorials/animation/use-tutorial-animation';
import {
  getContinuousNarrationSession,
  type ContinuousNarrationClip,
} from '@/lib/tutorials/continuous-narration-session';
import { resolveStepDemoScene } from '@/lib/tutorials/animation/resolve-demo-scene';
import {
  clampNarrationRate,
  readNarrationPreferences,
  writeNarrationPreferences,
  type StoredVoiceProfile,
  type SpeechNarrationStatus,
} from '@/lib/tutorials/speech-narration';
import type { NarrationVoiceProfileId } from '@sincvete/shared';
import { getElevenLabsAudioEngine } from '@/lib/tutorials/elevenlabs-audio';
import { cn } from '@/lib/utils';

interface TutorialOverlayProps {
  engine: TutorialEngineApi;
}

function toEngineProfile(profile: StoredVoiceProfile): NarrationVoiceProfileId {
  return profile === 'horacio' ? 'horacio' : 'brian';
}

function buildPlaylist(engine: TutorialEngineApi): ContinuousNarrationClip[] {
  const { state } = engine;
  const tutorial = state.tutorial;
  if (!tutorial) return [];

  return tutorial.steps.map((step, stepIndex) => {
    let text = step.narration?.trim() || step.body;
    if (state.mode === 'demo') {
      const scene = resolveStepDemoScene(tutorial, step);
      if (scene?.narration?.trim()) text = scene.narration.trim();
    }
    return {
      stepIndex,
      text,
      clipId: step.id,
    };
  });
}

export function TutorialOverlay({ engine }: TutorialOverlayProps) {
  const { state, skip, pause, resume, skipIntro, syncStepFromNarration, completeFromNarration } =
    engine;
  const chromeRef = useRef<HTMLDivElement | null>(null);
  const session = useMemo(() => getContinuousNarrationSession(), []);
  const sessionKeyRef = useRef<string | null>(null);

  const [muted, setMuted] = useState(false);
  const [rate, setRate] = useState(1);
  const [voiceProfile, setVoiceProfile] = useState<StoredVoiceProfile>('brian');
  const [status, setStatus] = useState<SpeechNarrationStatus>('idle');
  const [elevenLabsAvailable, setElevenLabsAvailable] = useState(false);
  const [prefsReady, setPrefsReady] = useState(false);

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

  useEffect(() => {
    const prefs = readNarrationPreferences();
    setMuted(prefs.muted);
    setRate(prefs.rate);
    setVoiceProfile(prefs.voiceProfile === 'auto' ? 'brian' : prefs.voiceProfile);
    setPrefsReady(true);
    void getElevenLabsAudioEngine()
      .isAvailable()
      .then(setElevenLabsAvailable);
  }, []);

  // Audio-driven continuous playlist — starts once per tutorial run in guide phase.
  useEffect(() => {
    if (!prefsReady || !state.active || !state.tutorial || state.phase !== 'guide') {
      if (!state.active) {
        session.stop();
        sessionKeyRef.current = null;
      }
      return;
    }

    const key = `${state.tutorial.id}:${state.mode}`;
    if (sessionKeyRef.current === key && session.isRunning()) return;

    sessionKeyRef.current = key;
    const clips = buildPlaylist(engine);
    const startIndex = Math.max(0, Math.min(state.stepIndex, clips.length - 1));

    void session.start(
      clips,
      {
        voice: toEngineProfile(voiceProfile),
        rate,
        muted,
        startIndex,
      },
      {
        onStep: (stepIndex) => {
          syncStepFromNarration(stepIndex);
        },
        onComplete: () => {
          sessionKeyRef.current = null;
          completeFromNarration();
        },
        onStatus: setStatus,
      }
    );
    // Intentionally omit stepIndex/voice — audio owns progression; voice uses setVoice().
    // eslint-disable-next-line react-hooks/exhaustive-deps -- continuous playlist
  }, [
    prefsReady,
    state.active,
    state.tutorial?.id,
    state.mode,
    state.phase,
    session,
    syncStepFromNarration,
    completeFromNarration,
  ]);

  useEffect(() => {
    if (!state.active) {
      session.stop();
      sessionKeyRef.current = null;
    }
  }, [state.active, session]);

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

  const persistPrefs = (next: {
    muted: boolean;
    rate: number;
    voiceProfile: StoredVoiceProfile;
  }) => {
    writeNarrationPreferences(next);
  };

  const handleClose = () => {
    session.stop();
    sessionKeyRef.current = null;
    skip();
  };

  const handleTogglePause = () => {
    if (state.paused) {
      resume();
      return;
    }
    pause();
  };

  const handleToggleMute = () => {
    setMuted((prev) => {
      const next = !prev;
      session.setMuted(next);
      persistPrefs({ muted: next, rate, voiceProfile });
      return next;
    });
  };

  const handleRateChange = (nextRate: number) => {
    const clamped = clampNarrationRate(nextRate);
    setRate(clamped);
    session.setRate(clamped);
    persistPrefs({ muted, rate: clamped, voiceProfile });
  };

  const handleVoiceChange = (nextProfile: StoredVoiceProfile) => {
    const normalized = nextProfile === 'auto' ? 'brian' : nextProfile;
    setVoiceProfile(normalized);
    persistPrefs({ muted, rate, voiceProfile: normalized });
    void session.setVoice(toEngineProfile(normalized));
  };

  const handleIntroSkip = () => {
    if (animation.showIntroLogo) {
      skipIntro();
      return;
    }
    if (animation.showOutroLogo) {
      session.stop();
      completeFromNarration();
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
        {state.phase === 'intro' || animation.showOutroLogo ? null : (
          <>
            {state.navigating ? (
              <div
                role="status"
                aria-live="polite"
                className="pointer-events-none fixed bottom-[11.5rem] left-1/2 z-[70] w-[min(100vw-1.5rem,320px)] -translate-x-1/2 rounded-lg border bg-background/95 p-3 text-center shadow-lg"
              >
                <p className="text-xs text-muted-foreground">Actualizando pantalla…</p>
              </div>
            ) : (
              floatingDemo
            )}
            <TutorialPlaybackBar
              title={state.step.title}
              caption={state.step.caption ?? state.step.body}
              stepIndex={state.stepIndex}
              totalSteps={state.tutorial.steps.length}
              paused={state.paused || status === 'paused'}
              muted={muted}
              rate={rate}
              voiceProfile={voiceProfile}
              elevenLabsAvailable={elevenLabsAvailable}
              onTogglePause={handleTogglePause}
              onToggleMute={handleToggleMute}
              onRateChange={handleRateChange}
              onVoiceProfileChange={handleVoiceChange}
              onClose={handleClose}
            />
          </>
        )}
      </div>
    </div>
  );
}
