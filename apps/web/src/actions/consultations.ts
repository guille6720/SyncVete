'use server';

import { redirect } from 'next/navigation';
import {
  buildPaginatedResult,
  consultationListSchema,
  consultationSoapSchema,
  consultationStartSchema,
  type ActionResult,
  type Consultation,
  type ConsultationListRow,
  type ConsultationQueueItem,
  type PaginatedResult,
} from '@sincvete/shared';
import { createServerClient } from '@/lib/supabase/server';
import { PermissionError, requirePermission, requirePermissionAndFeature, canPermissionAndFeature } from '@/lib/permissions';
import { getSessionContext } from '@/actions/auth';
import { FEATURES, planRestrictionResult, canUseFeature } from '@/lib/entitlements';
import {
  revalidateAgenda,
  revalidateClinicalEntry,
  revalidateConsultation,
  revalidateConsultationDetail,
  revalidatePatientHistoria,
  revalidateWaitingRoomSurfaces,
} from '@/lib/cache-revalidate';
import { CONSULTATION_COLUMNS } from '@/lib/db-columns';

function isNextRedirect(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'digest' in error &&
    typeof (error as { digest?: string }).digest === 'string' &&
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

function parseSoapForm(formData: FormData) {
  return consultationSoapSchema.safeParse({
    title: formData.get('title'),
    anamnesis: formData.get('anamnesis'),
    physicalExam: formData.get('physicalExam'),
    diagnosis: formData.get('diagnosis'),
    treatment: formData.get('treatment'),
    plan: formData.get('plan'),
    weightKg: formData.get('weightKg'),
    temperatureC: formData.get('temperatureC'),
    notes: formData.get('notes'),
  });
}

function toConsultationListRow(
  row: ConsultationListRow & { total_count?: number }
): ConsultationListRow {
  const { total_count: _total, ...entry } = row;
  void _total;
  return {
    ...entry,
    weight_kg: entry.weight_kg != null ? Number(entry.weight_kg) : null,
    temperature_c: entry.temperature_c != null ? Number(entry.temperature_c) : null,
    deleted_at: entry.deleted_at ?? null,
  };
}

export async function listConsultationQueue(): Promise<ConsultationQueueItem[]> {
  const session = await getSessionContext();
  if (
    !session ||
    (!session.permissions.includes('clinical:read') &&
      !session.permissions.includes('appointments:read'))
  ) {
    throw new PermissionError();
  }

  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc('list_consultation_queue', {
    p_branch_id: session.branchId ?? null,
  });

  if (error) throw error;
  return (data ?? []) as ConsultationQueueItem[];
}

export async function listConsultations(
  input: {
    page?: number;
    pageSize?: number;
    search?: string;
    patientId?: string;
    branchId?: string;
    status?: string;
  } = {}
): Promise<PaginatedResult<ConsultationListRow>> {
  await requirePermission('clinical:read');
  const parsed = consultationListSchema.parse(input);
  const session = await getSessionContext();
  const supabase = await createServerClient();

  const { data, error } = await supabase.rpc('search_consultations', {
    p_search: parsed.search?.trim() || null,
    p_patient_id: parsed.patientId || null,
    p_branch_id: parsed.branchId ?? session?.branchId ?? null,
    p_status: parsed.status || null,
    p_page: parsed.page,
    p_page_size: parsed.pageSize,
  });

  if (error) throw error;

  const rows = data ?? [];
  const total = rows[0]?.total_count ?? 0;
  const consultations = rows.map((row) =>
    toConsultationListRow(row as ConsultationListRow & { total_count: number })
  );

  return buildPaginatedResult(consultations, Number(total), parsed.page, parsed.pageSize);
}

export async function getConsultation(id: string): Promise<ConsultationListRow | null> {
  await requirePermission('clinical:read');
  const supabase = await createServerClient();

  const { data: consultation, error } = await supabase
    .from('consultations')
    .select(CONSULTATION_COLUMNS)
    .eq('id', id)
    .is('deleted_at', null)
    .single();

  if (error || !consultation) return null;

  const [{ data: patient }, { data: owner }, profileResult] = await Promise.all([
    supabase.from('patients').select('name, species').eq('id', consultation.patient_id).single(),
    supabase.from('owners').select('full_name').eq('id', consultation.owner_id).single(),
    consultation.veterinarian_id
      ? supabase.from('profiles').select('full_name').eq('id', consultation.veterinarian_id).single()
      : Promise.resolve({ data: null }),
  ]);

  if (!patient || !owner) return null;

  return {
    ...(consultation as Consultation),
    patient_name: patient.name,
    patient_species: patient.species as ConsultationListRow['patient_species'],
    owner_full_name: owner.full_name,
    veterinarian_name: profileResult.data?.full_name ?? null,
    weight_kg: consultation.weight_kg != null ? Number(consultation.weight_kg) : null,
    temperature_c: consultation.temperature_c != null ? Number(consultation.temperature_c) : null,
  };
}

export async function getConsultationByAppointment(
  appointmentId: string
): Promise<{ id: string } | null> {
  const session = await getSessionContext();
  if (!session) return null;

  const supabase = await createServerClient();
  const { data } = await supabase
    .from('consultations')
    .select('id')
    .eq('appointment_id', appointmentId)
    .is('deleted_at', null)
    .neq('status', 'cancelada')
    .maybeSingle();

  return data ? { id: data.id } : null;
}

export async function startWalkInConsultation(
  _prev: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  try {
    const session = await requirePermissionAndFeature('clinical:write', FEATURES.CONSULTATIONS);
    const parsed = consultationStartSchema.safeParse({
      patientId: formData.get('patientId'),
      ownerId: formData.get('ownerId'),
      appointmentId: formData.get('appointmentId'),
      branchId: formData.get('branchId'),
      title: formData.get('title'),
    });

    if (!parsed.success) {
      return {
        success: false,
        error: 'Datos inválidos',
        fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
      };
    }

    const branchId = parsed.data.branchId ?? session.branchId;
    if (!branchId) {
      return { success: false, error: 'Seleccioná una sucursal activa' };
    }

    const supabase = await createServerClient();
    const { data, error } = await supabase
      .from('consultations')
      .insert({
        organization_id: session.organizationId,
        branch_id: branchId,
        patient_id: parsed.data.patientId,
        owner_id: parsed.data.ownerId,
        appointment_id: parsed.data.appointmentId ?? null,
        veterinarian_id: session.userId,
        status: 'en_curso',
        title: parsed.data.title ?? null,
      })
      .select('id')
      .single();

    if (error) {
      return { success: false, error: 'No se pudo iniciar la consulta' };
    }

    revalidateConsultation(data.id);
    redirect(`/consultas/${data.id}`);
  } catch (error) {
    return actionError(error);
  }
}

export async function startConsultationFromAppointment(
  appointmentId: string
): Promise<ActionResult<{ id: string }>> {
  try {
    const session = await requirePermissionAndFeature('clinical:write', FEATURES.CONSULTATIONS);
    const supabase = await createServerClient();

    const { data: existing } = await supabase
      .from('consultations')
      .select('id')
      .eq('appointment_id', appointmentId)
      .is('deleted_at', null)
      .neq('status', 'cancelada')
      .maybeSingle();

    if (existing) {
      redirect(`/consultas/${existing.id}`);
    }

    const { data: appointment, error: appointmentError } = await supabase
      .from('appointments')
      .select('id, organization_id, branch_id, patient_id, owner_id, title, status')
      .eq('id', appointmentId)
      .is('deleted_at', null)
      .single();

    if (appointmentError || !appointment) {
      return { success: false, error: 'Cita no encontrada' };
    }

    if (appointment.status === 'cancelada' || appointment.status === 'ausente') {
      return { success: false, error: 'No se puede atender una cita cancelada o ausente' };
    }

    const { data, error } = await supabase
      .from('consultations')
      .insert({
        organization_id: session.organizationId,
        branch_id: appointment.branch_id,
        patient_id: appointment.patient_id,
        owner_id: appointment.owner_id,
        appointment_id: appointment.id,
        veterinarian_id: session.userId,
        status: 'en_curso',
        title: appointment.title,
      })
      .select('id')
      .single();

    if (error) {
      return { success: false, error: 'No se pudo iniciar la consulta' };
    }

    if (appointment.status === 'programada' || appointment.status === 'confirmada') {
      await supabase
        .from('appointments')
        .update({ status: 'en_curso' })
        .eq('id', appointment.id);
    }

    revalidateConsultation(data.id);
    revalidateAgenda(appointmentId);
    redirect(`/consultas/${data.id}`);
  } catch (error) {
    return actionError(error);
  }
}

export async function saveConsultationDraft(
  consultationId: string,
  _prev: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  try {
    await requirePermissionAndFeature('clinical:write', FEATURES.CONSULTATIONS);
    const parsed = parseSoapForm(formData);

    if (!parsed.success) {
      return {
        success: false,
        error: 'Datos inválidos',
        fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
      };
    }

    const supabase = await createServerClient();
    const { error } = await supabase
      .from('consultations')
      .update({
        title: parsed.data.title ?? null,
        anamnesis: parsed.data.anamnesis ?? null,
        physical_exam: parsed.data.physicalExam ?? null,
        diagnosis: parsed.data.diagnosis ?? null,
        treatment: parsed.data.treatment ?? null,
        plan: parsed.data.plan ?? null,
        weight_kg: parsed.data.weightKg ?? null,
        temperature_c: parsed.data.temperatureC ?? null,
        notes: parsed.data.notes ?? null,
      })
      .eq('id', consultationId)
      .in('status', ['en_espera', 'en_curso']);

    if (error) {
      return { success: false, error: 'No se pudo guardar el borrador' };
    }

    revalidateConsultationDetail(consultationId);
    return { success: true };
  } catch (error) {
    return actionError(error);
  }
}

export async function completeConsultationAction(
  consultationId: string,
  _prev: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  try {
    await requirePermissionAndFeature('clinical:write', FEATURES.CONSULTATIONS);
    const parsed = parseSoapForm(formData);

    if (!parsed.success) {
      return {
        success: false,
        error: 'Datos inválidos',
        fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
      };
    }

    const supabase = await createServerClient();
    const { error: draftError } = await supabase
      .from('consultations')
      .update({
        title: parsed.data.title ?? null,
        anamnesis: parsed.data.anamnesis ?? null,
        physical_exam: parsed.data.physicalExam ?? null,
        diagnosis: parsed.data.diagnosis ?? null,
        treatment: parsed.data.treatment ?? null,
        plan: parsed.data.plan ?? null,
        weight_kg: parsed.data.weightKg ?? null,
        temperature_c: parsed.data.temperatureC ?? null,
        notes: parsed.data.notes ?? null,
      })
      .eq('id', consultationId)
      .in('status', ['en_espera', 'en_curso']);

    if (draftError) {
      return { success: false, error: 'No se pudo guardar la consulta' };
    }

    const { data: consultationMeta } = await supabase
      .from('consultations')
      .select('patient_id, appointment_id')
      .eq('id', consultationId)
      .single();

    const { data, error } = await supabase.rpc('complete_consultation', {
      p_consultation_id: consultationId,
    });

    if (error) {
      return { success: false, error: error.message || 'No se pudo completar la consulta' };
    }

    const result = data as { consultation_id?: string; clinical_entry_id?: string } | null;

    revalidateConsultation(consultationId);
    revalidateWaitingRoomSurfaces(consultationMeta?.appointment_id);

    if (result?.clinical_entry_id) {
      revalidateClinicalEntry(result.clinical_entry_id, consultationMeta?.patient_id);
    } else if (consultationMeta?.patient_id) {
      revalidatePatientHistoria(consultationMeta.patient_id);
    }

    redirect(`/consultas/${consultationId}`);
  } catch (error) {
    return actionError(error);
  }
}

export async function cancelConsultation(consultationId: string): Promise<ActionResult> {
  try {
    await requirePermissionAndFeature('clinical:write', FEATURES.CONSULTATIONS);
    const supabase = await createServerClient();

    const { data: consultationMeta } = await supabase
      .from('consultations')
      .select('appointment_id')
      .eq('id', consultationId)
      .single();

    const { error } = await supabase
      .from('consultations')
      .update({ status: 'cancelada' })
      .eq('id', consultationId)
      .in('status', ['en_espera', 'en_curso']);

    if (error) {
      return { success: false, error: 'No se pudo cancelar la consulta' };
    }

    revalidateConsultation(consultationId);
    revalidateAgenda(consultationMeta?.appointment_id);
    return { success: true };
  } catch (error) {
    return actionError(error);
  }
}

export async function canManageConsultations(): Promise<boolean> {
  return canPermissionAndFeature('clinical:write', FEATURES.CONSULTATIONS);
}

export async function canReadConsultations(): Promise<boolean> {
  const session = await getSessionContext();
  if (!session) return false;
  if (
    !session.permissions.includes('clinical:read') &&
    !session.permissions.includes('appointments:read')
  ) {
    return false;
  }
  return canUseFeature({
    organizationId: session.organizationId,
    featureKey: FEATURES.CONSULTATIONS,
  });
}

export async function canReadConsultationHistory(): Promise<boolean> {
  return canPermissionAndFeature('clinical:read', FEATURES.CONSULTATIONS);
}
