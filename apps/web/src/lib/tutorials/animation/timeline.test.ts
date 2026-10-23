import { describe, expect, it } from 'vitest';
import {
  buildStaggeredCues,
  buildTimelineSnapshot,
  collapseTimelineForReducedMotion,
  createAnimationTimeline,
} from '@/lib/tutorials/animation/timeline';

describe('tutorial animation timeline', () => {
  it('activates cues by elapsed time', () => {
    const cues = [
      { id: 'a', atMs: 0, durationMs: 500 },
      { id: 'b', atMs: 500, durationMs: 500 },
    ];
    expect(buildTimelineSnapshot(100, 1000, cues).activeCueIds).toEqual(['a']);
    expect(buildTimelineSnapshot(600, 1000, cues).activeCueIds).toEqual(['b']);
    expect(buildTimelineSnapshot(1000, 1000, cues).completed).toBe(true);
  });

  it('does not advance while paused', () => {
    const timeline = createAnimationTimeline(1000, [{ id: 'a', atMs: 0, durationMs: 1000 }]);
    timeline.tick(400, false);
    expect(timeline.getSnapshot().elapsedMs).toBe(400);
    timeline.tick(400, true);
    expect(timeline.getSnapshot().elapsedMs).toBe(400);
    timeline.tick(200, false);
    expect(timeline.getSnapshot().elapsedMs).toBe(600);
  });

  it('collapses timelines for reduced motion without dropping cue order', () => {
    const cues = buildStaggeredCues(['one', 'two', 'three'], 4000);
    const collapsed = collapseTimelineForReducedMotion(4000, cues, 800);
    expect(collapsed.totalMs).toBe(800);
    expect(collapsed.cues.map((c) => c.id)).toEqual(['one', 'two', 'three']);
    expect(collapsed.cues[0]!.atMs).toBeLessThan(collapsed.cues[1]!.atMs);
  });

  it('builds staggered cues inside the usable window', () => {
    const cues = buildStaggeredCues(['a', 'b'], 2000, { leadInMs: 200, trailMs: 200 });
    expect(cues).toHaveLength(2);
    expect(cues[0]!.atMs).toBe(200);
    expect(cues[1]!.atMs).toBeGreaterThan(cues[0]!.atMs);
  });
});
