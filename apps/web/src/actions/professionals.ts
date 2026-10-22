'use server';

import { revalidatePath } from 'next/cache';
import {
  professionalCreateSchema,
  professionalUpdateSchema,
  type ActionResult,
  type Professional,
  type ProfessionalBranch,
  type ProfessionalListRow,
  type ProfessionalSettlementSummary,
} from '@sincvete/shared';
import { createServerClient, createServiceClient } from '@/lib/supabase/server';
import {
  PermissionError,
  canPermissionAndFeature,
  requirePermissionAndFeature,
} from '@/lib/permissions';
import { FEATURES, planRestrictionResult, canUseFeature, assertWithinLimit, getSeatUsageMeters } from '@/lib/entitlements';
import { getSessionContext } from '@/actions/auth';
import { randomBytes } from 'crypto';
import type { Database } from '@sincvete/db';

type ProfessionalUpdate = Database['public']['Tables']['professionals']['Update'];

function revalidateProfessionalsModule() {
  revalidatePath('/profesionales');
  revalidatePath('/liquidaciones');
  revalidatePath('/configuracion');
  revalidatePath('/agenda');
  revalidatePath('/agenda/nueva');
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

async function assertAgendaSeatAvailable(organizationId: string, userId?: string | null) {
  const supabase = await createServerClient();
  if (userId) {
    const { data: vetRow } = await supabase
      .from('branch_members')
      .select('id')
      .eq('user_id', userId)
      .eq('role', 'veterinarian')
      .eq('is_active', true)
      .is('deleted_at', null)
      .limit(1)
      .maybeSingle();
    if (vetRow) return;
  }

  const seats = await getSeatUsageMeters(organizationId);
  const meter = seats.find((item) => item.featureKey === FEATURES.PROFESSIONALS_MAX);
  await assertWithinLimit({
    organizationId,
    featureKey: FEATURES.PROFESSIONALS_MAX,
    currentCount: meter?.used ?? 0,
  });
}

/**
 * Ensures the professional has an auth identity + branch_members so they appear
 * in Agenda → Nuevo turno (getAssignableStaff).
 */
async function ensureProfessionalAgendaAccess(params: {
  organizationId: string;
  branchIds: string[];
  fullName: string;
  userId?: string | null;
  agendaEmail?: string | null;
}): Promise<{ userId: string } | { error: string }> {
  const branchIds = [...new Set(params.branchIds.filter(Boolean))];
  if (branchIds.length === 0) {
    return { error: 'Seleccioná al menos una sucursal para habilitar agenda' };
  }

  const service = await createServiceClient();
  const supabase = await createServerClient();
  let userId = params.userId ?? null;
  const email = params.agendaEmail?.trim().toLowerCase() || null;

  if (!userId && email) {
    const { data: listed } = await service.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const existing = listed.users.find((u) => u.email?.toLowerCase() === email);
    if (existing) {
      userId = existing.id;
    } else {
      const { count: profileCount } = await supabase
        .from('profiles')
        .select('id', { count: 'exact', head: true })
        .eq('is_active', true)
        .is('deleted_at', null);
      await assertWithinLimit({
        organizationId: params.organizationId,
        featureKey: FEATURES.USERS_MAX,
        currentCount: profileCount ?? 0,
      });

      const tempPassword = `Sv${randomBytes(9).toString('base64url')}!`;
      const created = await service.auth.admin.createUser({
        email,
        password: tempPassword,
        email_confirm: true,
        user_metadata: {
          full_name: params.fullName,
          organization_id: params.organizationId,
          role: 'veterinarian',
        },
      });
      if (created.error || !created.data.user) {
        return { error: created.error?.message || 'No se pudo crear el usuario de agenda' };
      }
      userId = created.data.user.id;
    }
  }

  if (!userId) {
    return { error: 'Indicá un email o vinculá un usuario para agenda' };
  }

  await assertAgendaSeatAvailable(params.organizationId, userId);

  const { error: profileError } = await service.from('profiles').upsert(
    {
      id: userId,
      organization_id: params.organizationId,
      full_name: params.fullName,
      is_active: true,
      deleted_at: null,
    },
    { onConflict: 'id' }
  );
  if (profileError) {
    return { error: rpcErrorMessage(profileError) };
  }

  for (const branchId of branchIds) {
    const { error: memberError } = await service.from('branch_members').upsert(
      {
        organization_id: params.organizationId,
        branch_id: branchId,
        user_id: userId,
        role: 'veterinarian',
        is_active: true,
        deleted_at: null,
      },
      { onConflict: 'branch_id,user_id' }
    );
    if (memberError) {
      // Fallback if unique constraint name differs: soft update path via RPC.
      const { error: rpcError } = await supabase.rpc('add_team_member', {
        p_user_id: userId,
        p_branch_id: branchId,
        p_role: 'veterinarian',
      });
      if (rpcError) {
        return { error: rpcErrorMessage(memberError) || rpcError.message };
      }
    }
  }

  return { userId };
}

function normalizeTime(value: string): string {
  return value.length === 5 ? `${value}:00` : value;
}

function parseSchedulesJson(raw: FormDataEntryValue | null): Array<{
  weekday: number;
  startTime: string;
  endTime: string;
  slotDurationMinutes: number;
}> {
  if (typeof raw !== 'string' || !raw.trim()) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((row) => {
        if (!row || typeof row !== 'object') return null;
        const item = row as Record<string, unknown>;
        const weekday = Number(item.weekday);
        const startTime = String(item.startTime ?? '');
        const endTime = String(item.endTime ?? '');
        const slotDurationMinutes = Number(item.slotDurationMinutes ?? 30);
        if (!Number.isInteger(weekday) || weekday < 1 || weekday > 7) return null;
        if (!/^\d{2}:\d{2}/.test(startTime) || !/^\d{2}:\d{2}/.test(endTime)) return null;
        return {
          weekday,
          startTime,
          endTime,
          slotDurationMinutes:
            Number.isFinite(slotDurationMinutes) && slotDurationMinutes >= 5
              ? slotDurationMinutes
              : 30,
        };
      })
      .filter((row): row is NonNullable<typeof row> => Boolean(row));
  } catch {
    return [];
  }
}

async function saveProfessionalSchedules(params: {
  userId: string;
  branchIds: string[];
  schedules: Array<{
    weekday: number;
    startTime: string;
    endTime: string;
    slotDurationMinutes: number;
  }>;
}): Promise<string | null> {
  if (params.schedules.length === 0 || params.branchIds.length === 0) return null;
  const supabase = await createServerClient();
  for (const branchId of params.branchIds) {
    for (const schedule of params.schedules) {
      const { error } = await supabase.rpc('upsert_professional_schedule', {
        p_branch_id: branchId,
        p_user_id: params.userId,
        p_weekday: schedule.weekday,
        p_start_time: normalizeTime(schedule.startTime),
        p_end_time: normalizeTime(schedule.endTime),
        p_slot_duration_minutes: schedule.slotDurationMinutes,
        p_allowed_appointment_types: null,
        p_is_active: true,
        p_id: null,
      });
      if (error) {
        if (/schema cache|does not exist|Could not find the (table|function)/i.test(error.message)) {
          return null;
        }
        return rpcErrorMessage(error);
      }
    }
  }
  revalidatePath('/agenda');
  revalidatePath('/agenda/disponibilidad');
  return null;
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
    relationship_type: row.relationship_type as Professional['relationship_type'],
    start_date: row.start_date ? String(row.start_date) : null,
    end_date: row.end_date ? String(row.end_date) : null,
    is_active: Boolean(row.is_active),
    invoice_required: Boolean(row.invoice_required),
    notes: row.notes ? String(row.notes) : null,
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
  if (settlementsError) {
    if (/schema cache|does not exist|Could not find the (table|function)/i.test(settlementsError.message)) {
      return {
        openBalance: 0,
        pendingSettlementCount: 0,
        approvedUnpaidCount: 0,
        activeSchemeName: null,
        lastPaymentAmount: null,
        lastPaymentDate: null,
        lastPaymentSettlementId: null,
      };
    }
    throw settlementsError;
  }
  if (schemesError) {
    if (/schema cache|does not exist|Could not find the (table|function)/i.test(schemesError.message)) {
      return {
        openBalance: 0,
        pendingSettlementCount: 0,
        approvedUnpaidCount: 0,
        activeSchemeName: null,
        lastPaymentAmount: null,
        lastPaymentDate: null,
        lastPaymentSettlementId: null,
      };
    }
    throw schemesError;
  }
  if (paymentError) {
    if (/schema cache|does not exist|Could not find the (table|function)/i.test(paymentError.message)) {
      return {
        openBalance: 0,
        pendingSettlementCount: 0,
        approvedUnpaidCount: 0,
        activeSchemeName: null,
        lastPaymentAmount: null,
        lastPaymentDate: null,
        lastPaymentSettlementId: null,
      };
    }
    throw paymentError;
  }

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
}

export async function hasLinkedProfessionalProfile(): Promise<boolean> {
  const professional = await getProfessionalForCurrentUser();
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

    const enableAgenda =
      formData.get('enableAgenda') === 'true' || formData.get('enableAgenda') === 'on';
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
      relationshipType: formData.get('relationshipType'),
      startDate: formData.get('startDate') || null,
      endDate: formData.get('endDate') || null,
      isActive: formData.get('isActive') === 'true' || formData.get('isActive') === 'on',
      invoiceRequired: formData.get('invoiceRequired') === 'true' || formData.get('invoiceRequired') === 'on',
      notes: formData.get('notes') || null,
      branchIds: formData.getAll('branchIds').map(String).filter(Boolean),
      enableAgenda,
      agendaEmail: formData.get('agendaEmail') || null,
    });

    if (!parsed.success) {
      return {
        success: false,
        error: 'Datos inválidos',
        fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
      };
    }

    let branchIds = parsed.data.branchIds;
    if (branchIds.length === 0 && session.branchId) {
      branchIds = [session.branchId];
    }

    let userId = parsed.data.userId ?? null;
    let profileId = parsed.data.profileId ?? null;

    if (enableAgenda) {
      const agenda = await ensureProfessionalAgendaAccess({
        organizationId: session.organizationId,
        branchIds,
        fullName: `${parsed.data.firstName} ${parsed.data.lastName}`.trim(),
        userId,
        agendaEmail: parsed.data.agendaEmail,
      });
      if ('error' in agenda) {
        return { success: false, error: agenda.error };
      }
      userId = agenda.userId;
      profileId = agenda.userId;
    }

    const supabase = await createServerClient();
    const { data, error } = await supabase
      .from('professionals')
      .insert({
        organization_id: session.organizationId,
        user_id: userId,
        profile_id: profileId,
        first_name: parsed.data.firstName,
        last_name: parsed.data.lastName,
        document_number: parsed.data.documentNumber ?? null,
        tax_id: parsed.data.taxId ?? null,
        professional_license: parsed.data.professionalLicense ?? null,
        professional_license_jurisdiction: parsed.data.professionalLicenseJurisdiction ?? null,
        specialty: parsed.data.specialty ?? null,
        relationship_type: parsed.data.relationshipType,
        start_date: parsed.data.startDate ?? null,
        end_date: parsed.data.endDate ?? null,
        is_active: parsed.data.isActive ?? true,
        invoice_required: parsed.data.invoiceRequired ?? false,
        notes: parsed.data.notes ?? null,
      })
      .select('*')
      .single();

    if (error) {
      return { success: false, error: rpcErrorMessage(error) };
    }

    if (branchIds.length > 0) {
      const branchRows = branchIds.map((branchId: string) => ({
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

    if (userId) {
      const schedules = parseSchedulesJson(formData.get('schedulesJson'));
      const scheduleError = await saveProfessionalSchedules({
        userId,
        branchIds,
        schedules,
      });
      if (scheduleError) {
        return {
          success: false,
          error: `Profesional creado, pero no se pudieron guardar los horarios: ${scheduleError}`,
        };
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
      enableAgenda:
        formData.get('enableAgenda') === 'true' || formData.get('enableAgenda') === 'on'
          ? true
          : undefined,
      agendaEmail: formData.get('agendaEmail') || undefined,
    });

    if (!parsed.success) {
      return {
        success: false,
        error: 'Datos inválidos',
        fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
      };
    }

    const session = await getSessionContext();
    if (!session) return { success: false, error: 'Sesión inválida' };

    const { id, branchIds, enableAgenda, agendaEmail, ...fields } = parsed.data;
    const patch: ProfessionalUpdate = {};
    if (fields.userId !== undefined) patch.user_id = fields.userId;
    if (fields.profileId !== undefined) patch.profile_id = fields.profileId;
    if (fields.firstName !== undefined) patch.first_name = fields.firstName;
    if (fields.lastName !== undefined) patch.last_name = fields.lastName;
    if (fields.documentNumber !== undefined) patch.document_number = fields.documentNumber;
    if (fields.taxId !== undefined) patch.tax_id = fields.taxId;
    if (fields.professionalLicense !== undefined) patch.professional_license = fields.professionalLicense;
    if (fields.professionalLicenseJurisdiction !== undefined) {
      patch.professional_license_jurisdiction = fields.professionalLicenseJurisdiction;
    }
    if (fields.specialty !== undefined) patch.specialty = fields.specialty;
    if (fields.relationshipType !== undefined) patch.relationship_type = fields.relationshipType;
    if (fields.startDate !== undefined) patch.start_date = fields.startDate;
    if (fields.endDate !== undefined) patch.end_date = fields.endDate;
    if (fields.isActive !== undefined) patch.is_active = fields.isActive;
    if (fields.invoiceRequired !== undefined) patch.invoice_required = fields.invoiceRequired;
    if (fields.notes !== undefined) patch.notes = fields.notes;

    const supabase = await createServerClient();
    const { data: existing, error: existingError } = await supabase
      .from('professionals')
      .select('*')
      .eq('id', id)
      .is('deleted_at', null)
      .maybeSingle();
    if (existingError || !existing) {
      return { success: false, error: 'Profesional no encontrado' };
    }

    let resolvedBranchIds: string[] =
      branchIds ??
      (
        await supabase
          .from('professional_branches')
          .select('branch_id')
          .eq('professional_id', id)
          .eq('is_active', true)
          .is('deleted_at', null)
      ).data?.map((row) => String(row.branch_id)) ??
      [];
    if (resolvedBranchIds.length === 0 && session.branchId) {
      resolvedBranchIds = [session.branchId];
    }

    if (enableAgenda === true || (!existing.user_id && (fields.userId || agendaEmail))) {
      const agenda = await ensureProfessionalAgendaAccess({
        organizationId: session.organizationId,
        branchIds: resolvedBranchIds,
        fullName: `${fields.firstName ?? existing.first_name} ${fields.lastName ?? existing.last_name}`.trim(),
        userId: (fields.userId as string | undefined) ?? existing.user_id,
        agendaEmail: agendaEmail as string | undefined,
      });
      if ('error' in agenda) {
        return { success: false, error: agenda.error };
      }
      patch.user_id = agenda.userId;
      patch.profile_id = agenda.userId;
    }

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
        const branchRows = branchIds.map((branchId: string) => ({
          organization_id: session.organizationId,
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

    const linkedUserId = (patch.user_id as string | undefined) ?? data.user_id ?? null;
    if (linkedUserId) {
      const schedules = parseSchedulesJson(formData.get('schedulesJson'));
      if (schedules.length > 0) {
        const scheduleError = await saveProfessionalSchedules({
          userId: String(linkedUserId),
          branchIds: resolvedBranchIds,
          schedules,
        });
        if (scheduleError) {
          return {
            success: false,
            error: `Profesional actualizado, pero no se pudieron guardar los horarios: ${scheduleError}`,
          };
        }
      }
    }

    revalidateProfessionalsModule();
    return { success: true, data: mapProfessional(data as Record<string, unknown>) };
  } catch (error) {
    return actionError(error);
  }
}
