'use server';

import { revalidatePath } from 'next/cache';
import {
  buildPaginatedResult,
  ownerListSchema,
  ownerSchema,
  type ActionResult,
  type Owner,
  type PaginatedResult,
} from '@sincvete/shared';
import { createServerClient } from '@/lib/supabase/server';
import { PermissionError, requirePermission, requirePermissionAndFeature, canPermissionAndFeature } from '@/lib/permissions';
import { OWNER_COLUMNS } from '@/lib/db-columns';
import { FEATURES, planRestrictionResult } from '@/lib/entitlements';

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

function parseOwnerForm(formData: FormData) {
  return ownerSchema.safeParse({
    fullName: formData.get('fullName'),
    email: formData.get('email'),
    phone: formData.get('phone'),
    phoneWhatsapp: formData.get('phoneWhatsapp'),
    documentType: formData.get('documentType') || 'DNI',
    documentNumber: formData.get('documentNumber'),
    address: formData.get('address'),
    city: formData.get('city'),
    province: formData.get('province'),
    postalCode: formData.get('postalCode'),
    notes: formData.get('notes'),
    branchId: formData.get('branchId'),
    isActive: formData.has('isActive')
      ? formData.getAll('isActive').includes('true')
      : true,
  });
}

function toOwnerRow(row: Owner & { total_count?: number }): Owner {
  const { total_count: _total, ...owner } = row;
  void _total;
  return { ...owner, deleted_at: owner.deleted_at ?? null, portal_user_id: owner.portal_user_id ?? null };
}

export async function listOwners(
  input: { page?: number; pageSize?: number; search?: string; branchId?: string } = {}
): Promise<PaginatedResult<Owner>> {
  await requirePermission('patients:read');
  const parsed = ownerListSchema.parse(input);
  const supabase = await createServerClient();

  const { data, error } = await supabase.rpc('search_owners', {
    p_search: parsed.search?.trim() || null,
    p_branch_id: parsed.branchId || null,
    p_page: parsed.page,
    p_page_size: parsed.pageSize,
  });

  if (error) throw error;

  const rows = data ?? [];
  const total = rows[0]?.total_count ?? 0;
  const owners = rows.map((row) => toOwnerRow(row as Owner & { total_count: number }));

  return buildPaginatedResult(owners, Number(total), parsed.page, parsed.pageSize);
}

export async function getOwner(id: string): Promise<Owner | null> {
  await requirePermission('patients:read');
  const supabase = await createServerClient();

  const { data, error } = await supabase
    .from('owners')
    .select(OWNER_COLUMNS)
    .eq('id', id)
    .is('deleted_at', null)
    .single();

  if (error) return null;
  return data as Owner;
}

export async function createOwner(
  _prev: ActionResult<{ id: string }> | null,
  formData: FormData
): Promise<ActionResult<{ id: string }>> {
  try {
    const session = await requirePermissionAndFeature('patients:write', FEATURES.OWNERS);
    const parsed = parseOwnerForm(formData);

    if (!parsed.success) {
      return {
        success: false,
        error: 'Datos inválidos',
        fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
      };
    }

    const supabase = await createServerClient();
    const { data, error } = await supabase
      .from('owners')
      .insert({
        organization_id: session.organizationId,
        branch_id: parsed.data.branchId || session.branchId,
        full_name: parsed.data.fullName,
        email: parsed.data.email ?? null,
        phone: parsed.data.phone ?? null,
        phone_whatsapp: parsed.data.phoneWhatsapp ?? null,
        document_type: parsed.data.documentType,
        document_number: parsed.data.documentNumber ?? null,
        address: parsed.data.address || null,
        city: parsed.data.city || null,
        province: parsed.data.province || null,
        postal_code: parsed.data.postalCode || null,
        notes: parsed.data.notes || null,
        is_active: parsed.data.isActive,
      })
      .select('id')
      .single();

    if (error) {
      console.error('[createOwner]', error);
      return { success: false, error: error.message || 'No se pudo crear el propietario' };
    }

    revalidatePath('/propietarios');
    return { success: true, data: { id: data.id } };
  } catch (error) {
    return actionError<{ id: string }>(error);
  }
}

export async function updateOwner(
  ownerId: string,
  _prev: ActionResult<{ id: string }> | null,
  formData: FormData
): Promise<ActionResult<{ id: string }>> {
  try {
    await requirePermissionAndFeature('patients:write', FEATURES.OWNERS);
    const parsed = parseOwnerForm(formData);

    if (!parsed.success) {
      return {
        success: false,
        error: 'Datos inválidos',
        fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
      };
    }

    const supabase = await createServerClient();
    const { error } = await supabase
      .from('owners')
      .update({
        branch_id: parsed.data.branchId || null,
        full_name: parsed.data.fullName,
        email: parsed.data.email ?? null,
        phone: parsed.data.phone ?? null,
        phone_whatsapp: parsed.data.phoneWhatsapp ?? null,
        document_type: parsed.data.documentType,
        document_number: parsed.data.documentNumber ?? null,
        address: parsed.data.address || null,
        city: parsed.data.city || null,
        province: parsed.data.province || null,
        postal_code: parsed.data.postalCode || null,
        notes: parsed.data.notes || null,
        is_active: parsed.data.isActive,
      })
      .eq('id', ownerId);

    if (error) {
      return { success: false, error: 'No se pudo actualizar el propietario' };
    }

    revalidatePath('/propietarios');
    revalidatePath(`/propietarios/${ownerId}`);
    return { success: true, data: { id: ownerId } };
  } catch (error) {
    return actionError(error);
  }
}

export async function deleteOwner(ownerId: string): Promise<ActionResult> {
  try {
    await requirePermissionAndFeature('patients:write', FEATURES.OWNERS);
    const supabase = await createServerClient();

    const { error } = await supabase
      .from('owners')
      .update({ deleted_at: new Date().toISOString(), is_active: false })
      .eq('id', ownerId);

    if (error) {
      return { success: false, error: 'No se pudo eliminar el propietario' };
    }

    revalidatePath('/propietarios');
    return { success: true };
  } catch (error) {
    return actionError(error);
  }
}

export async function canManageOwners(): Promise<boolean> {
  return canPermissionAndFeature('patients:write', FEATURES.OWNERS);
}

export async function canReadOwners(): Promise<boolean> {
  return canPermissionAndFeature('patients:read', FEATURES.OWNERS);
}

export async function searchOwnersForSelect(
  search: string,
  limit = 10
): Promise<Array<{ id: string; full_name: string }>> {
  await requirePermission('patients:read');
  const supabase = await createServerClient();

  const { data, error } = await supabase.rpc('search_owners', {
    p_search: search.trim() || null,
    p_branch_id: null,
    p_page: 1,
    p_page_size: limit,
  });

  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: row.id,
    full_name: row.full_name,
  }));
}

export async function countActiveOwners(): Promise<number> {
  await requirePermission('patients:read');
  const supabase = await createServerClient();

  const { count, error } = await supabase
    .from('owners')
    .select('*', { count: 'exact', head: true })
    .is('deleted_at', null)
    .eq('is_active', true);

  if (error) return 0;
  return count ?? 0;
}
