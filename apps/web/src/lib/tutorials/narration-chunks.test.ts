import { describe, expect, it } from 'vitest';
import { splitNarrationChunks } from '@/lib/tutorials/narration-chunks';

describe('splitNarrationChunks', () => {
  it('returns empty for blank text', () => {
    expect(splitNarrationChunks('   ')).toEqual([]);
  });

  it('keeps short scripts as a single utterance for natural prosody', () => {
    expect(splitNarrationChunks('Hola. ¿Cómo estás?')).toEqual(['Hola. ¿Cómo estás?']);
  });

  it('splits only when the full script is very long', () => {
    const long =
      'Con Nueva cita abrís el formulario: paciente, fecha y hora, duración, tipo y profesional asignado, y después confirmás los datos antes de guardar el turno en la agenda del día. Luego revisás el estado, avisás al tutor y confirmás que todo quedó listo para la atención. Si hace falta, volvés a la lista del día y seguís con el próximo paciente de la clínica sin perder el ritmo de la consulta.';
    const chunks = splitNarrationChunks(long);
    expect(long.length).toBeGreaterThan(360);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.join(' ')).toContain('Nueva cita');
  });
});
