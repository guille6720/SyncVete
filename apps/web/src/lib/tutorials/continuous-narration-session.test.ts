import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ContinuousNarrationSession,
  __resetContinuousNarrationSessionForTests,
} from '@/lib/tutorials/continuous-narration-session';
import { ElevenLabsAudioEngine } from '@/lib/tutorials/elevenlabs-audio';

describe('continuous narration session', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    __resetContinuousNarrationSessionForTests();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('advances UI steps from audio completion, not the other way around', async () => {
    const eleven = new ElevenLabsAudioEngine();
    const endHandlers: Array<() => void> = [];
    vi.spyOn(eleven, 'isAvailable').mockResolvedValue(true);
    vi.spyOn(eleven, 'prefetch').mockResolvedValue(true);
    vi.spyOn(eleven, 'speak').mockImplementation(async (_text, _voice, options) => {
      endHandlers.push(() => options?.onEnd?.());
      return true;
    });
    vi.spyOn(eleven, 'subscribe').mockImplementation((listener) => {
      listener('idle');
      return () => undefined;
    });
    vi.spyOn(eleven, 'stop').mockImplementation(() => undefined);
    vi.spyOn(eleven, 'setMuted').mockImplementation(() => undefined);
    vi.spyOn(eleven, 'setRate').mockImplementation(() => undefined);
    vi.spyOn(eleven, 'getStatus').mockReturnValue('speaking');

    const session = new ContinuousNarrationSession(eleven);
    const steps: number[] = [];
    let completed = false;

    await session.start(
      [
        { stepIndex: 0, text: 'Paso uno de la demo.', clipId: 'a' },
        { stepIndex: 1, text: 'Paso dos de la demo.', clipId: 'b' },
      ],
      { voice: 'brian', rate: 1 },
      {
        onStep: (stepIndex) => {
          steps.push(stepIndex);
        },
        onComplete: () => {
          completed = true;
        },
      }
    );

    expect(steps).toEqual([0]);
    expect(eleven.speak).toHaveBeenCalledTimes(1);

    endHandlers[0]?.();
    await vi.advanceTimersByTimeAsync(300);
    expect(steps).toEqual([0, 1]);

    endHandlers[1]?.();
    await vi.advanceTimersByTimeAsync(50);
    expect(completed).toBe(true);
  });

  it('falls back to browser TTS when neural engine is configured but a clip fails', async () => {
    const eleven = new ElevenLabsAudioEngine();
    vi.spyOn(eleven, 'isAvailable').mockResolvedValue(true);
    vi.spyOn(eleven, 'prefetch').mockResolvedValue(false);
    vi.spyOn(eleven, 'speak').mockResolvedValue(false);
    vi.spyOn(eleven, 'subscribe').mockReturnValue(() => undefined);
    vi.spyOn(eleven, 'stop').mockImplementation(() => undefined);
    vi.spyOn(eleven, 'setMuted').mockImplementation(() => undefined);
    vi.spyOn(eleven, 'setRate').mockImplementation(() => undefined);
    vi.spyOn(eleven, 'getStatus').mockReturnValue('idle');

    const browser = {
      isSupported: () => true,
      ensureVoices: vi.fn(async () => []),
      setRate: vi.fn(),
      setVoiceProfile: vi.fn(),
      setMuted: vi.fn(),
      subscribe: vi.fn(() => () => undefined),
      speak: vi.fn((_text: string, options?: { onEnd?: () => void }) => {
        options?.onEnd?.();
        return 1;
      }),
      stop: vi.fn(),
      pause: vi.fn(),
      resume: vi.fn(),
      getStatus: vi.fn(() => 'speaking' as const),
    };

    const session = new ContinuousNarrationSession(eleven, browser as never);
    const steps: number[] = [];

    await session.start(
      [{ stepIndex: 0, text: 'Paso uno de la demo con texto largo.', clipId: 'a' }],
      { voice: 'brian', rate: 1 },
      {
        onStep: (stepIndex) => {
          steps.push(stepIndex);
        },
        onComplete: () => undefined,
      }
    );

    expect(steps).toEqual([0]);
    expect(browser.speak).toHaveBeenCalled();
  });

  it('falls back to browser TTS when ElevenLabs is not configured', async () => {
    const eleven = new ElevenLabsAudioEngine();
    vi.spyOn(eleven, 'isAvailable').mockResolvedValue(false);
    vi.spyOn(eleven, 'speak').mockResolvedValue(false);
    vi.spyOn(eleven, 'prefetch').mockResolvedValue(false);
    vi.spyOn(eleven, 'subscribe').mockReturnValue(() => undefined);
    vi.spyOn(eleven, 'stop').mockImplementation(() => undefined);
    vi.spyOn(eleven, 'setMuted').mockImplementation(() => undefined);
    vi.spyOn(eleven, 'setRate').mockImplementation(() => undefined);

    const browser = {
      isSupported: () => true,
      ensureVoices: vi.fn(async () => []),
      setRate: vi.fn(),
      setVoiceProfile: vi.fn(),
      setMuted: vi.fn(),
      subscribe: vi.fn((listener: (s: 'idle') => void) => {
        listener('idle');
        return () => undefined;
      }),
      speak: vi.fn((_text: string, options?: { onEnd?: () => void }) => {
        options?.onEnd?.();
        return 1;
      }),
      stop: vi.fn(),
      pause: vi.fn(),
      resume: vi.fn(),
      getStatus: vi.fn(() => 'speaking' as const),
    };

    const session = new ContinuousNarrationSession(eleven, browser as never);
    const steps: number[] = [];
    let completed = false;

    await session.start(
      [
        { stepIndex: 0, text: 'Paso uno.', clipId: 'a' },
        { stepIndex: 1, text: 'Paso dos.', clipId: 'b' },
      ],
      { voice: 'brian', rate: 1 },
      {
        onStep: (stepIndex) => {
          steps.push(stepIndex);
        },
        onComplete: () => {
          completed = true;
        },
      }
    );

    expect(browser.speak).toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(300);
    expect(steps).toEqual([0, 1]);
    await vi.advanceTimersByTimeAsync(50);
    expect(completed).toBe(true);
    expect(eleven.speak).not.toHaveBeenCalled();
  });
});
