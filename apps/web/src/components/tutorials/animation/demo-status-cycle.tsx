'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  buildStaggeredCues,
  collapseTimelineForReducedMotion,
  createAnimationTimeline,
} from '@/lib/tutorials/animation/timeline';
import { cn } from '@/lib/utils';

interface DemoStatusCycleProps {
  statuses: string[];
  durationMs: number;
  reducedMotion: boolean;
  paused?: boolean;
  playKey: string;
  className?: string;
}

/**
 * Animated fictional status transitions for Agenda demos.
 * Never mutates real appointment records.
 */
export function DemoStatusCycle({
  statuses,
  durationMs,
  reducedMotion,
  paused = false,
  playKey,
  className,
}: DemoStatusCycleProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const pausedRef = useRef(paused);
  pausedRef.current = paused;

  const ids = useMemo(
    () => statuses.map((label, index) => `status-${index}-${label}`),
    [statuses]
  );

  useEffect(() => {
    if (statuses.length === 0) return;
    const cues = buildStaggeredCues(ids, durationMs, { leadInMs: 180, trailMs: 350 });
    const plan = reducedMotion
      ? collapseTimelineForReducedMotion(durationMs, cues)
      : { totalMs: durationMs, cues };
    const timeline = createAnimationTimeline(plan.totalMs, plan.cues);
    setActiveIndex(0);

    let raf = 0;
    let last = performance.now();
    let cancelled = false;

    const tick = (now: number) => {
      if (cancelled) return;
      const delta = now - last;
      last = now;
      const snap = timeline.tick(delta, pausedRef.current);
      let nextIndex = 0;
      for (let i = 0; i < plan.cues.length; i += 1) {
        const cue = plan.cues[i]!;
        if (snap.elapsedMs >= cue.atMs) nextIndex = i;
      }
      setActiveIndex(nextIndex);
      if (!snap.completed) {
        raf = requestAnimationFrame(tick);
      }
    };

    raf = requestAnimationFrame(tick);
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
    };
  }, [ids, statuses.length, durationMs, reducedMotion, playKey]);

  return (
    <div
      className={cn('rounded-md border border-dashed bg-muted/40 p-3 text-sm', className)}
      data-tutorial-demo="status-cycle"
      aria-live="polite"
    >
      <p className="text-[11px] font-medium uppercase tracking-wide text-primary">
        Estados simulados
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        Ciclo de atención de demostración. No modifica turnos reales.
      </p>
      <ol className="mt-3 flex flex-wrap gap-2">
        {statuses.map((label, index) => {
          const isActive = index === activeIndex;
          const isDone = index < activeIndex;
          return (
            <li
              key={`${label}-${index}`}
              className={cn(
                'rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
                isActive &&
                  'border-primary bg-primary text-primary-foreground shadow-sm',
                isDone && !isActive && 'border-emerald-500/40 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200',
                !isActive && !isDone && 'border-border bg-background text-muted-foreground',
                isActive && !reducedMotion && 'sv-tutorial-status-pulse'
              )}
            >
              {label}
            </li>
          );
        })}
      </ol>
      <p className="mt-2 text-xs text-muted-foreground">
        Estado actual (simulado):{' '}
        <span className="font-medium text-foreground">
          {statuses[activeIndex] ?? '—'}
        </span>
      </p>
    </div>
  );
}
