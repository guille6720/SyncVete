/**
 * Provider-independent prerecorded neural narration player.
 * Plays static MP3 assets from /public — never sends patient data to TTS APIs.
 */

import {
  buildNarrationAssetPath,
  type NarrationClipRef,
  type NarrationVoiceProfileId,
} from '@sincvete/shared';
import type { SpeechNarrationStatus, SpeechSettledReason } from '@/lib/tutorials/speech-narration';

export type PrerecordedAvailability = 'unknown' | 'available' | 'missing';

export interface PrerecordedSpeakOptions {
  rate?: number;
  volume?: number;
  onEnd?: () => void;
  onError?: (error: unknown) => void;
}

function clampPlaybackRate(rate: number): number {
  if (!Number.isFinite(rate)) return 1;
  // HTMLAudioElement typically supports ~0.5–2.0
  return Math.min(1.5, Math.max(0.7, rate));
}

export class PrerecordedAudioEngine {
  private audio: HTMLAudioElement | null = null;
  private status: SpeechNarrationStatus = 'idle';
  private muted = false;
  private rate = 0.95;
  private generation = 0;
  private listeners = new Set<(status: SpeechNarrationStatus) => void>();
  private availability = new Map<string, PrerecordedAvailability>();
  private preloadCache = new Map<string, HTMLAudioElement>();
  private settleWaiters = new Set<{
    generation: number;
    resolve: (reason: SpeechSettledReason) => void;
  }>();

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

  assetPath(ref: NarrationClipRef): string {
    return buildNarrationAssetPath(ref);
  }

  getCachedAvailability(path: string): PrerecordedAvailability {
    return this.availability.get(path) ?? 'unknown';
  }

  async probe(ref: NarrationClipRef): Promise<boolean> {
    if (typeof window === 'undefined') return false;
    const path = this.assetPath(ref);
    const cached = this.availability.get(path);
    if (cached === 'available') return true;
    if (cached === 'missing') return false;

    try {
      const response = await fetch(path, { method: 'HEAD', cache: 'force-cache' });
      const ok = response.ok;
      this.availability.set(path, ok ? 'available' : 'missing');
      return ok;
    } catch {
      // Some hosts block HEAD — try a lightweight range GET
      try {
        const response = await fetch(path, {
          method: 'GET',
          headers: { Range: 'bytes=0-1' },
          cache: 'force-cache',
        });
        const ok = response.ok || response.status === 206;
        this.availability.set(path, ok ? 'available' : 'missing');
        return ok;
      } catch {
        this.availability.set(path, 'missing');
        return false;
      }
    }
  }

  async preload(
    refs: NarrationClipRef[],
    options?: { concurrency?: number }
  ): Promise<void> {
    if (typeof window === 'undefined') return;
    const concurrency = options?.concurrency ?? 3;
    const queue = [...refs];
    const workers = Array.from({ length: concurrency }, async () => {
      while (queue.length) {
        const ref = queue.shift();
        if (!ref) return;
        const available = await this.probe(ref);
        if (!available) continue;
        const path = this.assetPath(ref);
        if (this.preloadCache.has(path)) continue;
        const el = new Audio(path);
        el.preload = 'auto';
        this.preloadCache.set(path, el);
        try {
          el.load();
        } catch {
          // ignore
        }
      }
    });
    await Promise.all(workers);
  }

  /**
   * Attempt prerecorded playback. Returns false when the clip is unavailable
   * so the caller can fall back to browser speech.
   */
  async speak(
    ref: NarrationClipRef,
    options: PrerecordedSpeakOptions = {}
  ): Promise<boolean> {
    if (typeof window === 'undefined' || this.muted) return false;
    const available = await this.probe(ref);
    if (!available) return false;

    this.invalidatePending();
    const generation = ++this.generation;
    const path = this.assetPath(ref);
    const audio = this.preloadCache.get(path) ?? new Audio(path);
    this.audio = audio;
    audio.playbackRate = clampPlaybackRate(options.rate ?? this.rate);
    audio.volume = options.volume ?? 1;
    audio.currentTime = 0;

    const finish = (reason: SpeechSettledReason) => {
      if (generation !== this.generation) return;
      this.audio = null;
      this.setStatus('idle');
      this.resolveSettleWaiters(generation, reason);
      if (reason === 'ended') options.onEnd?.();
      if (reason === 'error') options.onError?.(reason);
    };

    audio.onplay = () => {
      if (generation !== this.generation) return;
      this.setStatus('speaking');
    };
    audio.onended = () => finish('ended');
    audio.onerror = () => {
      this.availability.set(path, 'missing');
      finish('error');
    };
    audio.onpause = () => {
      if (generation !== this.generation) return;
      if (!audio.ended && audio.currentTime > 0 && !audio.paused) return;
      if (!audio.ended && audio.paused) this.setStatus('paused');
    };

    try {
      if (generation !== this.generation || this.muted) return false;
      await audio.play();
      if (generation !== this.generation) {
        audio.pause();
        return false;
      }
      this.setStatus('speaking');
      return true;
    } catch (error) {
      this.availability.set(path, 'missing');
      this.audio = null;
      this.setStatus('idle');
      this.resolveSettleWaiters(generation, 'error');
      options.onError?.(error);
      return false;
    }
  }

  pause(): void {
    if (!this.audio) return;
    try {
      this.audio.pause();
      this.setStatus('paused');
    } catch {
      // ignore
    }
  }

  resume(): void {
    if (!this.audio || this.muted) return;
    void this.audio
      .play()
      .then(() => this.setStatus('speaking'))
      .catch(() => {
        this.audio = null;
        this.setStatus('idle');
        this.resolveSettleWaiters(this.generation, 'error');
      });
  }

  stop(): void {
    this.generation += 1;
    if (this.audio) {
      try {
        this.audio.pause();
        this.audio.currentTime = 0;
      } catch {
        // ignore
      }
    }
    this.audio = null;
    if (this.status !== 'unsupported') this.setStatus('idle');
    this.resolveSettleWaiters(null, 'stopped');
  }

  waitUntilSettled(options: {
    timeoutMs?: number;
    startGraceMs?: number;
  } = {}): Promise<SpeechSettledReason> {
    const timeoutMs = options.timeoutMs ?? 45_000;
    const startGraceMs = options.startGraceMs ?? 900;

    if (this.muted) return Promise.resolve('muted');

    return new Promise((resolve) => {
      let settled = false;
      let targetGeneration: number | null =
        this.status === 'speaking' || this.status === 'paused' ? this.generation : null;
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
        if (targetGeneration == null) {
          if (status === 'speaking' || status === 'paused') {
            targetGeneration = this.generation;
            armWaiter(targetGeneration);
          }
          return;
        }
        if (this.generation !== targetGeneration) finish('stopped');
      });

      timeoutTimer = setTimeout(() => finish('timeout'), timeoutMs);

      if (targetGeneration != null) armWaiter(targetGeneration);

      graceTimer = setTimeout(() => {
        if (settled) return;
        if (targetGeneration != null) return;
        if (this.status === 'speaking' || this.status === 'paused') {
          targetGeneration = this.generation;
          armWaiter(targetGeneration);
          return;
        }
        finish('idle');
      }, startGraceMs);
    });
  }

  private invalidatePending(): void {
    if (this.audio) {
      try {
        this.audio.pause();
        this.audio.currentTime = 0;
      } catch {
        // ignore
      }
    }
    this.audio = null;
    this.resolveSettleWaiters(null, 'stopped');
    if (this.status !== 'idle' && this.status !== 'unsupported') {
      this.setStatus('idle');
    }
  }

  private resolveSettleWaiters(
    generation: number | null,
    reason: SpeechSettledReason
  ): void {
    for (const waiter of [...this.settleWaiters]) {
      if (generation == null || waiter.generation === generation) {
        this.settleWaiters.delete(waiter);
        waiter.resolve(reason);
      }
    }
  }

  private setStatus(next: SpeechNarrationStatus): void {
    this.status = next;
    for (const listener of this.listeners) listener(next);
  }
}

let sharedPrerecorded: PrerecordedAudioEngine | null = null;

export function getPrerecordedAudioEngine(): PrerecordedAudioEngine {
  if (!sharedPrerecorded) sharedPrerecorded = new PrerecordedAudioEngine();
  return sharedPrerecorded;
}

export function __resetPrerecordedAudioEngineForTests(): void {
  sharedPrerecorded?.stop();
  sharedPrerecorded = null;
}

export function buildClipRef(options: {
  tutorialId: string;
  clipId: string;
  voiceProfile: NarrationVoiceProfileId;
}): NarrationClipRef {
  return {
    tutorialId: options.tutorialId,
    clipId: options.clipId,
    voiceProfile: options.voiceProfile,
  };
}
