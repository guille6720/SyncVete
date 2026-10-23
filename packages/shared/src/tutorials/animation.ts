/**
 * Declarative animation specs for Academia tutorials.
 * Modules describe *what* to animate; the web runtime owns timing and rendering.
 * Safe for reuse across future modules (Pacientes, Caja, etc.).
 */

export type TutorialAnimationPreset =
  | 'intro-logo'
  | 'cursor-highlight'
  | 'mock-appointment-create'
  | 'status-cycle'
  | 'none';

export interface TutorialMockField {
  key: string;
  label: string;
  value: string;
}

export interface TutorialAnimationSpec {
  /** Named preset so modules stay declarative and reusable. */
  preset: TutorialAnimationPreset;
  /**
   * Minimum visual hold in ms. The runtime uses
   * max(durationMs, scene.durationMs) and still waits for narration.
   */
  durationMs?: number;
  /** Move the simulated cursor to the step target (demo mode). */
  cursor?: boolean;
  /** Pulse the spotlight ring while the step is active. */
  spotlightPulse?: boolean;
  /** Fictional status labels for the status-cycle preset. */
  statusSequence?: string[];
  /** Ordered mock fields for the appointment-create preset. */
  mockFields?: TutorialMockField[];
}

/** Default fictional status cycle used by Agenda demos. */
export const DEFAULT_DEMO_STATUS_SEQUENCE = [
  'Programada',
  'Confirmada',
  'En curso',
  'Completada',
] as const;

/** Default fictional appointment fields for Agenda create demos. */
export const DEFAULT_DEMO_APPOINTMENT_FIELDS: readonly TutorialMockField[] = [
  { key: 'paciente', label: 'Paciente', value: 'Luna (canino)' },
  { key: 'tutor', label: 'Tutor', value: 'María Ejemplo' },
  { key: 'profesional', label: 'Profesional', value: 'Dra. Ana Demo' },
  { key: 'horario', label: 'Horario', value: 'Martes 10:30' },
  { key: 'tipo', label: 'Tipo', value: 'Consulta general (demo)' },
] as const;

export function resolveAnimationDurationMs(
  animation: TutorialAnimationSpec | undefined,
  sceneDurationMs: number | undefined,
  reducedMotion: boolean
): number {
  if (reducedMotion) return 800;
  const fromAnimation = animation?.durationMs;
  const fromScene = sceneDurationMs;
  const candidates = [fromAnimation, fromScene].filter(
    (value): value is number => typeof value === 'number' && value > 0
  );
  if (candidates.length === 0) return 3200;
  return Math.max(...candidates);
}
