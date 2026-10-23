import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ElevenLabsAudioEngine } from './elevenlabs-audio';

vi.mock('./kokoro-clips', () => ({
  hasKokoroClips: () => true,
  getKokoroClipPath: (text: string) =>
    text === 'Hola' ? '/academia/kokoro/v2/em_alex/test.mp3' : null,
}));

class MockAudio {
  static instances: MockAudio[] = [];
  playbackRate = 1;
  volume = 1;
  src = '';
  onended: (() => void) | null = null;
  onerror: (() => void) | null = null;
  play = vi.fn().mockResolvedValue(undefined);
  pause = vi.fn();
  constructor() {
    MockAudio.instances.push(this);
  }
}

describe('Kokoro static playback through the existing player', () => {
  let engine: ElevenLabsAudioEngine;
  beforeEach(() => {
    MockAudio.instances = [];
    vi.stubGlobal('window', {});
    vi.stubGlobal('Audio', MockAudio);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(new Blob(['audio']))));
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    engine = new ElevenLabsAudioEngine();
  });
  afterEach(() => {
    engine.stop();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('uses and caches only a same-origin static MP3, without a paid API request', async () => {
    expect(await engine.isAvailable()).toBe(true);
    expect(fetch).not.toHaveBeenCalled();
    expect(await engine.speak('Hola', 'brian')).toBe(true);
    expect(fetch).toHaveBeenCalledWith('/academia/kokoro/v2/em_alex/test.mp3', {
      cache: 'force-cache',
    });
    await engine.speak('Hola', 'brian');
    expect(fetch).toHaveBeenCalledTimes(1);
    engine.pause();
    expect(engine.getStatus()).toBe('paused');
    engine.resume();
    await Promise.resolve();
    expect(engine.getStatus()).toBe('speaking');
    engine.setRate(1.1);
    expect(MockAudio.instances.at(-1)?.playbackRate).toBe(1.1);
  });

  it('never submits unknown text to an external provider', async () => {
    expect(await engine.speak('Private information', 'brian')).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('honors pause while an MP3 is still loading', async () => {
    let resolveFetch!: (response: Response) => void;
    vi.mocked(fetch).mockReturnValue(
      new Promise((resolve) => {
        resolveFetch = resolve;
      })
    );
    const started = engine.speak('Hola', 'brian');
    engine.pause();
    resolveFetch(new Response(new Blob(['audio'])));
    expect(await started).toBe(true);
    expect(engine.getStatus()).toBe('paused');
    expect(MockAudio.instances[0].play).not.toHaveBeenCalled();
  });

  it('does not start stale audio after stop during loading', async () => {
    let resolveFetch!: (response: Response) => void;
    vi.mocked(fetch).mockReturnValue(
      new Promise((resolve) => {
        resolveFetch = resolve;
      })
    );
    const started = engine.speak('Hola', 'brian');
    engine.stop();
    resolveFetch(new Response(new Blob(['audio'])));
    expect(await started).toBe(false);
    expect(MockAudio.instances).toHaveLength(0);
  });
});
