/**
 * Audio-driven continuous tutorial narration.
 * The playlist advances steps — React step changes must NOT restart speech.
 * Prefers ElevenLabs; falls back to browser male Spanish TTS when unavailable.
 */

import type { NarrationVoiceProfileId } from '@sincvete/shared';
import { normalizeSpokenText } from '@sincvete/shared';
import { getElevenLabsAudioEngine } from '@/lib/tutorials/elevenlabs-audio';
import {
  getSpeechNarrationEngine,
  type SpeechNarrationStatus,
} from '@/lib/tutorials/speech-narration';

export interface ContinuousNarrationClip {
  stepIndex: number;
  text: string;
  clipId: string;
}

export interface ContinuousNarrationHandlers {
  /** Called when a clip starts (UI should show this step). */
  onStep: (stepIndex: number) => void;
  /** Called after the last clip finishes. */
  onComplete: () => void;
  onStatus?: (status: SpeechNarrationStatus) => void;
}

function estimateHoldMs(text: string): number {
  return Math.min(45_000, Math.max(2_500, text.trim().length * 55));
}

export class ContinuousNarrationSession {
  private clips: ContinuousNarrationClip[] = [];
  private index = -1;
  private voice: NarrationVoiceProfileId = 'brian';
  private rate = 1;
  private muted = false;
  private paused = false;
  private running = false;
  private generation = 0;
  private handlers: ContinuousNarrationHandlers | null = null;
  private holdTimer: ReturnType<typeof setTimeout> | null = null;
  private useEleven = true;
  private eleven: ReturnType<typeof getElevenLabsAudioEngine>;
  private browser: ReturnType<typeof getSpeechNarrationEngine>;
  private unsub: (() => void) | null = null;

  constructor(
    eleven: ReturnType<typeof getElevenLabsAudioEngine> = getElevenLabsAudioEngine(),
    browser: ReturnType<typeof getSpeechNarrationEngine> = getSpeechNarrationEngine()
  ) {
    this.eleven = eleven;
    this.browser = browser;
  }

  isRunning(): boolean {
    return this.running;
  }

  getStatus(): SpeechNarrationStatus {
    if (!this.running) return 'idle';
    if (this.paused) return 'paused';
    if (this.muted) return 'idle';
    return this.useEleven ? this.eleven.getStatus() : this.browser.getStatus();
  }

  async start(
    clips: ContinuousNarrationClip[],
    options: {
      voice: NarrationVoiceProfileId;
      rate: number;
      muted?: boolean;
      startIndex?: number;
    },
    handlers: ContinuousNarrationHandlers
  ): Promise<void> {
    this.stopInternal(false);
    const cleaned = clips
      .map((clip) => ({
        ...clip,
        text: normalizeSpokenText(clip.text.trim()),
      }))
      .filter((clip) => clip.text.length > 0);
    if (cleaned.length === 0) {
      handlers.onComplete();
      return;
    }

    this.clips = cleaned;
    this.voice = options.voice;
    this.rate = options.rate;
    this.muted = Boolean(options.muted);
    this.paused = false;
    this.running = true;
    this.handlers = handlers;
    this.index = Math.max(0, Math.min(options.startIndex ?? 0, cleaned.length - 1));
    this.generation += 1;
    const gen = this.generation;

    this.useEleven = await this.eleven.isAvailable();
    if (gen !== this.generation || !this.running) return;

    if (this.useEleven) {
      this.unsub = this.eleven.subscribe((status) => {
        handlers.onStatus?.(this.paused ? 'paused' : status);
      });
      const first = cleaned[this.index];
      if (first) {
        await this.eleven.prefetch(first.text, this.voice);
      }
      if (gen !== this.generation || !this.running) return;
      void this.prefetchFrom(this.index + 1, gen);
    } else {
      this.browser.setRate(this.rate);
      this.browser.setVoiceProfile(this.voice);
      this.browser.setMuted(this.muted);
      this.unsub = this.browser.subscribe((status) => {
        handlers.onStatus?.(this.paused ? 'paused' : status);
      });
      await this.browser.ensureVoices();
      if (gen !== this.generation || !this.running) return;
    }

    await this.playIndex(this.index, gen);
  }

  pause(): void {
    if (!this.running || this.paused) return;
    this.paused = true;
    if (this.holdTimer != null) {
      clearTimeout(this.holdTimer);
      this.holdTimer = null;
    }
    if (this.useEleven) this.eleven.pause();
    else this.browser.pause();
    this.handlers?.onStatus?.('paused');
  }

  resume(): void {
    if (!this.running || !this.paused) return;
    this.paused = false;
    if (this.muted) {
      void this.scheduleMutedHold(this.generation);
      return;
    }
    const status = this.useEleven ? this.eleven.getStatus() : this.browser.getStatus();
    if (status === 'paused') {
      if (this.useEleven) this.eleven.resume();
      else this.browser.resume();
      this.handlers?.onStatus?.('speaking');
      return;
    }
    void this.playIndex(this.index, this.generation);
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    this.eleven.setMuted(muted);
    this.browser.setMuted(muted);
    if (!this.running) return;
    if (muted) {
      this.eleven.stop();
      this.browser.stop();
      void this.scheduleMutedHold(this.generation);
      return;
    }
    if (!this.paused) {
      void this.playIndex(this.index, this.generation);
    }
  }

  setRate(rate: number): void {
    this.rate = rate;
    this.eleven.setRate(rate);
    this.browser.setRate(rate);
  }

  async setVoice(voice: NarrationVoiceProfileId): Promise<void> {
    if (this.voice === voice) return;
    this.voice = voice;
    this.browser.setVoiceProfile(voice);
    if (!this.running) return;
    if (this.useEleven) {
      const remaining = this.clips.slice(this.index);
      await Promise.all(remaining.map((clip) => this.eleven.prefetch(clip.text, voice)));
    }
    if (!this.paused && !this.muted) {
      await this.playIndex(this.index, this.generation);
    }
  }

  stop(): void {
    this.stopInternal(true);
  }

  private stopInternal(_notifyIdle: boolean): void {
    this.generation += 1;
    this.running = false;
    this.paused = false;
    if (this.holdTimer != null) {
      clearTimeout(this.holdTimer);
      this.holdTimer = null;
    }
    this.unsub?.();
    this.unsub = null;
    this.eleven.stop();
    this.browser.stop();
    this.clips = [];
    this.index = -1;
    this.handlers = null;
  }

  private async prefetchFrom(startIndex: number, gen: number): Promise<void> {
    if (!this.useEleven) return;
    for (let i = startIndex; i < this.clips.length; i += 1) {
      if (gen !== this.generation || !this.running) return;
      const clip = this.clips[i];
      if (!clip) continue;
      await this.eleven.prefetch(clip.text, this.voice);
    }
  }

  private async playIndex(index: number, gen: number): Promise<void> {
    if (gen !== this.generation || !this.running) return;
    const clip = this.clips[index];
    if (!clip) {
      this.finish(gen);
      return;
    }

    this.index = index;
    this.handlers?.onStep(clip.stepIndex);
    void this.prefetchFrom(index + 1, gen);

    if (this.muted) {
      await this.scheduleMutedHold(gen);
      return;
    }

    if (this.useEleven) {
      const started = await this.eleven.speak(clip.text, this.voice, {
        rate: this.rate,
        // Slight headroom — screen capture / laptop speakers clip ElevenLabs peaks.
        volume: 0.9,
        onEnd: () => {
          if (gen !== this.generation || this.paused) return;
          void this.advance(gen);
        },
        onError: () => {
          if (gen !== this.generation || this.paused) return;
          // Keep the step on screen; do not race through the playlist.
          void this.scheduleClipHold(gen);
        },
      });

      if (gen !== this.generation) return;
      if (!started) {
        // Never fall back to browser TTS when ElevenLabs is the engine —
        // Windows/Chrome voices sound harsh next to Brian C / Horacio.
        void this.scheduleClipHold(gen);
      }
      return;
    }

    if (!(await this.speakWithBrowser(clip.text, gen))) {
      void this.scheduleClipHold(gen);
    }
  }

  private async speakWithBrowser(text: string, gen: number): Promise<boolean> {
    if (!this.browser.isSupported()) return false;
    this.browser.setRate(this.rate);
    this.browser.setVoiceProfile(this.voice);
    await this.browser.ensureVoices();
    if (gen !== this.generation || !this.running || this.paused || this.muted) return false;

    this.browser.speak(text, {
      rate: this.rate,
      // Browser TTS peaks hard; lower gain reduces metallic clipping.
      volume: 0.82,
      onEnd: () => {
        if (gen !== this.generation || this.paused) return;
        void this.advance(gen);
      },
      onError: () => {
        if (gen !== this.generation || this.paused) return;
        void this.scheduleClipHold(gen);
      },
    });
    return true;
  }

  private async scheduleMutedHold(gen: number): Promise<void> {
    await this.scheduleClipHold(gen);
  }

  /** Hold for an estimated read time so failed/missing audio does not skip steps. */
  private async scheduleClipHold(gen: number): Promise<void> {
    if (gen !== this.generation || !this.running || this.paused) return;
    const clip = this.clips[this.index];
    if (!clip) {
      this.finish(gen);
      return;
    }
    if (this.holdTimer != null) clearTimeout(this.holdTimer);
    this.holdTimer = setTimeout(() => {
      this.holdTimer = null;
      if (gen !== this.generation || this.paused) return;
      void this.advance(gen);
    }, estimateHoldMs(clip.text));
  }

  private async advance(gen: number): Promise<void> {
    if (gen !== this.generation || !this.running || this.paused) return;
    const next = this.index + 1;
    if (next >= this.clips.length) {
      this.finish(gen);
      return;
    }
    await new Promise<void>((resolve) => {
      this.holdTimer = setTimeout(() => {
        this.holdTimer = null;
        resolve();
      }, 220);
    });
    if (gen !== this.generation || this.paused) return;
    await this.playIndex(next, gen);
  }

  private finish(gen: number): void {
    if (gen !== this.generation) return;
    const complete = this.handlers?.onComplete;
    this.stopInternal(false);
    complete?.();
  }
}

let sharedSession: ContinuousNarrationSession | null = null;

export function getContinuousNarrationSession(): ContinuousNarrationSession {
  if (!sharedSession) sharedSession = new ContinuousNarrationSession();
  return sharedSession;
}

export function __resetContinuousNarrationSessionForTests(): void {
  sharedSession?.stop();
  sharedSession = null;
}
