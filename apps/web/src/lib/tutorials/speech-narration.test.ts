import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  __resetSpeechNarrationEngineForTests,
  clampNarrationRate,
  isSpeechSynthesisSupported,
  pickPreferredSpanishVoice,
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

type UtteranceFake = SpeechSynthesisUtterance & {
  onstart: ((this: SpeechSynthesisUtterance, ev: SpeechSynthesisEvent) => void) | null;
  onend: ((this: SpeechSynthesisUtterance, ev: SpeechSynthesisEvent) => void) | null;
  onerror: ((this: SpeechSynthesisUtterance, ev: SpeechSynthesisErrorEvent) => void) | null;
  onpause: ((this: SpeechSynthesisUtterance, ev: SpeechSynthesisEvent) => void) | null;
  onresume: ((this: SpeechSynthesisUtterance, ev: SpeechSynthesisEvent) => void) | null;
};

function installSpeechMocks(options?: { voicesDeferred?: boolean }) {
  const voicesDeferred = options?.voicesDeferred ?? false;
  let voices: SpeechSynthesisVoice[] = voicesDeferred
    ? []
    : [voice({ name: 'Paulina', lang: 'es-AR' })];

  const utteranceCtor = vi.fn(function (this: UtteranceFake, text: string) {
    this.text = text;
    this.lang = '';
    this.rate = 1;
    this.pitch = 1;
    this.volume = 1;
    this.voice = null;
    this.onstart = null;
    this.onend = null;
    this.onerror = null;
    this.onpause = null;
    this.onresume = null;
  });

  vi.stubGlobal('SpeechSynthesisUtterance', utteranceCtor);

  const listeners = new Map<string, Set<EventListener>>();
  let currentUtterance: UtteranceFake | null = null;

  const fakeSynth = {
    speaking: false,
    paused: false,
    pending: false,
    getVoices: () => voices,
    speak: vi.fn((utter: UtteranceFake) => {
      currentUtterance = utter;
      fakeSynth.speaking = true;
      fakeSynth.paused = false;
      queueMicrotask(() => utter.onstart?.(new Event('start') as SpeechSynthesisEvent));
    }),
    cancel: vi.fn(() => {
      fakeSynth.speaking = false;
      fakeSynth.paused = false;
      currentUtterance = null;
    }),
    pause: vi.fn(() => {
      if (fakeSynth.speaking) {
        fakeSynth.paused = true;
        currentUtterance?.onpause?.(new Event('pause') as SpeechSynthesisEvent);
      }
    }),
    resume: vi.fn(() => {
      if (fakeSynth.paused) {
        fakeSynth.paused = false;
        currentUtterance?.onresume?.(new Event('resume') as SpeechSynthesisEvent);
      }
    }),
    addEventListener: vi.fn((type: string, listener: EventListener) => {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)!.add(listener);
    }),
    removeEventListener: vi.fn((type: string, listener: EventListener) => {
      listeners.get(type)?.delete(listener);
    }),
    __setVoices(next: SpeechSynthesisVoice[]) {
      voices = next;
      listeners.get('voiceschanged')?.forEach((l) => l(new Event('voiceschanged')));
    },
    __endCurrent() {
      const utter = currentUtterance;
      fakeSynth.speaking = false;
      fakeSynth.paused = false;
      currentUtterance = null;
      utter?.onend?.(new Event('end') as SpeechSynthesisEvent);
    },
    __errorCurrent() {
      const utter = currentUtterance;
      fakeSynth.speaking = false;
      fakeSynth.paused = false;
      currentUtterance = null;
      utter?.onerror?.(new Event('error') as SpeechSynthesisErrorEvent);
    },
    __current() {
      return currentUtterance;
    },
  };

  return { fakeSynth: fakeSynth as unknown as SpeechSynthesis & typeof fakeSynth, utteranceCtor };
}

describe('speech narration engine', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    __resetSpeechNarrationEngineForTests();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('detects missing speech synthesis as unsupported', () => {
    expect(isSpeechSynthesisSupported(null)).toBe(false);
    const engine = new SpeechNarrationEngine(null);
    expect(engine.isSupported()).toBe(false);
    expect(engine.getStatus()).toBe('unsupported');
  });

  it('prefers es-AR female voices when available', () => {
    const picked = pickPreferredSpanishVoice([
      voice({ name: 'Google US English', lang: 'en-US' }),
      voice({ name: 'Microsoft Sabina', lang: 'es-MX' }),
      voice({ name: 'Paulina', lang: 'es-AR' }),
      voice({ name: 'Diego', lang: 'es-AR' }),
    ]);
    expect(picked?.name).toBe('Paulina');
  });

  it('clamps narration rate', () => {
    expect(clampNarrationRate(0.2)).toBe(0.7);
    expect(clampNarrationRate(3)).toBe(1.35);
  });

  it('does not speak after stop during asynchronous voice loading', async () => {
    const { fakeSynth } = installSpeechMocks({ voicesDeferred: true });
    const engine = new SpeechNarrationEngine(fakeSynth);
    engine.speak('Hola después del cierre');
    engine.stop();
    fakeSynth.__setVoices([voice({ name: 'Paulina', lang: 'es-AR' })]);
    await vi.runAllTimersAsync();
    expect(fakeSynth.speak).not.toHaveBeenCalled();
  });

  it('ignores delayed speak after close before voices are available', async () => {
    const { fakeSynth } = installSpeechMocks({ voicesDeferred: true });
    const engine = new SpeechNarrationEngine(fakeSynth);
    const gen = engine.speak('No debería sonar');
    expect(gen).toBeGreaterThan(0);
    engine.stop();
    fakeSynth.__setVoices([voice({ name: 'Paulina', lang: 'es-AR' })]);
    await vi.runAllTimersAsync();
    expect(fakeSynth.speak).not.toHaveBeenCalled();
  });

  it('rapid navigation cancels prior utterance and keeps only the latest active', async () => {
    const { fakeSynth } = installSpeechMocks();
    const engine = new SpeechNarrationEngine(fakeSynth);
    await engine.ensureVoices();
    engine.speak('Paso uno');
    engine.speak('Paso dos');
    engine.speak('Paso tres');
    await Promise.resolve();
    expect(fakeSynth.cancel).toHaveBeenCalled();
    expect(fakeSynth.__current()?.text).toBe('Paso tres');
    expect(fakeSynth.speak.mock.calls.at(-1)?.[0]?.text).toBe('Paso tres');
  });

  it('pause and resume keep the same utterance without replaying', async () => {
    const { fakeSynth } = installSpeechMocks();
    const engine = new SpeechNarrationEngine(fakeSynth);
    await engine.ensureVoices();
    engine.speak('Explicación continua');
    await vi.runAllTimersAsync();
    expect(engine.getStatus()).toBe('speaking');
    const gen = engine.getGeneration();
    engine.pause();
    expect(engine.getStatus()).toBe('paused');
    expect(engine.getGeneration()).toBe(gen);
    expect(fakeSynth.speak).toHaveBeenCalledTimes(1);
    engine.resume();
    expect(engine.getStatus()).toBe('speaking');
    expect(fakeSynth.speak).toHaveBeenCalledTimes(1);
    expect(fakeSynth.resume).toHaveBeenCalled();
  });

  it('explicit replay starts a new speak for the same text', async () => {
    const { fakeSynth } = installSpeechMocks();
    const engine = new SpeechNarrationEngine(fakeSynth);
    await engine.ensureVoices();
    engine.speak('Repetir');
    await vi.runAllTimersAsync();
    fakeSynth.__endCurrent();
    engine.speak('Repetir');
    await vi.runAllTimersAsync();
    expect(fakeSynth.speak).toHaveBeenCalledTimes(2);
  });

  it('waitUntilSettled resolves on delayed narration completion', async () => {
    const { fakeSynth } = installSpeechMocks();
    const engine = new SpeechNarrationEngine(fakeSynth);
    await engine.ensureVoices();
    const settled = engine.waitUntilSettled({ startGraceMs: 100, timeoutMs: 5000 });
    engine.speak('Narración larga');
    await vi.advanceTimersByTimeAsync(50);
    fakeSynth.__endCurrent();
    await expect(settled).resolves.toBe('ended');
  });

  it('waitUntilSettled falls back for muted and unsupported browsers', async () => {
    const unsupported = new SpeechNarrationEngine(null);
    await expect(unsupported.waitUntilSettled()).resolves.toBe('unsupported');

    const { fakeSynth } = installSpeechMocks();
    const engine = new SpeechNarrationEngine(fakeSynth);
    engine.setMuted(true);
    await expect(engine.waitUntilSettled()).resolves.toBe('muted');
  });

  it('speech errors settle waiters without overlapping utterances', async () => {
    const { fakeSynth } = installSpeechMocks();
    const engine = new SpeechNarrationEngine(fakeSynth);
    await engine.ensureVoices();
    const settled = engine.waitUntilSettled({ startGraceMs: 50, timeoutMs: 5000 });
    engine.speak('Error path');
    await vi.advanceTimersByTimeAsync(20);
    fakeSynth.__errorCurrent();
    await expect(settled).resolves.toBe('error');
    expect(engine.getStatus()).toBe('idle');
  });

  it('missing completion callback still times out safely', async () => {
    const { fakeSynth } = installSpeechMocks();
    const engine = new SpeechNarrationEngine(fakeSynth);
    await engine.ensureVoices();
    const settled = engine.waitUntilSettled({ startGraceMs: 10, timeoutMs: 200 });
    engine.speak('Sin onend');
    await vi.advanceTimersByTimeAsync(250);
    await expect(settled).resolves.toBe('timeout');
  });

  it('stop invalidates in-flight settle waiters', async () => {
    const { fakeSynth } = installSpeechMocks();
    const engine = new SpeechNarrationEngine(fakeSynth);
    await engine.ensureVoices();
    const settled = engine.waitUntilSettled({ startGraceMs: 50, timeoutMs: 5000 });
    engine.speak('Se cancela');
    await vi.advanceTimersByTimeAsync(20);
    engine.stop();
    await expect(settled).resolves.toBe('stopped');
  });

  it('does not start overlapping utterances after unmount-style stop', async () => {
    const { fakeSynth } = installSpeechMocks({ voicesDeferred: true });
    const engine = new SpeechNarrationEngine(fakeSynth);
    engine.speak('A');
    engine.speak('B');
    engine.stop();
    fakeSynth.__setVoices([voice({ name: 'Paulina', lang: 'es-AR' })]);
    await vi.runAllTimersAsync();
    expect(fakeSynth.speak).not.toHaveBeenCalled();
  });
});
