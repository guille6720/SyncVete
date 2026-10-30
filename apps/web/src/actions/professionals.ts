'use server';

import { revalidatePath } from 'next/cache';
import {
  professionalCreateSchema,
  type ActionResult,
  type Professional,
  type ProfessionalBranch,
  type ProfessionalListRow,
  type ProfessionalSettlementSummary,
} from '@sincvete/shared';
import { createServerClient } from '@/lib/supabase/server';
import {
  PermissionError,
  canPermissionAndFeature,
  requirePermissionAndFeature,
} from '@/lib/permissions';
import {
  FEATURES,
  planRestrictionResult,
  canUseFeature,
  assertWithinLimit,
} from '@/lib/entitlements';
import { getSessionContext } from '@/actions/auth';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import { explainAgendaProblem } from '@/lib/agenda-problems';
import { parseProfessionalScheduleInput } from '@/lib/professional-schedule-input';

function revalidateProfessionalsModule() {
  revalidatePath('/profesionales');
  revalidatePath('/liquidaciones');
  revalidatePath('/configuracion');
  revalidatePath('/agenda');
  revalidatePath('/agenda/nueva');
  revalidatePath('/agenda/turnos');
  revalidatePath('/agenda/disponibilidad');
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
    return { success: false, error: explainAgendaProblem(error.message).message };
  }
  console.error(error);
  return { success: false, error: 'Ocurrió un error inesperado' };
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

export async function listProfessionals(
  input: { activeOnly?: boolean } = {}
): Promise<Professional[]> {
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

  const [canReadCompensation, canReadSettlements] = await Promise.all([
    canPermissionAndFeature('professional_compensation:read', FEATURES.PROFESSIONALS_SETTLEMENTS),
    canPermissionAndFeature('professional_settlements:read', FEATURES.PROFESSIONALS_SETTLEMENTS),
  ]);

  const [
    { data: settlements, error: settlementsError },
    { data: schemes, error: schemesError },
    { data: payments, error: paymentsError },
  ] = await Promise.all([
    canReadSettlements
      ? supabase
          .from('professional_settlements')
          .select('professional_id, balance_due, status')
          .in('professional_id', professionalIds)
          .is('deleted_at', null)
      : Promise.resolve({ data: [], error: null }),
    canReadCompensation
      ? supabase
          .from('professional_compensation_schemes')
          .select('professional_id, name, is_active, valid_from, valid_to')
          .in('professional_id', professionalIds)
          .is('deleted_at', null)
          .eq('is_active', true)
      : Promise.resolve({ data: [], error: null }),
    canReadSettlements
      ? supabase
          .from('professional_payments')
          .select('professional_id, amount, paid_at, settlement_id')
          .in('professional_id', professionalIds)
          .is('deleted_at', null)
          .order('paid_at', { ascending: false })
      : Promise.resolve({ data: [], error: null }),
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
  await requirePermissionAndFeature(
    'professional_settlements:read',
    FEATURES.PROFESSIONALS_SETTLEMENTS
  );
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
    if (
      /schema cache|does not exist|Could not find the (table|function)/i.test(
        settlementsError.message
      )
    ) {
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
    if (
      /schema cache|does not exist|Could not find the (table|function)/i.test(schemesError.message)
    ) {
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
    if (
      /schema cache|does not exist|Could not find the (table|function)/i.test(paymentError.message)
    ) {
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
    lastPaymentSettlementId: lastPayment?.settlement_id ? String(lastPayment.settlement_id) : null,
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

async function persistProfessional(
  formData: FormData,
  create: boolean
): Promise<ActionResult<Professional>> {
  try {
    const session = await requirePermissionAndFeature(
      'professionals:write',
      FEATURES.PROFESSIONALS_SETTLEMENTS
    );
    const scheduleInput = parseProfessionalScheduleInput(formData.get('schedulesJson'));
    if (!scheduleInput.success) return { success: false, error: scheduleInput.error };
    if (scheduleInput.schedules !== undefined)
      await requirePermissionAndFeature('appointments:write', FEATURES.APPOINTMENTS);
    const parsed = professionalCreateSchema.safeParse({
      firstName: formData.get('firstName'),
      lastName: formData.get('lastName'),
      specialty: formData.get('specialty') || null,
      relationshipType: formData.get('relationshipType') || 'independent',
      documentNumber: formData.get('documentNumber') || null,
      taxId: formData.get('taxId') || null,
      professionalLicense: formData.get('professionalLicense') || null,
      professionalLicenseJurisdiction: formData.get('professionalLicenseJurisdiction') || null,
      startDate: formData.get('startDate') || null,
      endDate: formData.get('endDate') || null,
      isActive: formData.get('isActive') !== 'false',
      invoiceRequired: formData.has('invoiceRequired'),
      notes: formData.get('notes') || null,
      branchIds: formData.getAll('branchIds').map(String).filter(Boolean),
    });
    if (!parsed.success)
      return {
        success: false,
        error: 'Revisá los campos marcados para guardar el profesional.',
        fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
      };
    const idInput = z
      .string()
      .uuid()
      .safeParse(formData.get(create ? 'draftId' : 'id') || (create ? randomUUID() : ''));
    if (!idInput.success)
      return {
        success: false,
        error: 'No se pudo identificar la ficha. Volvé a abrir el formulario.',
      };
    const branchIds = parsed.data.branchIds.length
      ? parsed.data.branchIds
      : session.branchId
        ? [session.branchId]
        : [];
    if (!branchIds.length)
      return { success: false, error: 'Seleccioná una sucursal para guardar el profesional.' };
    if (formData.get('nextStep') === 'appointment' && !scheduleInput.schedules?.length)
      return {
        success: false,
        error:
          'Agregá al menos un día y horario antes de crear el primer turno. También podés guardar la ficha y cargar los horarios después.',
      };
    const supabase = await createServerClient();
    if (create) {
      const { count, error: countError } = await supabase
        .from('professionals')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', session.organizationId)
        .eq('is_active', true)
        .is('deleted_at', null);
      if (countError)
        return {
          success: false,
          error:
            'No se pudo comprobar el límite de profesionales. Reintentá; tus datos siguen cargados.',
        };
      const { data: retry } = await supabase
        .from('professionals')
        .select('id')
        .eq('id', idInput.data)
        .maybeSingle();
      if (!retry)
        await assertWithinLimit({
          organizationId: session.organizationId,
          featureKey: FEATURES.PROFESSIONALS_MAX,
          currentCount: count ?? 0,
        });
    }
    const d = parsed.data;
    const { data, error } = await supabase.rpc('save_professional_with_agenda', {
      p_id: idInput.data,
      p_create: create,
      p_branch_ids: branchIds,
      p_data: {
        first_name: d.firstName,
        last_name: d.lastName,
        specialty: d.specialty ?? null,
        relationship_type: d.relationshipType,
        document_number: d.documentNumber ?? null,
        tax_id: d.taxId ?? null,
        professional_license: d.professionalLicense ?? null,
        professional_license_jurisdiction: d.professionalLicenseJurisdiction ?? null,
        start_date: d.startDate ?? null,
        end_date: d.endDate ?? null,
        is_active: d.isActive,
        invoice_required: d.invoiceRequired,
        notes: d.notes ?? null,
      },
      p_schedules:
        scheduleInput.schedules?.map((w) => ({
          weekday: w.weekday,
          start_time: w.startTime,
          end_time: w.endTime,
          slot_duration_minutes: w.slotDurationMinutes,
        })) ?? null,
    });
    if (error) return { success: false, error: explainAgendaProblem(error.message).message };
    if (!data || typeof data !== 'object' || Array.isArray(data) || data.id !== idInput.data)
      return {
        success: false,
        error:
          'No se pudo confirmar el guardado. Reintentá sin cerrar el formulario; no se duplicará la ficha.',
      };
    revalidateProfessionalsModule();
    revalidatePath(`/profesionales/${idInput.data}`);
    return { success: true, data: mapProfessional(data as Record<string, unknown>) };
  } catch (error) {
    return actionError(error);
  }
}
export async function createProfessional(
  _prev: ActionResult<Professional> | null,
  formData: FormData
): Promise<ActionResult<Professional>> {
  return persistProfessional(formData, true);
}
export async function updateProfessional(
  _prev: ActionResult<Professional> | null,
  formData: FormData
): Promise<ActionResult<Professional>> {
  return persistProfessional(formData, false);
}
