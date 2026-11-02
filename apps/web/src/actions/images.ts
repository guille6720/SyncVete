'use server';
import { uploadWithStorageReservation } from '@/lib/storage-upload';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import {
  buildClinicalImageStoragePath,
  buildPaginatedResult,
  clinicalImageCreateSchema,
  clinicalImageListSchema,
  CLINICAL_IMAGE_MAX_BYTES,
  isAllowedClinicalImageMime,
  type ActionResult,
  type ClinicalImage,
  type ClinicalImageListRow,
  type PaginatedResult,
} from '@sincvete/shared';
import { createServerClient } from '@/lib/supabase/server';
import { PermissionError, requirePermission } from '@/lib/permissions';
import { getSessionContext } from '@/actions/auth';
import {
  FEATURES,
  canUseFeature,
  planRestrictionResult,
  requireFeature,
} from '@/lib/entitlements';

const SIGNED_URL_TTL = 60 * 60;

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

function toImageRow(
  row: Omit<ClinicalImageListRow, 'signed_url'> & { total_count?: number; signed_url?: string | null }
): ClinicalImageListRow {
  const { total_count: _total, ...entry } = row;
  void _total;
  return {
    ...entry,
    file_size: Number(entry.file_size ?? 0),
    signed_url: entry.signed_url ?? null,
    deleted_at: entry.deleted_at ?? null,
  };
}

async function attachSignedUrls(
  rows: Array<Omit<ClinicalImageListRow, 'signed_url'> & { signed_url?: string | null }>
): Promise<ClinicalImageListRow[]> {
  if (rows.length === 0) return [];
  const supabase = await createServerClient();
  const paths = rows.map((row) => row.storage_path);
  const { data } = await supabase.storage.from('clinical-images').createSignedUrls(paths, SIGNED_URL_TTL);
  const urlByPath = new Map((data ?? []).map((item) => [item.path, item.signedUrl ?? null]));

  return rows.map((row, index) =>
    toImageRow({
      ...row,
      signed_url: urlByPath.get(row.storage_path) ?? data?.[index]?.signedUrl ?? null,
    })
  );
}

export async function listClinicalImages(
  input: {
    page?: number;
    pageSize?: number;
    search?: string;
    patientId?: string;
    branchId?: string;
    kind?: string;
  } = {}
): Promise<PaginatedResult<ClinicalImageListRow>> {
  await requirePermission('clinical:read');
  const parsed = clinicalImageListSchema.parse(input);
  const session = await getSessionContext();
  const supabase = await createServerClient();

  const { data, error } = await supabase.rpc('search_clinical_images', {
    p_search: parsed.search?.trim() || null,
    p_patient_id: parsed.patientId || null,
    p_branch_id: parsed.branchId ?? session?.branchId ?? null,
    p_kind: parsed.kind || null,
    p_page: parsed.page,
    p_page_size: parsed.pageSize,
  });

  if (error) throw error;

  const rows = data ?? [];
  const total = rows[0]?.total_count ?? 0;
  const images = await attachSignedUrls(
    rows.map((row) => {
      const { total_count: _total, ...entry } = row as typeof row & { total_count?: number };
      void _total;
      return entry;
    })
  );

  return buildPaginatedResult(images, Number(total), parsed.page, parsed.pageSize);
}

export async function getClinicalImage(id: string): Promise<ClinicalImageListRow | null> {
  await requirePermission('clinical:read');
  const supabase = await createServerClient();

  const { data: image, error } = await supabase
    .from('clinical_images')
    .select('*')
    .eq('id', id)
    .is('deleted_at', null)
    .single();

  if (error || !image) return null;

  const [{ data: patient }, { data: owner }, profileResult] = await Promise.all([
    supabase.from('patients').select('name, species').eq('id', image.patient_id).single(),
    supabase.from('owners').select('full_name').eq('id', image.owner_id).single(),
    image.uploaded_by
      ? supabase.from('profiles').select('full_name').eq('id', image.uploaded_by).single()
      : Promise.resolve({ data: null }),
  ]);

  if (!patient || !owner) return null;

  const [withUrl] = await attachSignedUrls([
    {
      ...(image as ClinicalImage),
      patient_name: patient.name,
      patient_species: patient.species as ClinicalImageListRow['patient_species'],
      owner_full_name: owner.full_name,
      uploaded_by_name: profileResult.data?.full_name ?? null,
    },
  ]);

  return withUrl ?? null;
}

export async function uploadClinicalImage(
  _prev: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  try {
    const session = await requirePermission('clinical:write');
    const parsed = clinicalImageCreateSchema.safeParse({
      patientId: formData.get('patientId'),
      ownerId: formData.get('ownerId'),
      branchId: formData.get('branchId'),
      consultationId: formData.get('consultationId'),
      clinicalEntryId: formData.get('clinicalEntryId'),
      kind: formData.get('kind') || 'foto',
      title: formData.get('title'),
      notes: formData.get('notes'),
      takenAt: formData.get('takenAt'),
    });

    if (!parsed.success) {
      return {
        success: false,
        error: 'Datos inválidos',
        fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
      };
    }

    const file = formData.get('file');
    if (!(file instanceof File) || file.size === 0) {
      return { success: false, error: 'Seleccioná un archivo' };
    }
    if (!isAllowedClinicalImageMime(file.type)) {
      return { success: false, error: 'Formato no permitido. Usá JPG, PNG, WebP, GIF o PDF.' };
    }
    if (file.size > CLINICAL_IMAGE_MAX_BYTES) {
      return { success: false, error: 'El archivo no puede superar 10 MB' };
    }

    await requireFeature(session.organizationId, FEATURES.CLINICAL_IMAGES);

    const branchId = parsed.data.branchId ?? session.branchId;
    const imageId = crypto.randomUUID();
    const storagePath = buildClinicalImageStoragePath(
      session.organizationId,
      parsed.data.patientId,
      imageId,
      file.type
    );
    if (!storagePath) {
      return { success: false, error: 'Formato no permitido' };
    }

    const title =
      parsed.data.title ??
      file.name.replace(/\.[^.]+$/, '').slice(0, 160) ??
      null;

    const supabase = await createServerClient();
    const { error: insertError } = await supabase.from('clinical_images').insert({
      id: imageId,
      organization_id: session.organizationId,
      branch_id: branchId ?? null,
      patient_id: parsed.data.patientId,
      owner_id: parsed.data.ownerId,
      consultation_id: parsed.data.consultationId ?? null,
      clinical_entry_id: parsed.data.clinicalEntryId ?? null,
      uploaded_by: session.userId,
      kind: parsed.data.kind,
      title: title || null,
      notes: parsed.data.notes ?? null,
      storage_path: storagePath,
      mime_type: file.type,
      file_size: file.size,
      original_name: file.name.slice(0, 200),
      taken_at: parsed.data.takenAt
        ? new Date(`${parsed.data.takenAt}T12:00:00-03:00`).toISOString()
        : new Date().toISOString(),
    });

    if (insertError) {
      return { success: false, error: 'No se pudo guardar la imagen' };
    }

    const { error: uploadError } = await uploadWithStorageReservation({
      organizationId: session.organizationId, bucket: 'clinical-images',
      path: storagePath, body: file, contentType: file.type,
    });

    if (uploadError) {
      await supabase
        .from('clinical_images')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', imageId);
      return { success: false, error: 'No se pudo subir el archivo' };
    }

    revalidatePath('/imagenes');
    revalidatePath(`/pacientes/${parsed.data.patientId}`);
    if (parsed.data.consultationId) {
      revalidatePath(`/consultas/${parsed.data.consultationId}`);
    }
    if (parsed.data.clinicalEntryId) {
      revalidatePath(`/historia-clinica/${parsed.data.clinicalEntryId}`);
    }
    redirect(`/imagenes/${imageId}`);
  } catch (error) {
    return actionError(error);
  }
}

export async function deleteClinicalImage(id: string): Promise<ActionResult> {
  try {
    await requirePermission('clinical:write');
    const supabase = await createServerClient();

    const { data: image, error: loadError } = await supabase
      .from('clinical_images')
      .select('id, storage_path, patient_id')
      .eq('id', id)
      .is('deleted_at', null)
      .single();

    if (loadError || !image) {
      return { success: false, error: 'Imagen no encontrada' };
    }

    const { error } = await supabase
      .from('clinical_images')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id);

    if (error) {
      return { success: false, error: 'No se pudo eliminar la imagen' };
    }

    await supabase.storage.from('clinical-images').remove([image.storage_path]);

    revalidatePath('/imagenes');
    revalidatePath(`/imagenes/${id}`);
    revalidatePath(`/pacientes/${image.patient_id}`);
    return { success: true };
  } catch (error) {
    return actionError(error);
  }
}

export async function canManageImages(): Promise<boolean> {
  const session = await getSessionContext();
  if (!session || !session.permissions.includes('clinical:write')) return false;
  return canUseFeature({
    organizationId: session.organizationId,
    featureKey: FEATURES.CLINICAL_IMAGES,
  });
}

export async function canReadImages(): Promise<boolean> {
  const session = await getSessionContext();
  if (!session || !session.permissions.includes('clinical:read')) return false;
  return canUseFeature({
    organizationId: session.organizationId,
    featureKey: FEATURES.CLINICAL_IMAGES,
  });
}
