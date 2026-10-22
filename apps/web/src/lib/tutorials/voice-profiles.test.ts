import { describe, expect, it } from 'vitest';
import {
  analyzeVoiceProfileAvailability,
  classifySpeechVoiceGender,
  pickVoiceForProfile,
} from '@/lib/tutorials/voice-profiles';

function voice(partial: Partial<SpeechSynthesisVoice> & { name: string; lang: string }) {
  return {
    default: false,
    localService: true,
    voiceURI: partial.name,
    ...partial,
  } as SpeechSynthesisVoice;
}

describe('voice profile classification', () => {
  it('classifies only reliable gendered names', () => {
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

  it('does not present a gendered profile without a matching voice', () => {
    const voices = [voice({ name: 'Google español', lang: 'es-AR' })];
    const availability = analyzeVoiceProfileAvailability(voices);
    expect(availability.female).toHaveLength(0);
    expect(availability.male).toHaveLength(0);
    expect(pickVoiceForProfile(voices, 'female')).toBeNull();
    expect(pickVoiceForProfile(voices, 'male')).toBeNull();
    expect(pickVoiceForProfile(voices, null)?.lang).toMatch(/es/i);
  });

  it('prefers es-AR within a gendered pool', () => {
    const voices = [
      voice({ name: 'Paulina', lang: 'es-MX' }),
      voice({ name: 'Sabina', lang: 'es-AR' }),
      voice({ name: 'Pablo', lang: 'es-ES' }),
    ];
    expect(pickVoiceForProfile(voices, 'female')?.lang).toBe('es-AR');
    expect(pickVoiceForProfile(voices, 'male')?.name).toBe('Pablo');
  });

  it('prefers neural/natural voices when available', () => {
    const voices = [
      voice({ name: 'Microsoft Sabina', lang: 'es-AR', localService: true }),
      voice({
        name: 'Microsoft Sabina Online (Natural)',
        lang: 'es-AR',
        localService: false,
      }),
    ];
    expect(pickVoiceForProfile(voices, 'female')?.name).toContain('Natural');
  });

  it('ranks Google Spanish above compact local voices', () => {
    const voices = [
      voice({ name: 'Microsoft Pablo Desktop', lang: 'es-ES', localService: true }),
      voice({ name: 'Google español', lang: 'es-US', localService: false }),
    ];
    expect(pickVoiceForProfile(voices, null)?.name).toContain('Google');
  });
});
