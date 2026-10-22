/**
 * Static narration asset map for Academia.
 * Professional neural audio files are optional; the web app falls back to
 * browser speech when a clip is missing. No patient data is sent externally.
 */

export type NarrationVoiceProfileId = 'female' | 'male';

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
  'female',
  'male',
] as const;

/**
 * Public URL path for a static narration clip.
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
