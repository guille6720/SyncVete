import { afterEach, describe, expect, it, vi } from 'vitest';
import { GET, POST } from './route';

vi.mock('@/lib/tutorials/kokoro-clips', () => ({
  hasKokoroClips: () => true,
  getKokoroClipPath: (text: string) =>
    text === 'Hola' ? '/academia/kokoro/v2/em_alex/test.mp3' : null,
}));

describe('Kokoro tutorial endpoint', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('reports Kokoro instead of a paid provider', async () => {
    vi.stubEnv('NEXT_PUBLIC_ACADEMIA_ENABLED', 'true');
    expect(await (await GET()).json()).toMatchObject({ configured: true, provider: 'kokoro' });
  });

  it('respects the existing tutorial feature flag', async () => {
    vi.stubEnv('NEXT_PUBLIC_ACADEMIA_ENABLED', 'false');
    expect((await GET()).status).toBe(404);
  });

  it('redirects only a known script to same-origin pre-generated audio', async () => {
    vi.stubEnv('NEXT_PUBLIC_ACADEMIA_ENABLED', 'true');
    const response = await POST(
      new Request('https://syncvete.opusorg.com/api/tutorials/tts', {
        method: 'POST',
        body: JSON.stringify({ text: 'Hola', voiceProfile: 'brian' }),
      })
    );
    expect(response.status).toBe(303);
    expect(response.headers.get('Location')).toBe('/academia/kokoro/v2/em_alex/test.mp3');
    expect(response.headers.get('X-Syncvete-Tts-Provider')).toBe('kokoro');
  });

  it('rejects arbitrary text instead of synthesizing it', async () => {
    vi.stubEnv('NEXT_PUBLIC_ACADEMIA_ENABLED', 'true');
    const response = await POST(
      new Request('https://syncvete.opusorg.com/api/tutorials/tts', {
        method: 'POST',
        body: JSON.stringify({ text: 'Private patient information', voiceProfile: 'brian' }),
      })
    );
    expect(response.status).toBe(404);
  });
});
