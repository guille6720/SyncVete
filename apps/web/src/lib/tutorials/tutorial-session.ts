import type { TutorialMode } from '@sincvete/shared';

const SESSION_KEY = 'sv-academia-tutorial-session-v1';

export interface TutorialSessionSnapshot {
  tutorialId: string;
  mode: TutorialMode;
  stepIndex: number;
  organizationId: string;
  userId: string;
  updatedAt: string;
}

export function readTutorialSession(
  organizationId: string,
  userId: string
): TutorialSessionSnapshot | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as TutorialSessionSnapshot;
    if (
      parsed.organizationId !== organizationId ||
      parsed.userId !== userId ||
      !parsed.tutorialId
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function writeTutorialSession(snapshot: TutorialSessionSnapshot): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(snapshot));
  } catch {
    // Ignore quota / private mode failures — local progress still persists.
  }
}

export function clearTutorialSession(): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.removeItem(SESSION_KEY);
  } catch {
    // no-op
  }
}
