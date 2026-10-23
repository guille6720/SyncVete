/**
 * Server-side ElevenLabs TTS helper for Tutoriales.
 * Never expose the API key to the browser.
 *
 * Production may set TUTORIALS_TTS_UPSTREAM_URL to a trusted SyncVete
 * deployment that already has ELEVENLABS_API_KEY (e.g. staging) when the
 * local key cannot be copied (Vercel sensitive envs).
 */

import type { NarrationVoiceProfileId } from '@sincvete/shared';
import {
  ELEVENLABS_MODEL_ID,
  resolveElevenLabsVoiceId,
} from '@/lib/tutorials/elevenlabs-voices';

const ELEVENLABS_TTS_URL = 'https://api.elevenlabs.io/v1/text-to-speech';

function getUpstreamTtsBaseUrl(): string | null {
  const raw = process.env.TUTORIALS_TTS_UPSTREAM_URL?.trim();
  if (!raw) return null;
  return raw.replace(/\/$/, '');
}

export function isElevenLabsConfigured(): boolean {
  return Boolean(process.env.ELEVENLABS_API_KEY?.trim() || getUpstreamTtsBaseUrl());
}

async function synthesizeViaUpstream(options: {
  text: string;
  voiceProfile: NarrationVoiceProfileId;
}): Promise<{ audio: ArrayBuffer; contentType: string }> {
  const base = getUpstreamTtsBaseUrl();
  if (!base) {
    throw new Error('TUTORIALS_TTS_UPSTREAM_URL no configurada');
  }

  const response = await fetch(`${base}/api/tutorials/tts`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'audio/mpeg',
    },
    body: JSON.stringify({
      text: options.text,
      voiceProfile: options.voiceProfile,
    }),
    cache: 'no-store',
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(
      `Upstream TTS falló (${response.status})${detail ? `: ${detail.slice(0, 180)}` : ''}`
    );
  }

  const audio = await response.arrayBuffer();
  const contentType = response.headers.get('content-type') || 'audio/mpeg';
  return { audio, contentType };
}

export async function synthesizeElevenLabsSpeech(options: {
  text: string;
  voiceProfile: NarrationVoiceProfileId;
}): Promise<{ audio: ArrayBuffer; contentType: string }> {
  const text = options.text.trim();
  if (!text) {
    throw new Error('Texto vacío');
  }
  if (text.length > 2500) {
    throw new Error('Texto demasiado largo para narración');
  }

  const apiKey = process.env.ELEVENLABS_API_KEY?.trim();
  if (!apiKey) {
    if (getUpstreamTtsBaseUrl()) {
      return synthesizeViaUpstream({ text, voiceProfile: options.voiceProfile });
    }
    throw new Error('ELEVENLABS_API_KEY no configurada');
  }

  const voiceId = resolveElevenLabsVoiceId(options.voiceProfile);
  const response = await fetch(`${ELEVENLABS_TTS_URL}/${voiceId}`, {
    method: 'POST',
    headers: {
      'xi-api-key': apiKey,
      'Content-Type': 'application/json',
      Accept: 'audio/mpeg',
    },
    body: JSON.stringify({
      text,
      model_id: ELEVENLABS_MODEL_ID,
      voice_settings: {
        // Stable delivery — lower style avoids abrupt emotional jumps mid-sentence.
        stability: 0.62,
        similarity_boost: 0.75,
        style: 0.1,
        use_speaker_boost: true,
      },
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(
      `ElevenLabs TTS falló (${response.status})${detail ? `: ${detail.slice(0, 180)}` : ''}`
    );
  }

  const audio = await response.arrayBuffer();
  const contentType = response.headers.get('content-type') || 'audio/mpeg';
  return { audio, contentType };
}
