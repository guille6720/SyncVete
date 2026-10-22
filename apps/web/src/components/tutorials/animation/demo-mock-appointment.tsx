'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { TutorialMockField } from '@sincvete/shared';
import {
  buildStaggeredCues,
  collapseTimelineForReducedMotion,
  createAnimationTimeline,
} from '@/lib/tutorials/animation/timeline';
import { cn } from '@/lib/utils';

interface DemoMockAppointmentProps {
  fields: TutorialMockField[];
  durationMs: number;
  reducedMotion: boolean;
  paused?: boolean;
  playKey: string;
  className?: string;
}

/**
 * Animated mock appointment creation — fictional fields only, never submitted.
 */
export function DemoMockAppointment({
  fields,
  durationMs,
  reducedMotion,
  paused = false,
  playKey,
  className,
}: DemoMockAppointmentProps) {
  const [visibleKeys, setVisibleKeys] = useState<string[]>([]);
  const [savedFlash, setSavedFlash] = useState(false);
  const pausedRef = useRef(paused);
  pausedRef.current = paused;

  const fieldIds = useMemo(() => fields.map((field) => field.key), [fields]);

  useEffect(() => {
    const cues = buildStaggeredCues(fieldIds, durationMs, { leadInMs: 250, trailMs: 500 });
    const plan = reducedMotion
      ? collapseTimelineForReducedMotion(durationMs, cues)
      : { totalMs: durationMs, cues };
    const timeline = createAnimationTimeline(plan.totalMs, plan.cues);
    setVisibleKeys([]);
    setSavedFlash(false);

    let raf = 0;
    let last = performance.now();
    let cancelled = false;

    const tick = (now: number) => {
      if (cancelled) return;
      const delta = now - last;
      last = now;
      const snap = timeline.tick(delta, pausedRef.current);
      // Once a field's atMs has passed, keep it visible
      const kept = fieldIds.filter((id) => {
        const cue = plan.cues.find((c) => c.id === id);
        return cue != null && snap.elapsedMs >= cue.atMs;
      });
      setVisibleKeys(kept);
      if (snap.progress >= 0.82) setSavedFlash(true);
      if (!snap.completed) {
        raf = requestAnimationFrame(tick);
      }
    };

    raf = requestAnimationFrame(tick);
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
    };
  }, [fieldIds, durationMs, reducedMotion, playKey]);

  return (
    <div
      className={cn('rounded-md border border-dashed bg-muted/40 p-3 text-sm', className)}
      data-tutorial-demo="mock-create"
      aria-live="polite"
    >
      <p className="text-[11px] font-medium uppercase tracking-wide text-primary">
        Alta simulada
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        Datos ficticios de demostración. No se envía ni guarda nada.
      </p>
      <ul className="mt-3 space-y-2">
        {fields.map((field) => {
          const shown = visibleKeys.includes(field.key) || reducedMotion;
          return (
            <li
              key={field.key}
              className={cn(
                'rounded border bg-background/80 px-2 py-1.5 transition-all',
                shown
                  ? 'translate-y-0 opacity-100'
                  : 'translate-y-1 opacity-0',
                reducedMotion ? '' : 'duration-300'
              )}
            >
              <span className="block text-[10px] uppercase tracking-wide text-muted-foreground">
                {field.label}
              </span>
              <span className="text-sm font-medium text-foreground">
                {shown ? field.value : '…'}
              </span>
            </li>
          );
        })}
      </ul>
      <div
        className={cn(
          'mt-3 inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium',
          savedFlash
            ? 'bg-emerald-600/15 text-emerald-800 dark:text-emerald-200'
            : 'bg-muted text-muted-foreground'
        )}
      >
        {savedFlash ? '✓ Guardado simulado' : 'Preparando alta…'}
      </div>
    </div>
  );
}
