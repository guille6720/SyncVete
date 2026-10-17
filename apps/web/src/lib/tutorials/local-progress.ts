import type { TutorialProgress, TutorialProgressStatus } from '@sincvete/shared';

function storageKey(organizationId: string, userId: string, tutorialId: string): string {
  return `sv-tutorial-progress:${organizationId}:${userId}:${tutorialId}`;
}

export function readLocalTutorialProgress(
  organizationId: string,
  userId: string,
  tutorialId: string
): TutorialProgress | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(storageKey(organizationId, userId, tutorialId));
    if (!raw) return null;
    return JSON.parse(raw) as TutorialProgress;
  } catch {
    return null;
  }
}

export function writeLocalTutorialProgress(
  organizationId: string,
  userId: string,
  progress: TutorialProgress
): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(
      storageKey(organizationId, userId, progress.tutorialId),
      JSON.stringify(progress)
    );
  } catch {
    // Quota / private mode — ignore.
  }
}

export function buildProgressPatch(input: {
  tutorialId: string;
  tutorialVersion: number;
  currentStepIndex: number;
  status: TutorialProgressStatus;
  previous?: TutorialProgress | null;
}): TutorialProgress {
  const now = new Date().toISOString();
  return {
    tutorialId: input.tutorialId,
    tutorialVersion: input.tutorialVersion,
    currentStepIndex: input.currentStepIndex,
    status: input.status,
    startedAt: input.previous?.startedAt ?? now,
    completedAt:
      input.status === 'completed' || input.status === 'skipped'
        ? now
        : (input.previous?.completedAt ?? null),
    updatedAt: now,
  };
}
