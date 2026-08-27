'use server';

import {
  waitlistEntrySchema,
  waitlistListSchema,
  waitlistMatchSchema,
  waitlistStatusUpdateSchema,
  type ActionResult,
  type WaitlistEntry,
  type WaitlistStatus,
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

export async function listWaitlist(input: {
  branchId?: string;
  status?: WaitlistStatus;
} = {}): Promise<WaitlistEntry[]> {
  await requirePermissionAndFeature('appointments:read', FEATURES.APPOINTMENTS);
  const parsed = waitlistListSchema.parse(input);
  const session = await getSessionContext();
  const supabase = await createServerClient();

  const { data, error } = await supabase.rpc('list_waitlist', {
    p_branch_id: parsed.branchId ?? session?.branchId ?? null,
    p_status: parsed.status ?? null,
  });

  if (error) throw error;
  return (data ?? []) as WaitlistEntry[];
}

export async function createWaitlistEntry(
  input: {
    branchId: string;
    ownerId: string;
    patientId: string;
    appointmentType?: string;
    preferredUserId?: string;
    preferredWeekdays?: number[] | string;
    preferredTimeStart?: string;
    preferredTimeEnd?: string;
    priority?: number;
    notes?: string;
  }
): Promise<ActionResult<WaitlistEntry>> {
  try {
    await requirePermissionAndFeature('appointments:write', FEATURES.APPOINTMENTS);
    const parsed = waitlistEntrySchema.safeParse(input);
    if (!parsed.success) {
      return {
        success: false,
        error: 'Datos inválidos',
        fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
      };
    }

    const supabase = await createServerClient();
    const { data, error } = await supabase.rpc('create_waitlist_entry', {
      p_branch_id: parsed.data.branchId,
      p_owner_id: parsed.data.ownerId,
      p_patient_id: parsed.data.patientId,
      p_appointment_type: parsed.data.appointmentType,
      p_preferred_user_id: parsed.data.preferredUserId ?? null,
      p_preferred_weekdays: parsed.data.preferredWeekdays ?? null,
      p_preferred_time_start: parsed.data.preferredTimeStart ?? null,
      p_preferred_time_end: parsed.data.preferredTimeEnd ?? null,
      p_priority: parsed.data.priority,
      p_notes: parsed.data.notes ?? null,
    });

    if (error) {
      return {
        success: false,
        error: rpcErrorMessage(error, 'No se pudo crear la lista de espera'),
      };
    }

    revalidateAgenda();
    return { success: true, data: data as unknown as WaitlistEntry };
  } catch (error) {
    return actionError<WaitlistEntry>(error);
  }
}

export async function updateWaitlistStatus(input: {
  id: string;
  status: WaitlistStatus;
  matchedAppointmentId?: string;
}): Promise<ActionResult<{ id: string; status: WaitlistStatus }>> {
  try {
    await requirePermissionAndFeature('appointments:write', FEATURES.APPOINTMENTS);
    const parsed = waitlistStatusUpdateSchema.safeParse(input);
    if (!parsed.success) {
      return {
        success: false,
        error: 'Datos inválidos',
        fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
      };
    }

    const supabase = await createServerClient();
    const { data, error } = await supabase.rpc('update_waitlist_status', {
      p_id: parsed.data.id,
      p_status: parsed.data.status,
      p_matched_appointment_id: parsed.data.matchedAppointmentId ?? null,
    });

    if (error) {
      return {
        success: false,
        error: rpcErrorMessage(error, 'No se pudo actualizar la lista de espera'),
      };
    }

    revalidateAgenda();
    return {
      success: true,
      data: data as unknown as { id: string; status: WaitlistStatus },
    };
  } catch (error) {
    return actionError<{ id: string; status: WaitlistStatus }>(error);
  }
}

export async function deleteWaitlistEntry(id: string): Promise<ActionResult> {
  try {
    await requirePermissionAndFeature('appointments:write', FEATURES.APPOINTMENTS);
    const supabase = await createServerClient();
    const { error } = await supabase
      .from('appointment_waitlist')
      .update({ deleted_at: new Date().toISOString(), status: 'cancelled' })
      .eq('id', id)
      .is('deleted_at', null);

    if (error) {
      return {
        success: false,
        error: rpcErrorMessage(error, 'No se pudo eliminar la entrada'),
      };
    }

    revalidateAgenda();
    return { success: true };
  } catch (error) {
    return actionError(error);
  }
}

export async function matchWaitlistForSlot(input: {
  startsAt: string;
  endsAt: string;
  branchId: string;
  assignedUserId?: string;
  appointmentType?: string;
}): Promise<WaitlistEntry[]> {
  await requirePermissionAndFeature('appointments:read', FEATURES.APPOINTMENTS);
  const parsed = waitlistMatchSchema.parse(input);
  const supabase = await createServerClient();

  const { data, error } = await supabase.rpc('match_waitlist_for_slot', {
    p_starts_at: parsed.startsAt,
    p_ends_at: parsed.endsAt,
    p_branch_id: parsed.branchId,
    p_assigned_user_id: parsed.assignedUserId ?? null,
    p_appointment_type: parsed.appointmentType ?? null,
  });

  if (error) throw error;
  return (data ?? []) as WaitlistEntry[];
}
