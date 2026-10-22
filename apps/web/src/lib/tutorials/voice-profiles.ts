/**
 * Honest Spanish voice-profile classification for Web Speech.
 * Gender is only reported when the voice name/URI contains a reliable cue.
 * Never invent male/female labels from language alone.
 */

import type { NarrationVoiceProfileId } from '@sincvete/shared';

export type { NarrationVoiceProfileId };

/** Strong female cues only — avoid broad matches like "Google español". */
const FEMALE_VOICE_HINTS =
  /\b(female|mujer|femenin[oa]?|sabina|m[oó]nica|paulina|helena|elena|luc[ií]a|sof[ií]a|mar[ií]a|carmen|isabela|paloma|dalia|zira|elsa|pilar|conchita|linda|laura|sara|joanna|ivy|salli|kendra|kimberly|amy|emma|olivia)\b/i;

/** Strong male cues only. */
const MALE_VOICE_HINTS =
  /\b(male|hombre|masculin[oa]?|pablo|jorge|diego|ra[uú]l|tom[aá]s|tomas|carlos|enrique|miguel|antonio|juan|pedro|david|mark|matthew|justin|joey|brian|arthur|george|james|ravi)\b/i;

export type ClassifiedVoiceGender = NarrationVoiceProfileId | 'unknown';

export function classifySpeechVoiceGender(
  voice: Pick<SpeechSynthesisVoice, 'name' | 'voiceURI'>
): ClassifiedVoiceGender {
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

export function listVoicesForProfile(
  voices: SpeechSynthesisVoice[],
  profile: NarrationVoiceProfileId
): SpeechSynthesisVoice[] {
  return listSpanishVoices(voices).filter(
    (voice) => classifySpeechVoiceGender(voice) === profile
  );
}

export interface VoiceProfileAvailability {
  female: SpeechSynthesisVoice[];
  male: SpeechSynthesisVoice[];
  spanishAny: SpeechSynthesisVoice[];
}

export function analyzeVoiceProfileAvailability(
  voices: SpeechSynthesisVoice[]
): VoiceProfileAvailability {
  const spanishAny = listSpanishVoices(voices);
  return {
    female: spanishAny.filter((v) => classifySpeechVoiceGender(v) === 'female'),
    male: spanishAny.filter((v) => classifySpeechVoiceGender(v) === 'male'),
    spanishAny,
  };
}

/** Higher = more human / higher quality for Spanish tutorial narration. */
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

  // Known warmer Spanish voices on Windows/Edge when gender is identifiable.
  if (/sabina|elena|paulina|m[oó]nica|lucia|lucía/i.test(name)) score += 25;

  return score;
}

/**
 * Pick a voice for a requested profile.
 * Returns null when the profile cannot be satisfied honestly.
 * For profile=null (automatic), returns best Spanish voice without gender claims.
 */
export function pickVoiceForProfile(
  voices: SpeechSynthesisVoice[],
  profile: NarrationVoiceProfileId | null,
  preferredLang = 'es-AR'
): SpeechSynthesisVoice | null {
  const pickBest = (pool: SpeechSynthesisVoice[]) => {
    if (!pool.length) return null;
    const ranked = [...pool].sort(
      (a, b) =>
        scoreSpanishVoiceQuality(b, preferredLang) -
        scoreSpanishVoiceQuality(a, preferredLang)
    );
    return ranked[0] ?? null;
  };

  if (profile === 'female' || profile === 'male') {
    return pickBest(listVoicesForProfile(voices, profile));
  }

  const spanish = listSpanishVoices(voices);
  return pickBest(spanish.length ? spanish : voices);
}

export const VOICE_PREVIEW_SAMPLE =
  'Hola, soy la narración de Tutoriales Sinc Vete. Así vas a escuchar las guías del tutorial.';
