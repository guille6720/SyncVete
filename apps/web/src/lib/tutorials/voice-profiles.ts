/**
 * Browser Web Speech voice helpers (fallback only).
 * Tutoriales primary voices are ElevenLabs Brian C / Horacio (male).
 */

/** Strong female cues only — avoid broad matches like "Google español". */
const FEMALE_VOICE_HINTS =
  /\b(female|mujer|femenin[oa]?|sabina|m[oó]nica|paulina|helena|elena|luc[ií]a|sof[ií]a|mar[ií]a|carmen|isabela|paloma|dalia|zira|elsa|pilar|conchita|linda|laura|sara|joanna|ivy|salli|kendra|kimberly|amy|emma|olivia|hedda|katja|susan|hazel|catherine)\b/i;

/** Strong male cues only. */
const MALE_VOICE_HINTS =
  /\b(male|hombre|masculin[oa]?|pablo|jorge|diego|ra[uú]l|tom[aá]s|tomas|carlos|enrique|miguel|antonio|juan|pedro|david|mark|matthew|justin|joey|brian|arthur|george|james|ravi|raul|alvaro|álvaro|javi|javier)\b/i;

export type BrowserVoiceGender = 'female' | 'male' | 'unknown';

export function classifySpeechVoiceGender(
  voice: Pick<SpeechSynthesisVoice, 'name' | 'voiceURI'>
): BrowserVoiceGender {
  const haystack = `${voice.name} ${voice.voiceURI}`;
  const female = FEMALE_VOICE_HINTS.test(haystack);
  const male = MALE_VOICE_HINTS.test(haystack);
  if (female && !male) return 'female';
  if (male && !female) return 'male';
  return 'unknown';
}

export function isSpanishVoice(voice: Pick<SpeechSynthesisVoice, 'lang'>): boolean {
  const lang = voice.lang.toLowerCase().replace('_', '-');
  return lang === 'es' || lang.startsWith('es-');
}

export function listSpanishVoices(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice[] {
  return voices.filter(isSpanishVoice);
}

export interface VoiceProfileAvailability {
  /** ElevenLabs Brian C available (API configured). */
  brian: boolean;
  /** ElevenLabs Horacio available (API configured). */
  horacio: boolean;
  /** True when ElevenLabs TTS endpoint is ready. */
  elevenLabs: boolean;
}

export function scoreSpanishVoiceQuality(
  voice: SpeechSynthesisVoice,
  preferredLang = 'es-AR'
): number {
  const name = `${voice.name} ${voice.voiceURI}`;
  const lang = voice.lang.toLowerCase().replace('_', '-');
  const preferred = preferredLang.toLowerCase().replace('_', '-');
  let score = 0;

  if (/natural|neural|online|premium|enhanced/i.test(name)) score += 120;
  if (/google/i.test(name)) score += 55;
  if (!voice.localService) score += 40;
  if (/desktop|compact|mobile|hepspeak|espeak/i.test(name)) score -= 55;

  if (lang === preferred) score += 60;
  else if (lang.startsWith('es-ar')) score += 55;
  else if (lang.startsWith('es-mx')) score += 40;
  else if (lang.startsWith('es-us')) score += 30;
  else if (lang.startsWith('es-es') || lang === 'es') score += 20;

  // Prefer known male Spanish voices when ranking neutrally.
  if (MALE_VOICE_HINTS.test(name)) score += 30;
  if (FEMALE_VOICE_HINTS.test(name)) score -= 40;

  return score;
}

/**
 * Browser fallback voice picker.
 * Brian C / Horacio are male — never return a female voice for male/default.
 * Prefer explicit male voices; if none, return null (caller skips speech).
 */
export function pickVoiceForProfile(
  voices: SpeechSynthesisVoice[],
  profile: BrowserVoiceGender | 'female' | 'male' | null,
  preferredLang = 'es-AR'
): SpeechSynthesisVoice | null {
  const spanish = listSpanishVoices(voices);
  const pool = spanish.length ? spanish : voices;
  if (!pool.length) return null;

  const wantMale = profile === 'male' || profile == null;
  const wantFemale = profile === 'female';

  if (wantMale) {
    const males = pool.filter((voice) => classifySpeechVoiceGender(voice) === 'male');
    if (!males.length) return null;
    const ranked = [...males].sort(
      (a, b) =>
        scoreSpanishVoiceQuality(b, preferredLang) -
        scoreSpanishVoiceQuality(a, preferredLang)
    );
    return ranked[0] ?? null;
  }

  if (wantFemale) {
    const females = pool.filter((voice) => classifySpeechVoiceGender(voice) === 'female');
    const ranked = [...(females.length ? females : pool)].sort(
      (a, b) =>
        scoreSpanishVoiceQuality(b, preferredLang) -
        scoreSpanishVoiceQuality(a, preferredLang)
    );
    return ranked[0] ?? null;
  }

  const ranked = [...pool].sort(
    (a, b) =>
      scoreSpanishVoiceQuality(b, preferredLang) -
      scoreSpanishVoiceQuality(a, preferredLang)
  );
  return ranked[0] ?? null;
}

export const VOICE_PREVIEW_SAMPLE =
  'Hola. Así se escucha la narración de Tutoriales Sync Vete para cada módulo.';
