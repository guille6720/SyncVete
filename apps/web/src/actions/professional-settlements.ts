'use server';

import { revalidatePath } from 'next/cache';
import {
  approveSettlementSchema,
  calculateSettlementSchema,
  bulkCalculateSettlementsSchema,
  voidProfessionalPaymentSchema,
  linkProfessionalPaymentToCashSchema,
  cancelSettlementSchema,
  compensationRuleCreateSchema,
  compensationRuleUpdateSchema,
  compensationSchemeCreateSchema,
  compensationSchemeUpdateSchema,
  listSettlementsSchema,
  bulkSettlementIdsSchema,
  bulkRegisterProfessionalPaymentsSchema,
  registerProfessionalPaymentSchema,
  settlementAdjustmentSchema,
  settlementNotesSchema,
  deleteSettlementAdjustmentSchema,
  updateSettlementAdjustmentSchema,
  omitSettlementItemSchema,
  restoreSettlementOmissionSchema,
  returnSettlementToDraftSchema,
  cloneCompensationSchemeSchema,
  type ActionResult,
  type CalculateSettlementResult,
  type CompensationRule,
  type CompensationScheme,
  type ProfessionalSettlement,
  type ProfessionalSettlementDetail,
  mapSettlementRow,
  buildPaginatedResult,
  buildCsv,
  buildProfessionalPaymentCashNote,
  SETTLEMENT_ADJUSTMENT_TYPE_LABELS,
  SETTLEMENT_ITEM_SOURCE_TYPE_LABELS,
  SETTLEMENT_STATUS_LABELS,
  type SettlementsSummary,
  type SettlementSourceClaimInfo,
  type SettlementItemSourceType,
  type SettlementDuplicateClaimWarning,
  type MySettlementsSummary,
  type ReportProfessionalsSettlements,
  type BulkSettlementActionResult,
  type BulkCalculateSettlementsResult,
  getSettlementItemSourceHref,
  compensationSchemeRangesOverlap,
  addDaysIso,
  SETTLEMENT_EXPORT_MAX_ROWS,
  parseSettlementReturnNotes,
  mergeSettlementReturnNotes,
} from '@sincvete/shared';
import { createServerClient } from '@/lib/supabase/server';
import {
  getProfessional,
  getProfessionalForCurrentUser,
  listProfessionals,
} from '@/actions/professionals';
import {
  PermissionError,
  canPermissionAndFeature,
  requirePermission,
  requirePermissionAndFeature,
} from '@/lib/permissions';
import { getSessionContext } from '@/actions/auth';
import { FEATURES, planRestrictionResult, requireFeature } from '@/lib/entitlements';
import type { Database, Json } from '@sincvete/db';

type CompensationSchemeUpdate = Database['public']['Tables']['professional_compensation_schemes']['Update'];
type CompensationRuleUpdate = Database['public']['Tables']['professional_compensation_rules']['Update'];

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

function buildSchemeConditionsFromForm(formData: FormData): Record<string, unknown> | null {
  const anchorDate = String(formData.get('anchorDate') ?? '').trim();
  const periodDaysRaw = String(formData.get('periodDays') ?? '').trim();
  const conditions: Record<string, unknown> = {};
  if (anchorDate) conditions.anchor_date = anchorDate;
  if (periodDaysRaw) {
    const periodDays = Number(periodDaysRaw);
    if (Number.isFinite(periodDays) && periodDays > 0) {
      conditions.period_days = periodDays;
    }
  }
  return Object.keys(conditions).length > 0 ? conditions : null;
}

function mapScheme(row: Record<string, unknown>): CompensationScheme {
  return {
    id: String(row.id),
    organization_id: String(row.organization_id),
    professional_id: String(row.professional_id),
    name: String(row.name),
    valid_from: String(row.valid_from),
    valid_to: row.valid_to ? String(row.valid_to) : null,
    currency: String(row.currency ?? 'ARS'),
    is_active: Boolean(row.is_active),
    conditions: (row.conditions as Record<string, unknown> | null) ?? null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
    deleted_at: row.deleted_at ? String(row.deleted_at) : null,
  };
}

function mapRule(row: Record<string, unknown>): CompensationRule {
  return {
    id: String(row.id),
    organization_id: String(row.organization_id),
    compensation_scheme_id: String(row.compensation_scheme_id),
    rule_type: row.rule_type as CompensationRule['rule_type'],
    frequency: row.frequency as CompensationRule['frequency'],
    amount: row.amount != null ? Number(row.amount) : null,
    percentage: row.percentage != null ? Number(row.percentage) : null,
    activity_type: row.activity_type ? String(row.activity_type) : null,
    minimum_amount: row.minimum_amount != null ? Number(row.minimum_amount) : null,
    maximum_amount: row.maximum_amount != null ? Number(row.maximum_amount) : null,
    conditions: (row.conditions as Record<string, unknown> | null) ?? null,
    is_active: Boolean(row.is_active),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
    deleted_at: row.deleted_at ? String(row.deleted_at) : null,
  };
}

async function findOverlappingActiveScheme(
  supabase: Awaited<ReturnType<typeof createServerClient>>,
  professionalId: string,
  range: { validFrom: string; validTo?: string | null },
  options?: { excludeSchemeId?: string }
): Promise<{ id: string; name: string } | null> {
  const { data: peers, error } = await supabase
    .from('professional_compensation_schemes')
    .select('id, name, valid_from, valid_to')
    .eq('professional_id', professionalId)
    .is('deleted_at', null)
    .eq('is_active', true);
  if (error) throw error;

  for (const peer of peers ?? []) {
    if (options?.excludeSchemeId && String(peer.id) === options.excludeSchemeId) continue;
    if (
      compensationSchemeRangesOverlap(range, {
        validFrom: String(peer.valid_from),
        validTo: peer.valid_to ? String(peer.valid_to) : null,
      })
    ) {
      return { id: String(peer.id), name: String(peer.name) };
    }
  }
  return null;
}

export async function canReadProfessionalCompensation(): Promise<boolean> {
  return canPermissionAndFeature(
    'professional_compensation:read',
    FEATURES.PROFESSIONALS_SETTLEMENTS
  );
}

export async function canReadProfessionalSettlements(): Promise<boolean> {
  return canPermissionAndFeature('professional_settlements:read', FEATURES.PROFESSIONALS_SETTLEMENTS);
}

export async function canReadOwnProfessionalSettlements(): Promise<boolean> {
  return (await getProfessionalForCurrentUser()) != null;
}

export async function canReadSettlementSourceClaims(): Promise<'admin' | 'own' | null> {
  if (await canReadProfessionalSettlements()) return 'admin';
  if (await getProfessionalForCurrentUser()) return 'own';
  return null;
}

export async function canViewProfessionalSettlement(
  settlementProfessionalId: string
): Promise<'admin' | 'own' | null> {
  const linked = await getProfessionalForCurrentUser();
  if (linked && linked.id === settlementProfessionalId) return 'own';
  const canReadAll = await canReadProfessionalSettlements();
  if (canReadAll) return 'admin';
  return null;
}

export async function canWriteProfessionalCompensation(): Promise<boolean> {
  return canPermissionAndFeature(
    'professional_compensation:write',
    FEATURES.PROFESSIONALS_SETTLEMENTS
  );
}

export async function canApproveProfessionalSettlements(): Promise<boolean> {
  return canPermissionAndFeature(
    'professional_settlements:approve',
    FEATURES.PROFESSIONALS_SETTLEMENTS
  );
}

export async function canPayProfessionalSettlements(): Promise<boolean> {
  return canPermissionAndFeature('professional_settlements:pay', FEATURES.PROFESSIONALS_SETTLEMENTS);
}

export async function listCompensationSchemes(professionalId: string): Promise<CompensationScheme[]> {
  await requirePermissionAndFeature(
    'professional_compensation:read',
    FEATURES.PROFESSIONALS_SETTLEMENTS
  );
  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from('professional_compensation_schemes')
    .select('*')
    .eq('professional_id', professionalId)
    .is('deleted_at', null)
    .order('valid_from', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((row) => mapScheme(row as Record<string, unknown>));
}

export async function listCompensationRules(schemeId: string): Promise<CompensationRule[]> {
  await requirePermissionAndFeature(
    'professional_compensation:read',
    FEATURES.PROFESSIONALS_SETTLEMENTS
  );
  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from('professional_compensation_rules')
    .select('*')
    .eq('compensation_scheme_id', schemeId)
    .is('deleted_at', null)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []).map((row) => mapRule(row as Record<string, unknown>));
}

export async function createCompensationScheme(
  _prev: ActionResult<CompensationScheme> | null,
  formData: FormData
): Promise<ActionResult<CompensationScheme>> {
  try {
    await requirePermissionAndFeature(
      'professional_compensation:write',
      FEATURES.PROFESSIONALS_SETTLEMENTS
    );
    const parsed = compensationSchemeCreateSchema.safeParse({
      professionalId: formData.get('professionalId'),
      name: formData.get('name'),
      validFrom: formData.get('validFrom'),
      validTo: formData.get('validTo') || null,
      currency: formData.get('currency') || 'ARS',
      isActive: formData.get('isActive') !== 'false',
      conditions: buildSchemeConditionsFromForm(formData),
    });
    if (!parsed.success) {
      return { success: false, error: 'Datos inválidos' };
    }

    const supabase = await createServerClient();
    const { data: professional, error: profError } = await supabase
      .from('professionals')
      .select('organization_id')
      .eq('id', parsed.data.professionalId)
      .is('deleted_at', null)
      .single();
    if (profError || !professional) {
      return { success: false, error: 'Profesional no encontrado' };
    }

    if (parsed.data.isActive !== false) {
      const overlap = await findOverlappingActiveScheme(
        supabase,
        parsed.data.professionalId,
        {
          validFrom: parsed.data.validFrom,
          validTo: parsed.data.validTo ?? null,
        }
      );
      if (overlap) {
        return {
          success: false,
          error: `El período se solapa con el esquema activo "${overlap.name}"`,
        };
      }
    }

    const { data, error } = await supabase
      .from('professional_compensation_schemes')
      .insert({
        organization_id: professional.organization_id,
        professional_id: parsed.data.professionalId,
        name: parsed.data.name,
        valid_from: parsed.data.validFrom,
        valid_to: parsed.data.validTo ?? null,
        currency: parsed.data.currency,
        is_active: parsed.data.isActive ?? true,
        conditions: (parsed.data.conditions ?? {}) as Json,
      })
      .select('*')
      .single();

    if (error) return { success: false, error: rpcErrorMessage(error) };
    revalidateProfessionalsModule();
    return { success: true, data: mapScheme(data as Record<string, unknown>) };
  } catch (error) {
    return actionError(error);
  }
}

export async function updateCompensationScheme(
  _prev: ActionResult<CompensationScheme> | null,
  formData: FormData
): Promise<ActionResult<CompensationScheme>> {
  try {
    await requirePermissionAndFeature(
      'professional_compensation:write',
      FEATURES.PROFESSIONALS_SETTLEMENTS
    );
    const parsed = compensationSchemeUpdateSchema.safeParse({
      id: formData.get('id'),
      professionalId: formData.get('professionalId') || undefined,
      name: formData.get('name') || undefined,
      validFrom: formData.get('validFrom') || undefined,
      validTo: formData.get('validTo') || undefined,
      currency: formData.get('currency') || undefined,
      isActive: formData.has('isActive') ? formData.get('isActive') !== 'false' : undefined,
      conditions: formData.get('conditions')
        ? JSON.parse(String(formData.get('conditions')))
        : formData.has('anchorDate') || formData.has('periodDays')
          ? buildSchemeConditionsFromForm(formData)
          : undefined,
    });
    if (!parsed.success) return { success: false, error: 'Datos inválidos' };

    const { id, ...fields } = parsed.data;
    const supabase = await createServerClient();
    const { data: current, error: currentError } = await supabase
      .from('professional_compensation_schemes')
      .select('id, professional_id, valid_from, valid_to, is_active')
      .eq('id', id)
      .is('deleted_at', null)
      .single();
    if (currentError || !current) {
      return { success: false, error: 'Esquema no encontrado' };
    }

    const nextIsActive =
      fields.isActive !== undefined ? fields.isActive : Boolean(current.is_active);
    const nextFrom =
      fields.validFrom !== undefined ? fields.validFrom : String(current.valid_from);
    const nextTo =
      fields.validTo !== undefined
        ? fields.validTo
        : current.valid_to
          ? String(current.valid_to)
          : null;

    if (nextIsActive) {
      const overlap = await findOverlappingActiveScheme(
        supabase,
        String(current.professional_id),
        { validFrom: nextFrom, validTo: nextTo },
        { excludeSchemeId: id }
      );
      if (overlap) {
        return {
          success: false,
          error: `El período se solapa con el esquema activo "${overlap.name}"`,
        };
      }
    }

    const patch: CompensationSchemeUpdate = {};
    if (fields.name !== undefined) patch.name = fields.name;
    if (fields.validFrom !== undefined) patch.valid_from = fields.validFrom;
    if (fields.validTo !== undefined) patch.valid_to = fields.validTo;
    if (fields.currency !== undefined) patch.currency = fields.currency;
    if (fields.isActive !== undefined) patch.is_active = fields.isActive;
    if (fields.conditions !== undefined) patch.conditions = fields.conditions as Json;

    const { data, error } = await supabase
      .from('professional_compensation_schemes')
      .update(patch)
      .eq('id', id)
      .is('deleted_at', null)
      .select('*')
      .single();
    if (error) return { success: false, error: rpcErrorMessage(error) };
    revalidateProfessionalsModule();
    return { success: true, data: mapScheme(data as Record<string, unknown>) };
  } catch (error) {
    return actionError(error);
  }
}

export async function cloneCompensationScheme(
  _prev: ActionResult<CompensationScheme> | null,
  formData: FormData
): Promise<ActionResult<CompensationScheme>> {
  try {
    await requirePermissionAndFeature(
      'professional_compensation:write',
      FEATURES.PROFESSIONALS_SETTLEMENTS
    );
    const parsed = cloneCompensationSchemeSchema.safeParse({
      sourceSchemeId: formData.get('sourceSchemeId'),
      name: formData.get('name'),
      validFrom: formData.get('validFrom'),
      validTo: formData.get('validTo') || null,
      deactivateSource: formData.get('deactivateSource') === 'true',
    });
    if (!parsed.success) {
      return {
        success: false,
        error: 'Datos inválidos',
        fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
      };
    }

    const supabase = await createServerClient();
    const { data: source, error: sourceError } = await supabase
      .from('professional_compensation_schemes')
      .select('*')
      .eq('id', parsed.data.sourceSchemeId)
      .is('deleted_at', null)
      .single();
    if (sourceError || !source) return { success: false, error: 'Esquema origen no encontrado' };

    const overlap = await findOverlappingActiveScheme(
      supabase,
      String(source.professional_id),
      {
        validFrom: parsed.data.validFrom,
        validTo: parsed.data.validTo ?? null,
      },
      {
        excludeSchemeId: parsed.data.deactivateSource ? String(source.id) : undefined,
      }
    );
    if (overlap) {
      return {
        success: false,
        error: `El período se solapa con el esquema activo "${overlap.name}"`,
      };
    }

    const { data: rules, error: rulesError } = await supabase
      .from('professional_compensation_rules')
      .select('*')
      .eq('compensation_scheme_id', parsed.data.sourceSchemeId)
      .is('deleted_at', null)
      .eq('is_active', true);
    if (rulesError) return { success: false, error: rpcErrorMessage(rulesError) };

    const { data: created, error: createError } = await supabase
      .from('professional_compensation_schemes')
      .insert({
        organization_id: source.organization_id,
        professional_id: source.professional_id,
        name: parsed.data.name,
        valid_from: parsed.data.validFrom,
        valid_to: parsed.data.validTo,
        currency: source.currency,
        is_active: true,
        conditions: source.conditions,
      })
      .select('*')
      .single();
    if (createError || !created) {
      return { success: false, error: createError ? rpcErrorMessage(createError) : 'No se pudo clonar' };
    }

    if ((rules ?? []).length > 0) {
      const { error: insertRulesError } = await supabase.from('professional_compensation_rules').insert(
        (rules ?? []).map((rule) => ({
          organization_id: source.organization_id,
          compensation_scheme_id: created.id,
          rule_type: rule.rule_type,
          frequency: rule.frequency,
          amount: rule.amount,
          percentage: rule.percentage,
          activity_type: rule.activity_type,
          minimum_amount: rule.minimum_amount,
          maximum_amount: rule.maximum_amount,
          conditions: rule.conditions,
          is_active: true,
        }))
      );
      if (insertRulesError) {
        await supabase
          .from('professional_compensation_schemes')
          .update({ deleted_at: new Date().toISOString(), is_active: false })
          .eq('id', created.id);
        return { success: false, error: rpcErrorMessage(insertRulesError) };
      }
    }

    if (parsed.data.deactivateSource) {
      const validTo = addDaysIso(parsed.data.validFrom, -1);
      await supabase
        .from('professional_compensation_schemes')
        .update({
          is_active: false,
          valid_to: source.valid_to && String(source.valid_to) < validTo ? source.valid_to : validTo,
        })
        .eq('id', source.id)
        .is('deleted_at', null);
    }

    revalidateProfessionalsModule();
    return { success: true, data: mapScheme(created as Record<string, unknown>) };
  } catch (error) {
    return actionError(error);
  }
}

export async function createCompensationRule(
  _prev: ActionResult<CompensationRule> | null,
  formData: FormData
): Promise<ActionResult<CompensationRule>> {
  try {
    await requirePermissionAndFeature(
      'professional_compensation:write',
      FEATURES.PROFESSIONALS_SETTLEMENTS
    );
    const parsed = compensationRuleCreateSchema.safeParse({
      compensationSchemeId: formData.get('compensationSchemeId'),
      ruleType: formData.get('ruleType'),
      frequency: formData.get('frequency'),
      amount: formData.get('amount') || null,
      percentage: formData.get('percentage') || null,
      activityType: formData.get('activityType') || null,
      minimumAmount: formData.get('minimumAmount') || null,
      maximumAmount: formData.get('maximumAmount') || null,
      conditions: formData.get('conditions')
        ? JSON.parse(String(formData.get('conditions')))
        : null,
      isActive: formData.get('isActive') !== 'false',
    });
    if (!parsed.success) {
      return {
        success: false,
        error: 'Datos inválidos',
        fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
      };
    }

    const supabase = await createServerClient();
    const { data: scheme, error: schemeError } = await supabase
      .from('professional_compensation_schemes')
      .select('organization_id')
      .eq('id', parsed.data.compensationSchemeId)
      .is('deleted_at', null)
      .single();
    if (schemeError || !scheme) return { success: false, error: 'Esquema no encontrado' };

    const { data, error } = await supabase
      .from('professional_compensation_rules')
      .insert({
        organization_id: scheme.organization_id,
        compensation_scheme_id: parsed.data.compensationSchemeId,
        rule_type: parsed.data.ruleType,
        frequency: parsed.data.frequency,
        amount: parsed.data.amount ?? null,
        percentage: parsed.data.percentage ?? null,
        activity_type: parsed.data.activityType ?? null,
        minimum_amount: parsed.data.minimumAmount ?? null,
        maximum_amount: parsed.data.maximumAmount ?? null,
        conditions: (parsed.data.conditions ?? {}) as Json,
        is_active: parsed.data.isActive ?? true,
      })
      .select('*')
      .single();
    if (error) return { success: false, error: rpcErrorMessage(error) };
    revalidateProfessionalsModule();
    return { success: true, data: mapRule(data as Record<string, unknown>) };
  } catch (error) {
    return actionError(error);
  }
}

export async function updateCompensationRule(
  _prev: ActionResult<CompensationRule> | null,
  formData: FormData
): Promise<ActionResult<CompensationRule>> {
  try {
    await requirePermissionAndFeature(
      'professional_compensation:write',
      FEATURES.PROFESSIONALS_SETTLEMENTS
    );
    const parsed = compensationRuleUpdateSchema.safeParse({
      id: formData.get('id'),
      compensationSchemeId: formData.get('compensationSchemeId') || undefined,
      ruleType: formData.get('ruleType') || undefined,
      frequency: formData.get('frequency') || undefined,
      amount: formData.get('amount') || undefined,
      percentage: formData.get('percentage') || undefined,
      activityType: formData.get('activityType') || undefined,
      minimumAmount: formData.get('minimumAmount') || undefined,
      maximumAmount: formData.get('maximumAmount') || undefined,
      conditions: formData.get('conditions')
        ? JSON.parse(String(formData.get('conditions')))
        : undefined,
      isActive: formData.has('isActive') ? formData.get('isActive') !== 'false' : undefined,
    });
    if (!parsed.success) return { success: false, error: 'Datos inválidos' };

    const { id, ...fields } = parsed.data;
    const patch: CompensationRuleUpdate = {};
    if (fields.ruleType !== undefined) patch.rule_type = fields.ruleType;
    if (fields.frequency !== undefined) patch.frequency = fields.frequency;
    if (fields.amount !== undefined) patch.amount = fields.amount;
    if (fields.percentage !== undefined) patch.percentage = fields.percentage;
    if (fields.activityType !== undefined) patch.activity_type = fields.activityType;
    if (fields.minimumAmount !== undefined) patch.minimum_amount = fields.minimumAmount;
    if (fields.maximumAmount !== undefined) patch.maximum_amount = fields.maximumAmount;
    if (fields.conditions !== undefined) patch.conditions = fields.conditions as Json;
    if (fields.isActive !== undefined) patch.is_active = fields.isActive;

    const supabase = await createServerClient();
    const { data, error } = await supabase
      .from('professional_compensation_rules')
      .update(patch)
      .eq('id', id)
      .is('deleted_at', null)
      .select('*')
      .single();
    if (error) return { success: false, error: rpcErrorMessage(error) };
    revalidateProfessionalsModule();
    return { success: true, data: mapRule(data as Record<string, unknown>) };
  } catch (error) {
    return actionError(error);
  }
}

export async function calculateSettlement(
  _prev: ActionResult<CalculateSettlementResult> | null,
  formData: FormData
): Promise<ActionResult<CalculateSettlementResult>> {
  try {
    await requirePermissionAndFeature(
      'professional_settlements:read',
      FEATURES.PROFESSIONALS_SETTLEMENTS
    );
    await requirePermission('professional_compensation:write');

    const parsed = calculateSettlementSchema.safeParse({
      professionalId: formData.get('professionalId'),
      periodStart: formData.get('periodStart'),
      periodEnd: formData.get('periodEnd'),
      branchId: formData.get('branchId') || null,
    });
    if (!parsed.success) return { success: false, error: 'Datos inválidos' };

    const supabase = await createServerClient();
    const { data: settlementId, error } = await supabase.rpc('calculate_professional_settlement', {
      p_professional_id: parsed.data.professionalId,
      p_period_start: parsed.data.periodStart,
      p_period_end: parsed.data.periodEnd,
      p_branch_id: parsed.data.branchId ?? null,
    });
    if (error) return { success: false, error: rpcErrorMessage(error) };
    if (settlementId) {
      const { error: omitError } = await supabase.rpc('apply_professional_settlement_omissions', {
        p_settlement_id: String(settlementId),
      });
      if (omitError) {
        return {
          success: false,
          error: `Liquidación calculada, pero falló aplicar exclusiones: ${rpcErrorMessage(omitError)}`,
        };
      }
    }

    const detail = await getSettlement(String(settlementId));
    if (!detail) return { success: false, error: 'No se pudo obtener la liquidación' };

    revalidateProfessionalsModule();
    return {
      success: true,
      data: {
        settlement_id: detail.id,
        status: detail.status,
        gross_amount: detail.gross_amount,
        adjustments_amount: detail.adjustments_amount,
        deductions_amount: detail.deductions_amount,
        total_amount: detail.total_amount,
        item_count: detail.items.length,
      },
    };
  } catch (error) {
    return actionError(error);
  }
}

export async function calculateSettlementsForPeriod(input: {
  periodStart: string;
  periodEnd: string;
  branchId?: string | null;
  professionalIds?: string[];
}): Promise<ActionResult<BulkCalculateSettlementsResult>> {
  try {
    await requirePermissionAndFeature(
      'professional_settlements:read',
      FEATURES.PROFESSIONALS_SETTLEMENTS
    );
    await requirePermission('professional_compensation:write');

    const parsed = bulkCalculateSettlementsSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: 'Datos inválidos' };

    const professionals = await listProfessionals({ activeOnly: true });
    const targets =
      parsed.data.professionalIds && parsed.data.professionalIds.length > 0
        ? professionals.filter((row) => parsed.data.professionalIds!.includes(row.id))
        : professionals;

    if (targets.length === 0) {
      return { success: false, error: 'No hay profesionales activos para calcular' };
    }

    const supabase = await createServerClient();
    const succeeded: BulkCalculateSettlementsResult['succeeded'] = [];
    const failed: BulkCalculateSettlementsResult['failed'] = [];

    for (const professional of targets) {
      const { data: settlementId, error } = await supabase.rpc('calculate_professional_settlement', {
        p_professional_id: professional.id,
        p_period_start: parsed.data.periodStart,
        p_period_end: parsed.data.periodEnd,
        p_branch_id: parsed.data.branchId ?? null,
      });
      if (error) {
        failed.push({ professionalId: professional.id, error: rpcErrorMessage(error) });
        continue;
      }
      if (settlementId) {
        const { error: omitError } = await supabase.rpc('apply_professional_settlement_omissions', {
          p_settlement_id: String(settlementId),
        });
        if (omitError) {
          failed.push({
            professionalId: professional.id,
            error: `Calculada, exclusiones fallaron: ${rpcErrorMessage(omitError)}`,
          });
          continue;
        }
      }
      succeeded.push({
        professionalId: professional.id,
        settlementId: String(settlementId),
      });
    }

    if (succeeded.length > 0) revalidateProfessionalsModule();
    return { success: true, data: { succeeded, failed } };
  } catch (error) {
    return actionError(error);
  }
}

export async function getSettlement(settlementId: string): Promise<ProfessionalSettlementDetail | null> {
  const canReadAll = await canReadProfessionalSettlements();
  if (canReadAll) {
    await requirePermissionAndFeature('professional_settlements:read', FEATURES.PROFESSIONALS_SETTLEMENTS);
  } else {
    const session = await getSessionContext();
    if (!session) return null;
    await requireFeature(session.organizationId, FEATURES.PROFESSIONALS_SETTLEMENTS);
    const linked = await getProfessionalForCurrentUser();
    if (!linked) return null;
  }

  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc('get_professional_settlement', {
    p_settlement_id: settlementId,
  });
  if (error) throw error;
  if (!data) return null;
  const payload = data as Record<string, unknown>;
  const detail = {
    ...mapSettlementRow((payload.settlement ?? {}) as Record<string, unknown>),
    items: ((payload.items as Record<string, unknown>[]) ?? []).map((row) => ({
      id: String(row.id),
      settlement_id: String(row.settlement_id),
      organization_id: String(row.organization_id),
      rule_id: row.rule_id ? String(row.rule_id) : null,
      source_type: row.source_type as ProfessionalSettlementDetail['items'][number]['source_type'],
      source_id: row.source_id ? String(row.source_id) : null,
      description: String(row.description),
      quantity: Number(row.quantity ?? 0),
      unit_amount: row.unit_amount != null ? Number(row.unit_amount) : null,
      percentage: row.percentage != null ? Number(row.percentage) : null,
      base_amount: row.base_amount != null ? Number(row.base_amount) : null,
      calculated_amount: Number(row.calculated_amount ?? 0),
      created_at: String(row.created_at),
    })),
    adjustments: ((payload.adjustments as Record<string, unknown>[]) ?? []).map((row) => ({
      id: String(row.id),
      settlement_id: String(row.settlement_id),
      organization_id: String(row.organization_id),
      adjustment_type: row.adjustment_type as ProfessionalSettlementDetail['adjustments'][number]['adjustment_type'],
      amount: Number(row.amount ?? 0),
      reason: String(row.reason),
      created_by: String(row.created_by),
      created_at: String(row.created_at),
    })),
    payments: ((payload.payments as Record<string, unknown>[]) ?? []).map((row) => ({
      id: String(row.id),
      organization_id: String(row.organization_id),
      professional_id: String(row.professional_id),
      settlement_id: String(row.settlement_id),
      amount: Number(row.amount ?? 0),
      currency: String(row.currency ?? 'ARS'),
      method: row.method as ProfessionalSettlementDetail['payments'][number]['method'],
      paid_at: String(row.paid_at),
      reference: row.reference ? String(row.reference) : null,
      notes: row.notes ? String(row.notes) : null,
      invoice_number: row.invoice_number ? String(row.invoice_number) : null,
      invoice_date: row.invoice_date ? String(row.invoice_date) : null,
      invoice_amount: row.invoice_amount != null ? Number(row.invoice_amount) : null,
      invoice_attachment_url: row.invoice_attachment_url ? String(row.invoice_attachment_url) : null,
      created_by: String(row.created_by),
      created_at: String(row.created_at),
      updated_at: String(row.updated_at),
      deleted_at: row.deleted_at ? String(row.deleted_at) : null,
      cash_session_id: row.cash_session_id ? String(row.cash_session_id) : null,
      cash_movement_id: row.cash_movement_id ? String(row.cash_movement_id) : null,
    })),
    omissions: ((payload.omissions as Record<string, unknown>[]) ?? []).map((row) => ({
      id: String(row.id),
      organization_id: String(row.organization_id),
      settlement_id: String(row.settlement_id),
      source_type: row.source_type as ProfessionalSettlementDetail['omissions'][number]['source_type'],
      source_id: String(row.source_id),
      reason: String(row.reason),
      created_by: String(row.created_by),
      created_at: String(row.created_at),
      deleted_at: row.deleted_at ? String(row.deleted_at) : null,
    })),
  };

  if (!canReadAll) {
    const linked = await getProfessionalForCurrentUser();
    if (!linked || detail.professional_id !== linked.id) return null;
  }

  detail.items = await enrichSettlementItemsWithSourceHrefs(supabase, detail.items);
  detail.omissions = await enrichSettlementOmissionsWithSourceHrefs(supabase, detail.omissions);

  return detail;
}

async function resolveShiftHospitalizationByNoteId(
  supabase: Awaited<ReturnType<typeof createServerClient>>,
  noteIds: string[]
): Promise<Map<string, string>> {
  const hospitalizationByNoteId = new Map<string, string>();
  if (noteIds.length === 0) return hospitalizationByNoteId;
  const { data, error } = await supabase
    .from('hospitalization_notes')
    .select('id, hospitalization_id')
    .in('id', noteIds);
  if (error) throw error;
  for (const row of data ?? []) {
    hospitalizationByNoteId.set(String(row.id), String(row.hospitalization_id));
  }
  return hospitalizationByNoteId;
}

function resolveSourceHref(
  sourceType: SettlementItemSourceType,
  sourceId: string | null | undefined,
  hospitalizationByNoteId: Map<string, string>
): string | null {
  if (!sourceId) return null;
  if (sourceType === 'shift') {
    const hospitalizationId = hospitalizationByNoteId.get(sourceId);
    return hospitalizationId ? `/internacion/${hospitalizationId}#note-${sourceId}` : null;
  }
  return getSettlementItemSourceHref(sourceType, sourceId);
}

async function enrichSettlementItemsWithSourceHrefs(
  supabase: Awaited<ReturnType<typeof createServerClient>>,
  items: ProfessionalSettlementDetail['items']
): Promise<ProfessionalSettlementDetail['items']> {
  const shiftNoteIds = items
    .filter((item) => item.source_type === 'shift' && item.source_id)
    .map((item) => item.source_id as string);
  const hospitalizationByNoteId = await resolveShiftHospitalizationByNoteId(supabase, shiftNoteIds);

  return items.map((item) => ({
    ...item,
    source_href: resolveSourceHref(item.source_type, item.source_id, hospitalizationByNoteId),
  }));
}

async function enrichSettlementOmissionsWithSourceHrefs(
  supabase: Awaited<ReturnType<typeof createServerClient>>,
  omissions: ProfessionalSettlementDetail['omissions']
): Promise<ProfessionalSettlementDetail['omissions']> {
  const shiftNoteIds = omissions
    .filter((item) => item.source_type === 'shift' && item.source_id)
    .map((item) => item.source_id);
  const hospitalizationByNoteId = await resolveShiftHospitalizationByNoteId(supabase, shiftNoteIds);

  return omissions.map((omission) => ({
    ...omission,
    source_href: resolveSourceHref(omission.source_type, omission.source_id, hospitalizationByNoteId),
  }));
}

export async function getSettlementsSummary(currency = 'ARS'): Promise<SettlementsSummary> {
  await requirePermissionAndFeature('professional_settlements:read', FEATURES.PROFESSIONALS_SETTLEMENTS);
  const supabase = await createServerClient();

  const { data: settlements, error: settlementsError } = await supabase
    .from('professional_settlements')
    .select('status, balance_due, currency')
    .is('deleted_at', null);
  if (settlementsError) throw settlementsError;

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  const { data: payments, error: paymentsError } = await supabase
    .from('professional_payments')
    .select('amount, paid_at')
    .is('deleted_at', null)
    .gte('paid_at', monthStart);
  if (paymentsError) throw paymentsError;

  let pendingReviewCount = 0;
  let approvedUnpaidCount = 0;
  let totalBalanceDue = 0;
  const byStatusMap = new Map<string, number>();

  for (const row of settlements ?? []) {
    const status = String(row.status);
    byStatusMap.set(status, (byStatusMap.get(status) ?? 0) + 1);
    if (row.status === 'draft' || row.status === 'review') {
      pendingReviewCount += 1;
    }
    if (
      (row.status === 'approved' || row.status === 'partially_paid') &&
      Number(row.balance_due ?? 0) > 0
    ) {
      approvedUnpaidCount += 1;
      totalBalanceDue += Number(row.balance_due ?? 0);
    }
  }

  const paidThisMonth = (payments ?? []).reduce((sum, row) => sum + Number(row.amount ?? 0), 0);
  const settlementCurrency =
    settlements?.find((row) => row.currency)?.currency ?? currency;

  return {
    pendingReviewCount,
    approvedUnpaidCount,
    totalBalanceDue: Math.round(totalBalanceDue * 100) / 100,
    paidThisMonth: Math.round(paidThisMonth * 100) / 100,
    currency: String(settlementCurrency ?? currency),
    byStatus: [...byStatusMap.entries()].map(([status, count]) => ({ status, count })),
  };
}

async function querySettlementsPaginated(input: {
  professionalId?: string;
  statuses?: Array<ProfessionalSettlement['status']>;
  status?: ProfessionalSettlement['status'];
  unpaidOnly?: boolean;
  settlementIds?: string[];
  periodStart?: string;
  periodEnd?: string;
  branchId?: string;
  page: number;
  pageSize: number;
}) {
  const supabase = await createServerClient();
  const from = (input.page - 1) * input.pageSize;
  const to = from + input.pageSize - 1;

  let query = supabase
    .from('professional_settlements')
    .select('*', { count: 'exact' })
    .is('deleted_at', null);

  if (input.settlementIds) {
    if (input.settlementIds.length === 0) {
      return buildPaginatedResult([], 0, input.page, input.pageSize);
    }
    query = query.in('id', input.settlementIds);
  }

  if (input.unpaidOnly) {
    query = query.in('status', ['approved', 'partially_paid']).gt('balance_due', 0);
  } else if (input.statuses?.length) {
    query = query.in('status', input.statuses);
  } else if (input.status) {
    query = query.eq('status', input.status);
  }
  if (input.professionalId) query = query.eq('professional_id', input.professionalId);
  if (input.periodStart) query = query.gte('period_end', input.periodStart);
  if (input.periodEnd) query = query.lte('period_start', input.periodEnd);
  if (input.branchId) query = query.eq('branch_id', input.branchId);

  const { data, error, count } = await query
    .order('period_end', { ascending: false })
    .order('created_at', { ascending: false })
    .range(from, to);
  if (error) throw error;

  const settlements = (data ?? []).map((row) => mapSettlementRow(row as Record<string, unknown>));
  return buildPaginatedResult(settlements, Number(count ?? 0), input.page, input.pageSize);
}

async function settlementIdsPaidInCurrentMonth(professionalId?: string): Promise<string[]> {
  const supabase = await createServerClient();
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  let query = supabase
    .from('professional_payments')
    .select('settlement_id')
    .is('deleted_at', null)
    .gte('paid_at', monthStart)
    .not('settlement_id', 'is', null);
  if (professionalId) query = query.eq('professional_id', professionalId);
  const { data, error } = await query;
  if (error) throw error;
  return [
    ...new Set(
      (data ?? [])
        .map((row) => (row.settlement_id ? String(row.settlement_id) : null))
        .filter((id): id is string => Boolean(id))
    ),
  ];
}

export async function listSettlements(input: {
  professionalId?: string;
  status?: string;
  pendingReview?: boolean;
  unpaid?: boolean;
  paidInMonth?: boolean;
  periodStart?: string;
  periodEnd?: string;
  branchId?: string;
  page?: number;
  pageSize?: number;
}) {
  await requirePermissionAndFeature('professional_settlements:read', FEATURES.PROFESSIONALS_SETTLEMENTS);
  const parsed = listSettlementsSchema.safeParse(input);
  if (!parsed.success) throw new Error('Parámetros inválidos');

  if (input.paidInMonth) {
    const settlementIds = await settlementIdsPaidInCurrentMonth(parsed.data.professionalId);
    return querySettlementsPaginated({
      professionalId: parsed.data.professionalId,
      settlementIds,
      branchId: parsed.data.branchId,
      page: parsed.data.page,
      pageSize: parsed.data.pageSize,
    });
  }

  if (input.unpaid) {
    return querySettlementsPaginated({
      professionalId: parsed.data.professionalId,
      unpaidOnly: true,
      periodStart: parsed.data.periodStart,
      periodEnd: parsed.data.periodEnd,
      branchId: parsed.data.branchId,
      page: parsed.data.page,
      pageSize: parsed.data.pageSize,
    });
  }

  if (input.pendingReview) {
    return querySettlementsPaginated({
      professionalId: parsed.data.professionalId,
      statuses: ['draft', 'review'],
      periodStart: parsed.data.periodStart,
      periodEnd: parsed.data.periodEnd,
      branchId: parsed.data.branchId,
      page: parsed.data.page,
      pageSize: parsed.data.pageSize,
    });
  }

  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc('list_professional_settlements', {
    p_professional_id: parsed.data.professionalId ?? null,
    p_status: parsed.data.status ?? null,
    p_period_start: parsed.data.periodStart ?? null,
    p_period_end: parsed.data.periodEnd ?? null,
    p_branch_id: parsed.data.branchId ?? null,
    p_page: parsed.data.page,
    p_page_size: parsed.data.pageSize,
  });
  if (error) throw error;

  const payload = (data ?? { items: [], total: 0 }) as {
    items?: Record<string, unknown>[];
    total?: number;
    page?: number;
    page_size?: number;
  };
  const settlements = (payload.items ?? []).map((row) => mapSettlementRow(row));
  return buildPaginatedResult(
    settlements,
    Number(payload.total ?? 0),
    Number(payload.page ?? parsed.data.page),
    Number(payload.page_size ?? parsed.data.pageSize)
  );
}

export async function listMySettlements(input: {
  status?: string;
  pendingReview?: boolean;
  unpaid?: boolean;
  paidInMonth?: boolean;
  periodStart?: string;
  periodEnd?: string;
  page?: number;
  pageSize?: number;
}) {
  const session = await getSessionContext();
  if (!session) {
    return buildPaginatedResult([], 0, input.page ?? 1, input.pageSize ?? 25);
  }
  await requireFeature(session.organizationId, FEATURES.PROFESSIONALS_SETTLEMENTS);
  const linked = await getProfessionalForCurrentUser();
  if (!linked) {
    return buildPaginatedResult([], 0, input.page ?? 1, input.pageSize ?? 25);
  }

  const parsed = listSettlementsSchema.safeParse({
    ...input,
    professionalId: linked.id,
    page: input.page ?? 1,
    pageSize: input.pageSize ?? 25,
  });
  if (!parsed.success) throw new Error('Parámetros inválidos');

  if (input.paidInMonth) {
    const settlementIds = await settlementIdsPaidInCurrentMonth(linked.id);
    return querySettlementsPaginated({
      professionalId: linked.id,
      settlementIds,
      page: parsed.data.page,
      pageSize: parsed.data.pageSize,
    });
  }

  if (input.unpaid) {
    return querySettlementsPaginated({
      professionalId: linked.id,
      unpaidOnly: true,
      periodStart: parsed.data.periodStart,
      periodEnd: parsed.data.periodEnd,
      page: parsed.data.page,
      pageSize: parsed.data.pageSize,
    });
  }

  if (input.pendingReview) {
    return querySettlementsPaginated({
      professionalId: linked.id,
      statuses: ['draft', 'review'],
      periodStart: parsed.data.periodStart,
      periodEnd: parsed.data.periodEnd,
      page: parsed.data.page,
      pageSize: parsed.data.pageSize,
    });
  }

  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc('list_my_professional_settlements', {
    p_status: parsed.data.status ?? null,
    p_page: parsed.data.page,
    p_page_size: parsed.data.pageSize,
    p_period_start: parsed.data.periodStart ?? null,
    p_period_end: parsed.data.periodEnd ?? null,
  });
  if (error) throw error;

  const payload = (data ?? { items: [], total: 0 }) as {
    items?: Record<string, unknown>[];
    total?: number;
    page?: number;
    page_size?: number;
  };
  const settlements = (payload.items ?? []).map((row) => mapSettlementRow(row));
  return buildPaginatedResult(
    settlements,
    Number(payload.total ?? 0),
    Number(payload.page ?? parsed.data.page),
    Number(payload.page_size ?? parsed.data.pageSize)
  );
}

async function runBulkSettlementAction(
  settlementIds: string[],
  action: (settlementId: string) => Promise<{ success: boolean; error?: string }>
): Promise<BulkSettlementActionResult> {
  const parsed = bulkSettlementIdsSchema.safeParse({ settlementIds });
  if (!parsed.success) {
    return {
      succeeded: [],
      failed: settlementIds.map((id) => ({ id, error: 'IDs inválidos' })),
    };
  }

  const succeeded: string[] = [];
  const failed: Array<{ id: string; error: string }> = [];

  for (const settlementId of parsed.data.settlementIds) {
    const result = await action(settlementId);
    if (result.success) succeeded.push(settlementId);
    else failed.push({ id: settlementId, error: result.error ?? 'Error desconocido' });
  }

  if (succeeded.length > 0) revalidateProfessionalsModule();
  return { succeeded, failed };
}

export async function bulkApproveSettlements(
  settlementIds: string[]
): Promise<ActionResult<BulkSettlementActionResult>> {
  try {
    await requirePermissionAndFeature(
      'professional_settlements:approve',
      FEATURES.PROFESSIONALS_SETTLEMENTS
    );
    const supabase = await createServerClient();
    const result = await runBulkSettlementAction(settlementIds, async (settlementId) => {
      const { error } = await supabase.rpc('approve_professional_settlement', {
        p_settlement_id: settlementId,
      });
      if (error) return { success: false, error: rpcErrorMessage(error) };
      return { success: true };
    });
    return { success: true, data: result };
  } catch (error) {
    return actionError(error);
  }
}

export async function bulkSubmitSettlementsForReview(
  settlementIds: string[]
): Promise<ActionResult<BulkSettlementActionResult>> {
  try {
    await requirePermissionAndFeature(
      'professional_compensation:write',
      FEATURES.PROFESSIONALS_SETTLEMENTS
    );
    await requirePermission('professional_settlements:read');
    const supabase = await createServerClient();
    const result = await runBulkSettlementAction(settlementIds, async (settlementId) => {
      const { error } = await supabase.rpc('submit_professional_settlement_for_review', {
        p_settlement_id: settlementId,
      });
      if (error) return { success: false, error: rpcErrorMessage(error) };
      return { success: true };
    });
    return { success: true, data: result };
  } catch (error) {
    return actionError(error);
  }
}

export async function bulkReturnSettlementsToDraft(
  settlementIds: string[],
  reason: string
): Promise<ActionResult<BulkSettlementActionResult>> {
  try {
    await requirePermissionAndFeature(
      'professional_settlements:approve',
      FEATURES.PROFESSIONALS_SETTLEMENTS
    );
    const parsedReason = returnSettlementToDraftSchema
      .pick({ reason: true })
      .safeParse({ reason });
    if (!parsedReason.success) {
      return { success: false, error: 'Motivo inválido (mínimo 3 caracteres)' };
    }

    const supabase = await createServerClient();
    const result = await runBulkSettlementAction(settlementIds, async (settlementId) => {
      const { error } = await supabase.rpc('return_professional_settlement_to_draft', {
        p_settlement_id: settlementId,
        p_reason: parsedReason.data.reason,
      });
      if (error) return { success: false, error: rpcErrorMessage(error) };
      return { success: true };
    });
    return { success: true, data: result };
  } catch (error) {
    return actionError(error);
  }
}

export async function bulkRegisterProfessionalPayments(input: {
  mode: 'full' | 'custom';
  settlementIds?: string[];
  payments?: Array<{ settlementId: string; amount: number }>;
  method: string;
  paidAt?: string;
  reference?: string | null;
  notes?: string | null;
  invoiceNumber?: string | null;
  invoiceDate?: string | null;
  invoiceAmount?: number | null;
  invoiceAttachmentUrl?: string | null;
  postCashEgreso?: boolean;
  cashSessionId?: string | null;
}): Promise<
  ActionResult<BulkSettlementActionResult & { warnings?: Array<{ id: string; message: string }> }>
> {
  try {
    await requirePermissionAndFeature('professional_settlements:pay', FEATURES.PROFESSIONALS_SETTLEMENTS);
    const parsed = bulkRegisterProfessionalPaymentsSchema.safeParse(input);
    if (!parsed.success) {
      return { success: false, error: 'Datos de pago inválidos' };
    }

    let paidAt: string | undefined = parsed.data.paidAt;
    if (input.paidAt && !paidAt) {
      const parsedDate = new Date(input.paidAt);
      if (!Number.isNaN(parsedDate.getTime())) {
        paidAt = parsedDate.toISOString();
      }
    }

    const supabase = await createServerClient();
    const paymentTargets =
      parsed.data.mode === 'custom'
        ? parsed.data.payments.map((row) => ({
            settlementId: row.settlementId,
            amount: row.amount,
          }))
        : parsed.data.settlementIds.map((settlementId) => ({
            settlementId,
            amount: null as number | null,
          }));

    const wantsCash =
      Boolean(input.postCashEgreso) &&
      parsed.data.method === 'efectivo' &&
      Boolean(input.cashSessionId);
    const canCash = wantsCash
      ? await canPermissionAndFeature('billing:write', FEATURES.CASH_REGISTER)
      : false;
    const warnings: Array<{ id: string; message: string }> = [];
    const professionals = wantsCash ? await listProfessionals() : [];
    const professionalNameById = new Map(
      professionals.map((row) => [row.id, `${row.last_name}, ${row.first_name}`])
    );

    const result = await runBulkSettlementAction(
      paymentTargets.map((row) => row.settlementId),
      async (settlementId) => {
        const target = paymentTargets.find((row) => row.settlementId === settlementId);
        if (!target) return { success: false, error: 'Liquidación no encontrada' };

        const settlement = await getSettlement(settlementId);
        if (!settlement) return { success: false, error: 'Liquidación no encontrada' };
        if (settlement.status !== 'approved' && settlement.status !== 'partially_paid') {
          return { success: false, error: 'La liquidación no está aprobada' };
        }
        if (settlement.balance_due <= 0) {
          return { success: false, error: 'Sin saldo pendiente' };
        }

        const amount =
          parsed.data.mode === 'custom' && target.amount != null
            ? target.amount
            : settlement.balance_due;

        if (amount <= 0) {
          return { success: false, error: 'El monto debe ser positivo' };
        }
        if (amount > settlement.balance_due) {
          return { success: false, error: 'El monto excede el saldo pendiente' };
        }

        const { data, error } = await supabase.rpc('register_professional_payment', {
          p_settlement_id: settlementId,
          p_amount: amount,
          p_method: parsed.data.method,
          p_paid_at: paidAt ?? parsed.data.paidAt ?? null,
          p_reference: parsed.data.reference ?? null,
          p_notes: parsed.data.notes ?? null,
          p_invoice_number: parsed.data.invoiceNumber ?? null,
          p_invoice_date: parsed.data.invoiceDate ?? null,
          p_invoice_amount: parsed.data.invoiceAmount ?? null,
          p_invoice_attachment_url: parsed.data.invoiceAttachmentUrl ?? null,
        });
        if (error) return { success: false, error: rpcErrorMessage(error) };

        if (wantsCash) {
          if (!canCash) {
            warnings.push({
              id: settlementId,
              message: 'Pago OK; sin permiso para egreso en caja',
            });
          } else {
            const paymentPayload = data as { payment?: { id?: string } } | null;
            const paymentId = String(paymentPayload?.payment?.id ?? '');
            const professionalName = professionalNameById.get(settlement.professional_id);
            const { error: cashMoveError } = await supabase.rpc('add_cash_movement', {
              p_session_id: String(input.cashSessionId),
              p_kind: 'egreso',
              p_amount: amount,
              p_method: 'efectivo',
              p_notes: buildProfessionalPaymentCashNote({
                settlementId,
                paymentId,
                professionalName,
              }),
              p_professional_payment_id: paymentId || null,
            });
            if (cashMoveError) {
              warnings.push({
                id: settlementId,
                message: `Pago OK; egreso caja falló: ${rpcErrorMessage(cashMoveError)}`,
              });
            }
          }
        }

        return { success: true };
      }
    );

    if (warnings.length > 0 && input.cashSessionId) {
      revalidatePath('/caja');
      revalidatePath(`/caja/${input.cashSessionId}`);
    } else if (wantsCash && canCash && result.succeeded.length > 0 && input.cashSessionId) {
      revalidatePath('/caja');
      revalidatePath(`/caja/${input.cashSessionId}`);
    }

    return { success: true, data: { ...result, warnings } };
  } catch (error) {
    return actionError(error);
  }
}

export async function approveSettlement(
  _prev: ActionResult<ProfessionalSettlement> | null,
  formData: FormData
): Promise<ActionResult<ProfessionalSettlement>> {
  try {
    await requirePermissionAndFeature(
      'professional_settlements:approve',
      FEATURES.PROFESSIONALS_SETTLEMENTS
    );
    const parsed = approveSettlementSchema.safeParse({ settlementId: formData.get('settlementId') });
    if (!parsed.success) return { success: false, error: 'Liquidación inválida' };

    const supabase = await createServerClient();
    const { error } = await supabase.rpc('approve_professional_settlement', {
      p_settlement_id: parsed.data.settlementId,
    });
    if (error) return { success: false, error: rpcErrorMessage(error) };

    const detail = await getSettlement(parsed.data.settlementId);
    revalidateProfessionalsModule();
    return { success: true, data: detail! };
  } catch (error) {
    return actionError(error);
  }
}

export async function cancelSettlement(
  _prev: ActionResult | null,
  formData: FormData
): Promise<ActionResult<void>> {
  try {
    await requirePermissionAndFeature(
      'professional_settlements:approve',
      FEATURES.PROFESSIONALS_SETTLEMENTS
    );
    const parsed = cancelSettlementSchema.safeParse({
      settlementId: formData.get('settlementId'),
      reason: formData.get('reason'),
    });
    if (!parsed.success) {
      return {
        success: false,
        error: 'Datos inválidos',
        fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
      };
    }

    const supabase = await createServerClient();
    const { error } = await supabase.rpc('cancel_professional_settlement', {
      p_settlement_id: parsed.data.settlementId,
      p_reason: parsed.data.reason,
    });
    if (error) return { success: false, error: rpcErrorMessage(error) };
    revalidateProfessionalsModule();
    return { success: true, data: undefined };
  } catch (error) {
    return actionError(error);
  }
}

export async function bulkCancelSettlements(
  settlementIds: string[],
  reason: string
): Promise<ActionResult<BulkSettlementActionResult>> {
  try {
    await requirePermissionAndFeature(
      'professional_settlements:approve',
      FEATURES.PROFESSIONALS_SETTLEMENTS
    );
    const parsedReason = cancelSettlementSchema.pick({ reason: true }).safeParse({ reason });
    if (!parsedReason.success) {
      return { success: false, error: 'Motivo inválido (mínimo 3 caracteres)' };
    }

    const supabase = await createServerClient();
    const result = await runBulkSettlementAction(settlementIds, async (settlementId) => {
      const { error } = await supabase.rpc('cancel_professional_settlement', {
        p_settlement_id: settlementId,
        p_reason: parsedReason.data.reason,
      });
      if (error) return { success: false, error: rpcErrorMessage(error) };
      return { success: true };
    });
    return { success: true, data: result };
  } catch (error) {
    return actionError(error);
  }
}

export async function returnSettlementToDraft(
  _prev: ActionResult<ProfessionalSettlement> | null,
  formData: FormData
): Promise<ActionResult<ProfessionalSettlement>> {
  try {
    await requirePermissionAndFeature(
      'professional_settlements:approve',
      FEATURES.PROFESSIONALS_SETTLEMENTS
    );
    const parsed = returnSettlementToDraftSchema.safeParse({
      settlementId: formData.get('settlementId'),
      reason: formData.get('reason'),
    });
    if (!parsed.success) {
      return {
        success: false,
        error: 'Datos inválidos',
        fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
      };
    }

    const supabase = await createServerClient();
    const { error } = await supabase.rpc('return_professional_settlement_to_draft', {
      p_settlement_id: parsed.data.settlementId,
      p_reason: parsed.data.reason,
    });
    if (error) return { success: false, error: rpcErrorMessage(error) };

    const detail = await getSettlement(parsed.data.settlementId);
    revalidateProfessionalsModule();
    return { success: true, data: detail! };
  } catch (error) {
    return actionError(error);
  }
}

export async function addSettlementAdjustment(
  _prev: ActionResult | null,
  formData: FormData
): Promise<ActionResult<void>> {
  try {
    await requirePermissionAndFeature(
      'professional_settlements:read',
      FEATURES.PROFESSIONALS_SETTLEMENTS
    );
    await requirePermission('professional_compensation:write');
    const parsed = settlementAdjustmentSchema.safeParse({
      settlementId: formData.get('settlementId'),
      adjustmentType: formData.get('adjustmentType'),
      amount: formData.get('amount'),
      reason: formData.get('reason'),
    });
    if (!parsed.success) {
      return {
        success: false,
        error: 'Datos inválidos',
        fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
      };
    }

    const supabase = await createServerClient();
    const { error } = await supabase.rpc('add_professional_settlement_adjustment', {
      p_settlement_id: parsed.data.settlementId,
      p_type: parsed.data.adjustmentType,
      p_amount: parsed.data.amount,
      p_reason: parsed.data.reason,
    });
    if (error) return { success: false, error: rpcErrorMessage(error) };
    revalidateProfessionalsModule();
    return { success: true, data: undefined };
  } catch (error) {
    return actionError(error);
  }
}

export async function deleteSettlementAdjustment(
  _prev: ActionResult | null,
  formData: FormData
): Promise<ActionResult<void>> {
  try {
    await requirePermissionAndFeature(
      'professional_settlements:read',
      FEATURES.PROFESSIONALS_SETTLEMENTS
    );
    await requirePermission('professional_compensation:write');
    const parsed = deleteSettlementAdjustmentSchema.safeParse({
      adjustmentId: formData.get('adjustmentId'),
    });
    if (!parsed.success) return { success: false, error: 'Ajuste inválido' };

    const supabase = await createServerClient();
    const { error } = await supabase.rpc('delete_professional_settlement_adjustment', {
      p_adjustment_id: parsed.data.adjustmentId,
    });
    if (error) return { success: false, error: rpcErrorMessage(error) };
    revalidateProfessionalsModule();
    return { success: true, data: undefined };
  } catch (error) {
    return actionError(error);
  }
}

export async function updateSettlementAdjustment(
  _prev: ActionResult | null,
  formData: FormData
): Promise<ActionResult<void>> {
  try {
    await requirePermissionAndFeature(
      'professional_settlements:read',
      FEATURES.PROFESSIONALS_SETTLEMENTS
    );
    await requirePermission('professional_compensation:write');
    const parsed = updateSettlementAdjustmentSchema.safeParse({
      adjustmentId: formData.get('adjustmentId'),
      adjustmentType: formData.get('adjustmentType'),
      amount: formData.get('amount'),
      reason: formData.get('reason'),
    });
    if (!parsed.success) {
      return {
        success: false,
        error: 'Datos inválidos',
        fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
      };
    }

    const supabase = await createServerClient();
    const { error } = await supabase.rpc('update_professional_settlement_adjustment', {
      p_adjustment_id: parsed.data.adjustmentId,
      p_type: parsed.data.adjustmentType,
      p_amount: parsed.data.amount,
      p_reason: parsed.data.reason,
    });
    if (error) return { success: false, error: rpcErrorMessage(error) };
    revalidateProfessionalsModule();
    return { success: true, data: undefined };
  } catch (error) {
    return actionError(error);
  }
}

export async function updateSettlementNotes(
  _prev: ActionResult | null,
  formData: FormData
): Promise<ActionResult<void>> {
  try {
    await requirePermissionAndFeature(
      'professional_settlements:read',
      FEATURES.PROFESSIONALS_SETTLEMENTS
    );
    await requirePermission('professional_compensation:write');
    const parsed = settlementNotesSchema.safeParse({
      settlementId: formData.get('settlementId'),
      notes: formData.get('notes') || null,
    });
    if (!parsed.success) return { success: false, error: 'Notas inválidas' };

    const current = await getSettlement(parsed.data.settlementId);
    if (!current) return { success: false, error: 'Liquidación no encontrada' };
    const { returnPrefix } = parseSettlementReturnNotes(current.notes);
    const mergedNotes = mergeSettlementReturnNotes(returnPrefix, parsed.data.notes);

    const supabase = await createServerClient();
    const { error } = await supabase.rpc('update_professional_settlement_notes', {
      p_settlement_id: parsed.data.settlementId,
      p_notes: mergedNotes,
    });
    if (error) return { success: false, error: rpcErrorMessage(error) };
    revalidateProfessionalsModule();
    return { success: true, data: undefined };
  } catch (error) {
    return actionError(error);
  }
}

export async function registerProfessionalPayment(
  _prev: ActionResult<{
    payment_id: string;
    cashError?: string;
    cashSessionId?: string | null;
  }> | null,
  formData: FormData
): Promise<
  ActionResult<{
    payment_id: string;
    cashError?: string;
    cashSessionId?: string | null;
  }>
> {
  try {
    await requirePermissionAndFeature(
      'professional_settlements:pay',
      FEATURES.PROFESSIONALS_SETTLEMENTS
    );
    const paidAtRaw = formData.get('paidAt');
    let paidAt: string | undefined;
    if (typeof paidAtRaw === 'string' && paidAtRaw.trim()) {
      const parsedDate = new Date(paidAtRaw);
      if (!Number.isNaN(parsedDate.getTime())) {
        paidAt = parsedDate.toISOString();
      }
    }

    const parsed = registerProfessionalPaymentSchema.safeParse({
      settlementId: formData.get('settlementId'),
      amount: formData.get('amount'),
      method: formData.get('method'),
      paidAt,
      reference: formData.get('reference') || null,
      notes: formData.get('notes') || null,
      invoiceNumber: formData.get('invoiceNumber') || null,
      invoiceDate: formData.get('invoiceDate') || null,
      invoiceAmount: formData.get('invoiceAmount') || null,
      invoiceAttachmentUrl: formData.get('invoiceAttachmentUrl') || null,
    });
    if (!parsed.success) {
      return {
        success: false,
        error: 'Datos inválidos',
        fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
      };
    }

    const supabase = await createServerClient();
    const { data, error } = await supabase.rpc('register_professional_payment', {
      p_settlement_id: parsed.data.settlementId,
      p_amount: parsed.data.amount,
      p_method: parsed.data.method,
      p_paid_at: parsed.data.paidAt ?? null,
      p_reference: parsed.data.reference ?? null,
      p_notes: parsed.data.notes ?? null,
      p_invoice_number: parsed.data.invoiceNumber ?? null,
      p_invoice_date: parsed.data.invoiceDate ?? null,
      p_invoice_amount: parsed.data.invoiceAmount ?? null,
      p_invoice_attachment_url: parsed.data.invoiceAttachmentUrl ?? null,
    });
    if (error) return { success: false, error: rpcErrorMessage(error) };
    const paymentPayload = data as { payment?: { id?: string } } | null;
    const paymentId = String(paymentPayload?.payment?.id ?? '');

    let cashError: string | undefined;
    let linkedCashSessionId: string | null = null;
    const wantsCashEgreso =
      formData.get('postCashEgreso') === '1' || formData.get('postCashEgreso') === 'on';
    const cashSessionId = String(formData.get('cashSessionId') ?? '').trim();
    if (wantsCashEgreso && parsed.data.method === 'efectivo' && cashSessionId) {
      const canCash = await canPermissionAndFeature('billing:write', FEATURES.CASH_REGISTER);
      if (!canCash) {
        cashError = 'Pago registrado. Sin permiso para egreso en caja.';
      } else {
        const settlement = await getSettlement(parsed.data.settlementId);
        const professional = settlement
          ? await getProfessional(settlement.professional_id)
          : null;
        const professionalName = professional
          ? `${professional.last_name}, ${professional.first_name}`
          : null;
        const { error: cashMoveError } = await supabase.rpc('add_cash_movement', {
          p_session_id: cashSessionId,
          p_kind: 'egreso',
          p_amount: parsed.data.amount,
          p_method: 'efectivo',
          p_notes: buildProfessionalPaymentCashNote({
            settlementId: parsed.data.settlementId,
            paymentId,
            professionalName,
          }),
          p_professional_payment_id: paymentId || null,
        });
        if (cashMoveError) {
          cashError = `Pago registrado. No se pudo crear el egreso en caja: ${rpcErrorMessage(cashMoveError)}`;
        } else {
          linkedCashSessionId = cashSessionId;
          revalidatePath('/caja');
          revalidatePath(`/caja/${cashSessionId}`);
        }
      }
    }

    revalidateProfessionalsModule();
    return {
      success: true,
      data: {
        payment_id: paymentId,
        cashError,
        cashSessionId: linkedCashSessionId,
      },
    };
  } catch (error) {
    return actionError(error);
  }
}

export async function voidProfessionalPayment(
  _prev: ActionResult<{
    cashReversed?: boolean;
    cashSessionId?: string | null;
    cashWarning?: string | null;
  }> | null,
  formData: FormData
): Promise<
  ActionResult<{
    cashReversed?: boolean;
    cashSessionId?: string | null;
    cashWarning?: string | null;
  }>
> {
  try {
    await requirePermissionAndFeature(
      'professional_settlements:pay',
      FEATURES.PROFESSIONALS_SETTLEMENTS
    );
    const parsed = voidProfessionalPaymentSchema.safeParse({
      paymentId: formData.get('paymentId'),
      reason: formData.get('reason'),
    });
    if (!parsed.success) {
      return {
        success: false,
        error: 'Datos inválidos',
        fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
      };
    }

    const supabase = await createServerClient();
    const { data, error } = await supabase.rpc('void_professional_payment', {
      p_payment_id: parsed.data.paymentId,
      p_reason: parsed.data.reason,
    });
    if (error) return { success: false, error: rpcErrorMessage(error) };
    const payload = (data ?? {}) as {
      cash_reversed?: boolean;
      cash_session_id?: string | null;
      cash_warning?: string | null;
    };
    if (payload.cash_session_id) {
      revalidatePath('/caja');
      revalidatePath(`/caja/${payload.cash_session_id}`);
    }
    revalidateProfessionalsModule();
    return {
      success: true,
      data: {
        cashReversed: Boolean(payload.cash_reversed),
        cashSessionId: payload.cash_session_id ?? null,
        cashWarning: payload.cash_warning ?? null,
      },
    };
  } catch (error) {
    return actionError(error);
  }
}

export async function linkProfessionalPaymentToCash(
  _prev: ActionResult<{ cashSessionId: string }> | null,
  formData: FormData
): Promise<ActionResult<{ cashSessionId: string }>> {
  try {
    await requirePermissionAndFeature(
      'professional_settlements:pay',
      FEATURES.PROFESSIONALS_SETTLEMENTS
    );
    const canCash = await canPermissionAndFeature('billing:write', FEATURES.CASH_REGISTER);
    if (!canCash) return { success: false, error: 'Sin permiso para egreso en caja' };

    const parsed = linkProfessionalPaymentToCashSchema.safeParse({
      paymentId: formData.get('paymentId'),
      cashSessionId: formData.get('cashSessionId'),
    });
    if (!parsed.success) return { success: false, error: 'Datos inválidos' };

    const supabase = await createServerClient();
    const { data: payment, error: paymentError } = await supabase
      .from('professional_payments')
      .select('id, settlement_id, professional_id, amount, method, deleted_at')
      .eq('id', parsed.data.paymentId)
      .maybeSingle();
    if (paymentError) return { success: false, error: rpcErrorMessage(paymentError) };
    if (!payment || payment.deleted_at) {
      return { success: false, error: 'Pago no encontrado o anulado' };
    }
    if (String(payment.method) !== 'efectivo') {
      return { success: false, error: 'Solo se pueden vincular pagos en efectivo' };
    }

    const { data: existingMove, error: existingError } = await supabase
      .from('cash_movements')
      .select('id')
      .eq('professional_payment_id', payment.id)
      .is('deleted_at', null)
      .maybeSingle();
    if (existingError) return { success: false, error: rpcErrorMessage(existingError) };
    if (existingMove) {
      return { success: false, error: 'Este pago ya tiene un egreso de caja vinculado' };
    }

    const professional = await getProfessional(String(payment.professional_id));
    const professionalName = professional
      ? `${professional.last_name}, ${professional.first_name}`
      : null;

    const { error: cashMoveError } = await supabase.rpc('add_cash_movement', {
      p_session_id: parsed.data.cashSessionId,
      p_kind: 'egreso',
      p_amount: Number(payment.amount),
      p_method: 'efectivo',
      p_notes: buildProfessionalPaymentCashNote({
        settlementId: String(payment.settlement_id),
        paymentId: String(payment.id),
        professionalName,
      }),
      p_professional_payment_id: String(payment.id),
    });
    if (cashMoveError) return { success: false, error: rpcErrorMessage(cashMoveError) };

    revalidatePath('/caja');
    revalidatePath(`/caja/${parsed.data.cashSessionId}`);
    revalidateProfessionalsModule();
    return { success: true, data: { cashSessionId: parsed.data.cashSessionId } };
  } catch (error) {
    return actionError(error);
  }
}

export async function omitSettlementItem(
  _prev: ActionResult | null,
  formData: FormData
): Promise<ActionResult<void>> {
  try {
    await requirePermissionAndFeature(
      'professional_compensation:write',
      FEATURES.PROFESSIONALS_SETTLEMENTS
    );
    const parsed = omitSettlementItemSchema.safeParse({
      itemId: formData.get('itemId'),
      reason: formData.get('reason'),
    });
    if (!parsed.success) {
      return {
        success: false,
        error: 'Datos inválidos',
        fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
      };
    }

    const supabase = await createServerClient();
    const { error } = await supabase.rpc('omit_professional_settlement_item', {
      p_item_id: parsed.data.itemId,
      p_reason: parsed.data.reason,
    });
    if (error) return { success: false, error: rpcErrorMessage(error) };
    revalidateProfessionalsModule();
    return { success: true, data: undefined };
  } catch (error) {
    return actionError(error);
  }
}

export async function restoreSettlementOmission(
  _prev: ActionResult<{ settlementId: string }> | null,
  formData: FormData
): Promise<ActionResult<{ settlementId: string }>> {
  try {
    await requirePermissionAndFeature(
      'professional_compensation:write',
      FEATURES.PROFESSIONALS_SETTLEMENTS
    );
    const parsed = restoreSettlementOmissionSchema.safeParse({
      omissionId: formData.get('omissionId'),
    });
    if (!parsed.success) {
      return {
        success: false,
        error: 'Datos inválidos',
        fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
      };
    }

    const supabase = await createServerClient();
    const { data, error } = await supabase.rpc('restore_professional_settlement_omission', {
      p_omission_id: parsed.data.omissionId,
    });
    if (error) return { success: false, error: rpcErrorMessage(error) };
    const payload = (data ?? {}) as { settlement_id?: string };
    const settlementId = String(payload.settlement_id ?? '');
    if (!settlementId) {
      return { success: false, error: 'No se pudo restaurar la omisión' };
    }

    const settlement = await getSettlement(settlementId);
    if (!settlement) return { success: false, error: 'Liquidación no encontrada' };
    if (settlement.status !== 'draft' && settlement.status !== 'review') {
      revalidateProfessionalsModule();
      return { success: true, data: { settlementId } };
    }

    const { data: recalcId, error: recalcError } = await supabase.rpc(
      'calculate_professional_settlement',
      {
        p_professional_id: settlement.professional_id,
        p_period_start: settlement.period_start,
        p_period_end: settlement.period_end,
        p_branch_id: settlement.branch_id,
      }
    );
    if (recalcError) {
      return {
        success: false,
        error: `Omisión restaurada, pero falló el recálculo: ${rpcErrorMessage(recalcError)}`,
      };
    }
    const nextId = String(recalcId ?? settlementId);
    const { error: omitError } = await supabase.rpc('apply_professional_settlement_omissions', {
      p_settlement_id: nextId,
    });
    if (omitError) {
      return {
        success: false,
        error: `Omisión restaurada y recalculada, exclusiones fallaron: ${rpcErrorMessage(omitError)}`,
      };
    }

    revalidateProfessionalsModule();
    return {
      success: true,
      data: { settlementId: nextId },
    };
  } catch (error) {
    return actionError(error);
  }
}

export async function submitSettlementForReview(
  _prev: ActionResult<ProfessionalSettlement> | null,
  formData: FormData
): Promise<ActionResult<ProfessionalSettlement>> {
  try {
    await requirePermissionAndFeature(
      'professional_compensation:write',
      FEATURES.PROFESSIONALS_SETTLEMENTS
    );
    const parsed = approveSettlementSchema.safeParse({ settlementId: formData.get('settlementId') });
    if (!parsed.success) return { success: false, error: 'Liquidación inválida' };

    const supabase = await createServerClient();
    const { error } = await supabase.rpc('submit_professional_settlement_for_review', {
      p_settlement_id: parsed.data.settlementId,
    });
    if (error) return { success: false, error: rpcErrorMessage(error) };

    const detail = await getSettlement(parsed.data.settlementId);
    revalidateProfessionalsModule();
    return { success: true, data: detail! };
  } catch (error) {
    return actionError(error);
  }
}

export async function exportSettlementDetailCsv(
  settlementId: string
): Promise<ActionResult<{ csv: string; filename: string }>> {
  try {
    const detail = await getSettlement(settlementId);
    if (!detail) return { success: false, error: 'Liquidación no encontrada' };

    const rows: Array<Array<string | number | null>> = [
      ['Campo', 'Valor'],
      ['ID', detail.id],
      ['Período', `${detail.period_start} → ${detail.period_end}`],
      ['Estado', SETTLEMENT_STATUS_LABELS[detail.status]],
      ['Bruto', detail.gross_amount],
      ['Ajustes', detail.adjustments_amount],
      ['Deducciones', detail.deductions_amount],
      ['Total', detail.total_amount],
      ['Pagado', detail.total_paid],
      ['Saldo', detail.balance_due],
      [],
      ['Tipo ítem', 'Descripción', 'Cantidad', 'Importe', 'Origen ID', 'Origen URL'],
      ...detail.items.map((item) => [
        SETTLEMENT_ITEM_SOURCE_TYPE_LABELS[item.source_type],
        item.description,
        item.quantity,
        item.calculated_amount,
        item.source_id,
        item.source_href ??
          getSettlementItemSourceHref(item.source_type, item.source_id) ??
          '',
      ]),
    ];

    if (detail.adjustments.length > 0) {
      rows.push([], ['Ajustes'], ['Tipo', 'Motivo', 'Importe']);
      rows.push(
        ...detail.adjustments.map((adjustment) => [
          SETTLEMENT_ADJUSTMENT_TYPE_LABELS[adjustment.adjustment_type],
          adjustment.reason,
          adjustment.amount,
        ])
      );
    }

    if (detail.payments.length > 0) {
      rows.push([], ['Pagos'], ['Fecha', 'Método', 'Importe', 'Referencia', 'Factura', 'Estado', 'Notas']);
      rows.push(
        ...detail.payments.map((payment) => [
          payment.paid_at.slice(0, 10),
          payment.method,
          payment.amount,
          payment.reference,
          payment.invoice_number,
          payment.deleted_at ? 'Anulado' : 'Activo',
          payment.notes,
        ])
      );
    }

    if (detail.omissions.length > 0) {
      rows.push([], ['Exclusiones'], ['Tipo', 'Origen ID', 'Motivo', 'Origen URL']);
      rows.push(
        ...detail.omissions.map((omission) => [
          SETTLEMENT_ITEM_SOURCE_TYPE_LABELS[omission.source_type],
          omission.source_id,
          omission.reason,
          omission.source_href ??
            getSettlementItemSourceHref(omission.source_type, omission.source_id) ??
            '',
        ])
      );
    }

    if (detail.notes || detail.cancellation_reason) {
      rows.push([], ['Notas / cancelación'], ['Campo', 'Valor']);
      if (detail.notes) rows.push(['Notas', detail.notes]);
      if (detail.cancellation_reason) {
        rows.push(['Motivo cancelación', detail.cancellation_reason]);
      }
    }

    return {
      success: true,
      data: {
        csv: buildCsv(rows),
        filename: `liquidacion-${detail.period_start}-${detail.id.slice(0, 8)}.csv`,
      },
    };
  } catch (error) {
    return actionError(error);
  }
}

export async function exportSettlementsHistoryCsv(input: {
  professionalId?: string;
  status?: string;
  pendingReview?: boolean;
  unpaid?: boolean;
  paidInMonth?: boolean;
  periodStart?: string;
  periodEnd?: string;
  branchId?: string;
}): Promise<ActionResult<{ csv: string; rowCount: number; total: number; truncated: boolean }>> {
  try {
    await requirePermissionAndFeature('professional_settlements:read', FEATURES.PROFESSIONALS_SETTLEMENTS);
    const [result, professionals] = await Promise.all([
      listSettlements({ ...input, page: 1, pageSize: SETTLEMENT_EXPORT_MAX_ROWS }),
      listProfessionals(),
    ]);

    const professionalNameById = new Map(
      professionals.map((row) => [row.id, `${row.last_name}, ${row.first_name}`])
    );

    const rows: Array<Array<string | number | null>> = [
      [
        'Profesional',
        'Período inicio',
        'Período fin',
        'Estado',
        'Total',
        'Pagado',
        'Saldo',
        'Moneda',
        'ID liquidación',
      ],
      ...result.data.map((settlement) => [
        professionalNameById.get(settlement.professional_id) ?? settlement.professional_id,
        settlement.period_start,
        settlement.period_end,
        SETTLEMENT_STATUS_LABELS[settlement.status],
        settlement.total_amount,
        settlement.total_paid,
        settlement.balance_due,
        settlement.currency,
        settlement.id,
      ]),
    ];

    const total = result.total;
    const rowCount = result.data.length;
    return {
      success: true,
      data: {
        csv: buildCsv(rows),
        rowCount,
        total,
        truncated: total > rowCount,
      },
    };
  } catch (error) {
    return actionError(error);
  }
}

export async function exportMySettlementsHistoryCsv(input: {
  status?: string;
  pendingReview?: boolean;
  unpaid?: boolean;
  paidInMonth?: boolean;
  periodStart?: string;
  periodEnd?: string;
}): Promise<ActionResult<{ csv: string; rowCount: number; total: number; truncated: boolean }>> {
  try {
    const session = await getSessionContext();
    if (!session) return { success: false, error: 'No autenticado' };
    await requireFeature(session.organizationId, FEATURES.PROFESSIONALS_SETTLEMENTS);
    const linked = await getProfessionalForCurrentUser();
    if (!linked) return { success: false, error: 'Sin profesional vinculado' };

    const result = await listMySettlements({
      ...input,
      page: 1,
      pageSize: SETTLEMENT_EXPORT_MAX_ROWS,
    });

    const professionalName = `${linked.last_name}, ${linked.first_name}`;
    const rows: Array<Array<string | number | null>> = [
      [
        'Profesional',
        'Período inicio',
        'Período fin',
        'Estado',
        'Total',
        'Pagado',
        'Saldo',
        'Moneda',
        'ID liquidación',
      ],
      ...result.data.map((settlement) => [
        professionalName,
        settlement.period_start,
        settlement.period_end,
        SETTLEMENT_STATUS_LABELS[settlement.status],
        settlement.total_amount,
        settlement.total_paid,
        settlement.balance_due,
        settlement.currency,
        settlement.id,
      ]),
    ];

    const total = result.total;
    const rowCount = result.data.length;
    return {
      success: true,
      data: {
        csv: buildCsv(rows),
        rowCount,
        total,
        truncated: total > rowCount,
      },
    };
  } catch (error) {
    return actionError(error);
  }
}

export async function exportSettlementsAccountingCsv(input: {
  professionalId?: string;
  status?: string;
  pendingReview?: boolean;
  unpaid?: boolean;
  paidInMonth?: boolean;
  periodStart?: string;
  periodEnd?: string;
  branchId?: string;
}): Promise<ActionResult<{ csv: string; rowCount: number; total: number; truncated: boolean }>> {
  try {
    await requirePermissionAndFeature('professional_settlements:read', FEATURES.PROFESSIONALS_SETTLEMENTS);
    const [result, professionals] = await Promise.all([
      listSettlements({ ...input, page: 1, pageSize: SETTLEMENT_EXPORT_MAX_ROWS }),
      listProfessionals(),
    ]);

    const professionalById = new Map(
      professionals.map((professional) => [
        professional.id,
        {
          name: `${professional.last_name}, ${professional.first_name}`,
          taxId: professional.tax_id ?? '',
        },
      ])
    );

    const rows: Array<Array<string | number | null>> = [
      [
        'Profesional',
        'CUIT/CUIL',
        'Período inicio',
        'Período fin',
        'Estado',
        'Bruto',
        'Ajustes',
        'Deducciones',
        'Neto',
        'Pagado',
        'Saldo',
        'Moneda',
        'ID liquidación',
      ],
      ...result.data.map((settlement) => {
        const professional = professionalById.get(settlement.professional_id);
        return [
          professional?.name ?? settlement.professional_id,
          professional?.taxId ?? '',
          settlement.period_start,
          settlement.period_end,
          SETTLEMENT_STATUS_LABELS[settlement.status],
          settlement.gross_amount,
          settlement.adjustments_amount,
          settlement.deductions_amount,
          settlement.total_amount,
          settlement.total_paid,
          settlement.balance_due,
          settlement.currency,
          settlement.id,
        ];
      }),
    ];

    const total = result.total;
    const rowCount = result.data.length;
    return {
      success: true,
      data: {
        csv: buildCsv(rows),
        rowCount,
        total,
        truncated: total > rowCount,
      },
    };
  } catch (error) {
    return actionError(error);
  }
}

export async function recalculateSettlementById(
  settlementId: string
): Promise<ActionResult<CalculateSettlementResult>> {
  try {
    await requirePermissionAndFeature(
      'professional_settlements:read',
      FEATURES.PROFESSIONALS_SETTLEMENTS
    );
    await requirePermission('professional_compensation:write');

    const settlement = await getSettlement(settlementId);
    if (!settlement) return { success: false, error: 'Liquidación no encontrada' };
    if (settlement.status !== 'draft' && settlement.status !== 'review') {
      return { success: false, error: 'Solo se pueden recalcular borradores o liquidaciones en revisión' };
    }

    const supabase = await createServerClient();
    const { data, error } = await supabase.rpc('calculate_professional_settlement', {
      p_professional_id: settlement.professional_id,
      p_period_start: settlement.period_start,
      p_period_end: settlement.period_end,
      p_branch_id: settlement.branch_id,
    });
    if (error) return { success: false, error: rpcErrorMessage(error) };
    const nextId = String(data ?? settlementId);
    const { error: omitError } = await supabase.rpc('apply_professional_settlement_omissions', {
      p_settlement_id: nextId,
    });
    if (omitError) {
      return {
        success: false,
        error: `Recalculada, pero falló aplicar exclusiones: ${rpcErrorMessage(omitError)}`,
      };
    }

    const detail = await getSettlement(nextId);
    if (!detail) return { success: false, error: 'No se pudo cargar la liquidación recalculada' };

    revalidateProfessionalsModule();
    return {
      success: true,
      data: {
        settlement_id: detail.id,
        status: detail.status,
        gross_amount: detail.gross_amount,
        adjustments_amount: detail.adjustments_amount,
        deductions_amount: detail.deductions_amount,
        total_amount: detail.total_amount,
        item_count: detail.items.length,
      },
    };
  } catch (error) {
    return actionError(error);
  }
}

export async function getSettlementClaimForSource(
  sourceType: SettlementItemSourceType,
  sourceId: string
): Promise<SettlementSourceClaimInfo | null> {
  const access = await canReadSettlementSourceClaims();
  if (!access) return null;

  const linked =
    access === 'own' ? await getProfessionalForCurrentUser() : null;
  const supabase = await createServerClient();

  const { data: claim, error: claimError } = await supabase
    .from('professional_settlement_source_claims')
    .select('settlement_id')
    .eq('source_type', sourceType)
    .eq('source_id', sourceId)
    .maybeSingle();
  if (claimError) throw claimError;
  if (!claim?.settlement_id) return null;

  const { data: settlement, error: settlementError } = await supabase
    .from('professional_settlements')
    .select('id, status, period_start, period_end, professional_id')
    .eq('id', claim.settlement_id)
    .is('deleted_at', null)
    .maybeSingle();
  if (settlementError) throw settlementError;
  if (!settlement) return null;
  if (access === 'own' && linked && String(settlement.professional_id) !== linked.id) {
    return null;
  }

  return {
    settlementId: settlement.id,
    status: settlement.status as SettlementSourceClaimInfo['status'],
    periodStart: settlement.period_start,
    periodEnd: settlement.period_end,
  };
}

export async function getSettlementClaimsForSources(
  sourceType: SettlementItemSourceType,
  sourceIds: string[]
): Promise<Record<string, SettlementSourceClaimInfo>> {
  if (sourceIds.length === 0) return {};

  const access = await canReadSettlementSourceClaims();
  if (!access) return {};

  const linked =
    access === 'own' ? await getProfessionalForCurrentUser() : null;
  const supabase = await createServerClient();

  const { data: claims, error: claimError } = await supabase
    .from('professional_settlement_source_claims')
    .select('source_id, settlement_id')
    .eq('source_type', sourceType)
    .in('source_id', sourceIds);
  if (claimError) throw claimError;
  if (!claims?.length) return {};

  const settlementIds = [...new Set(claims.map((row) => String(row.settlement_id)))];
  const { data: settlements, error: settlementError } = await supabase
    .from('professional_settlements')
    .select('id, status, period_start, period_end, professional_id')
    .in('id', settlementIds)
    .is('deleted_at', null);
  if (settlementError) throw settlementError;

  const settlementById = new Map(
    (settlements ?? []).map((row) => [
      String(row.id),
      {
        settlementId: String(row.id),
        status: row.status as SettlementSourceClaimInfo['status'],
        periodStart: String(row.period_start),
        periodEnd: String(row.period_end),
        professionalId: String(row.professional_id),
      },
    ])
  );

  const result: Record<string, SettlementSourceClaimInfo> = {};
  for (const claim of claims) {
    const sourceId = claim.source_id ? String(claim.source_id) : null;
    if (!sourceId) continue;
    const info = settlementById.get(String(claim.settlement_id));
    if (!info) continue;
    if (access === 'own' && linked && info.professionalId !== linked.id) continue;
    result[sourceId] = {
      settlementId: info.settlementId,
      status: info.status,
      periodStart: info.periodStart,
      periodEnd: info.periodEnd,
    };
  }

  return result;
}

export async function getSettlementDuplicateClaimWarnings(
  settlementId: string
): Promise<SettlementDuplicateClaimWarning[]> {
  const settlement = await getSettlement(settlementId);
  if (!settlement) return [];
  if (settlement.status !== 'draft' && settlement.status !== 'review') return [];

  const itemsWithSource = settlement.items.filter((item) => item.source_id);
  if (itemsWithSource.length === 0) return [];

  await requirePermissionAndFeature('professional_settlements:read', FEATURES.PROFESSIONALS_SETTLEMENTS);
  const supabase = await createServerClient();

  const sourceIds = [...new Set(itemsWithSource.map((item) => item.source_id as string))];
  const itemKey = (sourceType: string, sourceId: string) => `${sourceType}:${sourceId}`;
  const itemByKey = new Map(
    itemsWithSource.map((item) => [
      itemKey(item.source_type, item.source_id as string),
      item,
    ])
  );

  const warnings: SettlementDuplicateClaimWarning[] = [];
  const seen = new Set<string>();

  const pushWarning = (input: SettlementDuplicateClaimWarning) => {
    const dedupeKey = `${input.severity}:${input.sourceId}-${input.conflictingSettlementId}`;
    if (seen.has(dedupeKey)) return;
    seen.add(dedupeKey);
    warnings.push(input);
  };

  const [{ data: claims, error: claimError }, { data: peerItems, error: peerError }] =
    await Promise.all([
      supabase
        .from('professional_settlement_source_claims')
        .select('source_type, source_id, settlement_id')
        .in('source_id', sourceIds)
        .neq('settlement_id', settlementId),
      supabase
        .from('professional_settlement_items')
        .select('source_type, source_id, description, settlement_id')
        .in('source_id', sourceIds)
        .neq('settlement_id', settlementId),
    ]);
  if (claimError) throw claimError;
  if (peerError) throw peerError;

  const conflictingClaims = (claims ?? []).filter((claim) => {
    if (!claim.source_id) return false;
    return itemByKey.has(itemKey(String(claim.source_type), String(claim.source_id)));
  });

  const matchingPeerItems = (peerItems ?? []).filter((row) => {
    if (!row.source_id) return false;
    return itemByKey.has(itemKey(String(row.source_type), String(row.source_id)));
  });

  const settlementIds = [
    ...new Set([
      ...conflictingClaims.map((row) => String(row.settlement_id)),
      ...matchingPeerItems.map((row) => String(row.settlement_id)),
    ]),
  ];
  if (settlementIds.length === 0) return [];

  const { data: settlements, error: settlementError } = await supabase
    .from('professional_settlements')
    .select('id, status, period_start, period_end')
    .in('id', settlementIds)
    .is('deleted_at', null)
    .neq('status', 'cancelled');
  if (settlementError) throw settlementError;

  const settlementById = new Map((settlements ?? []).map((row) => [String(row.id), row]));

  for (const claim of conflictingClaims) {
    if (!claim.source_id) continue;
    const item = itemByKey.get(itemKey(String(claim.source_type), String(claim.source_id)));
    const conflicting = settlementById.get(String(claim.settlement_id));
    if (!item || !conflicting) continue;
    pushWarning({
      itemId: item.id,
      itemDescription: item.description,
      sourceType: item.source_type,
      sourceId: String(claim.source_id),
      conflictingSettlementId: String(conflicting.id),
      conflictingStatus: conflicting.status as SettlementDuplicateClaimWarning['conflictingStatus'],
      conflictingPeriodStart: String(conflicting.period_start),
      conflictingPeriodEnd: String(conflicting.period_end),
      severity: 'hard',
    });
  }

  for (const peer of matchingPeerItems) {
    if (!peer.source_id) continue;
    const item = itemByKey.get(itemKey(String(peer.source_type), String(peer.source_id)));
    const conflicting = settlementById.get(String(peer.settlement_id));
    if (!item || !conflicting) continue;
    const status = String(conflicting.status);
    if (status !== 'draft' && status !== 'review') continue;
    pushWarning({
      itemId: item.id,
      itemDescription: item.description,
      sourceType: item.source_type,
      sourceId: String(peer.source_id),
      conflictingSettlementId: String(conflicting.id),
      conflictingStatus: conflicting.status as SettlementDuplicateClaimWarning['conflictingStatus'],
      conflictingPeriodStart: String(conflicting.period_start),
      conflictingPeriodEnd: String(conflicting.period_end),
      severity: 'soft',
    });
  }

  return warnings.sort((a, b) => {
    if (a.severity !== b.severity) return a.severity === 'hard' ? -1 : 1;
    return a.itemDescription.localeCompare(b.itemDescription);
  });
}

export async function preflightBulkApproveDuplicates(
  settlementIds: string[]
): Promise<
  ActionResult<{
    hardSettlements: number;
    softSettlements: number;
    hardWarnings: number;
    softWarnings: number;
  }>
> {
  try {
    await requirePermissionAndFeature(
      'professional_settlements:approve',
      FEATURES.PROFESSIONALS_SETTLEMENTS
    );
    const parsed = bulkSettlementIdsSchema.safeParse({ settlementIds });
    if (!parsed.success) return { success: false, error: 'IDs inválidos' };

    let hardSettlements = 0;
    let softSettlements = 0;
    let hardWarnings = 0;
    let softWarnings = 0;

    for (const settlementId of parsed.data.settlementIds) {
      const warnings = await getSettlementDuplicateClaimWarnings(settlementId);
      const hard = warnings.filter((row) => row.severity === 'hard').length;
      const soft = warnings.filter((row) => row.severity === 'soft').length;
      if (hard > 0) {
        hardSettlements += 1;
        hardWarnings += hard;
      }
      if (soft > 0) {
        softSettlements += 1;
        softWarnings += soft;
      }
    }

    return {
      success: true,
      data: { hardSettlements, softSettlements, hardWarnings, softWarnings },
    };
  } catch (error) {
    return actionError(error);
  }
}

export async function getMySettlementsSummary(): Promise<MySettlementsSummary | null> {
  const linked = await getProfessionalForCurrentUser();
  if (!linked) return null;

  const session = await getSessionContext();
  if (!session) return null;
  await requireFeature(session.organizationId, FEATURES.PROFESSIONALS_SETTLEMENTS);

  const supabase = await createServerClient();
  const { data: settlements, error: settlementsError } = await supabase
    .from('professional_settlements')
    .select('status, balance_due, currency')
    .eq('professional_id', linked.id)
    .is('deleted_at', null);
  if (settlementsError) throw settlementsError;

  const { data: lastPayment, error: paymentError } = await supabase
    .from('professional_payments')
    .select('amount, paid_at, currency, settlement_id')
    .eq('professional_id', linked.id)
    .is('deleted_at', null)
    .order('paid_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (paymentError) throw paymentError;

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const { data: monthPayments, error: monthPaymentsError } = await supabase
    .from('professional_payments')
    .select('amount')
    .eq('professional_id', linked.id)
    .is('deleted_at', null)
    .gte('paid_at', monthStart);
  if (monthPaymentsError) throw monthPaymentsError;

  let openBalance = 0;
  let pendingReviewCount = 0;
  let approvedUnpaidCount = 0;
  let currency = 'ARS';

  for (const row of settlements ?? []) {
    currency = String(row.currency ?? currency);
    const status = String(row.status);
    if (status === 'draft' || status === 'review') pendingReviewCount += 1;
    if (
      (status === 'approved' || status === 'partially_paid') &&
      Number(row.balance_due ?? 0) > 0
    ) {
      approvedUnpaidCount += 1;
      openBalance += Number(row.balance_due ?? 0);
    }
  }

  const paidThisMonth = (monthPayments ?? []).reduce(
    (sum, row) => sum + Number(row.amount ?? 0),
    0
  );

  return {
    openBalance: Math.round(openBalance * 100) / 100,
    pendingReviewCount,
    approvedUnpaidCount,
    paidThisMonth: Math.round(paidThisMonth * 100) / 100,
    lastPaymentAmount: lastPayment ? Number(lastPayment.amount) : null,
    lastPaymentDate: lastPayment ? String(lastPayment.paid_at) : null,
    lastPaymentSettlementId: lastPayment?.settlement_id ? String(lastPayment.settlement_id) : null,
    currency: lastPayment?.currency ? String(lastPayment.currency) : currency,
  };
}

export async function getProfessionalSettlementsReport(
  from: string,
  to: string
): Promise<ReportProfessionalsSettlements | null> {
  const entitled = await canPermissionAndFeature(
    'professional_settlements:read',
    FEATURES.PROFESSIONALS_SETTLEMENTS
  );
  if (!entitled) return null;

  const supabase = await createServerClient();
  const { data: settlements, error: settlementsError } = await supabase
    .from('professional_settlements')
    .select('status, total_amount, balance_due, period_start, period_end, professional_id')
    .is('deleted_at', null)
    .lte('period_start', to)
    .gte('period_end', from);
  if (settlementsError) throw settlementsError;

  const { data: professionals, error: professionalsError } = await supabase
    .from('professionals')
    .select('id, first_name, last_name')
    .is('deleted_at', null);
  if (professionalsError) throw professionalsError;

  const professionalNameById = new Map(
    (professionals ?? []).map((row) => [
      String(row.id),
      `${String(row.last_name)}, ${String(row.first_name)}`,
    ])
  );

  const periodStartIso = `${from}T00:00:00.000Z`;
  const periodEndIso = `${to}T23:59:59.999Z`;
  const { data: payments, error: paymentsError } = await supabase
    .from('professional_payments')
    .select('amount')
    .is('deleted_at', null)
    .gte('paid_at', periodStartIso)
    .lte('paid_at', periodEndIso);
  if (paymentsError) throw paymentsError;

  const byStatusMap = new Map<string, { count: number; totalAmount: number }>();
  const byProfessionalMap = new Map<
    string,
    { count: number; totalAmount: number; balanceDue: number }
  >();
  let totalCalculated = 0;
  let totalBalanceDue = 0;

  for (const row of settlements ?? []) {
    const status = String(row.status);
    const amount = Number(row.total_amount ?? 0);
    const balanceDue = Number(row.balance_due ?? 0);
    const professionalId = String(row.professional_id);
    totalCalculated += amount;
    totalBalanceDue += balanceDue;
    const current = byStatusMap.get(status) ?? { count: 0, totalAmount: 0 };
    byStatusMap.set(status, {
      count: current.count + 1,
      totalAmount: current.totalAmount + amount,
    });
    const profCurrent = byProfessionalMap.get(professionalId) ?? {
      count: 0,
      totalAmount: 0,
      balanceDue: 0,
    };
    byProfessionalMap.set(professionalId, {
      count: profCurrent.count + 1,
      totalAmount: profCurrent.totalAmount + amount,
      balanceDue: profCurrent.balanceDue + balanceDue,
    });
  }

  const totalPaidInPeriod = (payments ?? []).reduce((sum, row) => sum + Number(row.amount ?? 0), 0);

  return {
    settlementsInPeriod: settlements?.length ?? 0,
    totalCalculated: Math.round(totalCalculated * 100) / 100,
    totalPaidInPeriod: Math.round(totalPaidInPeriod * 100) / 100,
    totalBalanceDue: Math.round(totalBalanceDue * 100) / 100,
    byStatus: [...byStatusMap.entries()].map(([status, value]) => ({
      status,
      count: value.count,
      totalAmount: Math.round(value.totalAmount * 100) / 100,
    })),
    byProfessional: [...byProfessionalMap.entries()]
      .map(([professionalId, value]) => ({
        professionalId,
        professionalName: professionalNameById.get(professionalId) ?? professionalId,
        count: value.count,
        totalAmount: Math.round(value.totalAmount * 100) / 100,
        balanceDue: Math.round(value.balanceDue * 100) / 100,
      }))
      .sort((a, b) => b.totalAmount - a.totalAmount),
  };
}
