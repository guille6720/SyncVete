import { cache } from 'react';
import { readServerEnv } from '@/lib/server-env';

export type SvPerfMarks = Record<string, number>;

export type SvPerfReport = {
  path: string;
  totalMs: number;
  marks: SvPerfMarks;
  at: string;
};

type PerfBag = {
  enabled: boolean;
  startedAt: number;
  marks: SvPerfMarks;
  path: string;
};

function envEnabled(): boolean {
  if (readServerEnv('SYNC_VETE_PERF_TIMING') === '1') return true;
  if (process.env.VERCEL_ENV === 'preview') return true;
  if (process.env.NODE_ENV === 'development') return true;
  return false;
}

/** Request-scoped navigation timing bag (React.cache). */
export const getNavPerfBag = cache((): PerfBag => ({
  enabled: envEnabled(),
  startedAt: performance.now(),
  marks: {},
  path: '',
}));

export function isNavPerfEnabled(): boolean {
  return getNavPerfBag().enabled;
}

export function navPerfSetPath(path: string): void {
  const bag = getNavPerfBag();
  if (!bag.enabled) return;
  bag.path = path;
}

/** Record a duration mark in milliseconds. */
export function navPerfMark(name: string, durationMs: number): void {
  const bag = getNavPerfBag();
  if (!bag.enabled) return;
  bag.marks[name] = Math.round(durationMs * 10) / 10;
}

/** Time an async function and store the mark. */
export async function navPerfTime<T>(name: string, fn: () => Promise<T>): Promise<T> {
  const bag = getNavPerfBag();
  if (!bag.enabled) return fn();
  const start = performance.now();
  try {
    return await fn();
  } finally {
    navPerfMark(name, performance.now() - start);
  }
}

/**
 * Structured per-operation log for route navigation debugging.
 * Example: [SV_PERF] route=/profesionales/[id] operation=getProfessional duration_ms=42
 */
export async function svPerfOperation<T>(
  route: string,
  operation: string,
  fn: () => Promise<T>
): Promise<T> {
  const enabled = isNavPerfEnabled();
  if (!enabled) return fn();
  const start = performance.now();
  try {
    return await fn();
  } finally {
    const durationMs = Math.round((performance.now() - start) * 10) / 10;
    navPerfMark(`${route}.${operation}`, durationMs);
    console.info(
      `[SV_PERF] route=${route} operation=${operation} duration_ms=${durationMs}`
    );
  }
}

export function getNavPerfReport(): SvPerfReport | null {
  const bag = getNavPerfBag();
  if (!bag.enabled) return null;
  const totalMs = Math.round((performance.now() - bag.startedAt) * 10) / 10;
  const report: SvPerfReport = {
    path: bag.path || '(unknown)',
    totalMs,
    marks: { ...bag.marks, 'layout.total': totalMs },
    at: new Date().toISOString(),
  };
  // Structured log for Vercel / local terminal.
  console.info('[SV_PERF]', JSON.stringify(report));
  return report;
}
