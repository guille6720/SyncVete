import { describe, expect, it } from 'vitest';
import { buildProgressPatch } from './local-progress';

describe('buildProgressPatch', () => {
  it('marks startedAt on first write and completedAt when completed', () => {
    const first = buildProgressPatch({
      tutorialId: 'agenda-basico',
      tutorialVersion: 1,
      currentStepIndex: 0,
      status: 'in_progress',
    });
    expect(first.startedAt).toBeTruthy();
    expect(first.completedAt).toBeNull();

    const done = buildProgressPatch({
      tutorialId: 'agenda-basico',
      tutorialVersion: 1,
      currentStepIndex: 9,
      status: 'completed',
      previous: first,
    });
    expect(done.startedAt).toBe(first.startedAt);
    expect(done.completedAt).toBeTruthy();
  });
});
