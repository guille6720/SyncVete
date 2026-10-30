'use server';

import { redirect } from 'next/navigation';
import {
  buildPaginatedResult,
  clinicalEntryListSchema,
  clinicalEntrySchema,
  fromLocalDateTimeInput,
  type ActionResult,
  type ClinicalEntry,
  type ClinicalEntryListRow,
  type PaginatedResult,
} from '@sincvete/shared';
import { createServerClient } from '@/lib/supabase/server';
import { PermissionError, requirePermission, requirePermissionAndFeature, canPermissionAndFeature } from '@/lib/permissions';
import { getSessionContext } from '@/actions/auth';
import { FEATURES, planRestrictionResult } from '@/lib/entitlements';
import {
  revalidateClinicalEntry,
  revalidateClinicalEntryList,
  revalidatePatientHistoria,
} from '@/lib/cache-revalidate';
import { CLINICAL_ENTRY_COLUMNS } from '@/lib/db-columns';

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

function parseClinicalEntryForm(formData: FormData) {
  const entryDateRaw = formData.get('entryDate');
  const entryDate =
    typeof entryDateRaw === 'string' &&
    entryDateRaw.includes('T') &&
    !entryDateRaw.endsWith('Z')
      ? fromLocalDateTimeInput(entryDateRaw)
      : entryDateRaw;

  return clinicalEntrySchema.safeParse({
    patientId: formData.get('patientId'),
    ownerId: formData.get('ownerId'),
    appointmentId: formData.get('appointmentId'),
    entryDate,
    entryType: formData.get('entryType') || 'consulta',
    title: formData.get('title'),
    anamnesis: formData.get('anamnesis'),
    physicalExam: formData.get('physicalExam'),
    diagnosis: formData.get('diagnosis'),
    treatment: formData.get('treatment'),
    plan: formData.get('plan'),
    weightKg: formData.get('weightKg'),
    temperatureC: formData.get('temperatureC'),
    notes: formData.get('notes'),
    branchId: formData.get('branchId'),
  });
}

function toClinicalEntryListRow(
  row: ClinicalEntryListRow & { total_count?: number }
): ClinicalEntryListRow {
  const { total_count: _total, ...entry } = row;
  void _total;
  return {
    ...entry,
    weight_kg: entry.weight_kg != null ? Number(entry.weight_kg) : null,
    temperature_c: entry.temperature_c != null ? Number(entry.temperature_c) : null,
    deleted_at: entry.deleted_at ?? null,
  };
}

export async function listClinicalEntries(
  input: {
    page?: number;
    pageSize?: number;
    search?: string;
    patientId?: string;
    branchId?: string;
    entryType?: string;
  } = {}
): Promise<PaginatedResult<ClinicalEntryListRow>> {
  await requirePermission('clinical:read');
  const parsed = clinicalEntryListSchema.parse(input);
  const session = await getSessionContext();
  const supabase = await createServerClient();

  const { data, error } = await supabase.rpc('search_clinical_entries', {
    p_search: parsed.search?.trim() || null,
    p_patient_id: parsed.patientId || null,
    p_branch_id: parsed.branchId ?? session?.branchId ?? null,
    p_entry_type: parsed.entryType || null,
    p_page: parsed.page,
    p_page_size: parsed.pageSize,
  });

  if (error) throw error;

  const rows = data ?? [];
  const total = rows[0]?.total_count ?? 0;
  const entries = rows.map((row) =>
    toClinicalEntryListRow(row as ClinicalEntryListRow & { total_count: number })
  );

  return buildPaginatedResult(entries, Number(total), parsed.page, parsed.pageSize);
}

export async function getClinicalEntry(id: string): Promise<ClinicalEntryListRow | null> {
  await requirePermission('clinical:read');
  const supabase = await createServerClient();

  const { data: entry, error } = await supabase
    .from('clinical_entries')
    .select(CLINICAL_ENTRY_COLUMNS)
    .eq('id', id)
    .is('deleted_at', null)
    .single();

  if (error || !entry) return null;

  const [{ data: patient }, { data: owner }, profileResult] = await Promise.all([
    supabase.from('patients').select('name, species').eq('id', entry.patient_id).single(),
    supabase.from('owners').select('full_name').eq('id', entry.owner_id).single(),
    entry.recorded_by
      ? supabase.from('profiles').select('full_name').eq('id', entry.recorded_by).single()
      : Promise.resolve({ data: null }),
  ]);

  if (!patient || !owner) return null;

  return {
    ...(entry as ClinicalEntry),
    patient_name: patient.name,
    patient_species: patient.species as ClinicalEntryListRow['patient_species'],
    owner_full_name: owner.full_name,
    recorded_by_name: profileResult.data?.full_name ?? null,
    weight_kg: entry.weight_kg != null ? Number(entry.weight_kg) : null,
    temperature_c: entry.temperature_c != null ? Number(entry.temperature_c) : null,
  };
}

export async function createClinicalEntry(
  _prev: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  try {
    const session = await requirePermissionAndFeature('clinical:write', FEATURES.CLINICAL_HISTORY);
    const parsed = parseClinicalEntryForm(formData);

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
      .from('clinical_entries')
      .insert({
        organization_id: session.organizationId,
        branch_id: branchId,
        patient_id: parsed.data.patientId,
        owner_id: parsed.data.ownerId,
        appointment_id: parsed.data.appointmentId ?? null,
        recorded_by: session.userId,
        entry_date: parsed.data.entryDate,
        entry_type: parsed.data.entryType,
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
      .select('id')
      .single();

    if (error) {
      return { success: false, error: 'No se pudo crear la entrada clínica' };
    }

    revalidateClinicalEntryList();
    revalidatePatientHistoria(parsed.data.patientId);
    redirect(`/historia-clinica/${data.id}`);
  } catch (error) {
    return actionError(error);
  }
}

export async function updateClinicalEntry(
  entryId: string,
  _prev: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  try {
    await requirePermissionAndFeature('clinical:write', FEATURES.CLINICAL_HISTORY);
    const parsed = parseClinicalEntryForm(formData);

    if (!parsed.success) {
      return {
        success: false,
        error: 'Datos inválidos',
        fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
      };
    }

    const supabase = await createServerClient();
    const { error } = await supabase
      .from('clinical_entries')
      .update({
        branch_id: parsed.data.branchId,
        patient_id: parsed.data.patientId,
        owner_id: parsed.data.ownerId,
        appointment_id: parsed.data.appointmentId ?? null,
        entry_date: parsed.data.entryDate,
        entry_type: parsed.data.entryType,
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
      .eq('id', entryId);

    if (error) {
      return { success: false, error: 'No se pudo actualizar la entrada clínica' };
    }

    revalidateClinicalEntry(entryId, parsed.data.patientId);
    return { success: true };
  } catch (error) {
    return actionError(error);
  }
}

export async function deleteClinicalEntry(entryId: string): Promise<ActionResult> {
  try {
    await requirePermissionAndFeature('clinical:write', FEATURES.CLINICAL_HISTORY);
    const supabase = await createServerClient();

    const { data, error } = await supabase.rpc('soft_delete_clinical_entry', {
      p_entry_id: entryId,
    });

    if (error) {
      if (error.code === '42501') {
        return { success: false, error: 'No tenés permisos para eliminar esta entrada clínica' };
      }
      if (error.code === 'P0002') {
        return { success: false, error: 'La entrada ya fue eliminada o no está disponible' };
      }
      console.error('[clinical-entries] soft delete failed', error.code);
      return { success: false, error: 'No se pudo eliminar la entrada clínica. Intentá nuevamente.' };
    }

    const deletedEntry = data?.[0];
    if (!deletedEntry || deletedEntry.id !== entryId) {
      return { success: false, error: 'No se confirmó la eliminación de la entrada clínica' };
    }
    revalidateClinicalEntry(entryId, deletedEntry.patient_id);
    return { success: true };
  } catch (error) {
    return actionError(error);
  }
}

export async function canManageClinical(): Promise<boolean> {
  return canPermissionAndFeature('clinical:write', FEATURES.CLINICAL_HISTORY);
}

export async function canReadClinical(): Promise<boolean> {
  return canPermissionAndFeature('clinical:read', FEATURES.CLINICAL_HISTORY);
}

export async function countPatientClinicalEntries(patientId: string): Promise<number> {
  await requirePermission('clinical:read');
  const supabase = await createServerClient();

  const { count, error } = await supabase
    .from('clinical_entries')
    .select('*', { count: 'exact', head: true })
    .eq('patient_id', patientId)
    .is('deleted_at', null);

  if (error) return 0;
  return count ?? 0;
}
