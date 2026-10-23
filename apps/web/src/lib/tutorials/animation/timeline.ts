/**
 * Pure animation timeline for Academia demos.
 * Pause-aware, deterministic, and easy to unit-test without DOM.
 */

export interface TimelineCue {
  id: string;
  /** Start offset from timeline begin (ms). */
  atMs: number;
  /** Optional cue length; defaults to remaining time until next cue or end. */
  durationMs?: number;
}

export interface TimelineSnapshot {
  elapsedMs: number;
  totalMs: number;
  progress: number;
  activeCueIds: string[];
  completed: boolean;
}

export interface AnimationTimeline {
  totalMs: number;
  cues: TimelineCue[];
  tick: (deltaMs: number, paused: boolean) => TimelineSnapshot;
  reset: () => TimelineSnapshot;
  getSnapshot: () => TimelineSnapshot;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function resolveActiveCues(elapsedMs: number, totalMs: number, cues: TimelineCue[]): string[] {
  const active: string[] = [];
  for (let i = 0; i < cues.length; i += 1) {
    const cue = cues[i]!;
    const nextAt = cues[i + 1]?.atMs ?? totalMs;
    const end = cue.atMs + (cue.durationMs ?? Math.max(0, nextAt - cue.atMs));
    if (elapsedMs >= cue.atMs && elapsedMs < end) {
      active.push(cue.id);
    }
  }
  return active;
}

export function buildTimelineSnapshot(
  elapsedMs: number,
  totalMs: number,
  cues: TimelineCue[]
): TimelineSnapshot {
  const safeTotal = Math.max(1, totalMs);
  const safeElapsed = clamp(elapsedMs, 0, safeTotal);
  return {
    elapsedMs: safeElapsed,
    totalMs: safeTotal,
    progress: safeElapsed / safeTotal,
    activeCueIds: resolveActiveCues(safeElapsed, safeTotal, cues),
    completed: safeElapsed >= safeTotal,
  };
}

/**
 * Collapse long timelines when the user prefers reduced motion:
 * keep cue order but run almost instantly so UI state still updates.
 */
export function collapseTimelineForReducedMotion(
  totalMs: number,
  cues: TimelineCue[],
  collapsedTotalMs = 800
): { totalMs: number; cues: TimelineCue[] } {
  if (totalMs <= collapsedTotalMs || cues.length === 0) {
    return { totalMs: Math.min(totalMs, collapsedTotalMs), cues };
  }
  const scale = collapsedTotalMs / totalMs;
  return {
    totalMs: collapsedTotalMs,
    cues: cues.map((cue) => ({
      ...cue,
      atMs: Math.round(cue.atMs * scale),
      durationMs:
        cue.durationMs == null ? undefined : Math.max(40, Math.round(cue.durationMs * scale)),
    })),
  };
}

export function createAnimationTimeline(
  totalMs: number,
  cues: TimelineCue[] = []
): AnimationTimeline {
  let elapsedMs = 0;
  const sorted = [...cues].sort((a, b) => a.atMs - b.atMs);

  const api: AnimationTimeline = {
    totalMs: Math.max(1, totalMs),
    cues: sorted,
    tick(deltaMs, paused) {
      if (!paused && deltaMs > 0) {
        elapsedMs = clamp(elapsedMs + deltaMs, 0, api.totalMs);
      }
      return buildTimelineSnapshot(elapsedMs, api.totalMs, api.cues);
    },
    reset() {
      elapsedMs = 0;
      return buildTimelineSnapshot(elapsedMs, api.totalMs, api.cues);
    },
    getSnapshot() {
      return buildTimelineSnapshot(elapsedMs, api.totalMs, api.cues);
    },
  };

  return api;
}

/** Build evenly spaced reveal cues for mock form fields / status chips. */
export function buildStaggeredCues(
  ids: string[],
  totalMs: number,
  options?: { leadInMs?: number; trailMs?: number }
): TimelineCue[] {
  if (ids.length === 0) return [];
  const leadInMs = options?.leadInMs ?? 200;
  const trailMs = options?.trailMs ?? 400;
  const usable = Math.max(0, totalMs - leadInMs - trailMs);
  const slot = ids.length === 1 ? usable : usable / ids.length;
  return ids.map((id, index) => ({
    id,
    atMs: Math.round(leadInMs + slot * index),
    durationMs: Math.max(120, Math.round(slot + trailMs)),
  }));
}
