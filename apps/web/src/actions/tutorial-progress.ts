'use server';

import {
  getTutorialById,
  type ActionResult,
  type TutorialProgress,
  type TutorialProgressStatus,
} from '@sincvete/shared';
import { createServerClient } from '@/lib/supabase/server';
import { getSessionContext } from '@/lib/session';
import { isAcademiaEnabled } from '@/lib/tutorials/feature-flag';

function fail(message: string): ActionResult<never> {
  return { success: false, error: message };
}

/**
 * Soft persistence: tries RPC when the staging migration is applied.
 * Soft-fails when the table/RPC is missing (local/prod without migration).
 */
export async function upsertTutorialProgress(input: {
  tutorialId: string;
  tutorialVersion: number;
  currentStepIndex: number;
  status: TutorialProgressStatus;
}): Promise<ActionResult<TutorialProgress>> {
  if (!isAcademiaEnabled()) return fail('Tutoriales no está habilitado');

  const session = await getSessionContext();
  if (!session) return fail('No autenticado');

  const tutorial = getTutorialById(input.tutorialId);
  if (!tutorial) return fail('Tutorial desconocido');
  if (tutorial.version !== input.tutorialVersion) {
    return fail('Versión de tutorial desactualizada');
  }

  const now = new Date().toISOString();
  const progress: TutorialProgress = {
    tutorialId: input.tutorialId,
    tutorialVersion: input.tutorialVersion,
    currentStepIndex: input.currentStepIndex,
    status: input.status,
    startedAt: now,
    completedAt:
      input.status === 'completed' || input.status === 'skipped' ? now : null,
    updatedAt: now,
  };

  try {
    const supabase = await createServerClient();
    // RPC exists only after staging migration is applied; types lag until regenerate.
    const { data, error } = await (supabase.rpc as CallableFunction)('upsert_tutorial_progress', {
      p_tutorial_id: input.tutorialId,
      p_tutorial_version: input.tutorialVersion,
      p_current_step: input.currentStepIndex,
      p_status: input.status,
    }) as { data: Record<string, unknown> | null; error: { message: string } | null };
    if (error) {
      // Table/RPC not applied yet — client keeps localStorage.
      return { success: true, data: progress };
    }
    const row = (data ?? {}) as Record<string, unknown>;
    return {
      success: true,
      data: {
        tutorialId: String(row.tutorial_id ?? progress.tutorialId),
        tutorialVersion: Number(row.tutorial_version ?? progress.tutorialVersion),
        currentStepIndex: Number(row.current_step ?? progress.currentStepIndex),
        status: (row.status as TutorialProgressStatus) ?? progress.status,
        startedAt: (row.started_at as string | null) ?? progress.startedAt,
        completedAt: (row.completed_at as string | null) ?? progress.completedAt,
        updatedAt: (row.updated_at as string) ?? progress.updatedAt,
      },
    };
  } catch {
    return { success: true, data: progress };
  }
}

export async function getMyTutorialProgress(
  tutorialId: string
): Promise<ActionResult<TutorialProgress | null>> {
  if (!isAcademiaEnabled()) return { success: true, data: null };

  const session = await getSessionContext();
  if (!session) return fail('No autenticado');

  try {
    const supabase = await createServerClient();
    const { data, error } = await (supabase.rpc as CallableFunction)('get_my_tutorial_progress', {
      p_tutorial_id: tutorialId,
    }) as { data: Record<string, unknown> | null; error: { message: string } | null };
    if (error || !data) return { success: true, data: null };
    const row = data;
    return {
      success: true,
      data: {
        tutorialId: String(row.tutorial_id),
        tutorialVersion: Number(row.tutorial_version),
        currentStepIndex: Number(row.current_step ?? 0),
        status: row.status as TutorialProgressStatus,
        startedAt: (row.started_at as string | null) ?? null,
        completedAt: (row.completed_at as string | null) ?? null,
        updatedAt: String(row.updated_at ?? new Date().toISOString()),
      },
    };
  } catch {
    return { success: true, data: null };
  }
}
