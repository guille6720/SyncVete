import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { waitForDemoSceneAdvance } from '@/lib/tutorials/demo-scene-advance';
import {
  __resetSpeechNarrationEngineForTests,
  SpeechNarrationEngine,
} from '@/lib/tutorials/speech-narration';

function voice(partial: Partial<SpeechSynthesisVoice> & { name: string; lang: string }) {
  return {
    default: false,
    localService: true,
    voiceURI: partial.name,
    ...partial,
  } as SpeechSynthesisVoice;
}

function installReadySynth() {
  type UtteranceFake = SpeechSynthesisUtterance & {
    onstart: ((this: SpeechSynthesisUtterance, ev: SpeechSynthesisEvent) => void) | null;
    onend: ((this: SpeechSynthesisUtterance, ev: SpeechSynthesisEvent) => void) | null;
    onerror: ((this: SpeechSynthesisUtterance, ev: SpeechSynthesisErrorEvent) => void) | null;
  };

  let current: UtteranceFake | null = null;
  vi.stubGlobal(
    'SpeechSynthesisUtterance',
    vi.fn(function (this: UtteranceFake, text: string) {
      this.text = text;
      this.lang = '';
      this.rate = 1;
      this.pitch = 1;
      this.volume = 1;
      this.voice = null;
      this.onstart = null;
      this.onend = null;
      this.onerror = null;
    })
  );

  const fakeSynth = {
    speaking: false,
    paused: false,
    pending: false,
    getVoices: () => [voice({ name: 'Paulina', lang: 'es-AR' })],
    speak: vi.fn((utter: UtteranceFake) => {
      current = utter;
      fakeSynth.speaking = true;
      queueMicrotask(() => utter.onstart?.(new Event('start') as SpeechSynthesisEvent));
    }),
    cancel: vi.fn(() => {
      fakeSynth.speaking = false;
      current = null;
    }),
    pause: vi.fn(),
    resume: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    __end() {
      const utter = current;
      fakeSynth.speaking = false;
      current = null;
      utter?.onend?.(new Event('end') as SpeechSynthesisEvent);
    },
  };

  return fakeSynth as unknown as SpeechSynthesis & { __end: () => void; speak: ReturnType<typeof vi.fn> };
}

describe('demo scene advance coordination', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    __resetSpeechNarrationEngineForTests();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('advances after min time when narration is muted', async () => {
    const synth = installReadySynth();
    const engine = new SpeechNarrationEngine(synth);
    engine.setMuted(true);
    const sleeps: number[] = [];
    const advance = waitForDemoSceneAdvance({
      engine,
      minMs: 1000,
      waitForNarration: false,
      isCancelled: () => false,
      isPaused: () => false,
      sleep: async (ms) => {
        sleeps.push(ms);
        await vi.advanceTimersByTimeAsync(ms);
      },
    });
    await expect(advance).resolves.toBe(true);
    expect(sleeps[0]).toBe(1000);
  });

  it('waits for narration completion after min time before advancing', async () => {
    const synth = installReadySynth();
    const engine = new SpeechNarrationEngine(synth);
    await engine.ensureVoices();

    const advancePromise = waitForDemoSceneAdvance({
      engine,
      minMs: 500,
      waitForNarration: true,
      isCancelled: () => false,
      isPaused: () => false,
      sleep: async (ms) => {
        await vi.advanceTimersByTimeAsync(ms);
      },
    });

    // Start narration shortly after hold begins (simulates React hook delay)
    await vi.advanceTimersByTimeAsync(100);
    engine.speak('Explicación de la escena demo');
    await vi.advanceTimersByTimeAsync(50);

    // Min time elapsed but narration still going — must not resolve yet
    await vi.advanceTimersByTimeAsync(400);

    let done = false;
    void advancePromise.then(() => {
      done = true;
    });
    await Promise.resolve();
    expect(done).toBe(false);

    synth.__end();
    await expect(advancePromise).resolves.toBe(true);
  });

  it('defers advance while paused without cancelling hold', async () => {
    const synth = installReadySynth();
    const engine = new SpeechNarrationEngine(synth);
    engine.setMuted(true);

    let paused = true;
    const advancePromise = waitForDemoSceneAdvance({
      engine,
      minMs: 200,
      waitForNarration: false,
      isCancelled: () => false,
      isPaused: () => paused,
      sleep: async (ms) => {
        await vi.advanceTimersByTimeAsync(ms);
      },
    });

    await vi.advanceTimersByTimeAsync(200);
    // Still paused — keep polling
    await vi.advanceTimersByTimeAsync(240);
    let done = false;
    void advancePromise.then(() => {
      done = true;
    });
    await Promise.resolve();
    expect(done).toBe(false);

    paused = false;
    await vi.advanceTimersByTimeAsync(120);
    await expect(advancePromise).resolves.toBe(true);
  });

  it('returns false when cancelled (route change / unmount)', async () => {
    const synth = installReadySynth();
    const engine = new SpeechNarrationEngine(synth);
    engine.setMuted(true);
    let cancelled = false;
    const advancePromise = waitForDemoSceneAdvance({
      engine,
      minMs: 500,
      waitForNarration: false,
      isCancelled: () => cancelled,
      isPaused: () => false,
      sleep: async (ms) => {
        await vi.advanceTimersByTimeAsync(ms);
      },
    });
    cancelled = true;
    await vi.advanceTimersByTimeAsync(500);
    await expect(advancePromise).resolves.toBe(false);
  });

  it('outdated completion after cancel does not advance', async () => {
    const synth = installReadySynth();
    const engine = new SpeechNarrationEngine(synth);
    await engine.ensureVoices();
    let cancelled = false;
    const first = waitForDemoSceneAdvance({
      engine,
      minMs: 100,
      waitForNarration: true,
      isCancelled: () => cancelled,
      isPaused: () => false,
      sleep: async (ms) => {
        await vi.advanceTimersByTimeAsync(ms);
      },
    });
    await vi.advanceTimersByTimeAsync(20);
    engine.speak('Escena vieja');
    cancelled = true;
    await vi.advanceTimersByTimeAsync(100);
    synth.__end();
    await expect(first).resolves.toBe(false);
  });
});
