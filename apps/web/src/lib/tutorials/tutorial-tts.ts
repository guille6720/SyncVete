/**
 * Tutoriales neural TTS cascade:
 * 1) ElevenLabs (if keyed)
 * 2) Microsoft Edge neural (free, WebSocket — may fail on some hosts)
 * 3) Google Translate HTTP (free, works on Vercel)
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
import { synthesizeGoogleHttpSpeech } from '@/lib/tutorials/google-http-tts';

export type TutorialTtsProvider = 'elevenlabs' | 'edge' | 'google';

export function getTutorialTtsProvider(): TutorialTtsProvider | null {
  if (isElevenLabsConfigured()) return 'elevenlabs';
  if (isEdgeNeuralTtsEnabled()) return 'edge';
  // Google HTTP is always available as last free resort unless explicitly disabled.
  if (process.env.GOOGLE_HTTP_TTS_ENABLED === 'false') return null;
  return 'google';
}

export function isTutorialNeuralTtsConfigured(): boolean {
  return getTutorialTtsProvider() != null;
}

export async function synthesizeTutorialSpeech(options: {
  text: string;
  voiceProfile: NarrationVoiceProfileId;
}): Promise<{ audio: ArrayBuffer; contentType: string; provider: TutorialTtsProvider }> {
  if (isElevenLabsConfigured()) {
    const result = await synthesizeElevenLabsSpeech(options);
    return { ...result, provider: 'elevenlabs' };
  }

  if (isEdgeNeuralTtsEnabled()) {
    try {
      const result = await synthesizeEdgeNeuralSpeech(options);
      return {
        audio: result.audio,
        contentType: result.contentType,
        provider: 'edge',
      };
    } catch (error) {
      console.warn('[tutorials/tts] Edge falló, probando Google HTTP', error);
    }
  }

  if (process.env.GOOGLE_HTTP_TTS_ENABLED === 'false') {
    throw new Error('Narración neural no configurada');
  }

  const result = await synthesizeGoogleHttpSpeech(options);
  return { ...result, provider: 'google' };
}
