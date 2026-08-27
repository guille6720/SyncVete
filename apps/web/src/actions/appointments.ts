'use server';

import { redirect } from 'next/navigation';
import {
  appointmentListSchema,
  appointmentRescheduleSchema,
  appointmentSchema,
  computeEndTime,
  fromLocalDateTimeInput,
  type ActionResult,
  type Appointment,
  type AppointmentListRow,
  type AppointmentStatus,
  type AppointmentStatusEvent,
  type AssignableStaffMember,
  type ConsultationMode,
  type PaymentMethod,
  type Role,
} from '@sincvete/shared';
import { createServerClient } from '@/lib/supabase/server';
import { PermissionError, requirePermission, requirePermissionAndFeature, canPermissionAndFeature } from '@/lib/permissions';
import { getSessionContext } from '@/actions/auth';
import {
  revalidateAgenda,
  revalidateDashboard,
  revalidateWaitingRoomSurfaces,
} from '@/lib/cache-revalidate';
import { APPOINTMENT_COLUMNS } from '@/lib/db-columns';
import { FEATURES, planRestrictionResult } from '@/lib/entitlements';
import { cache } from 'react';

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

function rpcErrorMessage(error: { message?: string; code?: string; details?: string } | null, fallback: string): string {
  const message = error?.message?.trim();
  if (!message) return fallback;
  const cleaned = message.replace(/^.*ERROR:\s*/i, '').replace(/\s+CONTEXT:[\s\S]*$/i, '');
  if (cleaned.includes('Horario no disponible') || cleaned.includes('Horario inválido')) {
    return cleaned;
  }
  // Schema drift (Preview UI + Production DB without new columns)
  if (
    /column .* does not exist/i.test(cleaned) ||
    /Could not find the/i.test(cleaned) ||
    error?.code === 'PGRST204'
  ) {
    return 'La base de datos no tiene el esquema de agenda actualizado. Pedile al equipo que aplique la migración en este entorno.';
  }
  if (/appointments_expected_payment_method_check/i.test(cleaned)) {
    return 'El medio de pago elegido no es válido. Probá de nuevo o elegí otra opción.';
  }
  if (cleaned.length > 0 && cleaned.length < 220) {
    return cleaned;
  }
  return fallback;
}

function formString(formData: FormData, key: string): string | undefined {
  const value = formData.get(key);
  if (typeof value !== 'string') return undefined;
  return value;
}

function parseAppointmentForm(formData: FormData) {
  const startsAtRaw = formString(formData, 'startsAt');
  const startsAt =
    startsAtRaw && startsAtRaw.includes('T') && !startsAtRaw.endsWith('Z')
      ? fromLocalDateTimeInput(startsAtRaw)
      : startsAtRaw;

  return appointmentSchema.safeParse({
    patientId: formString(formData, 'patientId'),
    ownerId: formString(formData, 'ownerId'),
    assignedUserId: formString(formData, 'assignedUserId'),
    startsAt,
    durationMinutes: formString(formData, 'durationMinutes') || 30,
    appointmentType: formString(formData, 'appointmentType') || 'consulta',
    title: formString(formData, 'title') ?? '',
    notes: formString(formData, 'notes') ?? '',
    branchId: formString(formData, 'branchId'),
    status: formString(formData, 'status') || undefined,
    cancellationReason: formString(formData, 'cancellationReason') ?? '',
    consultationMode: formString(formData, 'consultationMode') || undefined,
    expectedPaymentMethod: formString(formData, 'expectedPaymentMethod') || undefined,
    room: formString(formData, 'room') ?? '',
    // Checkboxes: absent from FormData when unchecked.
    remind24h: formData.has('remind24h'),
    remind2h: formData.has('remind2h'),
    remindConfirmation: formData.has('remindConfirmation'),
  });
}

function appointmentWritePayload(data: {
  consultationMode?: ConsultationMode;
  expectedPaymentMethod?: PaymentMethod;
  room?: string;
  remind24h?: boolean;
  remind2h?: boolean;
  remindConfirmation?: boolean;
}) {
  return {
    ...(data.consultationMode !== undefined
      ? { consultation_mode: data.consultationMode }
      : {}),
    ...(data.expectedPaymentMethod !== undefined
      ? { expected_payment_method: data.expectedPaymentMethod }
      : {}),
    ...(data.room !== undefined ? { room: data.room } : {}),
    ...(data.remind24h !== undefined ? { remind_24h: data.remind24h } : {}),
    ...(data.remind2h !== undefined ? { remind_2h: data.remind2h } : {}),
    ...(data.remindConfirmation !== undefined
      ? { remind_confirmation: data.remindConfirmation }
      : {}),
  };
}

/**
 * When expected payment is free, close a stuck waiting-room "payment_pending"
 * so Agenda no longer shows "Pago pendiente".
 */
async function completeWaitingRoomIfPaymentFree(appointmentId: string) {
  try {
    const session = await getSessionContext();
    if (!session?.permissions.includes('waiting_room:write')) return;

    const supabase = await createServerClient();
    const { data: entry, error } = await supabase
      .from('waiting_room_entries')
      .select('id, status')
      .eq('appointment_id', appointmentId)
      .is('deleted_at', null)
      .maybeSingle();

    if (error || !entry || entry.status !== 'payment_pending') return;

    const { error: updateError } = await supabase.rpc('update_waiting_room_status', {
      p_entry_id: entry.id,
      p_new_status: 'completed',
      p_room: null,
    });
    if (updateError) {
      console.error('completeWaitingRoomIfPaymentFree', updateError);
      return;
    }
    revalidateWaitingRoomSurfaces(appointmentId);
  } catch (error) {
    console.error('completeWaitingRoomIfPaymentFree', error);
  }
}

async function enqueueReminderJobsSoft(appointmentId: string) {
  try {
    const supabase = await createServerClient();
    const { error } = await supabase.rpc('enqueue_appointment_reminder_jobs', {
      p_appointment_id: appointmentId,
    });
    if (error) {
      console.error('enqueue_appointment_reminder_jobs', error);
    }
  } catch (error) {
    // Soft-fail: reminder enqueue must not block appointment create.
    console.error('enqueue_appointment_reminder_jobs', error);
  }
}

export async function listAppointments(
  input: {
    weekStart: string;
    branchId?: string;
    status?: string;
    assignedUserId?: string;
  }
): Promise<AppointmentListRow[]> {
  await requirePermission('appointments:read');
  const parsed = appointmentListSchema.parse(input);
  if (!parsed.weekStart) {
    throw new Error('weekStart es requerido');
  }
  const session = await getSessionContext();
  const supabase = await createServerClient();

  const { data, error } = await supabase.rpc('list_appointments_range', {
    p_week_start: parsed.weekStart,
    p_branch_id: parsed.branchId ?? session?.branchId ?? null,
    p_status: parsed.status ?? null,
    p_assigned_user_id: parsed.assignedUserId ?? null,
  });

  if (error) throw error;
  return (data ?? []) as AppointmentListRow[];
}

export async function listAppointmentsCalendar(input: {
  from: string;
  to: string;
  branchId?: string;
  status?: string;
  assignedUserId?: string;
  query?: string;
}): Promise<AppointmentListRow[]> {
  await requirePermissionAndFeature('appointments:read', FEATURES.APPOINTMENTS);
  const parsed = appointmentListSchema.parse(input);
  if (!parsed.from || !parsed.to) {
    throw new Error('from y to son requeridos');
  }
  const session = await getSessionContext();
  const supabase = await createServerClient();

  const { data, error } = await supabase.rpc('list_appointments_calendar', {
    p_from: parsed.from,
    p_to: parsed.to,
    p_branch_id: parsed.branchId ?? session?.branchId ?? null,
    p_status: parsed.status ?? null,
    p_assigned_user_id: parsed.assignedUserId ?? null,
    p_query: parsed.query ?? null,
  });

  if (error) throw error;
  return (data ?? []) as AppointmentListRow[];
}

export async function getAppointment(id: string): Promise<AppointmentListRow | null> {
  await requirePermission('appointments:read');
  const supabase = await createServerClient();

  const { data: appointment, error } = await supabase
    .from('appointments')
    .select(APPOINTMENT_COLUMNS)
    .eq('id', id)
    .is('deleted_at', null)
    .single();

  if (error || !appointment) return null;

  const [{ data: patient }, { data: owner }, profileResult] = await Promise.all([
    supabase.from('patients').select('name, species').eq('id', appointment.patient_id).single(),
    supabase.from('owners').select('full_name').eq('id', appointment.owner_id).single(),
    appointment.assigned_user_id
      ? supabase.from('profiles').select('full_name').eq('id', appointment.assigned_user_id).single()
      : Promise.resolve({ data: null }),
  ]);

  if (!patient || !owner) return null;

  return {
    ...(appointment as Appointment),
    patient_name: patient.name,
    patient_species: patient.species as AppointmentListRow['patient_species'],
    owner_full_name: owner.full_name,
    assigned_user_name: profileResult.data?.full_name ?? null,
  };
}

export async function createAppointment(
  _prev: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  try {
    const session = await requirePermissionAndFeature('appointments:write', FEATURES.APPOINTMENTS);
    const parsed = parseAppointmentForm(formData);

    if (!parsed.success) {
      const fieldErrors = parsed.error.flatten().fieldErrors as Record<string, string[]>;
      const firstError = Object.values(fieldErrors).flat()[0];
      return {
        success: false,
        error: firstError ?? 'Datos inválidos',
        fieldErrors,
      };
    }

    const branchId = parsed.data.branchId ?? session.branchId;
    if (!branchId) {
      return { success: false, error: 'Seleccioná una sucursal activa' };
    }

    const startsAt = parsed.data.startsAt;
    const endsAt = computeEndTime(startsAt, parsed.data.durationMinutes);

    const supabase = await createServerClient();
    const { data, error } = await supabase
      .from('appointments')
      .insert({
        organization_id: session.organizationId,
        branch_id: branchId,
        patient_id: parsed.data.patientId,
        owner_id: parsed.data.ownerId,
        assigned_user_id: parsed.data.assignedUserId ?? null,
        starts_at: startsAt,
        ends_at: endsAt,
        appointment_type: parsed.data.appointmentType,
        title: parsed.data.title ?? null,
        notes: parsed.data.notes ?? null,
        status: 'programada',
        ...appointmentWritePayload(parsed.data),
      })
      .select('id')
      .single();

    if (error) {
      console.error('[createAppointment]', error);
      return {
        success: false,
        error: rpcErrorMessage(error, 'No se pudo crear la cita'),
      };
    }

    await enqueueReminderJobsSoft(data.id);

    revalidateAgenda(data.id);
    revalidateDashboard();
    redirect(`/agenda/${data.id}`);
  } catch (error) {
    return actionError(error);
  }
}

export async function updateAppointment(
  appointmentId: string,
  _prev: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  try {
    await requirePermissionAndFeature('appointments:write', FEATURES.APPOINTMENTS);
    const parsed = parseAppointmentForm(formData);

    if (!parsed.success) {
      const fieldErrors = parsed.error.flatten().fieldErrors as Record<string, string[]>;
      const firstError = Object.values(fieldErrors).flat()[0];
      return {
        success: false,
        error: firstError ?? 'Datos inválidos',
        fieldErrors,
      };
    }

    const startsAt = parsed.data.startsAt;
    const endsAt = computeEndTime(startsAt, parsed.data.durationMinutes);

    const supabase = await createServerClient();
    const { error } = await supabase
      .from('appointments')
      .update({
        branch_id: parsed.data.branchId,
        patient_id: parsed.data.patientId,
        owner_id: parsed.data.ownerId,
        assigned_user_id: parsed.data.assignedUserId ?? null,
        starts_at: startsAt,
        ends_at: endsAt,
        appointment_type: parsed.data.appointmentType,
        title: parsed.data.title ?? null,
        notes: parsed.data.notes ?? null,
        status: parsed.data.status,
        cancellation_reason: parsed.data.cancellationReason ?? null,
        ...appointmentWritePayload(parsed.data),
      })
      .eq('id', appointmentId);

    if (error) {
      return {
        success: false,
        error: rpcErrorMessage(error, 'No se pudo actualizar la cita'),
      };
    }

    if (parsed.data.expectedPaymentMethod === 'gratuito') {
      await completeWaitingRoomIfPaymentFree(appointmentId);
    }

    revalidateAgenda(appointmentId);
    return { success: true };
  } catch (error) {
    return actionError(error);
  }
}

export async function rescheduleAppointment(
  id: string,
  startsAt: string,
  durationMinutes: number
): Promise<ActionResult> {
  try {
    await requirePermissionAndFeature('appointments:write', FEATURES.APPOINTMENTS);
    const parsed = appointmentRescheduleSchema.safeParse({ id, startsAt, durationMinutes });
    if (!parsed.success) {
      const fieldErrors = parsed.error.flatten().fieldErrors as Record<string, string[]>;
      const firstError = Object.values(fieldErrors).flat()[0];
      return {
        success: false,
        error: firstError ?? 'Datos inválidos',
        fieldErrors,
      };
    }

    const endsAt = computeEndTime(parsed.data.startsAt, parsed.data.durationMinutes);
    const supabase = await createServerClient();
    const { error } = await supabase
      .from('appointments')
      .update({
        starts_at: parsed.data.startsAt,
        ends_at: endsAt,
      })
      .eq('id', parsed.data.id)
      .is('deleted_at', null);

    if (error) {
      return {
        success: false,
        error: rpcErrorMessage(error, 'No se pudo reprogramar la cita'),
      };
    }

    revalidateAgenda(parsed.data.id);
    return { success: true };
  } catch (error) {
    return actionError(error);
  }
}

export async function listAppointmentStatusEvents(
  appointmentId: string
): Promise<AppointmentStatusEvent[]> {
  await requirePermissionAndFeature('appointments:read', FEATURES.APPOINTMENTS);
  const supabase = await createServerClient();

  const { data, error } = await supabase.rpc('list_appointment_status_events', {
    p_appointment_id: appointmentId,
  });

  if (error) throw error;
  return (data ?? []) as AppointmentStatusEvent[];
}

export async function updateAppointmentStatus(
  appointmentId: string,
  status: AppointmentStatus,
  cancellationReason?: string
): Promise<ActionResult> {
  try {
    await requirePermissionAndFeature('appointments:write', FEATURES.APPOINTMENTS);
    const supabase = await createServerClient();

    const { error } = await supabase
      .from('appointments')
      .update({
        status,
        cancellation_reason:
          status === 'cancelada' ? cancellationReason ?? 'Cancelada' : null,
      })
      .eq('id', appointmentId);

    if (error) {
      return { success: false, error: 'No se pudo actualizar el estado' };
    }

    if (status === 'completada' || status === 'ausente' || status === 'cancelada') {
      revalidateWaitingRoomSurfaces(appointmentId);
    } else {
      revalidateAgenda(appointmentId);
    }
    return { success: true };
  } catch (error) {
    return actionError(error);
  }
}

export async function deleteAppointment(appointmentId: string): Promise<ActionResult> {
  try {
    await requirePermissionAndFeature('appointments:write', FEATURES.APPOINTMENTS);
    const supabase = await createServerClient();

    const { data, error } = await supabase
      .from('appointments')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', appointmentId)
      .is('deleted_at', null)
      .select('id');

    if (error) {
      return {
        success: false,
        error: rpcErrorMessage(error, 'No se pudo eliminar la cita'),
      };
    }
    if (!data?.length) {
      return {
        success: false,
        error: 'No se pudo eliminar la cita. Puede que ya esté eliminada o no tengas permiso.',
      };
    }

    revalidateAgenda();
    revalidateDashboard();
    return { success: true };
  } catch (error) {
    return actionError(error);
  }
}

/** Request-scoped staff list for agenda forms (not patient PHI). */
const loadAssignableStaff = cache(async (): Promise<AssignableStaffMember[]> => {
  await requirePermission('appointments:read');
  const session = await getSessionContext();
  if (!session) return [];

  const supabase = await createServerClient();
  let query = supabase
    .from('branch_members')
    .select('user_id, role')
    .eq('organization_id', session.organizationId)
    .eq('is_active', true)
    .is('deleted_at', null);

  if (session.branchId) {
    query = query.eq('branch_id', session.branchId);
  }

  const { data: members, error } = await query;
  if (error || !members?.length) return [];

  const userIds = [...new Set(members.map((m) => m.user_id))];
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, full_name')
    .in('id', userIds);

  const profileMap = new Map((profiles ?? []).map((p) => [p.id, p.full_name]));

  return members.map((member) => ({
    userId: member.user_id,
    fullName: profileMap.get(member.user_id) ?? 'Sin nombre',
    role: member.role as Role,
  }));
});

export async function getAssignableStaff(): Promise<AssignableStaffMember[]> {
  return loadAssignableStaff();
}

export async function canManageAppointments(): Promise<boolean> {
  return canPermissionAndFeature('appointments:write', FEATURES.APPOINTMENTS);
}

export async function canReadAppointments(): Promise<boolean> {
  return canPermissionAndFeature('appointments:read', FEATURES.APPOINTMENTS);
}
