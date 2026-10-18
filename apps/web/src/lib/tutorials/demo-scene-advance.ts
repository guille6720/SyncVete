import type { SpeechNarrationEngine } from '@/lib/tutorials/speech-narration';

export interface DemoSceneAdvanceOptions {
  engine: SpeechNarrationEngine;
  minMs: number;
  /** When false (muted/unsupported/no script), use timed fallback only. */
  waitForNarration: boolean;
  isCancelled: () => boolean;
  isPaused: () => boolean;
  sleep?: (ms: number) => Promise<void>;
}

/**
 * Hold a demo scene until the minimum display time elapses and (optionally)
 * narration settles. Returns false if cancelled before advance is allowed.
 */
export async function waitForDemoSceneAdvance(
  options: DemoSceneAdvanceOptions
): Promise<boolean> {
  const {
    engine,
    minMs,
    waitForNarration,
    isCancelled,
    isPaused,
    sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  } = options;

  const narrationWait = waitForNarration
    ? engine.waitUntilSettled({
        timeoutMs: Math.max(minMs + 25_000, 30_000),
        startGraceMs: 900,
      })
    : Promise.resolve('muted' as const);

  await sleep(minMs);
  if (isCancelled()) return false;

  await narrationWait;
  if (isCancelled()) return false;

  while (isPaused()) {
    if (isCancelled()) return false;
    await sleep(120);
  }

  return !isCancelled();
}
