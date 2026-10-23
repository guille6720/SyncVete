export type NarrationVoiceProfileId = 'brian' | 'horacio';

export interface NarrationClipRef {
  tutorialId: string;
  clipId: string;
  voiceProfile: NarrationVoiceProfileId;
}

/** Agenda básico: 10 guided steps + 3 demo scenes. */
export const AGENDA_NARRATION_CLIP_IDS = [
  'welcome',
  'day-overview',
  'week-nav',
  'filter-professional',
  'filter-status',
  'new-appointment',
  'appointment-form',
  'appointment-detail',
  'status-actions',
  'closing',
  'demo-welcome',
  'demo-create',
  'demo-status',
] as const;

export type AgendaNarrationClipId = (typeof AGENDA_NARRATION_CLIP_IDS)[number];

export const NARRATION_VOICE_PROFILES: readonly NarrationVoiceProfileId[] = [
  'brian',
  'horacio',
] as const;

export const NARRATION_VOICE_LABELS: Record<NarrationVoiceProfileId, string> = {
  brian: 'Alex · Kokoro',
  horacio: 'Santa · Kokoro',
};

/**
 * Public URL path for optional static narration clips.
 * Convention: /academia/narration/{tutorialId}/{voiceProfile}/{clipId}.mp3
 */
export function buildNarrationAssetPath(ref: NarrationClipRef): string {
  const tutorialId = encodeURIComponent(ref.tutorialId);
  const voice = encodeURIComponent(ref.voiceProfile);
  const clipId = encodeURIComponent(ref.clipId);
  return `/academia/narration/${tutorialId}/${voice}/${clipId}.mp3`;
}

export function listAgendaNarrationAssetPaths(): string[] {
  const paths: string[] = [];
  for (const voiceProfile of NARRATION_VOICE_PROFILES) {
    for (const clipId of AGENDA_NARRATION_CLIP_IDS) {
      paths.push(
        buildNarrationAssetPath({
          tutorialId: 'agenda-basico',
          clipId,
          voiceProfile,
        })
      );
    }
  }
  return paths;
}

/** Map legacy female/male prefs to the ElevenLabs profiles. */
export function migrateLegacyVoiceProfile(
  value: unknown
): NarrationVoiceProfileId | 'auto' {
  if (value === 'brian' || value === 'horacio' || value === 'auto') return value;
  if (value === 'male') return 'brian';
  if (value === 'female') return 'horacio';
  return 'brian';
}
