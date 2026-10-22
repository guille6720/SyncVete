/**
 * Spoken-text normalization for Academia narration.
 * Keeps on-screen brand spelling intact while guiding TTS pronunciation.
 */

export interface PronunciationEntry {
  /** Case-insensitive whole-word/phrase match against display text. */
  match: RegExp;
  /** Spoken form used only for audio / speech synthesis. */
  spoken: string;
}

/**
 * Reusable pronunciation dictionary for SyncVete Academia modules.
 * Visible UI, logos, and database content must keep the brand spelling.
 */
export const SYNCVETE_PRONUNCIATION_DICTIONARY: readonly PronunciationEntry[] = [
  {
    // SyncVete / Sync Vete / SYNCVETE — speak as two natural Spanish words.
    match: /\bSync\s*Vete\b/gi,
    spoken: 'Sinc Vete',
  },
  {
    // Times like 10:30 → more natural Argentine reading.
    match: /\b(\d{1,2}):30\b/g,
    spoken: '$1 y media',
  },
  {
    match: /\b(\d{1,2}):00\b/g,
    spoken: '$1 en punto',
  },
  {
    // Soften abrupt ellipsis pauses for TTS.
    match: /\u2026|\.\.\./g,
    spoken: ',',
  },
];

/**
 * Soften Spanish punctuation that some browser voices read as hard clicks.
 */
export function humanizeSpokenProsody(text: string): string {
  return text
    .replace(/[¡¿]/g, '')
    .replace(/\s*—\s*/g, ', ')
    .replace(/\s*-\s*/g, ', ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/**
 * Normalize text for narration engines (browser TTS or prerecorded scripts).
 * Does not mutate the original display string.
 */
export function normalizeSpokenText(
  text: string,
  dictionary: readonly PronunciationEntry[] = SYNCVETE_PRONUNCIATION_DICTIONARY
): string {
  let result = text;
  for (const entry of dictionary) {
    result = result.replace(entry.match, entry.spoken);
  }
  return humanizeSpokenProsody(result);
}
