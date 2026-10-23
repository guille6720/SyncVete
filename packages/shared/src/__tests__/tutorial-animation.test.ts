import { describe, expect, it } from 'vitest';
import { resolveAnimationDurationMs } from '../tutorials/animation';

describe('tutorial animation helpers', () => {
  it('prefers the longer of animation and scene durations', () => {
    expect(
      resolveAnimationDurationMs({ preset: 'cursor-highlight', durationMs: 5000 }, 3000, false)
    ).toBe(5000);
    expect(
      resolveAnimationDurationMs({ preset: 'cursor-highlight', durationMs: 2000 }, 4000, false)
    ).toBe(4000);
  });

  it('collapses duration when reduced motion is requested', () => {
    expect(
      resolveAnimationDurationMs({ preset: 'status-cycle', durationMs: 5000 }, 5000, true)
    ).toBe(800);
  });
});
