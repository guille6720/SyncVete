'use server';

import { revalidatePath } from 'next/cache';
import { cache } from 'react';
import {
  professionalCreateSchema,
  professionalOnboardingSchema,
  professionalUpdateSchema,
  resolveProfessionalAccessTemplate,
  type ActionResult,
  type Professional,
  type ProfessionalBranch,
  type ProfessionalListRow,
  type ProfessionalSettlementSummary,
} from '@sincvete/shared';
import type { Json } from '@sincvete/db';
import { createServerClient, createServiceClient } from '@/lib/supabase/server';
import {
  PermissionError,
  canPermissionAndFeature,
  requirePermission,
  requirePermissionAndFeature,
} from '@/lib/permissions';
import {
  FEATURES,
  assertWithinLimit,
  getSeatUsageMeters,
  planRestrictionResult,
  canUseFeature,
} from '@/lib/entitlements';
import { getSessionContext } from '@/actions/auth';
import type { Database } from '@sincvete/db';

type ProfessionalUpdate = Database['public']['Tables']['professionals']['Update'];

function revalidateProfessionalsModule() {
  revalidatePath('/profesionales');
  revalidatePath('/liquidaciones');
  revalidatePath('/configuracion');
}

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

function rpcErrorMessage(error: { message?: string } | null): string {
  const message = error?.message?.trim();
  if (!message) return 'No se pudo completar la operación';
  return message.replace(/^.*ERROR:\s*/i, '').replace(/\s+CONTEXT:[\s\S]*$/i, '');
}

function mapProfessional(row: Record<string, unknown>): Professional {
  return {
    id: String(row.id),
    organization_id: String(row.organization_id),
    user_id: row.user_id ? String(row.user_id) : null,
    profile_id: row.profile_id ? String(row.profile_id) : null,
    first_name: String(row.first_name),
    last_name: String(row.last_name),
    document_number: row.document_number ? String(row.document_number) : null,
    tax_id: row.tax_id ? String(row.tax_id) : null,
    professional_license: row.professional_license ? String(row.professional_license) : null,
    professional_license_jurisdiction: row.professional_license_jurisdiction
      ? String(row.professional_license_jurisdiction)
      : null,
    specialty: row.specialty ? String(row.specialty) : null,
    phone: row.phone ? String(row.phone) : null,
    email: row.email ? String(row.email) : null,
    address: row.address ? String(row.address) : null,
    date_of_birth: row.date_of_birth ? String(row.date_of_birth) : null,
    avatar_url: row.avatar_url ? String(row.avatar_url) : null,
    relationship_type: row.relationship_type as Professional['relationship_type'],
    start_date: row.start_date ? String(row.start_date) : null,
    end_date: row.end_date ? String(row.end_date) : null,
    is_active: Boolean(row.is_active),
    invoice_required: Boolean(row.invoice_required),
    notes: row.notes ? String(row.notes) : null,
    created_by: row.created_by ? String(row.created_by) : null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
    deleted_at: row.deleted_at ? String(row.deleted_at) : null,
  };
}

export async function canReadProfessionals(): Promise<boolean> {
  return canPermissionAndFeature('professionals:read', FEATURES.PROFESSIONALS_SETTLEMENTS);
}

export async function canWriteProfessionals(): Promise<boolean> {
  return canPermissionAndFeature('professionals:write', FEATURES.PROFESSIONALS_SETTLEMENTS);
}

export async function listProfessionals(input: { activeOnly?: boolean } = {}): Promise<Professional[]> {
  await requirePermissionAndFeature('professionals:read', FEATURES.PROFESSIONALS_SETTLEMENTS);
  const supabase = await createServerClient();
  let query = supabase
    .from('professionals')
    .select('*')
    .is('deleted_at', null)
    .order('last_name')
    .order('first_name');

  if (input.activeOnly) {
    query = query.eq('is_active', true);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map((row) => mapProfessional(row as Record<string, unknown>));
}

export async function listProfessionalsWithSummary(): Promise<ProfessionalListRow[]> {
  const professionals = await listProfessionals();
  if (professionals.length === 0) return [];

  const supabase = await createServerClient();
  const professionalIds = professionals.map((row) => row.id);
  const today = new Date().toISOString().slice(0, 10);

  const [{ data: settlements, error: settlementsError }, { data: schemes, error: schemesError }, { data: payments, error: paymentsError }] =
    await Promise.all([
      supabase
        .from('professional_settlements')
        .select('professional_id, balance_due, status')
        .in('professional_id', professionalIds)
        .is('deleted_at', null),
      supabase
        .from('professional_compensation_schemes')
        .select('professional_id, name, is_active, valid_from, valid_to')
        .in('professional_id', professionalIds)
        .is('deleted_at', null)
        .eq('is_active', true),
      supabase
        .from('professional_payments')
        .select('professional_id, amount, paid_at, settlement_id')
        .in('professional_id', professionalIds)
        .is('deleted_at', null)
        .order('paid_at', { ascending: false }),
    ]);
  if (settlementsError) throw settlementsError;
  if (schemesError) throw schemesError;
  if (paymentsError) throw paymentsError;

  const openBalanceByPro = new Map<string, number>();
  const pendingCountByPro = new Map<string, number>();
  const approvedUnpaidByPro = new Map<string, number>();
  for (const row of settlements ?? []) {
    const proId = String(row.professional_id);
    const status = String(row.status);
    if (status === 'draft' || status === 'review') {
      pendingCountByPro.set(proId, (pendingCountByPro.get(proId) ?? 0) + 1);
    }
    if (
      (status === 'approved' || status === 'partially_paid') &&
      Number(row.balance_due ?? 0) > 0
    ) {
      openBalanceByPro.set(
        proId,
        (openBalanceByPro.get(proId) ?? 0) + Number(row.balance_due ?? 0)
      );
      approvedUnpaidByPro.set(proId, (approvedUnpaidByPro.get(proId) ?? 0) + 1);
    }
  }

  const schemeNameByPro = new Map<string, string>();
  for (const row of schemes ?? []) {
    const proId = String(row.professional_id);
    const validFrom = String(row.valid_from);
    const validTo = row.valid_to ? String(row.valid_to) : null;
    if (validFrom <= today && (!validTo || validTo >= today)) {
      schemeNameByPro.set(proId, String(row.name));
    }
  }

  const lastPaymentByPro = new Map<
    string,
    { amount: number; paidAt: string; settlementId: string | null }
  >();
  for (const row of payments ?? []) {
    const proId = String(row.professional_id);
    if (lastPaymentByPro.has(proId)) continue;
    lastPaymentByPro.set(proId, {
      amount: Number(row.amount ?? 0),
      paidAt: String(row.paid_at),
      settlementId: row.settlement_id ? String(row.settlement_id) : null,
    });
  }

  return professionals.map((professional) => {
    const last = lastPaymentByPro.get(professional.id);
    return {
      ...professional,
      openBalance: Math.round((openBalanceByPro.get(professional.id) ?? 0) * 100) / 100,
      pendingSettlementCount: pendingCountByPro.get(professional.id) ?? 0,
      approvedUnpaidCount: approvedUnpaidByPro.get(professional.id) ?? 0,
      activeSchemeName: schemeNameByPro.get(professional.id) ?? null,
      lastPaymentAmount: last?.amount ?? null,
      lastPaymentDate: last?.paidAt ?? null,
      lastPaymentSettlementId: last?.settlementId ?? null,
    };
  });
}

export async function getProfessionalSettlementSummary(
  professionalId: string
): Promise<ProfessionalSettlementSummary> {
  await requirePermissionAndFeature('professionals:read', FEATURES.PROFESSIONALS_SETTLEMENTS);
  const supabase = await createServerClient();
  const today = new Date().toISOString().slice(0, 10);

  const [
    { data: settlements, error: settlementsError },
    { data: schemes, error: schemesError },
    { data: lastPayment, error: paymentError },
  ] = await Promise.all([
    supabase
      .from('professional_settlements')
      .select('balance_due, status')
      .eq('professional_id', professionalId)
      .is('deleted_at', null),
    supabase
      .from('professional_compensation_schemes')
      .select('name, is_active, valid_from, valid_to')
      .eq('professional_id', professionalId)
      .is('deleted_at', null)
      .eq('is_active', true),
    supabase
      .from('professional_payments')
      .select('amount, paid_at, settlement_id')
      .eq('professional_id', professionalId)
      .is('deleted_at', null)
      .order('paid_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  if (settlementsError) throw settlementsError;
  if (schemesError) throw schemesError;
  if (paymentError) throw paymentError;

  let openBalance = 0;
  let pendingSettlementCount = 0;
  let approvedUnpaidCount = 0;
  for (const row of settlements ?? []) {
    const status = String(row.status);
    if (status === 'draft' || status === 'review') pendingSettlementCount += 1;
    if (
      (status === 'approved' || status === 'partially_paid') &&
      Number(row.balance_due ?? 0) > 0
    ) {
      approvedUnpaidCount += 1;
      openBalance += Number(row.balance_due ?? 0);
    }
  }

  let activeSchemeName: string | null = null;
  for (const row of schemes ?? []) {
    const validFrom = String(row.valid_from);
    const validTo = row.valid_to ? String(row.valid_to) : null;
    if (validFrom <= today && (!validTo || validTo >= today)) {
      activeSchemeName = String(row.name);
      break;
    }
  }

  return {
    openBalance: Math.round(openBalance * 100) / 100,
    pendingSettlementCount,
    approvedUnpaidCount,
    activeSchemeName,
    lastPaymentAmount: lastPayment ? Number(lastPayment.amount) : null,
    lastPaymentDate: lastPayment ? String(lastPayment.paid_at) : null,
    lastPaymentSettlementId: lastPayment?.settlement_id
      ? String(lastPayment.settlement_id)
      : null,
  };
}

export async function getProfessional(id: string): Promise<Professional | null> {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)
  ) {
    return null;
  }

  await requirePermissionAndFeature('professionals:read', FEATURES.PROFESSIONALS_SETTLEMENTS);
  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from('professionals')
    .select('*')
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw error;
  return data ? mapProfessional(data as Record<string, unknown>) : null;
}

export async function getProfessionalForCurrentUser(): Promise<Professional | null> {
  return loadProfessionalForCurrentUser();
}

const loadProfessionalForCurrentUser = cache(async (): Promise<Professional | null> => {
  const session = await getSessionContext();
  if (!session?.userId) return null;

  const hasFeature = await canUseFeature({
    organizationId: session.organizationId,
    featureKey: FEATURES.PROFESSIONALS_SETTLEMENTS,
  });
  if (!hasFeature) return null;

  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from('professionals')
    .select('*')
    .eq('user_id', session.userId)
    .is('deleted_at', null)
    .eq('is_active', true)
    .maybeSingle();
  if (error) {
    // Schema not migrated yet — treat as no linked professional (do not crash clinic shell).
    if (/schema cache|does not exist|Could not find the (table|function)/i.test(error.message)) {
      return null;
    }
    throw error;
  }
  return data ? mapProfessional(data as Record<string, unknown>) : null;
});

export async function hasLinkedProfessionalProfile(): Promise<boolean> {
  const professional = await loadProfessionalForCurrentUser();
  return professional != null;
}

export async function listProfessionalBranches(
  professionalId: string
): Promise<ProfessionalBranch[]> {
  await requirePermissionAndFeature('professionals:read', FEATURES.PROFESSIONALS_SETTLEMENTS);
  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from('professional_branches')
    .select('*')
    .eq('professional_id', professionalId)
    .eq('is_active', true);
  if (error) throw error;
  return (data ?? []) as ProfessionalBranch[];
}

export async function createProfessional(
  _prev: ActionResult<Professional> | null,
  formData: FormData
): Promise<ActionResult<Professional>> {
  try {
    await requirePermissionAndFeature('professionals:write', FEATURES.PROFESSIONALS_SETTLEMENTS);
    const session = await getSessionContext();
    if (!session) return { success: false, error: 'Sesión inválida' };

    const parsed = professionalCreateSchema.safeParse({
      userId: formData.get('userId') || null,
      profileId: formData.get('profileId') || null,
      firstName: formData.get('firstName'),
      lastName: formData.get('lastName'),
      documentNumber: formData.get('documentNumber') || null,
      taxId: formData.get('taxId') || null,
      professionalLicense: formData.get('professionalLicense') || null,
      professionalLicenseJurisdiction: formData.get('professionalLicenseJurisdiction') || null,
      specialty: formData.get('specialty') || null,
      phone: formData.get('phone') || null,
      email: formData.get('email') || null,
      address: formData.get('address') || null,
      dateOfBirth: formData.get('dateOfBirth') || null,
      avatarUrl: formData.get('avatarUrl') || null,
      relationshipType: formData.get('relationshipType'),
      startDate: formData.get('startDate') || null,
      endDate: formData.get('endDate') || null,
      isActive: formData.get('isActive') === 'true' || formData.get('isActive') === 'on',
      invoiceRequired: formData.get('invoiceRequired') === 'true' || formData.get('invoiceRequired') === 'on',
      notes: formData.get('notes') || null,
      branchIds: formData.getAll('branchIds').map(String).filter(Boolean),
    });

    if (!parsed.success) {
      return {
        success: false,
        error: 'Datos inválidos',
        fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
      };
    }

    const emptyToNull = (value: string | null | undefined) => {
      if (value == null || value === '') return null;
      return value;
    };

    const supabase = await createServerClient();
    const { data, error } = await supabase
      .from('professionals')
      .insert({
        organization_id: session.organizationId,
        user_id: parsed.data.userId ?? null,
        profile_id: parsed.data.profileId ?? null,
        first_name: parsed.data.firstName,
        last_name: parsed.data.lastName,
        document_number: emptyToNull(parsed.data.documentNumber),
        tax_id: emptyToNull(parsed.data.taxId),
        professional_license: emptyToNull(parsed.data.professionalLicense),
        professional_license_jurisdiction: emptyToNull(parsed.data.professionalLicenseJurisdiction),
        specialty: emptyToNull(parsed.data.specialty),
        phone: emptyToNull(parsed.data.phone),
        email: emptyToNull(parsed.data.email),
        address: emptyToNull(parsed.data.address),
        date_of_birth: emptyToNull(parsed.data.dateOfBirth),
        avatar_url: emptyToNull(parsed.data.avatarUrl),
        relationship_type: parsed.data.relationshipType,
        start_date: emptyToNull(parsed.data.startDate),
        end_date: emptyToNull(parsed.data.endDate),
        is_active: parsed.data.isActive ?? true,
        invoice_required: parsed.data.invoiceRequired ?? false,
        notes: emptyToNull(parsed.data.notes),
        created_by: session.userId,
      })
      .select('*')
      .single();

    if (error) {
      return { success: false, error: rpcErrorMessage(error) };
    }

    if (parsed.data.branchIds.length > 0) {
      const branchRows = parsed.data.branchIds.map((branchId) => ({
        organization_id: session.organizationId,
        professional_id: data.id,
        branch_id: branchId,
        is_active: true,
      }));
      const { error: branchError } = await supabase.from('professional_branches').insert(branchRows);
      if (branchError) {
        return { success: false, error: rpcErrorMessage(branchError) };
      }
    }

    revalidateProfessionalsModule();
    return { success: true, data: mapProfessional(data as Record<string, unknown>) };
  } catch (error) {
    return actionError(error);
  }
}

export async function updateProfessional(
  _prev: ActionResult<Professional> | null,
  formData: FormData
): Promise<ActionResult<Professional>> {
  try {
    await requirePermissionAndFeature('professionals:write', FEATURES.PROFESSIONALS_SETTLEMENTS);

    const parsed = professionalUpdateSchema.safeParse({
      id: formData.get('id'),
      userId: formData.get('userId') || undefined,
      profileId: formData.get('profileId') || undefined,
      firstName: formData.get('firstName') || undefined,
      lastName: formData.get('lastName') || undefined,
      documentNumber: formData.get('documentNumber') || undefined,
      taxId: formData.get('taxId') || undefined,
      professionalLicense: formData.get('professionalLicense') || undefined,
      professionalLicenseJurisdiction: formData.get('professionalLicenseJurisdiction') || undefined,
      specialty: formData.get('specialty') || undefined,
      phone: formData.get('phone') || undefined,
      email: formData.get('email') || undefined,
      address: formData.get('address') || undefined,
      dateOfBirth: formData.get('dateOfBirth') || undefined,
      avatarUrl: formData.get('avatarUrl') || undefined,
      relationshipType: formData.get('relationshipType') || undefined,
      startDate: formData.get('startDate') || undefined,
      endDate: formData.get('endDate') || undefined,
      isActive:
        formData.has('isActive')
          ? formData.get('isActive') === 'true' || formData.get('isActive') === 'on'
          : undefined,
      invoiceRequired:
        formData.has('invoiceRequired')
          ? formData.get('invoiceRequired') === 'true' || formData.get('invoiceRequired') === 'on'
          : undefined,
      notes: formData.get('notes') || undefined,
      branchIds: formData.has('branchIds')
        ? formData.getAll('branchIds').map(String).filter(Boolean)
        : undefined,
    });

    if (!parsed.success) {
      return {
        success: false,
        error: 'Datos inválidos',
        fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
      };
    }

    const emptyToNull = (value: string | null | undefined) => {
      if (value == null || value === '') return null;
      return value;
    };

    const { id, branchIds, ...fields } = parsed.data;
    const patch: ProfessionalUpdate = {};
    if (fields.userId !== undefined) patch.user_id = fields.userId;
    if (fields.profileId !== undefined) patch.profile_id = fields.profileId;
    if (fields.firstName !== undefined) patch.first_name = fields.firstName;
    if (fields.lastName !== undefined) patch.last_name = fields.lastName;
    if (fields.documentNumber !== undefined) patch.document_number = emptyToNull(fields.documentNumber);
    if (fields.taxId !== undefined) patch.tax_id = emptyToNull(fields.taxId);
    if (fields.professionalLicense !== undefined) {
      patch.professional_license = emptyToNull(fields.professionalLicense);
    }
    if (fields.professionalLicenseJurisdiction !== undefined) {
      patch.professional_license_jurisdiction = emptyToNull(fields.professionalLicenseJurisdiction);
    }
    if (fields.specialty !== undefined) patch.specialty = emptyToNull(fields.specialty);
    if (fields.phone !== undefined) patch.phone = emptyToNull(fields.phone);
    if (fields.email !== undefined) patch.email = emptyToNull(fields.email);
    if (fields.address !== undefined) patch.address = emptyToNull(fields.address);
    if (fields.dateOfBirth !== undefined) patch.date_of_birth = emptyToNull(fields.dateOfBirth);
    if (fields.avatarUrl !== undefined) patch.avatar_url = emptyToNull(fields.avatarUrl);
    if (fields.relationshipType !== undefined) patch.relationship_type = fields.relationshipType;
    if (fields.startDate !== undefined) patch.start_date = emptyToNull(fields.startDate);
    if (fields.endDate !== undefined) patch.end_date = emptyToNull(fields.endDate);
    if (fields.isActive !== undefined) patch.is_active = fields.isActive;
    if (fields.invoiceRequired !== undefined) patch.invoice_required = fields.invoiceRequired;
    if (fields.notes !== undefined) patch.notes = emptyToNull(fields.notes);

    const supabase = await createServerClient();
    const { data, error } = await supabase
      .from('professionals')
      .update(patch)
      .eq('id', id)
      .is('deleted_at', null)
      .select('*')
      .single();

    if (error) {
      return { success: false, error: rpcErrorMessage(error) };
    }

    if (branchIds !== undefined) {
      await supabase
        .from('professional_branches')
        .update({ is_active: false })
        .eq('professional_id', id);
      if (branchIds.length > 0) {
        const session = await getSessionContext();
        const branchRows = branchIds.map((branchId) => ({
          organization_id: session!.organizationId,
          professional_id: id,
          branch_id: branchId,
          is_active: true,
        }));
        const { error: branchError } = await supabase
          .from('professional_branches')
          .upsert(branchRows, { onConflict: 'professional_id,branch_id' });
        if (branchError) {
          return { success: false, error: rpcErrorMessage(branchError) };
        }
      }
    }

    revalidateProfessionalsModule();
    return { success: true, data: mapProfessional(data as Record<string, unknown>) };
  } catch (error) {
    return actionError(error);
  }
}

export async function getProfessionalAccessState(professionalId: string): Promise<{
  userId: string | null;
  membershipId: string | null;
  role: string | null;
  isActive: boolean | null;
  email: string | null;
  fullName: string | null;
} | null> {
  const professional = await getProfessional(professionalId);
  if (!professional) return null;
  if (!professional.user_id) {
    return {
      userId: null,
      membershipId: null,
      role: null,
      isActive: null,
      email: professional.email,
      fullName: `${professional.first_name} ${professional.last_name}`.trim(),
    };
  }

  const supabase = await createServerClient();
  const [{ data: membership }, { data: profile }] = await Promise.all([
    supabase
      .from('branch_members')
      .select('id, role, is_active')
      .eq('user_id', professional.user_id)
      .is('deleted_at', null)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('profiles')
      .select('full_name')
      .eq('id', professional.user_id)
      .maybeSingle(),
  ]);

  return {
    userId: professional.user_id,
    membershipId: membership?.id ? String(membership.id) : null,
    role: membership?.role ? String(membership.role) : null,
    isActive: membership ? Boolean(membership.is_active) : null,
    email: professional.email,
    fullName: profile?.full_name ? String(profile.full_name) : null,
  };
}

export async function linkProfessionalUser(
  professionalId: string,
  userId: string | null
): Promise<ActionResult<Professional>> {
  try {
    await requirePermissionAndFeature('professionals:write', FEATURES.PROFESSIONALS_SETTLEMENTS);
    if (userId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(userId)) {
      return { success: false, error: 'Usuario inválido' };
    }

    const supabase = await createServerClient();
    const { data, error } = await supabase
      .from('professionals')
      .update({
        user_id: userId,
        profile_id: userId,
        updated_at: new Date().toISOString(),
      })
      .eq('id', professionalId)
      .is('deleted_at', null)
      .select('*')
      .single();

    if (error) return { success: false, error: rpcErrorMessage(error) };
    revalidateProfessionalsModule();
    return { success: true, data: mapProfessional(data as Record<string, unknown>) };
  } catch (error) {
    return actionError(error);
  }
}

export async function setProfessionalMembershipActive(
  membershipId: string,
  isActive: boolean
): Promise<ActionResult> {
  try {
    await requirePermissionAndFeature('professionals:write', FEATURES.PROFESSIONALS_SETTLEMENTS);
    await requirePermission('users:manage');

    const supabase = await createServerClient();
    const { error } = await supabase
      .from('branch_members')
      .update({
        is_active: isActive,
        deleted_at: isActive ? null : new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', membershipId);

    if (error) return { success: false, error: rpcErrorMessage(error) };
    revalidateProfessionalsModule();
    revalidatePath('/configuracion');
    return { success: true };
  } catch (error) {
    return actionError(error);
  }
}

type ProfessionalOnboardingResult = Professional & { temporaryPassword?: string };

function generateTemporaryPassword(length = 12): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$';
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
}

function normalizeScheduleTime(value: string): string {
  return value.length === 5 ? `${value}:00` : value;
}

export async function createProfessionalOnboarding(
  _prev: ActionResult<ProfessionalOnboardingResult> | null,
  formData: FormData
): Promise<ActionResult<ProfessionalOnboardingResult>> {
  try {
    await requirePermissionAndFeature('professionals:write', FEATURES.PROFESSIONALS_SETTLEMENTS);
    const session = await getSessionContext();
    if (!session) return { success: false, error: 'Sesión inválida' };

    const createPlatformAccessRaw = formData.get('createPlatformAccess');
    const createPlatformAccess =
      createPlatformAccessRaw === 'true' || createPlatformAccessRaw === 'on';

    const parsed = professionalOnboardingSchema.safeParse({
      firstName: formData.get('firstName'),
      lastName: formData.get('lastName'),
      documentNumber: formData.get('documentNumber') || null,
      professionalLicense: formData.get('professionalLicense') || null,
      specialty: formData.get('specialty') || null,
      phone: formData.get('phone') || null,
      email: formData.get('email') || null,
      relationshipType: formData.get('relationshipType'),
      isActive: formData.get('isActive') === 'true' || formData.get('isActive') === 'on',
      notes: formData.get('notes') || null,
      branchId: formData.get('branchId'),
      branchIds: formData.getAll('branchIds').map(String).filter(Boolean),
      accessTemplate: formData.get('accessTemplate') || 'veterinarian',
      createPlatformAccess,
      accessEmail: formData.get('accessEmail') || null,
      passwordMode: formData.get('passwordMode') || 'auto',
      password: formData.get('password') || null,
      forcePasswordChange:
        formData.get('forcePasswordChange') === 'true' ||
        formData.get('forcePasswordChange') === 'on',
      scheduleWeekdays: formData.getAll('scheduleWeekdays').map(String).filter(Boolean),
      scheduleStartTime: formData.get('scheduleStartTime') || '09:00',
      scheduleEndTime: formData.get('scheduleEndTime') || '18:00',
      scheduleSlotMinutes: formData.get('scheduleSlotMinutes') || 30,
    });

    if (!parsed.success) {
      const firstIssue = parsed.error.issues[0]?.message;
      return {
        success: false,
        error: firstIssue || 'Datos inválidos',
        fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
      };
    }

    const input = parsed.data;
    const emptyToNull = (value: string | null | undefined) => {
      if (value == null || value === '') return null;
      return value;
    };

    const branchIds = Array.from(
      new Set([input.branchId, ...(input.branchIds ?? [])].filter(Boolean))
    );

    let temporaryPassword: string | undefined;
    let createdUserId: string | null = null;
    const accessTemplate = resolveProfessionalAccessTemplate(input.accessTemplate);

    if (input.createPlatformAccess) {
      await requirePermission('users:manage');

      const accessEmail = String(input.accessEmail || input.email || '')
        .trim()
        .toLowerCase();
      if (!accessEmail) {
        return { success: false, error: 'Indicá un email para el acceso' };
      }

      const supabaseForLimit = await createServerClient();
      const service = await createServiceClient();

      const { data: existingUsers } = await service.auth.admin.listUsers({
        page: 1,
        perPage: 1000,
      });
      const existingUser = existingUsers.users.find(
        (u) => u.email?.toLowerCase() === accessEmail
      );

      if (existingUser) {
        const { data: existingProfile } = await supabaseForLimit
          .from('profiles')
          .select('id, organization_id')
          .eq('id', existingUser.id)
          .is('deleted_at', null)
          .maybeSingle();

        if (
          existingProfile?.organization_id &&
          existingProfile.organization_id !== session.organizationId
        ) {
          return {
            success: false,
            error: 'Ese email ya pertenece a otra organización',
          };
        }

        if (!existingProfile) {
          const [{ count: profileCount }, { count: inviteCount }] = await Promise.all([
            supabaseForLimit
              .from('profiles')
              .select('id', { count: 'exact', head: true })
              .eq('is_active', true)
              .is('deleted_at', null),
            supabaseForLimit
              .from('organization_invitations')
              .select('id', { count: 'exact', head: true })
              .eq('status', 'pending')
              .is('deleted_at', null),
          ]);
          await assertWithinLimit({
            organizationId: session.organizationId,
            featureKey: FEATURES.USERS_MAX,
            currentCount: (profileCount ?? 0) + (inviteCount ?? 0),
          });
        }

        createdUserId = existingUser.id;
        temporaryPassword = undefined;
        const { error: metaError } = await service.auth.admin.updateUserById(existingUser.id, {
          user_metadata: {
            ...(existingUser.user_metadata ?? {}),
            full_name: `${input.firstName} ${input.lastName}`.trim(),
          },
        });
        if (metaError) {
          return { success: false, error: metaError.message };
        }
      } else {
        temporaryPassword =
          input.passwordMode === 'manual' && input.password
            ? input.password
            : generateTemporaryPassword();

        const [{ count: profileCount }, { count: inviteCount }] = await Promise.all([
          supabaseForLimit
            .from('profiles')
            .select('id', { count: 'exact', head: true })
            .eq('is_active', true)
            .is('deleted_at', null),
          supabaseForLimit
            .from('organization_invitations')
            .select('id', { count: 'exact', head: true })
            .eq('status', 'pending')
            .is('deleted_at', null),
        ]);
        await assertWithinLimit({
          organizationId: session.organizationId,
          featureKey: FEATURES.USERS_MAX,
          currentCount: (profileCount ?? 0) + (inviteCount ?? 0),
        });

        if (accessTemplate.role === 'veterinarian') {
          const seats = await getSeatUsageMeters(session.organizationId);
          const meter = seats.find((item) => item.featureKey === FEATURES.PROFESSIONALS_MAX);
          if (meter) {
            await assertWithinLimit({
              organizationId: session.organizationId,
              featureKey: FEATURES.PROFESSIONALS_MAX,
              currentCount: meter.used,
            });
          }
        }

        const { data: created, error: createError } = await service.auth.admin.createUser({
          email: accessEmail,
          password: temporaryPassword,
          email_confirm: true,
          user_metadata: {
            full_name: `${input.firstName} ${input.lastName}`.trim(),
            force_password_change: input.forcePasswordChange,
            organization_id: session.organizationId,
            branch_id: input.branchId,
            role: accessTemplate.role,
          },
        });

        if (createError || !created.user) {
          return {
            success: false,
            error: createError?.message || 'No se pudo crear el usuario',
          };
        }
        createdUserId = created.user.id;
      }

      const supabase = await createServerClient();
      const { error: rpcError } = await supabase.rpc('add_team_member', {
        p_user_id: createdUserId,
        p_branch_id: input.branchId,
        p_role: accessTemplate.role,
      });
      if (rpcError) {
        return { success: false, error: rpcErrorMessage(rpcError) };
      }

      if (accessTemplate.permissions) {
        const { error: permError } = await supabase
          .from('branch_members')
          .update({
            permissions: accessTemplate.permissions as unknown as Json,
            updated_at: new Date().toISOString(),
          })
          .eq('user_id', createdUserId)
          .eq('branch_id', input.branchId)
          .is('deleted_at', null);
        if (permError) {
          return { success: false, error: rpcErrorMessage(permError) };
        }
      }
    }

    const supabase = await createServerClient();
    const { data, error } = await supabase
      .from('professionals')
      .insert({
        organization_id: session.organizationId,
        user_id: createdUserId,
        profile_id: createdUserId,
        first_name: input.firstName,
        last_name: input.lastName,
        document_number: emptyToNull(input.documentNumber),
        tax_id: emptyToNull(input.taxId),
        professional_license: emptyToNull(input.professionalLicense),
        professional_license_jurisdiction: emptyToNull(input.professionalLicenseJurisdiction),
        specialty: emptyToNull(input.specialty),
        phone: emptyToNull(input.phone),
        email: emptyToNull(input.email || input.accessEmail),
        address: emptyToNull(input.address),
        date_of_birth: emptyToNull(input.dateOfBirth),
        avatar_url: emptyToNull(input.avatarUrl),
        relationship_type: input.relationshipType,
        start_date: emptyToNull(input.startDate),
        end_date: emptyToNull(input.endDate),
        is_active: input.isActive ?? true,
        invoice_required: input.invoiceRequired ?? false,
        notes: emptyToNull(input.notes),
        created_by: session.userId,
      })
      .select('*')
      .single();

    if (error) {
      return { success: false, error: rpcErrorMessage(error) };
    }

    if (branchIds.length > 0) {
      const branchRows = branchIds.map((branchId) => ({
        organization_id: session.organizationId,
        professional_id: data.id,
        branch_id: branchId,
        is_active: true,
      }));
      const { error: branchError } = await supabase.from('professional_branches').insert(branchRows);
      if (branchError) {
        return { success: false, error: rpcErrorMessage(branchError) };
      }
    }

    if (createdUserId && (input.scheduleWeekdays?.length ?? 0) > 0) {
      const startTime = normalizeScheduleTime(input.scheduleStartTime ?? '09:00');
      const endTime = normalizeScheduleTime(input.scheduleEndTime ?? '18:00');
      for (const weekday of input.scheduleWeekdays) {
        const { error: scheduleError } = await supabase.rpc('upsert_professional_schedule', {
          p_branch_id: input.branchId,
          p_user_id: createdUserId,
          p_weekday: weekday,
          p_start_time: startTime,
          p_end_time: endTime,
          p_slot_duration_minutes: input.scheduleSlotMinutes ?? 30,
          p_allowed_appointment_types: null,
          p_is_active: true,
          p_id: null,
        });
        if (scheduleError) {
          return {
            success: false,
            error: `Profesional creado, pero falló la agenda: ${rpcErrorMessage(scheduleError)}`,
          };
        }
      }
      revalidatePath('/agenda');
    }

    revalidateProfessionalsModule();
    revalidatePath('/configuracion');
    revalidatePath(`/profesionales/${data.id}`);

    return {
      success: true,
      data: {
        ...mapProfessional(data as Record<string, unknown>),
        temporaryPassword,
      },
    };
  } catch (error) {
    return actionError(error);
  }
}
