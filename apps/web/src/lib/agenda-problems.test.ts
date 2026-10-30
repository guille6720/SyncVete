import { describe, expect, it } from 'vitest';
import { explainAgendaProblem } from './agenda-problems';
describe('actionable agenda failures', () => {
  it.each([
    ['El profesional no tiene horarios cargados. Agregá días y horarios en su ficha.', 'hours'],
    ['Horario fuera de la agenda del profesional. Elegí otro horario.', 'slots'],
    ['El turno acaba de ocuparse.', 'slots'],
    ['No tenés permiso para crear turnos.', 'permission'],
    ['Could not find the function public.save_professional_with_agenda', 'retry'],
    ['Network fetch failed', 'retry'],
  ])('explains %s with an action', (message, action) => {
    const result = explainAgendaProblem(message);
    expect(result.action).toBe(action);
    expect(result.message.length).toBeGreaterThan(30);
    expect(result.label).toBeTruthy();
    expect(result.message).not.toMatch(/public\.|SQL/);
  });
});
