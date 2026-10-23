import { normalizeSpokenText, type NarrationVoiceProfileId } from '@sincvete/shared';
import manifest from './kokoro-manifest.json';

const clips: Record<string, Partial<Record<NarrationVoiceProfileId, string>>> = manifest;

export function getKokoroClipPath(text: string, voice: NarrationVoiceProfileId): string | null {
  const spoken = normalizeSpokenText(text.trim());
  if (!Object.hasOwn(clips, spoken)) return null;
  return clips[spoken]?.[voice] ?? null;
}

export function hasKokoroClips(): boolean {
  return Object.keys(clips).length > 0;
}
