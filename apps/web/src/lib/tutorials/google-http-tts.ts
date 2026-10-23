/**
 * Free HTTP TTS via Google Translate (no API key).
 * Lower quality than Edge/ElevenLabs, but works on Vercel when WebSockets fail.
 * Chunked to ~180 chars (Translate TTS limit).
 */

import type { NarrationVoiceProfileId } from '@sincvete/shared';

const MAX_CHUNK = 180;

function splitForGoogleTts(text: string): string[] {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (!normalized) return [];
  if (normalized.length <= MAX_CHUNK) return [normalized];

  const parts: string[] = [];
  let remaining = normalized;
  while (remaining.length > MAX_CHUNK) {
    const window = remaining.slice(0, MAX_CHUNK);
    const breakAt = Math.max(
      window.lastIndexOf('. '),
      window.lastIndexOf('? '),
      window.lastIndexOf('! '),
      window.lastIndexOf('; '),
      window.lastIndexOf(', '),
      window.lastIndexOf(' ')
    );
    const cut = breakAt > 40 ? breakAt + 1 : MAX_CHUNK;
    parts.push(remaining.slice(0, cut).trim());
    remaining = remaining.slice(cut).trim();
  }
  if (remaining) parts.push(remaining);
  return parts.filter(Boolean);
}

function langForProfile(profile: NarrationVoiceProfileId): string {
  return profile === 'horacio' ? 'es-MX' : 'es-AR';
}

export async function synthesizeGoogleHttpSpeech(options: {
  text: string;
  voiceProfile: NarrationVoiceProfileId;
}): Promise<{ audio: ArrayBuffer; contentType: string }> {
  const text = options.text.trim();
  if (!text) throw new Error('Texto vacío');
  if (text.length > 2500) throw new Error('Texto demasiado largo para narración');

  const lang = langForProfile(options.voiceProfile);
  const chunks = splitForGoogleTts(text);
  const buffers: Buffer[] = [];

  for (const chunk of chunks) {
    const url = new URL('https://translate.google.com/translate_tts');
    url.searchParams.set('ie', 'UTF-8');
    url.searchParams.set('client', 'tw-ob');
    url.searchParams.set('tl', lang);
    url.searchParams.set('q', chunk);

    const response = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept: 'audio/mpeg,audio/*;q=0.9,*/*;q=0.8',
        Referer: 'https://translate.google.com/',
      },
      cache: 'no-store',
    });

    if (!response.ok) {
      throw new Error(`Google TTS falló (${response.status})`);
    }
    const part = Buffer.from(await response.arrayBuffer());
    if (!part.byteLength) throw new Error('Google TTS devolvió audio vacío');
    buffers.push(part);
  }

  const merged = Buffer.concat(buffers);
  return {
    audio: merged.buffer.slice(merged.byteOffset, merged.byteOffset + merged.byteLength),
    contentType: 'audio/mpeg',
  };
}
