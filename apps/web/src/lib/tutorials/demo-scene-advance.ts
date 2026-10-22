import type { SpeechSettledReason } from '@/lib/tutorials/speech-narration';

/** Duck-typed narration surface (browser engine or unified controller). */
export interface DemoNarrationWaiter {
  waitUntilSettled: (options?: {
    timeoutMs?: number;
    startGraceMs?: number;
  }) => Promise<SpeechSettledReason>;
}

export interface DemoSceneAdvanceOptions {
  engine: DemoNarrationWaiter;
  minMs: number;
  /** When false (muted/unsupported/no script), use timed fallback only. */
  waitForNarration: boolean;
  isCancelled: () => boolean;
  isPaused: () => boolean;
  sleep?: (ms: number) => Promise<void>;
}

async function waitForNarrationSettled(
  engine: DemoNarrationWaiter,
  minMs: number,
  isCancelled: () => boolean
): Promise<void> {
  let replacements = 0;
  while (!isCancelled() && replacements < 12) {
    const reason = await engine.waitUntilSettled({
      // ElevenLabs needs network time before audio starts; do not advance early.
      timeoutMs: Math.max(minMs + 90_000, 120_000),
      startGraceMs: 4_500,
    });
    if (isCancelled()) return;
    // speak() soft-stops the previous clip before starting the next — keep holding.
    if (reason === 'stopped') {
      replacements += 1;
      continue;
    }
    return;
  }
}

/**
 * Hold a demo scene until the minimum display time elapses and (optionally)
 * narration settles. Returns false if cancelled before advance is allowed.
 *
 * If narration is replaced mid-scene (`stopped`), keep waiting for the new clip
 * instead of advancing with the explanation cut off.
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
    ? waitForNarrationSettled(engine, minMs, isCancelled)
    : Promise.resolve();

  await sleep(minMs);
  if (isCancelled()) return false;

  await narrationWait;
  if (isCancelled()) return false;

  // Short natural breath between clips — not a long dead gap.
  await sleep(280);
  if (isCancelled()) return false;

  while (isPaused()) {
    if (isCancelled()) return false;
    await sleep(120);
  }

  return !isCancelled();
}
