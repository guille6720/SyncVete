'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { NarrationVoiceProfileId } from '@sincvete/shared';
import {
  clampNarrationRate,
  readNarrationPreferences,
  writeNarrationPreferences,
  type SpeechNarrationStatus,
  type StoredVoiceProfile,
} from '@/lib/tutorials/speech-narration';
import {
  getNarrationController,
  type NarrationSource,
} from '@/lib/tutorials/narration-controller';
import {
  analyzeVoiceProfileAvailability,
  VOICE_PREVIEW_SAMPLE,
  type VoiceProfileAvailability,
} from '@/lib/tutorials/voice-profiles';

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
   * Demo/tutorial pause flag. Uses pause/resume — does not restart.
   */
  paused?: boolean;
  /** Tutorial id for static neural clips (e.g. agenda-basico). */
  tutorialId?: string | null;
  /** Step or demo scene id for static clip lookup. */
  clipId?: string | null;
  /** Optional clip ids to preload for the active tutorial. */
  preloadClipIds?: string[];
}

export interface TutorialNarrationApi {
  supported: boolean;
  status: SpeechNarrationStatus;
  muted: boolean;
  rate: number;
  voiceProfile: StoredVoiceProfile;
  availability: VoiceProfileAvailability;
  activeSource: NarrationSource;
  play: () => void;
  pause: () => void;
  resume: () => void;
  replay: () => void;
  preview: () => void;
  stop: () => void;
  toggleMute: () => void;
  setRate: (rate: number) => void;
  setVoiceProfile: (profile: StoredVoiceProfile) => void;
}

function toEngineProfile(
  profile: StoredVoiceProfile
): NarrationVoiceProfileId | null {
  if (profile === 'female' || profile === 'male') return profile;
  return null;
}

export function useTutorialNarration(
  options: UseTutorialNarrationOptions
): TutorialNarrationApi {
  const {
    text,
    ready,
    active,
    paused = false,
    tutorialId = null,
    clipId = null,
    preloadClipIds = [],
  } = options;
  const controller = useMemo(() => getNarrationController(), []);
  const [status, setStatus] = useState<SpeechNarrationStatus>(() => controller.getStatus());
  const [muted, setMuted] = useState(false);
  const [rate, setRateState] = useState(0.92);
  const [voiceProfile, setVoiceProfileState] = useState<StoredVoiceProfile>('auto');
  const [availability, setAvailability] = useState<VoiceProfileAvailability>({
    female: [],
    male: [],
    spanishAny: [],
  });
  const [activeSource, setActiveSource] = useState<NarrationSource>('none');
  const [prefsReady, setPrefsReady] = useState(false);
  const lastSpokenKeyRef = useRef<string | null>(null);
  const pauseLatchedRef = useRef(false);

  useEffect(() => {
    const prefs = readNarrationPreferences();
    setMuted(prefs.muted);
    setRateState(prefs.rate);
    setVoiceProfileState(prefs.voiceProfile);
    controller.setMuted(prefs.muted);
    controller.setRate(prefs.rate);
    controller.setVoiceProfile(toEngineProfile(prefs.voiceProfile));
    setPrefsReady(true);
    void controller.ensureVoices().then((voices) => {
      setAvailability(analyzeVoiceProfileAvailability(voices));
    });
    return () => {
      controller.stop();
    };
  }, [controller]);

  useEffect(() => controller.subscribe(setStatus), [controller]);

  const persist = useCallback(
    (next: { muted: boolean; rate: number; voiceProfile: StoredVoiceProfile }) => {
      writeNarrationPreferences(next);
    },
    []
  );

  const profileBlocked = useMemo(() => {
    if (voiceProfile === 'female' && availability.female.length === 0) return true;
    if (voiceProfile === 'male' && availability.male.length === 0) return true;
    return false;
  }, [voiceProfile, availability]);

  const speakCurrent = useCallback(
    async (force = false) => {
      const value = text?.trim();
      if (!value || !controller.isSupported() || muted || profileBlocked) return;
      const key = `${tutorialId ?? ''}|${clipId ?? ''}|${value}|${voiceProfile}`;
      if (!force && lastSpokenKeyRef.current === key && controller.getStatus() !== 'idle') {
        return;
      }
      lastSpokenKeyRef.current = key;
      const source = await controller.speak(value, {
        rate,
        tutorialId,
        clipId,
        voiceProfile: toEngineProfile(voiceProfile),
      });
      setActiveSource(source);
    },
    [
      controller,
      text,
      muted,
      rate,
      tutorialId,
      clipId,
      voiceProfile,
      profileBlocked,
    ]
  );

  // Preload static clips when a gendered profile is selected
  useEffect(() => {
    if (!prefsReady || !active || !tutorialId) return;
    const profile = toEngineProfile(voiceProfile);
    if (!profile || preloadClipIds.length === 0) return;
    void controller.preloadClips(
      preloadClipIds.map((id) => ({ tutorialId, clipId: id })),
      profile
    );
  }, [prefsReady, active, tutorialId, voiceProfile, preloadClipIds, controller]);

  // Hard-stop when tutorial closes
  useEffect(() => {
    if (!active) {
      lastSpokenKeyRef.current = null;
      pauseLatchedRef.current = false;
      controller.stop();
      setActiveSource('none');
    }
  }, [active, controller]);

  /**
   * Auto-play on step/text change only.
   * Intentionally ignores `paused` so pause/resume does not cancel+restart.
   */
  useEffect(() => {
    if (!prefsReady) return;

    if (!active || !ready || muted || profileBlocked) {
      if (!active || !ready) {
        lastSpokenKeyRef.current = null;
        controller.stop();
        setActiveSource('none');
      }
      return;
    }

    const value = text?.trim();
    if (!value) return;

    const key = `${tutorialId ?? ''}|${clipId ?? ''}|${value}|${voiceProfile}`;
    if (lastSpokenKeyRef.current === key) {
      return;
    }

    const timer = window.setTimeout(() => {
      if (!active || muted || profileBlocked) return;
      void speakCurrent(true);
    }, 220);

    return () => {
      window.clearTimeout(timer);
    };
  }, [
    active,
    ready,
    text,
    muted,
    prefsReady,
    controller,
    speakCurrent,
    profileBlocked,
    tutorialId,
    clipId,
    voiceProfile,
  ]);

  // When text identity changes, cancel previous utterance before the delayed speak
  const previousTextRef = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    const next = text?.trim() ?? null;
    const prev = previousTextRef.current;
    previousTextRef.current = next;
    if (prev === undefined) return;
    if (prev !== next) {
      lastSpokenKeyRef.current = null;
      controller.stop();
      setActiveSource('none');
    }
  }, [text, controller]);

  // Pause / resume without restarting from the beginning
  useEffect(() => {
    if (!active || !prefsReady) return;

    if (paused) {
      pauseLatchedRef.current = true;
      controller.pause();
      return;
    }

    if (pauseLatchedRef.current) {
      pauseLatchedRef.current = false;
      if (controller.getStatus() === 'paused') {
        controller.resume();
      }
    }
  }, [paused, active, prefsReady, controller]);

  const play = useCallback(() => {
    if (controller.getStatus() === 'paused') {
      controller.resume();
      return;
    }
    void speakCurrent(true);
  }, [controller, speakCurrent]);

  const pause = useCallback(() => {
    pauseLatchedRef.current = true;
    controller.pause();
  }, [controller]);

  const resume = useCallback(() => {
    pauseLatchedRef.current = false;
    controller.resume();
  }, [controller]);

  const replay = useCallback(() => {
    lastSpokenKeyRef.current = null;
    void speakCurrent(true);
  }, [speakCurrent]);

  const preview = useCallback(() => {
    if (muted || profileBlocked) return;
    lastSpokenKeyRef.current = null;
    void controller
      .speak(VOICE_PREVIEW_SAMPLE, {
        rate,
        voiceProfile: toEngineProfile(voiceProfile),
      })
      .then(setActiveSource);
  }, [controller, muted, profileBlocked, rate, voiceProfile]);

  const stop = useCallback(() => {
    lastSpokenKeyRef.current = null;
    pauseLatchedRef.current = false;
    controller.stop();
    setActiveSource('none');
  }, [controller]);

  const toggleMute = useCallback(() => {
    setMuted((prev) => {
      const next = !prev;
      controller.setMuted(next);
      persist({ muted: next, rate, voiceProfile });
      if (next) {
        lastSpokenKeyRef.current = null;
        setActiveSource('none');
      }
      return next;
    });
  }, [controller, persist, rate, voiceProfile]);

  const setRate = useCallback(
    (nextRate: number) => {
      const clamped = clampNarrationRate(nextRate);
      setRateState(clamped);
      controller.setRate(clamped);
      persist({ muted, rate: clamped, voiceProfile });
      if (
        !muted &&
        !profileBlocked &&
        text?.trim() &&
        (controller.getStatus() === 'speaking' || controller.getStatus() === 'paused')
      ) {
        lastSpokenKeyRef.current = null;
        void controller
          .speak(text.trim(), {
            rate: clamped,
            tutorialId,
            clipId,
            voiceProfile: toEngineProfile(voiceProfile),
          })
          .then((source) => {
            setActiveSource(source);
            lastSpokenKeyRef.current = `${tutorialId ?? ''}|${clipId ?? ''}|${text.trim()}|${voiceProfile}`;
          });
      }
    },
    [controller, muted, persist, text, voiceProfile, tutorialId, clipId, profileBlocked]
  );

  const setVoiceProfile = useCallback(
    (nextProfile: StoredVoiceProfile) => {
      setVoiceProfileState(nextProfile);
      controller.setVoiceProfile(toEngineProfile(nextProfile));
      persist({ muted, rate, voiceProfile: nextProfile });
      lastSpokenKeyRef.current = null;
      void controller.ensureVoices().then((voices) => {
        setAvailability(analyzeVoiceProfileAvailability(voices));
      });
      if (
        !muted &&
        active &&
        ready &&
        text?.trim() &&
        !(
          (nextProfile === 'female' && availability.female.length === 0) ||
          (nextProfile === 'male' && availability.male.length === 0)
        )
      ) {
        void controller
          .speak(text.trim(), {
            rate,
            tutorialId,
            clipId,
            voiceProfile: toEngineProfile(nextProfile),
          })
          .then(setActiveSource);
      }
    },
    [
      controller,
      muted,
      rate,
      persist,
      active,
      ready,
      text,
      tutorialId,
      clipId,
      availability.female.length,
      availability.male.length,
    ]
  );

  return {
    supported: controller.isSupported(),
    status,
    muted,
    rate,
    voiceProfile,
    availability,
    activeSource,
    play,
    pause,
    resume,
    replay,
    preview,
    stop,
    toggleMute,
    setRate,
    setVoiceProfile,
  };
}
