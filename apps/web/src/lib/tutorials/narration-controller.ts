/**
 * Provider-independent Academia narration controller.
 * Prefers static neural clips when present; falls back to browser speech.
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

export type NarrationSource = 'prerecorded' | 'browser' | 'none';

export interface NarrationSpeakRequest extends SpeechNarrationSpeakOptions {
  /** Tutorial id for static asset lookup (e.g. agenda-basico). */
  tutorialId?: string | null;
  /** Step / demo scene id matching the asset map. */
  clipId?: string | null;
  /** Requested gendered neural / browser profile. */
  voiceProfile?: NarrationVoiceProfileId | null;
}

/**
 * Unified narration surface used by the tutorial hook and demo advance waiters.
 */
export class NarrationController {
  private browser: SpeechNarrationEngine;
  private audio: PrerecordedAudioEngine;
  private activeSource: NarrationSource = 'none';
  private status: SpeechNarrationStatus = 'idle';
  private listeners = new Set<(status: SpeechNarrationStatus) => void>();
  private unsubBrowser: (() => void) | null = null;
  private unsubAudio: (() => void) | null = null;
  private voiceProfile: NarrationVoiceProfileId | null = null;

  constructor(
    browser: SpeechNarrationEngine = getSpeechNarrationEngine(),
    audio: PrerecordedAudioEngine = getPrerecordedAudioEngine()
  ) {
    this.browser = browser;
    this.audio = audio;
    this.status = browser.isSupported() ? 'idle' : 'unsupported';
    this.unsubBrowser = this.browser.subscribe((status) => {
      if (this.activeSource === 'browser') this.setStatus(status);
    });
    this.unsubAudio = this.audio.subscribe((status) => {
      if (this.activeSource === 'prerecorded') this.setStatus(status);
    });
  }

  getStatus(): SpeechNarrationStatus {
    return this.status;
  }

  isSupported(): boolean {
    return this.browser.isSupported();
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
    if (muted) {
      this.activeSource = 'none';
      this.setStatus('idle');
    }
  }

  setRate(rate: number): void {
    const clamped = clampNarrationRate(rate);
    this.browser.setRate(clamped);
    this.audio.setRate(clamped);
  }

  setVoiceProfile(profile: NarrationVoiceProfileId | null): void {
    this.voiceProfile = profile;
    this.browser.setVoiceProfile(profile);
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

  /**
   * Speak with optional prerecorded clip. Falls back to browser TTS.
   * Applies SyncVete spoken-text normalization for browser synthesis.
   */
  async speak(text: string, options: NarrationSpeakRequest = {}): Promise<NarrationSource> {
    const trimmed = text.trim();
    if (!trimmed) return 'none';
    if (this.isMuted()) {
      this.activeSource = 'none';
      this.setStatus('idle');
      return 'none';
    }

    this.stopEnginesSoft();

    const profile = options.voiceProfile ?? this.voiceProfile;
    const tutorialId = options.tutorialId ?? null;
    const clipId = options.clipId ?? null;

    if (profile && tutorialId && clipId) {
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

    if (!this.browser.isSupported()) {
      this.activeSource = 'none';
      this.setStatus('unsupported');
      return 'none';
    }

    const spoken = normalizeSpokenText(trimmed);
    this.activeSource = 'browser';
    this.browser.setVoiceProfile(profile ?? null);
    this.browser.speak(spoken, options);
    this.setStatus(this.browser.getStatus());
    return 'browser';
  }

  pause(): void {
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
    this.activeSource = 'none';
    if (this.status !== 'unsupported') this.setStatus('idle');
  }

  waitUntilSettled(options: {
    timeoutMs?: number;
    startGraceMs?: number;
  } = {}): Promise<SpeechSettledReason> {
    if (this.activeSource === 'prerecorded') {
      return this.audio.waitUntilSettled(options);
    }
    return this.browser.waitUntilSettled(options);
  }

  dispose(): void {
    this.unsubBrowser?.();
    this.unsubAudio?.();
    this.unsubBrowser = null;
    this.unsubAudio = null;
    this.listeners.clear();
  }

  /** Stop without bumping browser generation twice when about to re-speak. */
  private stopEnginesSoft(): void {
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
