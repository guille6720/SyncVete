import { describe, expect, it } from 'vitest';
import {
  getModuleGroupIdFromSlug,
  getModuleHubPath,
  getModuleItemBlurb,
} from './module-hubs';

describe('module-hubs', () => {
  it('round-trips group ids and Spanish slugs', () => {
    expect(getModuleHubPath('clinical')).toBe('/modulos/clinica');
    expect(getModuleGroupIdFromSlug('clinica')).toBe('clinical');
    expect(getModuleGroupIdFromSlug('nope')).toBeNull();
  });

  it('returns concise blurbs for known modules', () => {
    expect(getModuleItemBlurb('/sala-espera')).toContain('check-in');
    expect(getModuleItemBlurb('/desconocido')).toBe('Abrir módulo');
  });
});
