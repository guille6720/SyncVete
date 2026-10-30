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
import { getAssignableStaff } from '@/actions/appointments';
import { agendaMemberKey } from '@sincvete/shared';
import { z } from 'zod';

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

export async function listProfessionalSchedules(
  input: {
    branchId?: string;
    userId?: string;
  } = {}
): Promise<ProfessionalSchedule[]> {
  await requirePermissionAndFeature('appointments:read', FEATURES.APPOINTMENTS);
  const parsed = professionalScheduleListSchema.parse(input);
  const session = await getSessionContext();
  const supabase = await createServerClient();

  const { data, error } = await supabase.rpc('list_agenda_schedules', {
    p_branch_id: parsed.branchId ?? session?.branchId ?? null,
    p_assignee_id: parsed.userId ?? null,
  });

  if (error) throw error;
  return (data ?? []) as ProfessionalSchedule[];
}

export async function upsertProfessionalSchedule(input: {
  id?: string;
  branchId: string;
  userId: string;
  weekday: number;
  startTime: string;
  endTime: string;
  slotDurationMinutes?: number;
  allowedAppointmentTypes?: string[];
  isActive?: boolean;
}): Promise<ActionResult<ProfessionalSchedule>> {
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
    const member = (await getAssignableStaff()).find(
      (m) => agendaMemberKey(m) === parsed.data.userId && m.branchIds.includes(parsed.data.branchId)
    );
    if (!member)
      return {
        success: false,
        error: 'Profesional no disponible en esta sucursal. Revisá su ficha.',
      };
    const payload = {
      branch_id: parsed.data.branchId,
      organization_id: (await getSessionContext())!.organizationId,
      professional_id: member.professionalId ?? null,
      user_id: member.professionalId ? null : member.userId,
      weekday: parsed.data.weekday,
      start_time: normalizeTime(parsed.data.startTime),
      end_time: normalizeTime(parsed.data.endTime),
      slot_duration_minutes: parsed.data.slotDurationMinutes,
      allowed_appointment_types: parsed.data.allowedAppointmentTypes ?? null,
      is_active: parsed.data.isActive,
    };
    const query = parsed.data.id
      ? supabase.from('professional_schedules').update(payload).eq('id', parsed.data.id)
      : supabase.from('professional_schedules').insert(payload);
    const { data, error } = await query.select('*').single();

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

export async function listProfessionalTimeBlocks(
  input: {
    branchId?: string;
    userId?: string;
    from?: string;
    to?: string;
  } = {}
): Promise<ProfessionalTimeBlock[]> {
  await requirePermissionAndFeature('appointments:read', FEATURES.APPOINTMENTS);
  const parsed = professionalTimeBlockListSchema.parse(input);
  const session = await getSessionContext();
  const supabase = await createServerClient();

  let query = supabase.from('professional_time_blocks').select('*').is('deleted_at', null);
  const branchId = parsed.branchId ?? session?.branchId;
  if (branchId) query = query.eq('branch_id', branchId);
  if (parsed.from) query = query.gte('ends_at', parsed.from);
  if (parsed.to) query = query.lte('starts_at', parsed.to);
  const { data, error } = await query;
  if (error) throw error;
  const member = parsed.userId
    ? (await getAssignableStaff()).find((m) => agendaMemberKey(m) === parsed.userId)
    : null;
  return (data ?? []).filter(
    (b) =>
      !parsed.userId ||
      b.professional_id === parsed.userId ||
      (!b.professional_id && (!b.user_id || b.user_id === (member?.userId || parsed.userId)))
  ) as ProfessionalTimeBlock[];
}

export async function upsertProfessionalTimeBlock(input: {
  branchId: string;
  startsAt: string;
  endsAt: string;
  kind?: string;
  userId?: string;
  reason?: string;
}): Promise<ActionResult<ProfessionalTimeBlock>> {
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
    const member = parsed.data.userId
      ? (await getAssignableStaff()).find(
          (m) =>
            agendaMemberKey(m) === parsed.data.userId && m.branchIds.includes(parsed.data.branchId)
        )
      : null;
    if (parsed.data.userId && !member)
      return {
        success: false,
        error: 'Profesional no disponible en esta sucursal. Revisá su ficha.',
      };
    const { data, error } = await supabase
      .from('professional_time_blocks')
      .insert({
        organization_id: (await getSessionContext())!.organizationId,
        branch_id: parsed.data.branchId,
        starts_at: parsed.data.startsAt,
        ends_at: parsed.data.endsAt,
        kind: parsed.data.kind,
        professional_id: member?.professionalId ?? null,
        user_id: member?.professionalId ? null : member?.userId || null,
        reason: parsed.data.reason ?? null,
      })
      .select('*')
      .single();

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

export type ProfessionalAgendaContext = {
  userId: string;
  professionalId?: string | null;
  fullName: string;
  specialty: string | null;
  schedules: ProfessionalSchedule[];
};
export async function getProfessionalAgendaContext(input: {
  userId: string;
  branchId?: string | null;
}): Promise<ProfessionalAgendaContext | null> {
  await requirePermissionAndFeature('appointments:read', FEATURES.APPOINTMENTS);
  const id = z.string().uuid().parse(input.userId);
  const session = await getSessionContext();
  const branchId = input.branchId || session?.branchId || undefined;
  const member = (await getAssignableStaff()).find(
    (m) => agendaMemberKey(m) === id && (!branchId || m.branchIds.includes(branchId))
  );
  if (!member)
    throw new Error(
      'Profesional no disponible en esta sucursal. Seleccioná otra sucursal o revisá su ficha.'
    );
  const schedules = await listProfessionalSchedules({ userId: id, branchId });
  return {
    userId: id,
    professionalId: member.professionalId,
    fullName: member.fullName,
    specialty: member.specialty ?? null,
    schedules,
  };
}
export type AgendaBusyRange = {
  id: string;
  startsAt: string;
  endsAt: string;
  kind: 'appointment' | 'block';
};
export async function getAgendaBusyRanges(input: {
  assigneeId: string;
  branchId: string;
  date: string;
}): Promise<AgendaBusyRange[]> {
  await requirePermissionAndFeature('appointments:read', FEATURES.APPOINTMENTS);
  const parsed = z
    .object({ assigneeId: z.string().uuid(), branchId: z.string().uuid(), date: z.string().date() })
    .parse(input);
  const { data, error } = await (
    await createServerClient()
  ).rpc('agenda_busy_ranges', {
    p_assignee_id: parsed.assigneeId,
    p_branch_id: parsed.branchId,
    p_date: parsed.date,
  });
  if (error) throw error;
  return (data as unknown as AgendaBusyRange[]) ?? [];
}
