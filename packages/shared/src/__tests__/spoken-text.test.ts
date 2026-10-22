import { describe, expect, it } from 'vitest';
import {
  buildNarrationAssetPath,
  listAgendaNarrationAssetPaths,
  normalizeSpokenText,
  AGENDA_NARRATION_CLIP_IDS,
} from '../tutorials';

describe('spoken-text pronunciation', () => {
  it('speaks SyncVete as Sinc Vete without changing surrounding copy', () => {
    expect(normalizeSpokenText('Bienvenido a SyncVete Tutoriales')).toBe(
      'Bienvenido a Sinc Vete Tutoriales'
    );
    expect(normalizeSpokenText('Tutoriales Sync Vete y SyncVete')).toBe(
      'Tutoriales Sinc Vete y Sinc Vete'
    );
  });

  it('is case-insensitive and leaves unrelated words alone', () => {
    expect(normalizeSpokenText('SYNCVETE syncvete')).toBe('Sinc Vete Sinc Vete');
    expect(normalizeSpokenText('sincronizar veterinaria')).toBe('sincronizar veterinaria');
  });

  it('reads clock times more naturally in Spanish', () => {
    expect(normalizeSpokenText('Martes 10:30 (simulado)')).toBe('Martes 10 y media (simulado)');
    expect(normalizeSpokenText('Cita a las 9:00')).toBe('Cita a las 9 en punto');
  });

  it('softens inverted punctuation for smoother TTS', () => {
    expect(normalizeSpokenText('¡Bienvenido a SyncVete!')).toBe('Bienvenido a Sinc Vete!');
  });
});

describe('narration asset map', () => {
  it('covers 10 agenda steps and 3 demo scenes for both voice profiles', () => {
    expect(AGENDA_NARRATION_CLIP_IDS).toHaveLength(13);
    const paths = listAgendaNarrationAssetPaths();
    expect(paths).toHaveLength(26);
    expect(paths[0]).toBe('/academia/narration/agenda-basico/brian/welcome.mp3');
    expect(
      buildNarrationAssetPath({
        tutorialId: 'agenda-basico',
        clipId: 'demo-status',
        voiceProfile: 'horacio',
      })
    ).toBe('/academia/narration/agenda-basico/horacio/demo-status.mp3');
  });
});
