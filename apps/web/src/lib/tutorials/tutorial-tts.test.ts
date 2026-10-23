import { afterEach, describe, expect, it, vi } from 'vitest';

describe('tutorial TTS provider', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('prefers ElevenLabs when API key is set', async () => {
    vi.stubEnv('ELEVENLABS_API_KEY', 'sk_test');
    vi.stubEnv('EDGE_TTS_ENABLED', undefined);
    const { getTutorialTtsProvider } = await import('./tutorial-tts');
    expect(getTutorialTtsProvider()).toBe('elevenlabs');
  });

  it('prefers Edge when ElevenLabs is absent', async () => {
    vi.stubEnv('ELEVENLABS_API_KEY', undefined);
    vi.stubEnv('TUTORIALS_TTS_UPSTREAM_URL', undefined);
    vi.stubEnv('EDGE_TTS_ENABLED', undefined);
    const { getTutorialTtsProvider, isTutorialNeuralTtsConfigured } = await import(
      './tutorial-tts'
    );
    expect(getTutorialTtsProvider()).toBe('edge');
    expect(isTutorialNeuralTtsConfigured()).toBe(true);
  });

  it('falls back to Google HTTP when Edge is disabled', async () => {
    vi.stubEnv('ELEVENLABS_API_KEY', undefined);
    vi.stubEnv('TUTORIALS_TTS_UPSTREAM_URL', undefined);
    vi.stubEnv('EDGE_TTS_ENABLED', 'false');
    vi.stubEnv('GOOGLE_HTTP_TTS_ENABLED', undefined);
    const { getTutorialTtsProvider } = await import('./tutorial-tts');
    expect(getTutorialTtsProvider()).toBe('google');
  });

  it('can disable all free providers', async () => {
    vi.stubEnv('ELEVENLABS_API_KEY', undefined);
    vi.stubEnv('TUTORIALS_TTS_UPSTREAM_URL', undefined);
    vi.stubEnv('EDGE_TTS_ENABLED', 'false');
    vi.stubEnv('GOOGLE_HTTP_TTS_ENABLED', 'false');
    const { getTutorialTtsProvider } = await import('./tutorial-tts');
    expect(getTutorialTtsProvider()).toBeNull();
  });
});
