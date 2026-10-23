/**
 * Client-side player for ElevenLabs tutorial narration (via /api/tutorials/tts).
 * Caches clips and swaps audio only when the next blob is ready (gapless steps).
 */

import type { NarrationVoiceProfileId } from '@sincvete/shared';
import { normalizeSpokenText } from '@sincvete/shared';
import type { SpeechNarrationStatus, SpeechSettledReason } from '@/lib/tutorials/speech-narration';

export interface ElevenLabsSpeakOptions {
  rate?: number;
  volume?: number;
  onEnd?: () => void;
  onError?: (error: unknown) => void;
}

function clampPlaybackRate(rate: number): number {
  if (!Number.isFinite(rate)) return 1;
  return Math.min(1.25, Math.max(0.8, rate));
}

function cacheKey(voiceProfile: NarrationVoiceProfileId, text: string): string {
  return `${voiceProfile}::${text}`;
}

export class ElevenLabsAudioEngine {
  private audio: HTMLAudioElement | null = null;
  private objectUrl: string | null = null;
  private status: SpeechNarrationStatus = 'idle';
  private muted = false;
  private rate = 1;
  private generation = 0;
  private configured: boolean | null = null;
  private listeners = new Set<(status: SpeechNarrationStatus) => void>();
  private settleWaiters = new Set<{
    generation: number;
    resolve: (reason: SpeechSettledReason) => void;
  }>();
  private cache = new Map<string, Blob>();
  private inflight = new Map<string, Promise<Blob | null>>();

  getStatus(): SpeechNarrationStatus {
    return this.status;
  }

  getGeneration(): number {
    return this.generation;
  }

  isMuted(): boolean {
    return this.muted;
  }

  subscribe(listener: (status: SpeechNarrationStatus) => void): () => void {
    this.listeners.add(listener);
    listener(this.status);
    return () => {
      this.listeners.delete(listener);
    };
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (muted) this.stop();
  }

  setRate(rate: number): void {
    this.rate = clampPlaybackRate(rate);
    if (this.audio) this.audio.playbackRate = this.rate;
  }

  /** Probe once whether the staging TTS endpoint is configured. */
  async isAvailable(): Promise<boolean> {
    if (this.configured != null) return this.configured;
    if (typeof window === 'undefined') {
      this.configured = false;
      return false;
    }
    try {
      const response = await fetch('/api/tutorials/tts', {
        method: 'GET',
        cache: 'no-store',
      });
      if (!response.ok) {
        this.configured = false;
        return false;
      }
      const data = (await response.json()) as { configured?: boolean };
      this.configured = Boolean(data.configured);
      return this.configured;
    } catch {
      this.configured = false;
      return false;
    }
  }

  /** Warm the cache so the next step can start without a network gap. */
  async prefetch(text: string, voiceProfile: NarrationVoiceProfileId): Promise<boolean> {
    if (typeof window === 'undefined' || this.muted) return false;
    const spoken = normalizeSpokenText(text.trim());
    if (!spoken) return false;
    const blob = await this.fetchBlob(spoken, voiceProfile);
    return Boolean(blob);
  }

  async speak(
    text: string,
    voiceProfile: NarrationVoiceProfileId,
    options: ElevenLabsSpeakOptions = {}
  ): Promise<boolean> {
    if (typeof window === 'undefined') return false;
    if (this.muted) {
      this.setStatus('idle');
      return false;
    }

    const spoken = normalizeSpokenText(text.trim());
    if (!spoken) return false;

    const previous = this.generation;
    const generation = ++this.generation;
    // New request supersedes settle waiters; keep current audio until swap.
    this.resolveWaiters(previous, 'stopped');
    // Keep "speaking" during fetch so scene advance does not race ahead,
    // but do NOT kill the current clip until the next blob is ready.
    this.setStatus('speaking');

    try {
      const blob = await this.fetchBlob(spoken, voiceProfile);
      if (generation !== this.generation) return false;

      if (!blob) {
        this.setStatus('idle');
        this.resolveWaiters(generation, 'error');
        return false;
      }

      // Atomic swap: stop previous only when replacement audio is ready.
      this.detachCurrentAudio();
      this.revokeObjectUrl();
      this.objectUrl = URL.createObjectURL(blob);
      const audio = new Audio(this.objectUrl);
      audio.playbackRate = clampPlaybackRate(options.rate ?? this.rate);
      if (typeof options.volume === 'number') {
        audio.volume = Math.min(1, Math.max(0, options.volume));
      }
      this.audio = audio;

      audio.onended = () => {
        if (generation !== this.generation) return;
        this.setStatus('idle');
        this.resolveWaiters(generation, 'ended');
        options.onEnd?.();
      };
      audio.onerror = () => {
        if (generation !== this.generation) return;
        this.setStatus('idle');
        this.resolveWaiters(generation, 'error');
        options.onError?.(new Error('Error de reproducción ElevenLabs'));
      };

      this.setStatus('speaking');
      await audio.play();
      if (generation !== this.generation) return false;
      return true;
    } catch (error) {
      if (generation === this.generation) {
        this.setStatus('idle');
        this.resolveWaiters(generation, 'error');
        options.onError?.(error);
      }
      return false;
    }
  }

  pause(): void {
    if (!this.audio || this.status !== 'speaking') return;
    this.audio.pause();
    this.setStatus('paused');
  }

  resume(): void {
    if (!this.audio || this.status !== 'paused') return;
    void this.audio.play().then(() => this.setStatus('speaking'));
  }

  stop(): void {
    const previous = this.generation;
    this.generation += 1;
    this.detachCurrentAudio();
    this.revokeObjectUrl();
    this.resolveWaiters(previous, 'stopped');
    this.setStatus('idle');
  }

  /**
   * Wait until current/upcoming clip settles.
   * Uses startGrace so callers that race the React speak() effect still wait
   * through the ElevenLabs network fetch.
   */
  waitUntilSettled(timeoutMs = 120_000, startGraceMs = 4_500): Promise<SpeechSettledReason> {
    if (this.muted) return Promise.resolve('muted');

    return new Promise((resolve) => {
      let settled = false;
      let sawSpeak = this.status === 'speaking' || this.status === 'paused';
      let targetGeneration =
        sawSpeak || this.status === 'speaking' || this.status === 'paused'
          ? this.generation
          : null;
      let graceTimer: ReturnType<typeof setTimeout> | null = null;
      let timeoutTimer: ReturnType<typeof setTimeout> | null = null;
      let activeWaiter: {
        generation: number;
        resolve: (reason: SpeechSettledReason) => void;
      } | null = null;

      const cleanup = () => {
        if (graceTimer != null) clearTimeout(graceTimer);
        if (timeoutTimer != null) clearTimeout(timeoutTimer);
        if (activeWaiter) {
          this.settleWaiters.delete(activeWaiter);
          activeWaiter = null;
        }
        unsub();
      };

      const finish = (reason: SpeechSettledReason) => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve(reason);
      };

      const armWaiter = (generation: number) => {
        if (activeWaiter) this.settleWaiters.delete(activeWaiter);
        activeWaiter = { generation, resolve: finish };
        this.settleWaiters.add(activeWaiter);
      };

      const unsub = this.subscribe((status) => {
        if (settled) return;
        if (status === 'speaking' || status === 'paused') {
          sawSpeak = true;
          targetGeneration = this.generation;
          armWaiter(targetGeneration);
        }
      });

      timeoutTimer = setTimeout(() => finish('timeout'), timeoutMs);

      if (targetGeneration != null) {
        armWaiter(targetGeneration);
      }

      graceTimer = setTimeout(() => {
        if (settled) return;
        if (sawSpeak || this.status === 'speaking' || this.status === 'paused') {
          if (targetGeneration == null) {
            targetGeneration = this.generation;
            armWaiter(targetGeneration);
          }
          return;
        }
        finish('idle');
      }, startGraceMs);
    });
  }

  private async fetchBlob(
    spoken: string,
    voiceProfile: NarrationVoiceProfileId
  ): Promise<Blob | null> {
    const key = cacheKey(voiceProfile, spoken);
    const cached = this.cache.get(key);
    if (cached) return cached;

    const existing = this.inflight.get(key);
    if (existing) return existing;

    const request = (async () => {
      try {
        const response = await fetch('/api/tutorials/tts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: spoken, voiceProfile }),
        });

        if (response.status === 503 || response.status === 404) {
          this.configured = false;
          return null;
        }
        if (!response.ok) return null;

        this.configured = true;
        const blob = await response.blob();
        if (blob.size > 0) {
          this.cache.set(key, blob);
          // Bound memory: keep last ~24 clips.
          if (this.cache.size > 24) {
            const first = this.cache.keys().next().value;
            if (first != null) this.cache.delete(first);
          }
        }
        return blob;
      } catch {
        return null;
      } finally {
        this.inflight.delete(key);
      }
    })();

    this.inflight.set(key, request);
    return request;
  }

  private detachCurrentAudio(): void {
    if (this.audio) {
      this.audio.onended = null;
      this.audio.onerror = null;
      this.audio.pause();
      this.audio.src = '';
      this.audio = null;
    }
  }

  private revokeObjectUrl(): void {
    if (this.objectUrl) {
      URL.revokeObjectURL(this.objectUrl);
      this.objectUrl = null;
    }
  }

  private setStatus(status: SpeechNarrationStatus): void {
    this.status = status;
    for (const listener of this.listeners) listener(status);
  }

  private resolveWaiters(generation: number, reason: SpeechSettledReason): void {
    for (const waiter of [...this.settleWaiters]) {
      if (waiter.generation === generation) {
        this.settleWaiters.delete(waiter);
        waiter.resolve(reason);
      }
    }
  }
}

let singleton: ElevenLabsAudioEngine | null = null;

export function getElevenLabsAudioEngine(): ElevenLabsAudioEngine {
  if (!singleton) singleton = new ElevenLabsAudioEngine();
  return singleton;
}

export function __resetElevenLabsAudioEngineForTests(): void {
  singleton?.stop();
  singleton = null;
}
