'use client';

import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

interface TutorialCursorProps {
  /** Target rect in viewport coordinates; null hides the cursor. */
  targetRect: DOMRect | null;
  active: boolean;
  reducedMotion: boolean;
  /** Replay token — bump to restart the move/click choreography. */
  playKey: string;
  paused?: boolean;
  className?: string;
}

interface CursorPoint {
  x: number;
  y: number;
}

/**
 * Simulated pointer that moves toward the spotlight target and performs a click pulse.
 * Decorative only (`aria-hidden`); real focus stays on the guide panel controls.
 */
export function TutorialCursor({
  targetRect,
  active,
  reducedMotion,
  playKey,
  paused = false,
  className,
}: TutorialCursorProps) {
  const [point, setPoint] = useState<CursorPoint | null>(null);
  const [phase, setPhase] = useState<'hidden' | 'moving' | 'click' | 'rest'>('hidden');
  const pausedRef = useRef(paused);
  pausedRef.current = paused;

  const targetKey = targetRect
    ? `${Math.round(targetRect.left)}:${Math.round(targetRect.top)}:${Math.round(targetRect.width)}:${Math.round(targetRect.height)}`
    : null;

  useEffect(() => {
    if (!active || !targetRect || !targetKey) {
      setPhase('hidden');
      setPoint(null);
      return;
    }

    const dest: CursorPoint = {
      x: targetRect.left + targetRect.width / 2,
      y: targetRect.top + Math.min(targetRect.height * 0.55, targetRect.height - 8),
    };

    if (reducedMotion) {
      setPoint(dest);
      setPhase('rest');
      return;
    }

    const origin: CursorPoint = {
      x: Math.max(24, dest.x - 120),
      y: Math.max(24, dest.y - 80),
    };
    setPoint(origin);
    setPhase('moving');

    let cancelled = false;
    let raf = 0;
    let clickTimer: ReturnType<typeof setTimeout> | null = null;
    const moveMs = 700;
    let elapsed = 0;
    let lastTs: number | null = null;

    const easeOutCubic = (t: number) => 1 - (1 - t) ** 3;

    const frame = (now: number) => {
      if (cancelled) return;
      if (lastTs == null) lastTs = now;
      const delta = now - lastTs;
      lastTs = now;
      if (!pausedRef.current) {
        elapsed = Math.min(moveMs, elapsed + delta);
      }
      const t = elapsed / moveMs;
      const eased = easeOutCubic(t);
      setPoint({
        x: origin.x + (dest.x - origin.x) * eased,
        y: origin.y + (dest.y - origin.y) * eased,
      });
      if (t < 1) {
        raf = requestAnimationFrame(frame);
        return;
      }
      setPhase('click');
      clickTimer = setTimeout(() => {
        if (!cancelled) setPhase('rest');
      }, 320);
    };

    raf = requestAnimationFrame(frame);
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      if (clickTimer) clearTimeout(clickTimer);
    };
    // targetKey captures geometry; targetRect is read for destination coordinates.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional geometry key
  }, [active, targetKey, reducedMotion, playKey]);

  if (!active || !point || phase === 'hidden') return null;

  return (
    <div
      className={cn('pointer-events-none fixed z-[75]', className)}
      style={{ left: point.x, top: point.y, transform: 'translate(-20%, -10%)' }}
      aria-hidden
      data-tutorial-cursor={phase}
    >
      <svg width="28" height="28" viewBox="0 0 24 24" className="drop-shadow-md">
        <path
          d="M4.5 2.5 19 12.2l-6.1 1.4 2.8 7.1-2.7 1.1-2.9-7.2L4.5 18.8V2.5Z"
          fill="currentColor"
          className="text-slate-900 dark:text-white"
          stroke="white"
          strokeWidth="1.2"
        />
      </svg>
      {phase === 'click' ? (
        <span className="sv-tutorial-cursor-ripple absolute left-1 top-1 h-5 w-5 rounded-full border-2 border-primary" />
      ) : null}
    </div>
  );
}
