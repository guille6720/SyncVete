import { describe, expect, it } from 'vitest';
import { canTransitionInterconsultationStatus } from '@sincvete/shared';

describe('interconsultation status machine (app)', () => {
  it('blocks invalid transitions used by clinic actions', () => {
    expect(canTransitionInterconsultationStatus('in_progress', 'completed')).toBe(true);
    expect(canTransitionInterconsultationStatus('draft', 'completed')).toBe(false);
    expect(canTransitionInterconsultationStatus('requesting', 'approved')).toBe(false);
  });
});
