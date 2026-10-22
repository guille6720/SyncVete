import { describe, expect, it } from 'vitest';
import {
  ACADEMIA_DEMO_KEY,
  isAcademiaDemoSettings,
} from '@/lib/academia-demo-marker';

describe('isAcademiaDemoSettings', () => {
  it('accepts explicit marker + key', () => {
    expect(
      isAcademiaDemoSettings({
        academia_demo: true,
        academia_demo_key: ACADEMIA_DEMO_KEY,
      })
    ).toBe(true);
  });

  it('rejects name-only / missing key (rename attack)', () => {
    expect(isAcademiaDemoSettings({ academia_demo: true })).toBe(false);
    expect(
      isAcademiaDemoSettings({
        academia_demo: true,
        academia_demo_key: 'forged',
      })
    ).toBe(false);
  });

  it('rejects empty / null', () => {
    expect(isAcademiaDemoSettings(null)).toBe(false);
    expect(isAcademiaDemoSettings({})).toBe(false);
  });
});
