/**
 * Tutoriales neural TTS cascade:
 * 1) ElevenLabs (Brian C / Horacio) when ELEVENLABS_API_KEY is set — best quality
 * 2) Microsoft Edge neural (Tomas / Jorge) — free, closest stand-in
 * 3) Browser SpeechSynthesis — last resort (never Google Translate: too robotic)
 */

import type { NarrationVoiceProfileId } from '@sincvete/shared';
import {
  isElevenLabsConfigured,
  synthesizeElevenLabsSpeech,
} from '@/lib/tutorials/elevenlabs-tts';
import {
  isEdgeNeuralTtsEnabled,
  synthesizeEdgeNeuralSpeech,
} from '@/lib/tutorials/edge-neural-tts';

export type TutorialTtsProvider = 'elevenlabs' | 'edge';

export function getTutorialTtsProvider(): TutorialTtsProvider | null {
  if (isElevenLabsConfigured()) return 'elevenlabs';
  if (isEdgeNeuralTtsEnabled()) return 'edge';
  return null;
}

export function isTutorialNeuralTtsConfigured(): boolean {
  return getTutorialTtsProvider() != null;
}

async function synthesizeEdgeWithRetry(options: {
  text: string;
  voiceProfile: NarrationVoiceProfileId;
}) {
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return await synthesizeEdgeNeuralSpeech(options);
    } catch (error) {
      lastError = error;
      console.warn(`[tutorials/tts] Edge intento ${attempt + 1} falló`, error);
      await new Promise((resolve) => setTimeout(resolve, 350 * (attempt + 1)));
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Edge TTS falló');
}

export async function synthesizeTutorialSpeech(options: {
  text: string;
  voiceProfile: NarrationVoiceProfileId;
}): Promise<{ audio: ArrayBuffer; contentType: string; provider: TutorialTtsProvider }> {
  if (isElevenLabsConfigured()) {
    const result = await synthesizeElevenLabsSpeech(options);
    return { ...result, provider: 'elevenlabs' };
  }

  if (!isEdgeNeuralTtsEnabled()) {
    throw new Error('Narración neural no configurada');
  }

  const result = await synthesizeEdgeWithRetry(options);
  return {
    audio: result.audio,
    contentType: result.contentType,
    provider: 'edge',
  };
}
