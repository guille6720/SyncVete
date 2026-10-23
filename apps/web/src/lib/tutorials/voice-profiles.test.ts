import { describe, expect, it } from 'vitest';
import {
  classifySpeechVoiceGender,
  pickVoiceForProfile,
  scoreSpanishVoiceQuality,
} from '@/lib/tutorials/voice-profiles';

function voice(partial: Partial<SpeechSynthesisVoice> & { name: string; lang: string }) {
  return {
    localService: true,
    voiceURI: partial.name,
    ...partial,
  } as SpeechSynthesisVoice;
}

describe('browser voice helpers (fallback)', () => {
  it('classifies gendered browser voices when name cues exist', () => {
    expect(classifySpeechVoiceGender(voice({ name: 'Microsoft Sabina', lang: 'es-ES' }))).toBe(
      'female'
    );
    expect(classifySpeechVoiceGender(voice({ name: 'Microsoft Pablo', lang: 'es-ES' }))).toBe(
      'male'
    );
    expect(classifySpeechVoiceGender(voice({ name: 'Google español', lang: 'es-US' }))).toBe(
      'unknown'
    );
  });

  it('never picks a female Spanish voice for male / default fallback', () => {
    const voices = [
      voice({ name: 'Microsoft Sabina', lang: 'es-AR', localService: true }),
      voice({ name: 'Microsoft Pablo', lang: 'es-AR', localService: true }),
      voice({
        name: 'Google español Natural',
        lang: 'es-AR',
        localService: false,
      }),
    ];
    const malePick = pickVoiceForProfile(voices, 'male');
    const defaultPick = pickVoiceForProfile(voices, null);
    expect(malePick?.name).not.toMatch(/Sabina|Paulina|Helena|Elena/i);
    expect(defaultPick?.name).not.toMatch(/Sabina|Paulina|Helena|Elena/i);
    expect(
      pickVoiceForProfile(
        [voice({ name: 'Microsoft Sabina', lang: 'es-AR' }), voice({ name: 'Microsoft Pablo', lang: 'es-AR' })],
        'male'
      )?.name
    ).toBe('Microsoft Pablo');
  });

  it('ranks Google Spanish above compact local voices', () => {
    const voices = [
      voice({ name: 'eSpeak compact', lang: 'es-ES', localService: true }),
      voice({ name: 'Google español', lang: 'es-US', localService: false }),
    ];
    expect(scoreSpanishVoiceQuality(voices[1]!)).toBeGreaterThan(
      scoreSpanishVoiceQuality(voices[0]!)
    );
  });

  it('returns null for male profile when only female/unknown Spanish voices exist', () => {
    const voices = [
      voice({ name: 'Microsoft Sabina', lang: 'es-AR' }),
      voice({ name: 'Google español', lang: 'es-US', localService: false }),
    ];
    expect(pickVoiceForProfile(voices, 'male')).toBeNull();
  });
});
