'use server';

import {
  parseWaitingRoomCheckInPreview,
  parseWaitingRoomCheckInRedeemResult,
  parseWaitingRoomCheckInTokenResult,
  waitingRoomCheckInRedeemSchema,
  waitingRoomCheckInSchema,
  waitingRoomCheckInTokenSchema,
  waitingRoomListSchema,
  waitingRoomReorderQueueSchema,
  waitingRoomRemoveSchema,
  waitingRoomNotesSchema,
  waitingRoomReorderSchema,
  waitingRoomUpdateStatusSchema,
  type ActionResult,
  type WaitingRoomCheckInPreview,
  type WaitingRoomCheckInRedeemResult,
  type WaitingRoomCheckInResult,
  type WaitingRoomCheckInTokenResult,
  type WaitingRoomListRow,
  type WaitingRoomMutationResult,
  type WaitingRoomRemoveResult,
  type WaitingRoomReorderQueueResult,
  type PatientWaitingRoomHistoryRow,
  parsePatientWaitingRoomHistoryRows,
  type OwnerWaitingRoomHistoryRow,
  parseOwnerWaitingRoomHistoryRows,
  parsePublicCheckInStatus,
  type PublicCheckInStatus,
} from '@sincvete/shared';
import { createServerClient } from '@/lib/supabase/server';
import {
  PermissionError,
  canPermissionAndFeature,
  requirePermissionAndFeature,
} from '@/lib/permissions';
import { FEATURES, planRestrictionResult } from '@/lib/entitlements';
import { getSessionContext } from '@/actions/auth';
import { revalidateWaitingRoom, revalidateWaitingRoomSurfaces } from '@/lib/cache-revalidate';

function appBaseUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000').replace(/\/$/, '');
}

function isNextRedirect(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'digest' in error &&
    typeof (error as { digest?: unknown }).digest === 'string' &&
    (error as { digest: string }).digest.startsWith('NEXT_REDIRECT')
  );
}

function actionError<T = void>(error: unknown): ActionResult<T> {
  if (isNextRedirect(error)) throw error;
  const planError = planRestrictionResult<T>(error);
  if (planError) return planError;
  if (error instanceof PermissionError) {
    return { success: false, error: error.message };
  }
  console.error(error);
  return { success: false, error: 'Ocurrió un error inesperado' };
}

function rpcErrorMessage(error: { message?: string } | null): string {
  const message = error?.message?.trim();
  if (!message) return 'No se pudo completar la operación';
  return message.replace(/^.*ERROR:\s*/i, '').replace(/\s+CONTEXT:[\s\S]*$/i, '');
}

export async function canReadWaitingRoom(): Promise<boolean> {
  return canPermissionAndFeature('waiting_room:read', FEATURES.WAITING_ROOM);
}

export async function canManageWaitingRoom(): Promise<boolean> {
  return canPermissionAndFeature('waiting_room:write', FEATURES.WAITING_ROOM);
}

export async function listWaitingRoom(input: {
  branchId?: string;
  date?: string;
} = {}): Promise<WaitingRoomListRow[]> {
  await requirePermissionAndFeature('waiting_room:read', FEATURES.WAITING_ROOM);
  const parsed = waitingRoomListSchema.parse(input);
  const session = await getSessionContext();
  const supabase = await createServerClient();

  const { data, error } = await supabase.rpc('list_waiting_room', {
    p_branch_id:
      parsed.branchId === 'all'
        ? null
        : parsed.branchId ?? session?.branchId ?? null,
    p_date: parsed.date ?? null,
  });

  if (error) throw error;
  return (data ?? []) as WaitingRoomListRow[];
}

export async function checkInAppointment(
  appointmentId: string
): Promise<ActionResult<WaitingRoomCheckInResult>> {
  try {
    await requirePermissionAndFeature('waiting_room:write', FEATURES.WAITING_ROOM);
    const parsed = waitingRoomCheckInSchema.safeParse({ appointmentId });
    if (!parsed.success) {
      return { success: false, error: 'Cita inválida' };
    }

    const supabase = await createServerClient();
    const { data, error } = await supabase.rpc('check_in_appointment', {
      p_appointment_id: parsed.data.appointmentId,
    });

    if (error) {
      return { success: false, error: rpcErrorMessage(error) };
    }

    const entry = data as unknown as WaitingRoomCheckInResult;
    revalidateWaitingRoomSurfaces(entry.appointment_id);
    return { success: true, data: entry };
  } catch (error) {
    return actionError<WaitingRoomCheckInResult>(error);
  }
}

export async function updateWaitingRoomStatus(input: {
  entryId: string;
  newStatus: string;
  room?: string;
}): Promise<ActionResult<WaitingRoomMutationResult>> {
  try {
    await requirePermissionAndFeature('waiting_room:write', FEATURES.WAITING_ROOM);
    const parsed = waitingRoomUpdateStatusSchema.safeParse(input);
    if (!parsed.success) {
      return {
        success: false,
        error: 'Datos inválidos',
        fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
      };
    }

    const supabase = await createServerClient();
    const { data, error } = await supabase.rpc('update_waiting_room_status', {
      p_entry_id: parsed.data.entryId,
      p_new_status: parsed.data.newStatus,
      p_room: parsed.data.room ?? null,
    });

    if (error) {
      return { success: false, error: rpcErrorMessage(error) };
    }

    const result = data as unknown as WaitingRoomMutationResult;
    revalidateWaitingRoomSurfaces(result.appointment_id);
    return { success: true, data: result };
  } catch (error) {
    return actionError<WaitingRoomMutationResult>(error);
  }
}

export async function reorderWaitingRoom(input: {
  entryId: string;
  queuePosition?: number;
  priority?: number;
}): Promise<ActionResult<WaitingRoomMutationResult>> {
  try {
    await requirePermissionAndFeature('waiting_room:write', FEATURES.WAITING_ROOM);
    const parsed = waitingRoomReorderSchema.safeParse(input);
    if (!parsed.success) {
      return {
        success: false,
        error: 'Datos inválidos',
        fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
      };
    }

    const supabase = await createServerClient();
    const { data, error } = await supabase.rpc('reorder_waiting_room', {
      p_entry_id: parsed.data.entryId,
      p_queue_position: parsed.data.queuePosition ?? null,
      p_priority: parsed.data.priority ?? null,
    });

    if (error) {
      return { success: false, error: rpcErrorMessage(error) };
    }

    revalidateWaitingRoom();
    return { success: true, data: data as unknown as WaitingRoomMutationResult };
  } catch (error) {
    return actionError<WaitingRoomMutationResult>(error);
  }
}

export async function reorderWaitingRoomQueue(
  orderedEntryIds: string[]
): Promise<ActionResult<WaitingRoomReorderQueueResult>> {
  try {
    await requirePermissionAndFeature('waiting_room:write', FEATURES.WAITING_ROOM);
    const parsed = waitingRoomReorderQueueSchema.safeParse({ orderedEntryIds });
    if (!parsed.success) {
      return {
        success: false,
        error: 'Orden inválido',
        fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
      };
    }

    const supabase = await createServerClient();
    const { data, error } = await supabase.rpc('reorder_waiting_room_queue', {
      p_ordered_entry_ids: parsed.data.orderedEntryIds,
    });

    if (error) {
      return { success: false, error: rpcErrorMessage(error) };
    }

    const raw = (data ?? {}) as { updated?: number; ordered_ids?: string[] };
    revalidateWaitingRoom();
    return {
      success: true,
      data: {
        updated: Number(raw.updated ?? parsed.data.orderedEntryIds.length),
        ordered_ids: Array.isArray(raw.ordered_ids)
          ? raw.ordered_ids.map(String)
          : parsed.data.orderedEntryIds,
      },
    };
  } catch (error) {
    return actionError<WaitingRoomReorderQueueResult>(error);
  }
}

export async function removeWaitingRoomEntry(input: {
  entryId: string;
  markAusente?: boolean;
}): Promise<ActionResult<WaitingRoomRemoveResult>> {
  try {
    await requirePermissionAndFeature('waiting_room:write', FEATURES.WAITING_ROOM);
    const parsed = waitingRoomRemoveSchema.safeParse(input);
    if (!parsed.success) {
      return {
        success: false,
        error: 'Datos inválidos',
        fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
      };
    }

    const supabase = await createServerClient();
    const { data, error } = await supabase.rpc('remove_waiting_room_entry', {
      p_entry_id: parsed.data.entryId,
      p_mark_ausente: parsed.data.markAusente ?? false,
    });

    if (error) {
      return { success: false, error: rpcErrorMessage(error) };
    }

    const raw = (data ?? {}) as Partial<WaitingRoomRemoveResult>;
    if (!raw.id || !raw.appointment_id) {
      return { success: false, error: 'No se pudo quitar la entrada' };
    }

    revalidateWaitingRoomSurfaces(raw.appointment_id);
    return {
      success: true,
      data: {
        id: String(raw.id),
        appointment_id: String(raw.appointment_id),
        deleted_at: String(raw.deleted_at ?? new Date().toISOString()),
        marked_ausente: Boolean(raw.marked_ausente),
      },
    };
  } catch (error) {
    return actionError<WaitingRoomRemoveResult>(error);
  }
}

export async function updateWaitingRoomNotes(input: {
  entryId: string;
  notes?: string | null;
}): Promise<ActionResult<{ id: string; appointment_id: string; internal_notes: string | null }>> {
  try {
    await requirePermissionAndFeature('waiting_room:write', FEATURES.WAITING_ROOM);
    const parsed = waitingRoomNotesSchema.safeParse(input);
    if (!parsed.success) {
      return {
        success: false,
        error: 'Datos inválidos',
        fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
      };
    }

    const supabase = await createServerClient();
    const { data, error } = await supabase.rpc('update_waiting_room_notes', {
      p_entry_id: parsed.data.entryId,
      p_notes: parsed.data.notes,
    });

    if (error) {
      return { success: false, error: rpcErrorMessage(error) };
    }

    const raw = (data ?? {}) as {
      id?: string;
      appointment_id?: string;
      internal_notes?: string | null;
    };
    if (!raw.id || !raw.appointment_id) {
      return { success: false, error: 'No se pudo guardar la nota' };
    }

    revalidateWaitingRoom();
    return {
      success: true,
      data: {
        id: String(raw.id),
        appointment_id: String(raw.appointment_id),
        internal_notes: raw.internal_notes ?? null,
      },
    };
  } catch (error) {
    return actionError(error);
  }
}

export async function createAppointmentCheckInToken(
  appointmentId: string
): Promise<ActionResult<WaitingRoomCheckInTokenResult>> {
  try {
    await requirePermissionAndFeature('waiting_room:write', FEATURES.WAITING_ROOM);
    const parsed = waitingRoomCheckInTokenSchema.safeParse({ appointmentId });
    if (!parsed.success) {
      return { success: false, error: 'Cita inválida' };
    }

    const supabase = await createServerClient();
    const { data, error } = await supabase.rpc('create_appointment_check_in_token', {
      p_appointment_id: parsed.data.appointmentId,
    });

    if (error) {
      return { success: false, error: rpcErrorMessage(error) };
    }

    const token = parseWaitingRoomCheckInTokenResult(data, appBaseUrl());
    if (!token) {
      return { success: false, error: 'No se pudo generar el código QR' };
    }
    return { success: true, data: token };
  } catch (error) {
    return actionError<WaitingRoomCheckInTokenResult>(error);
  }
}

export async function previewAppointmentCheckIn(
  token: string
): Promise<WaitingRoomCheckInPreview> {
  const parsed = waitingRoomCheckInRedeemSchema.safeParse({ token });
  if (!parsed.success) {
    return { valid: false, reason: 'invalid_token' };
  }

  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc('preview_appointment_check_in', {
    p_token: parsed.data.token,
  });
  if (error) {
    console.error('[waiting-room] preview_appointment_check_in', error.message);
    return { valid: false, reason: 'preview_failed' };
  }
  return parseWaitingRoomCheckInPreview(data);
}

export async function getPublicCheckInStatus(token: string): Promise<PublicCheckInStatus> {
  const parsed = waitingRoomCheckInRedeemSchema.safeParse({ token });
  if (!parsed.success) {
    return { valid: false, reason: 'invalid_token' };
  }

  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc('get_public_check_in_status', {
    p_token: parsed.data.token,
  });
  if (error) {
    console.error('[waiting-room] get_public_check_in_status', error.message);
    return { valid: false, reason: 'status_failed' };
  }
  return parsePublicCheckInStatus(data);
}

export async function redeemAppointmentCheckIn(
  token: string
): Promise<ActionResult<WaitingRoomCheckInRedeemResult>> {
  try {
    const parsed = waitingRoomCheckInRedeemSchema.safeParse({ token });
    if (!parsed.success) {
      return { success: false, error: 'Código inválido' };
    }

    const supabase = await createServerClient();
    const { data, error } = await supabase.rpc('redeem_appointment_check_in', {
      p_token: parsed.data.token,
    });

    if (error) {
      return { success: false, error: rpcErrorMessage(error) };
    }

    const entry = parseWaitingRoomCheckInRedeemResult(data);
    if (!entry) {
      return { success: false, error: 'No se pudo completar el check-in' };
    }

    revalidateWaitingRoomSurfaces(entry.appointment_id);
    return { success: true, data: entry };
  } catch (error) {
    return actionError<WaitingRoomCheckInRedeemResult>(error);
  }
}

export async function listPatientWaitingRoomHistory(
  patientId: string,
  limit = 8
): Promise<PatientWaitingRoomHistoryRow[]> {
  await requirePermissionAndFeature('waiting_room:read', FEATURES.WAITING_ROOM);
  const session = await getSessionContext();
  if (!session?.permissions.includes('patients:read')) {
    return [];
  }

  const safeLimit = Math.min(Math.max(Math.trunc(limit), 1), 20);
  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc('list_patient_waiting_room_history', {
    p_patient_id: patientId,
    p_limit: safeLimit,
  });

  if (error) {
    console.error('[waiting-room] list_patient_waiting_room_history', error.message);
    return [];
  }

  return parsePatientWaitingRoomHistoryRows(data);
}

export async function listOwnerWaitingRoomHistory(
  ownerId: string,
  limit = 8
): Promise<OwnerWaitingRoomHistoryRow[]> {
  await requirePermissionAndFeature('waiting_room:read', FEATURES.WAITING_ROOM);
  const session = await getSessionContext();
  if (!session?.permissions.includes('patients:read')) {
    return [];
  }

  const safeLimit = Math.min(Math.max(Math.trunc(limit), 1), 20);
  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc('list_owner_waiting_room_history', {
    p_owner_id: ownerId,
    p_limit: safeLimit,
  });

  if (error) {
    console.error('[waiting-room] list_owner_waiting_room_history', error.message);
    return [];
  }

  return parseOwnerWaitingRoomHistoryRows(data);
}
