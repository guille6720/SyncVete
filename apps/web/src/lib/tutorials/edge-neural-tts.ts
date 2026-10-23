/**
 * Free neural TTS via Microsoft Edge online voices (no API key).
 * Closest free stand-ins for ElevenLabs Brian C / Horacio in Latin Spanish.
 *
 * Brian  → es-AR-TomasNeural  (Argentine male, SyncVete locale)
 * Horacio → es-MX-JorgeNeural (deeper Latin male, “seguro / confiable”)
 *
 * Override with EDGE_TTS_VOICE_BRIAN / EDGE_TTS_VOICE_HORACIO if needed.
 * Disable with EDGE_TTS_ENABLED=false.
 */

import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { EdgeTTS } from 'node-edge-tts';
import type { NarrationVoiceProfileId } from '@sincvete/shared';

export const EDGE_TTS_VOICE_IDS: Record<
  NarrationVoiceProfileId,
  { voice: string; lang: string; label: string }
> = {
  brian: {
    voice: process.env.EDGE_TTS_VOICE_BRIAN?.trim() || 'es-AR-TomasNeural',
    lang: 'es-AR',
    label: 'Tomas (es-AR)',
  },
  horacio: {
    voice: process.env.EDGE_TTS_VOICE_HORACIO?.trim() || 'es-MX-JorgeNeural',
    lang: 'es-MX',
    label: 'Jorge (es-MX)',
  },
};

export function isEdgeNeuralTtsEnabled(): boolean {
  return process.env.EDGE_TTS_ENABLED !== 'false';
}

export function resolveEdgeTtsVoice(profile: NarrationVoiceProfileId) {
  return EDGE_TTS_VOICE_IDS[profile];
}

export async function synthesizeEdgeNeuralSpeech(options: {
  text: string;
  voiceProfile: NarrationVoiceProfileId;
}): Promise<{ audio: ArrayBuffer; contentType: string; voiceLabel: string }> {
  if (!isEdgeNeuralTtsEnabled()) {
    throw new Error('Edge TTS deshabilitado');
  }

  const text = options.text.trim();
  if (!text) throw new Error('Texto vacío');
  if (text.length > 2500) throw new Error('Texto demasiado largo para narración');

  const resolved = resolveEdgeTtsVoice(options.voiceProfile);
  const dir = await mkdtemp(join(tmpdir(), 'sv-edge-tts-'));
  const filePath = join(dir, 'narration.mp3');

  try {
    const tts = new EdgeTTS({
      voice: resolved.voice,
      lang: resolved.lang,
      outputFormat: 'audio-24khz-48kbitrate-mono-mp3',
      // Slightly calmer than default — closer to tutorial pacing.
      rate: '-5%',
      volume: '-5%',
      timeout: 20_000,
    });
    await tts.ttsPromise(text, filePath);
    const buffer = await readFile(filePath);
    if (!buffer.byteLength) {
      throw new Error('Edge TTS devolvió audio vacío');
    }
    return {
      audio: buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength),
      contentType: 'audio/mpeg',
      voiceLabel: resolved.label,
    };
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}
