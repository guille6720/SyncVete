'use server';

import { randomUUID } from 'crypto';
import {
  buildPaginatedResult,
  bytesToStorageMb,
  patientListSchema,
  patientSchema,
  type ActionResult,
  type Patient,
  type PatientListRow,
  type PaginatedResult,
} from '@sincvete/shared';
import { createServerClient } from '@/lib/supabase/server';
import { PermissionError, requirePermission, requirePermissionAndFeature, canPermissionAndFeature } from '@/lib/permissions';
import { getSessionContext } from '@/lib/session';
import { revalidateOwnerPatients, revalidatePatient, revalidatePatientsList } from '@/lib/cache-revalidate';
import { PATIENT_COLUMNS } from '@/lib/db-columns';
import {
  FEATURES,
  assertWithinLimit,
  consumeMeteredFeature,
  planRestrictionResult,
} from '@/lib/entitlements';

const PATIENT_PHOTO_MAX_BYTES = 5 * 1024 * 1024;
const PATIENT_PHOTO_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

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

function parsePatientForm(formData: FormData) {
  return patientSchema.safeParse({
    name: formData.get('name'),
    ownerId: formData.get('ownerId'),
    species: formData.get('species') || 'Canino',
    breed: formData.get('breed'),
    sex: formData.get('sex') || 'Desconocido',
    birthDate: formData.get('birthDate'),
    color: formData.get('color'),
    microchip: formData.get('microchip'),
    isNeutered: formData.getAll('isNeutered').includes('true'),
    isDeceased: formData.getAll('isDeceased').includes('true'),
    deceasedAt: formData.get('deceasedAt'),
    notes: formData.get('notes'),
    branchId: formData.get('branchId'),
    isActive: formData.has('isActive')
      ? formData.getAll('isActive').includes('true')
      : true,
  });
}

function photoExtension(mime: string): string | null {
  switch (mime) {
    case 'image/jpeg':
      return 'jpg';
    case 'image/png':
      return 'png';
    case 'image/webp':
      return 'webp';
    case 'image/gif':
      return 'gif';
    default:
      return null;
  }
}

async function uploadPatientPhoto(
  organizationId: string,
  patientId: string,
  file: File
): Promise<{ url: string } | { error: string }> {
  if (!PATIENT_PHOTO_MIME.has(file.type)) {
    return { error: 'Formato de foto no permitido (JPG, PNG, WebP o GIF)' };
  }
  if (file.size > PATIENT_PHOTO_MAX_BYTES) {
    return { error: 'La foto no puede superar los 5 MB' };
  }

  const ext = photoExtension(file.type);
  if (!ext) {
    return { error: 'Formato de foto no permitido' };
  }

  const path = `${organizationId}/${patientId}/${randomUUID()}.${ext}`;
  const supabase = await createServerClient();
  await consumeMeteredFeature({
    organizationId,
    featureKey: FEATURES.STORAGE_MAX_MB,
    amount: bytesToStorageMb(file.size),
  });
  const buffer = Buffer.from(await file.arrayBuffer());

  const { error } = await supabase.storage.from('patient-photos').upload(path, buffer, {
    contentType: file.type,
    upsert: false,
  });

  if (error) {
    console.error('[uploadPatientPhoto]', error);
    return { error: error.message || 'No se pudo subir la foto' };
  }

  const { data } = supabase.storage.from('patient-photos').getPublicUrl(path);
  return { url: data.publicUrl };
}

function toPatientListRow(row: PatientListRow & { total_count?: number }): PatientListRow {
  const { total_count: _total, ...patient } = row;
  void _total;
  return { ...patient, deleted_at: patient.deleted_at ?? null };
}

export async function listPatients(
  input: {
    page?: number;
    pageSize?: number;
    search?: string;
    ownerId?: string;
    branchId?: string;
    species?: string;
  } = {}
): Promise<PaginatedResult<PatientListRow>> {
  await requirePermission('patients:read');
  const parsed = patientListSchema.parse(input);
  const supabase = await createServerClient();

  const { data, error } = await supabase.rpc('search_patients', {
    p_search: parsed.search?.trim() || null,
    p_owner_id: parsed.ownerId || null,
    p_branch_id: parsed.branchId || null,
    p_species: parsed.species || null,
    p_page: parsed.page,
    p_page_size: parsed.pageSize,
  });

  if (error) throw error;

  const rows = data ?? [];
  const total = rows[0]?.total_count ?? 0;
  const patients = rows.map((row) =>
    toPatientListRow(row as PatientListRow & { total_count: number })
  );

  return buildPaginatedResult(patients, Number(total), parsed.page, parsed.pageSize);
}

export async function getPatient(id: string): Promise<Patient | null> {
  await requirePermission('patients:read');
  const supabase = await createServerClient();

  const { data, error } = await supabase
    .from('patients')
    .select(PATIENT_COLUMNS)
    .eq('id', id)
    .is('deleted_at', null)
    .single();

  if (error || !data) return null;
  return data as Patient;
}

export async function createPatient(
  _prev: ActionResult<{ id: string }> | null,
  formData: FormData
): Promise<ActionResult<{ id: string }>> {
  try {
    const session = await requirePermissionAndFeature('patients:write', FEATURES.PATIENTS);
    const parsed = parsePatientForm(formData);

    if (!parsed.success) {
      return {
        success: false,
        error: 'Datos inválidos',
        fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
      };
    }

    const activeCount = await countActivePatients();
    await assertWithinLimit({
      organizationId: session.organizationId,
      featureKey: FEATURES.PATIENTS_MAX,
      currentCount: activeCount,
    });

    const supabase = await createServerClient();
    const { data, error } = await supabase
      .from('patients')
      .insert({
        organization_id: session.organizationId,
        branch_id: parsed.data.branchId || session.branchId,
        owner_id: parsed.data.ownerId,
        name: parsed.data.name,
        species: parsed.data.species,
        breed: parsed.data.breed ?? null,
        sex: parsed.data.sex,
        birth_date: parsed.data.birthDate ?? null,
        color: parsed.data.color ?? null,
        microchip: parsed.data.microchip ?? null,
        is_neutered: parsed.data.isNeutered,
        is_deceased: parsed.data.isDeceased,
        deceased_at: parsed.data.deceasedAt ?? null,
        notes: parsed.data.notes ?? null,
        is_active: parsed.data.isActive,
      })
      .select('id')
      .single();

    if (error) {
      console.error('[createPatient]', error);
      if (error.code === '23505') {
        return { success: false, error: 'Ya existe un paciente con ese microchip' };
      }
      return { success: false, error: error.message || 'No se pudo crear el paciente' };
    }

    const photo = formData.get('photo');
    if (photo instanceof File && photo.size > 0) {
      const uploaded = await uploadPatientPhoto(session.organizationId, data.id, photo);
      if (!('error' in uploaded)) {
        await supabase.from('patients').update({ photo_url: uploaded.url }).eq('id', data.id);
      } else {
        console.error('[createPatient] photo', uploaded.error);
      }
    }

    revalidatePatientsList();
    revalidateOwnerPatients(parsed.data.ownerId);
    return { success: true, data: { id: data.id } };
  } catch (error) {
    return actionError<{ id: string }>(error);
  }
}

export async function updatePatient(
  patientId: string,
  _prev: ActionResult<{ id: string }> | null,
  formData: FormData
): Promise<ActionResult<{ id: string }>> {
  try {
    await requirePermissionAndFeature('patients:write', FEATURES.PATIENTS);
    const parsed = parsePatientForm(formData);

    if (!parsed.success) {
      return {
        success: false,
        error: 'Datos inválidos',
        fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
      };
    }

    const session = await getSessionContext();
    if (!session) {
      return { success: false, error: 'Sesión no válida' };
    }

    const supabase = await createServerClient();
    let photoUrl: string | undefined;
    const photo = formData.get('photo');
    if (photo instanceof File && photo.size > 0) {
      const uploaded = await uploadPatientPhoto(session.organizationId, patientId, photo);
      if ('error' in uploaded) {
        return { success: false, error: uploaded.error };
      }
      photoUrl = uploaded.url;
    }

    const { error } = await supabase
      .from('patients')
      .update({
        branch_id: parsed.data.branchId || null,
        owner_id: parsed.data.ownerId,
        name: parsed.data.name,
        species: parsed.data.species,
        breed: parsed.data.breed ?? null,
        sex: parsed.data.sex,
        birth_date: parsed.data.birthDate ?? null,
        color: parsed.data.color ?? null,
        microchip: parsed.data.microchip ?? null,
        is_neutered: parsed.data.isNeutered,
        is_deceased: parsed.data.isDeceased,
        deceased_at: parsed.data.deceasedAt ?? null,
        notes: parsed.data.notes ?? null,
        is_active: parsed.data.isActive,
        ...(photoUrl ? { photo_url: photoUrl } : {}),
      })
      .eq('id', patientId);

    if (error) {
      console.error('[updatePatient]', error);
      if (error.code === '23505') {
        return { success: false, error: 'Ya existe un paciente con ese microchip' };
      }
      return { success: false, error: error.message || 'No se pudo actualizar el paciente' };
    }

    revalidatePatientsList();
    revalidatePatient(patientId);
    revalidateOwnerPatients(parsed.data.ownerId);
    return { success: true, data: { id: patientId } };
  } catch (error) {
    return actionError<{ id: string }>(error);
  }
}

export async function deletePatient(patientId: string): Promise<ActionResult> {
  try {
    await requirePermissionAndFeature('patients:write', FEATURES.PATIENTS);
    const supabase = await createServerClient();

    const { data, error } = await supabase
      .from('patients')
      .update({ deleted_at: new Date().toISOString(), is_active: false })
      .eq('id', patientId)
      .is('deleted_at', null)
      .select('id')
      .maybeSingle();

    if (error) {
      console.error('[deletePatient]', error);
      return { success: false, error: error.message || 'No se pudo eliminar el paciente' };
    }

    if (!data) {
      return {
        success: false,
        error: 'No se pudo eliminar el paciente (sin permiso o ya eliminado)',
      };
    }

    revalidatePatientsList();
    return { success: true };
  } catch (error) {
    return actionError(error);
  }
}

export async function countActivePatients(): Promise<number> {
  await requirePermission('patients:read');
  const supabase = await createServerClient();

  const { count, error } = await supabase
    .from('patients')
    .select('id', { count: 'exact', head: true })
    .is('deleted_at', null)
    .eq('is_active', true)
    .eq('is_deceased', false);

  if (error) return 0;
  return count ?? 0;
}

export async function canManagePatients(): Promise<boolean> {
  return canPermissionAndFeature('patients:write', FEATURES.PATIENTS);
}

export async function canReadPatients(): Promise<boolean> {
  return canPermissionAndFeature('patients:read', FEATURES.PATIENTS);
}

export async function searchPatientsForSelect(
  search: string,
  limit = 10
): Promise<
  Array<{
    id: string;
    name: string;
    species: string;
    owner_id: string;
    owner_full_name: string;
  }>
> {
  await requirePermission('patients:read');
  const supabase = await createServerClient();

  const { data, error } = await supabase.rpc('search_patients', {
    p_search: search.trim() || null,
    p_branch_id: null,
    p_page: 1,
    p_page_size: limit,
  });

  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    species: row.species,
    owner_id: row.owner_id,
    owner_full_name: row.owner_full_name,
  }));
}
