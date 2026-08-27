'use server';

import {
  professionalScheduleListSchema,
  professionalScheduleSchema,
  professionalTimeBlockListSchema,
  professionalTimeBlockSchema,
  type ActionResult,
  type ProfessionalSchedule,
  type ProfessionalTimeBlock,
} from '@sincvete/shared';
import { createServerClient } from '@/lib/supabase/server';
import { PermissionError, requirePermissionAndFeature } from '@/lib/permissions';
import { getSessionContext } from '@/actions/auth';
import { revalidateAgenda } from '@/lib/cache-revalidate';
import { FEATURES, planRestrictionResult } from '@/lib/entitlements';

function actionError<T = void>(error: unknown): ActionResult<T> {
  const planError = planRestrictionResult<T>(error);
  if (planError) return planError;
  if (error instanceof PermissionError) {
    return { success: false, error: error.message };
  }
  console.error(error);
  return { success: false, error: 'Ocurrió un error inesperado' };
}

function rpcErrorMessage(error: { message?: string } | null, fallback: string): string {
  const message = error?.message?.trim();
  if (!message) return fallback;
  return message.replace(/^.*ERROR:\s*/i, '').replace(/\s+CONTEXT:[\s\S]*$/i, '');
}

function normalizeTime(value: string): string {
  return value.length === 5 ? `${value}:00` : value;
}

export async function listProfessionalSchedules(input: {
  branchId?: string;
  userId?: string;
} = {}): Promise<ProfessionalSchedule[]> {
  await requirePermissionAndFeature('appointments:read', FEATURES.APPOINTMENTS);
  const parsed = professionalScheduleListSchema.parse(input);
  const session = await getSessionContext();
  const supabase = await createServerClient();

  const { data, error } = await supabase.rpc('list_professional_schedules', {
    p_branch_id: parsed.branchId ?? session?.branchId ?? null,
    p_user_id: parsed.userId ?? null,
  });

  if (error) throw error;
  return (data ?? []) as ProfessionalSchedule[];
}

export async function upsertProfessionalSchedule(
  input: {
    id?: string;
    branchId: string;
    userId: string;
    weekday: number;
    startTime: string;
    endTime: string;
    slotDurationMinutes?: number;
    allowedAppointmentTypes?: string[];
    isActive?: boolean;
  }
): Promise<ActionResult<ProfessionalSchedule>> {
  try {
    await requirePermissionAndFeature('appointments:write', FEATURES.APPOINTMENTS);
    const parsed = professionalScheduleSchema.safeParse(input);
    if (!parsed.success) {
      return {
        success: false,
        error: 'Datos inválidos',
        fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
      };
    }

    const supabase = await createServerClient();
    const { data, error } = await supabase.rpc('upsert_professional_schedule', {
      p_branch_id: parsed.data.branchId,
      p_user_id: parsed.data.userId,
      p_weekday: parsed.data.weekday,
      p_start_time: normalizeTime(parsed.data.startTime),
      p_end_time: normalizeTime(parsed.data.endTime),
      p_slot_duration_minutes: parsed.data.slotDurationMinutes,
      p_allowed_appointment_types: parsed.data.allowedAppointmentTypes ?? null,
      p_is_active: parsed.data.isActive,
      p_id: parsed.data.id ?? null,
    });

    if (error) {
      return {
        success: false,
        error: rpcErrorMessage(error, 'No se pudo guardar la agenda'),
      };
    }

    revalidateAgenda();
    return { success: true, data: data as unknown as ProfessionalSchedule };
  } catch (error) {
    return actionError<ProfessionalSchedule>(error);
  }
}

export async function deleteProfessionalSchedule(id: string): Promise<ActionResult> {
  try {
    await requirePermissionAndFeature('appointments:write', FEATURES.APPOINTMENTS);
    const supabase = await createServerClient();
    const { error } = await supabase.rpc('soft_delete_professional_schedule', {
      p_id: id,
    });

    if (error) {
      return {
        success: false,
        error: rpcErrorMessage(error, 'No se pudo eliminar la agenda'),
      };
    }

    revalidateAgenda();
    return { success: true };
  } catch (error) {
    return actionError(error);
  }
}

export async function listProfessionalTimeBlocks(input: {
  branchId?: string;
  userId?: string;
  from?: string;
  to?: string;
} = {}): Promise<ProfessionalTimeBlock[]> {
  await requirePermissionAndFeature('appointments:read', FEATURES.APPOINTMENTS);
  const parsed = professionalTimeBlockListSchema.parse(input);
  const session = await getSessionContext();
  const supabase = await createServerClient();

  const { data, error } = await supabase.rpc('list_professional_time_blocks', {
    p_branch_id: parsed.branchId ?? session?.branchId ?? null,
    p_user_id: parsed.userId ?? null,
    p_from: parsed.from ?? null,
    p_to: parsed.to ?? null,
  });

  if (error) throw error;
  return (data ?? []) as ProfessionalTimeBlock[];
}

export async function upsertProfessionalTimeBlock(
  input: {
    branchId: string;
    startsAt: string;
    endsAt: string;
    kind?: string;
    userId?: string;
    reason?: string;
  }
): Promise<ActionResult<ProfessionalTimeBlock>> {
  try {
    await requirePermissionAndFeature('appointments:write', FEATURES.APPOINTMENTS);
    const parsed = professionalTimeBlockSchema.safeParse(input);
    if (!parsed.success) {
      return {
        success: false,
        error: 'Datos inválidos',
        fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
      };
    }

    const supabase = await createServerClient();
    const { data, error } = await supabase.rpc('create_professional_time_block', {
      p_branch_id: parsed.data.branchId,
      p_starts_at: parsed.data.startsAt,
      p_ends_at: parsed.data.endsAt,
      p_kind: parsed.data.kind,
      p_user_id: parsed.data.userId ?? null,
      p_reason: parsed.data.reason ?? null,
    });

    if (error) {
      return {
        success: false,
        error: rpcErrorMessage(error, 'No se pudo crear el bloqueo'),
      };
    }

    revalidateAgenda();
    return { success: true, data: data as unknown as ProfessionalTimeBlock };
  } catch (error) {
    return actionError<ProfessionalTimeBlock>(error);
  }
}

export async function deleteProfessionalTimeBlock(id: string): Promise<ActionResult> {
  try {
    await requirePermissionAndFeature('appointments:write', FEATURES.APPOINTMENTS);
    const supabase = await createServerClient();
    const { error } = await supabase.rpc('soft_delete_professional_time_block', {
      p_id: id,
    });

    if (error) {
      return {
        success: false,
        error: rpcErrorMessage(error, 'No se pudo eliminar el bloqueo'),
      };
    }

    revalidateAgenda();
    return { success: true };
  } catch (error) {
    return actionError(error);
  }
}
