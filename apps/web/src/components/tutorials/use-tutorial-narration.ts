'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  clampNarrationRate,
  getSpeechNarrationEngine,
  readNarrationPreferences,
  writeNarrationPreferences,
  type SpeechNarrationStatus,
} from '@/lib/tutorials/speech-narration';

export interface UseTutorialNarrationOptions {
  /** Spoken text for the current step or demo scene. */
  text: string | null | undefined;
  /**
   * When true, the step UI is ready for auto-play (target measured / not navigating).
   * Must NOT flip false merely because the demo is paused.
   */
  ready: boolean;
  /** Tutorial/demo is active. */
  active: boolean;
  /**
   * Demo/tutorial pause flag. Uses speechSynthesis.pause/resume — does not restart.
   */
  paused?: boolean;
}

export interface TutorialNarrationApi {
  supported: boolean;
  status: SpeechNarrationStatus;
  muted: boolean;
  rate: number;
  play: () => void;
  pause: () => void;
  resume: () => void;
  replay: () => void;
  stop: () => void;
  toggleMute: () => void;
  setRate: (rate: number) => void;
}

export function useTutorialNarration(
  options: UseTutorialNarrationOptions
): TutorialNarrationApi {
  const { text, ready, active, paused = false } = options;
  const engine = useMemo(() => getSpeechNarrationEngine(), []);
  const [status, setStatus] = useState<SpeechNarrationStatus>(() => engine.getStatus());
  const [muted, setMuted] = useState(false);
  const [rate, setRateState] = useState(0.95);
  const [prefsReady, setPrefsReady] = useState(false);
  const lastSpokenKeyRef = useRef<string | null>(null);
  const pauseLatchedRef = useRef(false);

  useEffect(() => {
    const prefs = readNarrationPreferences();
    setMuted(prefs.muted);
    setRateState(prefs.rate);
    engine.setMuted(prefs.muted);
    engine.setRate(prefs.rate);
    setPrefsReady(true);
    void engine.ensureVoices();
    return () => {
      engine.stop();
    };
  }, [engine]);

  useEffect(() => engine.subscribe(setStatus), [engine]);

  const persist = useCallback((next: { muted: boolean; rate: number }) => {
    writeNarrationPreferences(next);
  }, []);

  const speakCurrent = useCallback(
    (force = false) => {
      const value = text?.trim();
      if (!value || !engine.isSupported() || muted) return;
      const key = value;
      if (!force && lastSpokenKeyRef.current === key && engine.getStatus() !== 'idle') {
        return;
      }
      lastSpokenKeyRef.current = key;
      engine.speak(value, { rate });
    },
    [engine, text, muted, rate]
  );

  // Hard-stop when tutorial closes
  useEffect(() => {
    if (!active) {
      lastSpokenKeyRef.current = null;
      pauseLatchedRef.current = false;
      engine.stop();
    }
  }, [active, engine]);

  /**
   * Auto-play on step/text change only.
   * Intentionally ignores `paused` so pause/resume does not cancel+restart.
   */
  useEffect(() => {
    if (!prefsReady) return;

    if (!active || !ready || muted) {
      if (!active || !ready) {
        lastSpokenKeyRef.current = null;
        engine.stop();
      }
      return;
    }

    const value = text?.trim();
    if (!value) return;

    // Same text already spoken / in progress — do not restart (Strict Mode / re-render)
    if (lastSpokenKeyRef.current === value) {
      return;
    }

    const timer = window.setTimeout(() => {
      if (!active || muted) return;
      speakCurrent(true);
    }, 220);

    return () => {
      window.clearTimeout(timer);
      // Only cancel the pending start timer here.
      // Do NOT engine.stop() on every cleanup — Strict Mode would kill a live utterance
      // that we immediately want to keep. Stop happens when text/active/ready change
      // via the branch above on the next effect run, or via explicit stop/skip.
    };
  }, [active, ready, text, muted, prefsReady, engine, speakCurrent]);

  // When text identity changes, cancel previous utterance before the delayed speak
  const previousTextRef = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    const next = text?.trim() ?? null;
    const prev = previousTextRef.current;
    previousTextRef.current = next;
    if (prev === undefined) return;
    if (prev !== next) {
      lastSpokenKeyRef.current = null;
      engine.stop();
    }
  }, [text, engine]);

  // Pause / resume without restarting from the beginning
  useEffect(() => {
    if (!active || !prefsReady) return;

    if (paused) {
      pauseLatchedRef.current = true;
      engine.pause();
      return;
    }

    if (pauseLatchedRef.current) {
      pauseLatchedRef.current = false;
      if (engine.getStatus() === 'paused') {
        engine.resume();
      }
      // If resume is impossible (idle after browser error), do not auto-replay
    }
  }, [paused, active, prefsReady, engine]);

  const play = useCallback(() => {
    if (engine.getStatus() === 'paused') {
      engine.resume();
      return;
    }
    speakCurrent(true);
  }, [engine, speakCurrent]);

  const pause = useCallback(() => {
    pauseLatchedRef.current = true;
    engine.pause();
  }, [engine]);

  const resume = useCallback(() => {
    pauseLatchedRef.current = false;
    engine.resume();
  }, [engine]);

  const replay = useCallback(() => {
    lastSpokenKeyRef.current = null;
    speakCurrent(true);
  }, [speakCurrent]);

  const stop = useCallback(() => {
    lastSpokenKeyRef.current = null;
    pauseLatchedRef.current = false;
    engine.stop();
  }, [engine]);

  const toggleMute = useCallback(() => {
    setMuted((prev) => {
      const next = !prev;
      engine.setMuted(next);
      persist({ muted: next, rate });
      if (next) lastSpokenKeyRef.current = null;
      return next;
    });
  }, [engine, persist, rate]);

  const setRate = useCallback(
    (nextRate: number) => {
      const clamped = clampNarrationRate(nextRate);
      setRateState(clamped);
      engine.setRate(clamped);
      persist({ muted, rate: clamped });
      // Rate change while speaking: explicit re-speak (user control), not a pause artifact
      if (
        !muted &&
        text?.trim() &&
        (engine.getStatus() === 'speaking' || engine.getStatus() === 'paused')
      ) {
        lastSpokenKeyRef.current = null;
        engine.speak(text.trim(), { rate: clamped });
        lastSpokenKeyRef.current = text.trim();
      }
    },
    [engine, muted, persist, text]
  );

  return {
    supported: engine.isSupported(),
    status,
    muted,
    rate,
    play,
    pause,
    resume,
    replay,
    stop,
    toggleMute,
    setRate,
  };
}
