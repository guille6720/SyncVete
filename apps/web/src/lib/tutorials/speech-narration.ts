/**
 * Browser Web Speech API narration for Academia SyncVete.
 * Prefers es-AR, then other Spanish voices; warm/professional female when available.
 * Uses generation tokens so cancelled/async voice loads never speak after stop.
 * No external paid APIs or credentials.
 */

export type SpeechNarrationStatus = 'idle' | 'speaking' | 'paused' | 'unsupported';

export type SpeechSettledReason =
  | 'ended'
  | 'stopped'
  | 'timeout'
  | 'idle'
  | 'muted'
  | 'unsupported'
  | 'error';

export interface SpeechNarrationSpeakOptions {
  lang?: string;
  rate?: number;
  pitch?: number;
  volume?: number;
  onEnd?: () => void;
  onError?: (error: unknown) => void;
}

const FEMALE_VOICE_HINTS =
  /female|mujer|femenin|sabina|monica|mónica|paulina|elena|lucia|lucía|sofia|sofía|maria|maría|carmen|isabela|paloma|dalia|google español|microsoft sabina|microsoft helena/i;

export function isSpeechSynthesisSupported(
  synth: SpeechSynthesis | undefined | null = typeof window !== 'undefined'
    ? window.speechSynthesis
    : null
): boolean {
  return Boolean(synth && typeof SpeechSynthesisUtterance !== 'undefined');
}

export function pickPreferredSpanishVoice(
  voices: SpeechSynthesisVoice[],
  preferredLang = 'es-AR'
): SpeechSynthesisVoice | null {
  if (!voices.length) return null;

  const normalize = (lang: string) => lang.toLowerCase().replace('_', '-');
  const preferred = normalize(preferredLang);

  const byLangExact = voices.filter((v) => normalize(v.lang) === preferred);
  const byLangPrefix = voices.filter((v) => normalize(v.lang).startsWith('es-'));
  const byLangLoose = voices.filter((v) => normalize(v.lang).startsWith('es'));

  const pools = [byLangExact, byLangPrefix, byLangLoose, voices];

  for (const pool of pools) {
    if (!pool.length) continue;
    const female = pool.find((v) => FEMALE_VOICE_HINTS.test(`${v.name} ${v.voiceURI}`));
    if (female) return female;
    const local = pool.find((v) => v.localService);
    if (local) return local;
    return pool[0] ?? null;
  }
  return null;
}

export function clampNarrationRate(rate: number): number {
  if (!Number.isFinite(rate)) return 1;
  return Math.min(1.35, Math.max(0.7, rate));
}

/** Preference keys for Academia narration (local only). */
export const NARRATION_PREF_KEY = 'syncvete.academia.narration.v1';

export interface NarrationPreferences {
  muted: boolean;
  rate: number;
}

export const DEFAULT_NARRATION_PREFS: NarrationPreferences = {
  muted: false,
  rate: 0.95,
};

export function readNarrationPreferences(): NarrationPreferences {
  if (typeof window === 'undefined') return { ...DEFAULT_NARRATION_PREFS };
  try {
    const raw = window.localStorage.getItem(NARRATION_PREF_KEY);
    if (!raw) return { ...DEFAULT_NARRATION_PREFS };
    const parsed = JSON.parse(raw) as Partial<NarrationPreferences>;
    return {
      muted: Boolean(parsed.muted),
      rate: clampNarrationRate(
        typeof parsed.rate === 'number' ? parsed.rate : DEFAULT_NARRATION_PREFS.rate
      ),
    };
  } catch {
    return { ...DEFAULT_NARRATION_PREFS };
  }
}

export function writeNarrationPreferences(prefs: NarrationPreferences): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(
      NARRATION_PREF_KEY,
      JSON.stringify({
        muted: prefs.muted,
        rate: clampNarrationRate(prefs.rate),
      })
    );
  } catch {
    // ignore quota / private mode
  }
}

type VoicesWaiter = {
  resolve: (voices: SpeechSynthesisVoice[]) => void;
  onVoices: (() => void) | null;
  timer: ReturnType<typeof setTimeout> | null;
};

export class SpeechNarrationEngine {
  private synth: SpeechSynthesis | null;
  private utterance: SpeechSynthesisUtterance | null = null;
  private status: SpeechNarrationStatus = 'idle';
  private muted = false;
  private rate = DEFAULT_NARRATION_PREFS.rate;
  private voice: SpeechSynthesisVoice | null = null;
  private voicesReady = false;
  /** Incremented on every stop() and every new speak() — invalidates in-flight work. */
  private generation = 0;
  private listeners = new Set<(status: SpeechNarrationStatus) => void>();
  private voicesWaiters: VoicesWaiter[] = [];
  private settleWaiters = new Set<{
    generation: number;
    resolve: (reason: SpeechSettledReason) => void;
    timer: ReturnType<typeof setTimeout> | null;
  }>();

  constructor(synth?: SpeechSynthesis | null) {
    this.synth =
      synth ??
      (typeof window !== 'undefined' && window.speechSynthesis
        ? window.speechSynthesis
        : null);
    this.status = isSpeechSynthesisSupported(this.synth) ? 'idle' : 'unsupported';
  }

  getStatus(): SpeechNarrationStatus {
    return this.status;
  }

  getGeneration(): number {
    return this.generation;
  }

  isSupported(): boolean {
    return this.status !== 'unsupported' && Boolean(this.synth);
  }

  isMuted(): boolean {
    return this.muted;
  }

  getRate(): number {
    return this.rate;
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
    this.rate = clampNarrationRate(rate);
  }

  /** Load voices (Chrome populates asynchronously). Safe to cancel via stop(). */
  ensureVoices(): Promise<SpeechSynthesisVoice[]> {
    if (!this.synth) return Promise.resolve([]);
    const current = this.synth.getVoices();
    if (current.length > 0) {
      this.voicesReady = true;
      this.voice = pickPreferredSpanishVoice(current);
      return Promise.resolve(current);
    }

    return new Promise((resolve) => {
      const waiter: VoicesWaiter = {
        resolve,
        onVoices: null,
        timer: null,
      };

      const done = () => {
        this.detachVoicesWaiter(waiter);
        const voices = this.synth?.getVoices() ?? [];
        this.voicesReady = true;
        this.voice = pickPreferredSpanishVoice(voices);
        resolve(voices);
      };

      waiter.onVoices = () => done();
      this.synth?.addEventListener('voiceschanged', waiter.onVoices);
      waiter.timer = setTimeout(done, 750);
      this.voicesWaiters.push(waiter);
    });
  }

  /**
   * Speak text. Returns the generation id for this request.
   * Pending async voice loads are invalidated by stop() / a newer speak().
   */
  speak(text: string, options: SpeechNarrationSpeakOptions = {}): number {
    const trimmed = text.trim();
    if (!this.synth || !this.isSupported() || !trimmed) {
      return this.generation;
    }
    if (this.muted) {
      this.setStatus('idle');
      return this.generation;
    }

    // Invalidate prior pending speak / voice-load chains without notifying settle as "ended"
    this.invalidatePendingSpeak();

    const generation = ++this.generation;

    if (!this.voicesReady) {
      void this.ensureVoices().then(() => {
        if (generation !== this.generation || this.muted) return;
        this.beginUtterance(trimmed, options, generation);
      });
      return generation;
    }

    this.beginUtterance(trimmed, options, generation);
    return generation;
  }

  /**
   * Pause current utterance without cancelling it (keeps generation).
   * Does not treat pause as a step change.
   */
  pause(): void {
    if (!this.synth || !this.isSupported()) return;
    if (this.status === 'speaking' || (this.synth.speaking && !this.synth.paused)) {
      try {
        this.synth.pause();
      } catch {
        // Some engines throw; keep generation so resume/replay can recover
      }
      this.setStatus('paused');
    }
  }

  /**
   * Resume a paused utterance. If the browser cannot resume, reports idle
   * without starting a new speak (caller may Replay explicitly).
   */
  resume(): void {
    if (!this.synth || !this.isSupported() || this.muted) return;
    if (this.status !== 'paused' && !this.synth.paused) return;
    try {
      this.synth.resume();
      this.setStatus('speaking');
    } catch {
      this.utterance = null;
      this.setStatus('idle');
      this.resolveSettleWaiters(this.generation, 'error');
    }
  }

  /** Hard-cancel: invalidates all pending speak/voice-load work. */
  stop(): void {
    this.generation += 1;
    this.clearVoicesWaiters();
    if (this.synth) {
      try {
        this.synth.cancel();
      } catch {
        // ignore
      }
    }
    this.utterance = null;
    if (this.status !== 'unsupported') this.setStatus('idle');
    this.resolveSettleWaiters(/* any */ null, 'stopped');
  }

  /**
   * Wait until narration for the upcoming/current utterance settles, or timeout.
   * Allows a short grace period for the React hook to call speak().
   * Generation-aware: stop() or a replacement speak resolves early as 'stopped'.
   */
  waitUntilSettled(options: {
    timeoutMs?: number;
    /** Grace period to allow the narration hook to start speaking. */
    startGraceMs?: number;
  } = {}): Promise<SpeechSettledReason> {
    const timeoutMs = options.timeoutMs ?? 45_000;
    const startGraceMs = options.startGraceMs ?? 900;

    if (!this.isSupported()) return Promise.resolve('unsupported');
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
        timer: ReturnType<typeof setTimeout> | null;
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
        activeWaiter = {
          generation,
          resolve: finish,
          timer: null,
        };
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
        if (this.generation !== targetGeneration) {
          finish('stopped');
        }
        // Completion reasons come from settleWaiters (ended/error/stopped),
        // not from idle status alone — avoids masking speech errors as 'ended'.
      });

      timeoutTimer = setTimeout(() => finish('timeout'), timeoutMs);

      if (targetGeneration != null) {
        armWaiter(targetGeneration);
      }

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

  private beginUtterance(
    text: string,
    options: SpeechNarrationSpeakOptions,
    generation: number
  ): void {
    if (!this.synth || generation !== this.generation || this.muted) return;

    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = options.lang ?? this.voice?.lang ?? 'es-AR';
    utter.rate = clampNarrationRate(options.rate ?? this.rate);
    utter.pitch = options.pitch ?? 1;
    utter.volume = options.volume ?? 1;
    if (this.voice) utter.voice = this.voice;

    utter.onstart = () => {
      if (generation !== this.generation) return;
      this.setStatus('speaking');
    };
    utter.onend = () => {
      if (generation !== this.generation) return;
      this.utterance = null;
      this.resolveSettleWaiters(generation, 'ended');
      this.setStatus('idle');
      options.onEnd?.();
    };
    utter.onerror = (event) => {
      if (generation !== this.generation) return;
      this.utterance = null;
      this.resolveSettleWaiters(generation, 'error');
      this.setStatus('idle');
      options.onError?.(event);
    };
    utter.onpause = () => {
      if (generation !== this.generation) return;
      this.setStatus('paused');
    };
    utter.onresume = () => {
      if (generation !== this.generation) return;
      this.setStatus('speaking');
    };

    this.utterance = utter;

    // Final cancellation gate immediately before speak()
    if (generation !== this.generation || this.muted) {
      this.utterance = null;
      return;
    }

    try {
      this.synth.speak(utter);
      // After cancel(), some browsers leave the synth paused — only resume if this gen is live
      if (generation === this.generation && this.synth.paused) {
        try {
          this.synth.resume();
        } catch {
          // ignore
        }
      }
    } catch (error) {
      if (generation !== this.generation) return;
      this.utterance = null;
      this.setStatus('idle');
      this.resolveSettleWaiters(generation, 'error');
      options.onError?.(error);
    }
  }

  /** Cancel synth without bumping generation twice when speak() is about to bump it. */
  private invalidatePendingSpeak(): void {
    this.clearVoicesWaiters();
    if (this.synth) {
      try {
        this.synth.cancel();
      } catch {
        // ignore
      }
    }
    this.utterance = null;
    this.resolveSettleWaiters(null, 'stopped');
    if (this.status !== 'unsupported' && this.status !== 'idle') {
      this.setStatus('idle');
    }
  }

  private detachVoicesWaiter(waiter: VoicesWaiter): void {
    if (waiter.onVoices) {
      this.synth?.removeEventListener('voiceschanged', waiter.onVoices);
      waiter.onVoices = null;
    }
    if (waiter.timer != null) {
      clearTimeout(waiter.timer);
      waiter.timer = null;
    }
    this.voicesWaiters = this.voicesWaiters.filter((w) => w !== waiter);
  }

  private clearVoicesWaiters(): void {
    const copy = [...this.voicesWaiters];
    for (const waiter of copy) {
      this.detachVoicesWaiter(waiter);
      // Do not resolve with voices after cancel — callers check generation
      waiter.resolve(this.synth?.getVoices() ?? []);
    }
    this.voicesWaiters = [];
  }

  private resolveSettleWaiters(
    generation: number | null,
    reason: SpeechSettledReason
  ): void {
    for (const waiter of [...this.settleWaiters]) {
      if (generation == null || waiter.generation === generation) {
        this.settleWaiters.delete(waiter);
        if (waiter.timer) clearTimeout(waiter.timer);
        waiter.resolve(reason);
      }
    }
  }

  private setStatus(next: SpeechNarrationStatus): void {
    if (this.status === 'unsupported' && next !== 'unsupported') return;
    this.status = next;
    for (const listener of this.listeners) listener(next);
  }
}

/** Shared singleton for the clinic shell session. */
let sharedEngine: SpeechNarrationEngine | null = null;

export function getSpeechNarrationEngine(): SpeechNarrationEngine {
  if (!sharedEngine) sharedEngine = new SpeechNarrationEngine();
  return sharedEngine;
}

/** Test helper to reset singleton. */
export function __resetSpeechNarrationEngineForTests(): void {
  sharedEngine?.stop();
  sharedEngine = null;
}
