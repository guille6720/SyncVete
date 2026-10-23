/**
 * Tutoriales neural TTS: ElevenLabs when keyed, else free Microsoft Edge voices.
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

export async function synthesizeTutorialSpeech(options: {
  text: string;
  voiceProfile: NarrationVoiceProfileId;
}): Promise<{ audio: ArrayBuffer; contentType: string; provider: TutorialTtsProvider }> {
  const provider = getTutorialTtsProvider();
  if (!provider) {
    throw new Error('Narración neural no configurada');
  }

  if (provider === 'elevenlabs') {
    const result = await synthesizeElevenLabsSpeech(options);
    return { ...result, provider };
  }

  const result = await synthesizeEdgeNeuralSpeech(options);
  return {
    audio: result.audio,
    contentType: result.contentType,
    provider,
  };
}
