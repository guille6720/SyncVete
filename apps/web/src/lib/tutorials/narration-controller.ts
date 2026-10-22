/**
 * Tutoriales narration controller.
 * Prefers ElevenLabs (Brian C / Horacio). Browser TTS is last resort and male-only.
 */

import { normalizeSpokenText, type NarrationVoiceProfileId } from '@sincvete/shared';
import {
  clampNarrationRate,
  getSpeechNarrationEngine,
  SpeechNarrationEngine,
  type SpeechNarrationSpeakOptions,
  type SpeechNarrationStatus,
  type SpeechSettledReason,
} from '@/lib/tutorials/speech-narration';
import {
  buildClipRef,
  getPrerecordedAudioEngine,
  PrerecordedAudioEngine,
} from '@/lib/tutorials/prerecorded-audio';
import {
  getElevenLabsAudioEngine,
  ElevenLabsAudioEngine,
} from '@/lib/tutorials/elevenlabs-audio';

export type NarrationSource = 'elevenlabs' | 'prerecorded' | 'browser' | 'none';

export interface NarrationSpeakRequest extends SpeechNarrationSpeakOptions {
  tutorialId?: string | null;
  clipId?: string | null;
  voiceProfile?: NarrationVoiceProfileId | null;
}

export class NarrationController {
  private browser: SpeechNarrationEngine;
  private audio: PrerecordedAudioEngine;
  private eleven: ElevenLabsAudioEngine;
  private activeSource: NarrationSource = 'none';
  private status: SpeechNarrationStatus = 'idle';
  private listeners = new Set<(status: SpeechNarrationStatus) => void>();
  private unsubBrowser: (() => void) | null = null;
  private unsubAudio: (() => void) | null = null;
  private unsubEleven: (() => void) | null = null;
  private voiceProfile: NarrationVoiceProfileId | null = 'brian';

  constructor(
    browser: SpeechNarrationEngine = getSpeechNarrationEngine(),
    audio: PrerecordedAudioEngine = getPrerecordedAudioEngine(),
    eleven: ElevenLabsAudioEngine = getElevenLabsAudioEngine()
  ) {
    this.browser = browser;
    this.audio = audio;
    this.eleven = eleven;
    this.status = 'idle';
    this.unsubBrowser = this.browser.subscribe((status) => {
      if (this.activeSource !== 'browser') return;
      this.setStatus(status);
      if (status === 'idle') this.activeSource = 'none';
    });
    this.unsubAudio = this.audio.subscribe((status) => {
      if (this.activeSource !== 'prerecorded') return;
      this.setStatus(status);
      if (status === 'idle') this.activeSource = 'none';
    });
    this.unsubEleven = this.eleven.subscribe((status) => {
      if (this.activeSource !== 'elevenlabs') return;
      this.setStatus(status);
      if (status === 'idle') this.activeSource = 'none';
    });
  }

  getStatus(): SpeechNarrationStatus {
    return this.status;
  }

  isSupported(): boolean {
    return true;
  }

  isMuted(): boolean {
    return this.browser.isMuted();
  }

  getRate(): number {
    return this.browser.getRate();
  }

  getActiveSource(): NarrationSource {
    return this.activeSource;
  }

  getVoiceProfile(): NarrationVoiceProfileId | null {
    return this.voiceProfile;
  }

  subscribe(listener: (status: SpeechNarrationStatus) => void): () => void {
    this.listeners.add(listener);
    listener(this.status);
    return () => {
      this.listeners.delete(listener);
    };
  }

  setMuted(muted: boolean): void {
    this.browser.setMuted(muted);
    this.audio.setMuted(muted);
    this.eleven.setMuted(muted);
    if (muted) {
      this.activeSource = 'none';
      this.setStatus('idle');
    }
  }

  setRate(rate: number): void {
    const clamped = clampNarrationRate(rate);
    this.browser.setRate(clamped);
    this.audio.setRate(clamped);
    this.eleven.setRate(clamped);
  }

  setVoiceProfile(profile: NarrationVoiceProfileId | null): void {
    this.voiceProfile = profile ?? 'brian';
    // Browser fallback must stay male (Brian C / Horacio are men).
    this.browser.setVoiceProfile(this.voiceProfile);
  }

  ensureVoices(): Promise<SpeechSynthesisVoice[]> {
    return this.browser.ensureVoices();
  }

  async preloadClips(
    clips: Array<{ tutorialId: string; clipId: string }>,
    voiceProfile: NarrationVoiceProfileId | null
  ): Promise<void> {
    if (!voiceProfile) return;
    const refs = clips.map((clip) =>
      buildClipRef({
        tutorialId: clip.tutorialId,
        clipId: clip.clipId,
        voiceProfile,
      })
    );
    await this.audio.preload(refs);
  }

  /** Prefetch ElevenLabs audio for the next step while the current one plays. */
  async prefetch(text: string, voiceProfile?: NarrationVoiceProfileId | null): Promise<void> {
    const spoken = normalizeSpokenText(text.trim());
    if (!spoken) return;
    const profile = voiceProfile ?? this.voiceProfile ?? 'brian';
    await this.eleven.prefetch(spoken, profile);
  }

  async speak(text: string, options: NarrationSpeakRequest = {}): Promise<NarrationSource> {
    const trimmed = text.trim();
    if (!trimmed) return 'none';
    if (this.isMuted()) {
      this.activeSource = 'none';
      this.setStatus('idle');
      return 'none';
    }

    const profile = options.voiceProfile ?? this.voiceProfile ?? 'brian';
    const tutorialId = options.tutorialId ?? null;
    const clipId = options.clipId ?? null;
    const spoken = normalizeSpokenText(trimmed);

    // Claim ElevenLabs immediately; do not hard-stop other engines until needed.
    // ElevenLabs speak() keeps the previous clip until the next blob is ready.
    this.activeSource = 'elevenlabs';
    this.setStatus('speaking');
    this.browser.stop();
    this.audio.stop();

    const elevenStarted = await this.eleven.speak(spoken, profile, {
      rate: options.rate,
      volume: options.volume,
      onEnd: options.onEnd,
      onError: options.onError,
    });
    if (elevenStarted) {
      this.activeSource = 'elevenlabs';
      this.setStatus(this.eleven.getStatus());
      return 'elevenlabs';
    }

    // If ElevenLabs is configured, never fall back to a browser female voice.
    const elevenConfigured = await this.eleven.isAvailable();
    if (elevenConfigured) {
      this.activeSource = 'none';
      this.setStatus('idle');
      return 'none';
    }

    // 2) Optional static MP3 clips
    if (tutorialId && clipId) {
      this.activeSource = 'prerecorded';
      const started = await this.audio.speak(
        buildClipRef({ tutorialId, clipId, voiceProfile: profile }),
        {
          rate: options.rate,
          volume: options.volume,
          onEnd: options.onEnd,
          onError: options.onError,
        }
      );
      if (started) {
        this.activeSource = 'prerecorded';
        this.setStatus(this.audio.getStatus());
        return 'prerecorded';
      }
    }

    // 3) Browser fallback only when ElevenLabs is unavailable — male Spanish only.
    if (!this.browser.isSupported()) {
      this.activeSource = 'none';
      this.setStatus('unsupported');
      return 'none';
    }

    this.activeSource = 'browser';
    this.browser.setVoiceProfile(profile);
    this.browser.speak(spoken, options);
    this.setStatus(this.browser.getStatus());
    return 'browser';
  }

  pause(): void {
    if (this.activeSource === 'elevenlabs') {
      this.eleven.pause();
      this.setStatus(this.eleven.getStatus());
      return;
    }
    if (this.activeSource === 'prerecorded') {
      this.audio.pause();
      this.setStatus(this.audio.getStatus());
      return;
    }
    if (this.activeSource === 'browser') {
      this.browser.pause();
      this.setStatus(this.browser.getStatus());
    }
  }

  resume(): void {
    if (this.activeSource === 'elevenlabs') {
      this.eleven.resume();
      this.setStatus(this.eleven.getStatus());
      return;
    }
    if (this.activeSource === 'prerecorded') {
      this.audio.resume();
      this.setStatus(this.audio.getStatus());
      return;
    }
    if (this.activeSource === 'browser') {
      this.browser.resume();
      this.setStatus(this.browser.getStatus());
    }
  }

  stop(): void {
    this.browser.stop();
    this.audio.stop();
    this.eleven.stop();
    this.activeSource = 'none';
    if (this.status !== 'unsupported') this.setStatus('idle');
  }

  /**
   * Unified settle wait — does not depend on activeSource already being set.
   * Critical: auto-advance starts before React fires speak(); we must wait
   * through ElevenLabs fetch + full playback.
   *
   * Uses a short quiet gap so soft-stop → new speak (voice/rate change) does
   * not look like “narration finished”.
   */
  waitUntilSettled(options: {
    timeoutMs?: number;
    startGraceMs?: number;
  } = {}): Promise<SpeechSettledReason> {
    const timeoutMs = options.timeoutMs ?? 120_000;
    const startGraceMs = options.startGraceMs ?? 4_500;
    const quietGapMs = 400;

    if (this.isMuted()) return Promise.resolve('muted');

    return new Promise((resolve) => {
      let settled = false;
      let sawSpeak =
        this.status === 'speaking' ||
        this.status === 'paused' ||
        this.activeSource !== 'none';
      let graceTimer: ReturnType<typeof setTimeout> | null = null;
      let timeoutTimer: ReturnType<typeof setTimeout> | null = null;
      let quietTimer: ReturnType<typeof setTimeout> | null = null;

      const cleanup = () => {
        if (graceTimer != null) clearTimeout(graceTimer);
        if (timeoutTimer != null) clearTimeout(timeoutTimer);
        if (quietTimer != null) clearTimeout(quietTimer);
        unsub();
      };

      const finish = (reason: SpeechSettledReason) => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve(reason);
      };

      const armQuietFinish = () => {
        if (quietTimer != null) clearTimeout(quietTimer);
        quietTimer = setTimeout(() => {
          quietTimer = null;
          if (settled) return;
          if (this.status === 'speaking' || this.status === 'paused') return;
          if (this.activeSource !== 'none') return;
          finish(sawSpeak ? 'ended' : 'idle');
        }, quietGapMs);
      };

      const unsub = this.subscribe((status) => {
        if (settled) return;
        if (status === 'speaking' || status === 'paused' || this.activeSource !== 'none') {
          sawSpeak = true;
          if (quietTimer != null) {
            clearTimeout(quietTimer);
            quietTimer = null;
          }
          return;
        }
        if (sawSpeak && status === 'idle') {
          armQuietFinish();
        }
      });

      timeoutTimer = setTimeout(() => finish('timeout'), timeoutMs);

      if (sawSpeak && this.status === 'idle' && this.activeSource === 'none') {
        armQuietFinish();
      }

      graceTimer = setTimeout(() => {
        if (settled) return;
        if (
          sawSpeak ||
          this.status === 'speaking' ||
          this.status === 'paused' ||
          this.activeSource !== 'none'
        ) {
          sawSpeak = true;
          if (this.status === 'idle' && this.activeSource === 'none') {
            armQuietFinish();
          }
          return;
        }
        finish('idle');
      }, startGraceMs);
    });
  }

  dispose(): void {
    this.unsubBrowser?.();
    this.unsubAudio?.();
    this.unsubEleven?.();
    this.unsubBrowser = null;
    this.unsubAudio = null;
    this.unsubEleven = null;
    this.listeners.clear();
  }

  private stopEnginesSoft(): void {
    this.eleven.stop();
    this.audio.stop();
    this.browser.stop();
    this.activeSource = 'none';
  }

  private setStatus(next: SpeechNarrationStatus): void {
    if (this.status === 'unsupported' && next !== 'unsupported') return;
    this.status = next;
    for (const listener of this.listeners) listener(next);
  }
}

let sharedController: NarrationController | null = null;

export function getNarrationController(): NarrationController {
  if (!sharedController) sharedController = new NarrationController();
  return sharedController;
}

export function __resetNarrationControllerForTests(): void {
  sharedController?.stop();
  sharedController?.dispose();
  sharedController = null;
}
