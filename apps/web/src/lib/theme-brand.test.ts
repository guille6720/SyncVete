import { describe, expect, it } from 'vitest';
import { COLOR_PRESETS, DEFAULT_THEME, isColorPresetId } from '@/lib/theme';

/**
 * Brand gate for SyncVete UI V2: product default must stay teal.
 * Optional violet in COLOR_PRESETS is user preference only — not the brand.
 * @see docs/ui-v2/BRAND.md
 */
describe('SyncVete brand defaults', () => {
  it('defaults to light mode and teal accent', () => {
    expect(DEFAULT_THEME.mode).toBe('light');
    expect(DEFAULT_THEME.accent).toBe('teal');
  });

  it('exposes teal as the first / branded primary swatch', () => {
    const teal = COLOR_PRESETS.find((p) => p.id === 'teal');
    expect(teal?.swatch.toLowerCase()).toBe('#0d9488');
  });

  it('treats violet as an optional user preset, not the default', () => {
    expect(isColorPresetId('violet')).toBe(true);
    expect(DEFAULT_THEME.accent).not.toBe('violet');
    const violet = COLOR_PRESETS.find((p) => p.id === 'violet');
    expect(violet?.swatch.toLowerCase()).toBe('#7c3aed');
  });
});
