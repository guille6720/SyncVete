import { describe, expect, it } from 'vitest';
import { storageAlert, PRELIMINARY_STORAGE_PLANS } from './storage-status';

describe('storage thresholds', () => {
  it.each([[79, 'normal'], [80, 'warning'], [94, 'warning'], [95, 'critical'], [100, 'full'], [110, 'full']] as const)('classifies %s percent as %s', (used, expected) => {
    expect(storageAlert(used, 100)).toBe(expected);
  });
  it('does not invent capacity for unknown quotas or invalid measurements', () => {
    expect(storageAlert(0, null)).toBe('unknown');
    expect(storageAlert(-1, 100)).toBe('unknown');
    expect(storageAlert(0, 0)).toBe('unknown');
  });
  it('uses decimal GB for every preliminary plan', () => {
    expect(PRELIMINARY_STORAGE_PLANS.map(plan => plan.bytes)).toEqual([2e9, 10e9, 30e9]);
  });
});
