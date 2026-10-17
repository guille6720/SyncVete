import type { Role } from '../constants';

export type TutorialDifficulty = 'basico' | 'intermedio' | 'avanzado';
export type TutorialPlacement = 'top' | 'bottom' | 'left' | 'right' | 'center' | 'auto';
export type TutorialProgressStatus = 'not_started' | 'in_progress' | 'completed' | 'skipped';
export type TutorialMode = 'interactive' | 'demo';

/** Stable target keys mapped to data-tour attributes in the UI. */
export type TutorialTargetKey = string;

export interface TutorialValidation {
  /** Require the target element to exist before advancing (soft: warn if missing). */
  requireTarget?: boolean;
  /** Optional permission the viewer must hold for this step to be relevant. */
  requirePermission?: string;
}

export interface DemoScene {
  id: string;
  /** Fictional on-screen copy only — never real clinic data. */
  headline: string;
  body: string;
  /** Mock labels shown in the demo panel (veterinarian, pet, owner…). */
  mockLabels?: Record<string, string>;
  durationMs?: number;
}

export interface VideoScene {
  id: string;
  order: number;
  title: string;
  narration: string;
  caption: string;
  /** Suggested on-screen duration in seconds. */
  durationSec: number;
  layoutNotes?: string;
}

export interface TutorialStep {
  id: string;
  title: string;
  body: string;
  target?: TutorialTargetKey;
  placement?: TutorialPlacement;
  route?: string;
  validation?: TutorialValidation;
  demoSceneId?: string;
  videoSceneId?: string;
  /** Narration / caption overrides for this step when producing video. */
  narration?: string;
  caption?: string;
}

export interface TutorialDefinition {
  id: string;
  moduleId: string;
  version: number;
  title: string;
  description: string;
  audienceRoles: Role[];
  estimatedMinutes: number;
  difficulty: TutorialDifficulty;
  steps: TutorialStep[];
  demoScenes: DemoScene[];
  videoScenes: VideoScene[];
  /** Entry route when starting from Academia. */
  startRoute: string;
}

export interface TutorialProgress {
  tutorialId: string;
  tutorialVersion: number;
  currentStepIndex: number;
  status: TutorialProgressStatus;
  startedAt: string | null;
  completedAt: string | null;
  updatedAt: string;
}

export interface AcademyModuleCard {
  tutorialId: string;
  moduleId: string;
  title: string;
  description: string;
  estimatedMinutes: number;
  difficulty: TutorialDifficulty;
  startRoute: string;
  progress: TutorialProgress | null;
}
