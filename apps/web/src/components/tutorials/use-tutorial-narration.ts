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
import { getElevenLabsAudioEngine } from '@/lib/tutorials/elevenlabs-audio';
import {
  VOICE_PREVIEW_SAMPLE,
  type VoiceProfileAvailability,
} from '@/lib/tutorials/voice-profiles';

export interface UseTutorialNarrationOptions {
  text: string | null | undefined;
  ready: boolean;
  active: boolean;
  paused?: boolean;
  tutorialId?: string | null;
  clipId?: string | null;
  preloadClipIds?: string[];
  /** Prefetch these scripts (next steps) while the current clip plays. */
  prefetchTexts?: string[];
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

function toEngineProfile(profile: StoredVoiceProfile): NarrationVoiceProfileId {
  if (profile === 'horacio') return 'horacio';
  return 'brian';
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
    prefetchTexts = [],
  } = options;
  const controller = useMemo(() => getNarrationController(), []);
  const [status, setStatus] = useState<SpeechNarrationStatus>(() => controller.getStatus());
  const [muted, setMuted] = useState(false);
  const [rate, setRateState] = useState(1);
  const [voiceProfile, setVoiceProfileState] = useState<StoredVoiceProfile>('brian');
  const [availability, setAvailability] = useState<VoiceProfileAvailability>({
    brian: false,
    horacio: false,
    elevenLabs: false,
  });
  const [activeSource, setActiveSource] = useState<NarrationSource>('none');
  const [prefsReady, setPrefsReady] = useState(false);
  const lastSpokenKeyRef = useRef<string | null>(null);
  const pauseLatchedRef = useRef(false);

  useEffect(() => {
    const prefs = readNarrationPreferences();
    setMuted(prefs.muted);
    setRateState(prefs.rate);
    setVoiceProfileState(prefs.voiceProfile === 'auto' ? 'brian' : prefs.voiceProfile);
    controller.setMuted(prefs.muted);
    controller.setRate(prefs.rate);
    controller.setVoiceProfile(toEngineProfile(prefs.voiceProfile));
    setPrefsReady(true);
    void getElevenLabsAudioEngine()
      .isAvailable()
      .then((ok) => {
        setAvailability({ brian: ok, horacio: ok, elevenLabs: ok });
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

  const speakCurrent = useCallback(
    async (force = false) => {
      const value = text?.trim();
      if (!value || muted) return;
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
    [controller, text, muted, rate, tutorialId, clipId, voiceProfile]
  );

  useEffect(() => {
    if (!prefsReady || !active || !tutorialId) return;
    if (preloadClipIds.length === 0) return;
    void controller.preloadClips(
      preloadClipIds.map((id) => ({ tutorialId, clipId: id })),
      toEngineProfile(voiceProfile)
    );
  }, [prefsReady, active, tutorialId, voiceProfile, preloadClipIds, controller]);

  // Prefetch upcoming scripts so step changes do not wait on the network.
  useEffect(() => {
    if (!prefsReady || !active || muted || prefetchTexts.length === 0) return;
    const profile = toEngineProfile(voiceProfile);
    for (const script of prefetchTexts) {
      const value = script.trim();
      if (!value) continue;
      void controller.prefetch(value, profile);
    }
  }, [prefsReady, active, muted, voiceProfile, prefetchTexts, controller]);

  useEffect(() => {
    if (!active) {
      lastSpokenKeyRef.current = null;
      pauseLatchedRef.current = false;
      controller.stop();
      setActiveSource('none');
    }
  }, [active, controller]);

  useEffect(() => {
    if (!prefsReady) return;

    // Only hard-stop when the tutorial closes or mute — never on route navigation.
    if (!active) return;
    if (muted) return;
    if (!ready) return;

    const value = text?.trim();
    if (!value) return;

    const key = `${tutorialId ?? ''}|${clipId ?? ''}|${value}|${voiceProfile}`;
    if (lastSpokenKeyRef.current === key) return;

    const timer = window.setTimeout(() => {
      if (!active || muted) return;
      void speakCurrent(true);
    }, 60);

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
    tutorialId,
    clipId,
    voiceProfile,
  ]);

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
    if (muted) return;
    lastSpokenKeyRef.current = null;
    void controller
      .speak(VOICE_PREVIEW_SAMPLE, {
        rate,
        voiceProfile: toEngineProfile(voiceProfile),
      })
      .then(setActiveSource);
  }, [controller, muted, rate, voiceProfile]);

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
      // Live rate change on the current element — do not restart the clip.
    },
    [controller, muted, persist, voiceProfile]
  );

  const setVoiceProfile = useCallback(
    (nextProfile: StoredVoiceProfile) => {
      const normalized = nextProfile === 'auto' ? 'brian' : nextProfile;
      setVoiceProfileState(normalized);
      controller.setVoiceProfile(toEngineProfile(normalized));
      persist({ muted, rate, voiceProfile: normalized });
      lastSpokenKeyRef.current = null;
      if (!muted && active && ready && text?.trim()) {
        void controller
          .speak(text.trim(), {
            rate,
            tutorialId,
            clipId,
            voiceProfile: toEngineProfile(normalized),
          })
          .then(setActiveSource);
      }
    },
    [controller, muted, rate, persist, active, ready, text, tutorialId, clipId]
  );

  return {
    supported: true,
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
