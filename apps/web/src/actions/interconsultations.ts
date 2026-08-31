'use server';

import { createHash, randomBytes } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import {
  INTERCONSULTATION_LIST_COLUMNS,
  INTERCONSULTATION_TOKEN_TTL_DAYS,
  buildInterconsultationInvoiceDescription,
  buildInterconsultationWhatsAppAcceptedMessage,
  buildInterconsultationWhatsAppCompletedMessage,
  buildInterconsultationWhatsAppRequestMessage,
  canTransitionInterconsultationStatus,
  computeInterconsultationClientAmount,
  interconsultationAttachInvoiceSchema,
  interconsultationAttachSettlementSchema,
  interconsultationCreateSchema,
  interconsultationListFiltersSchema,
  interconsultationQuoteApproveSchema,
  interconsultationRequestQuotesSchema,
  interconsultationResponseSubmitSchema,
  interconsultationUpdateSchema,
  type ActionResult,
  type InterconsultationDetail,
  type InterconsultationKpis,
  type InterconsultationListRow,
  type InterconsultationStatus,
} from '@sincvete/shared';
import { createServerClient, createServiceClient } from '@/lib/supabase/server';
import {
  PermissionError,
  canPermissionAndFeature,
  requirePermissionAndFeature,
} from '@/lib/permissions';
import { FEATURES, planRestrictionResult } from '@/lib/entitlements';
import { getSessionContext } from '@/actions/auth';
import { getOrganization } from '@/actions/settings';
import { parseOrganizationSettings } from '@sincvete/shared';

/** Untyped table access until Database types include interconsultation_* tables. */
type LooseDb = {
  // Tables are not yet in generated Database; keep chainable client loosely typed.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any;
  rpc: (
    fn: string,
    args?: Record<string, unknown>
  ) => Promise<{ data: unknown; error: { message?: string } | null }>;
};

function asDb(client: unknown): LooseDb {
  return client as LooseDb;
}

function revalidateInterconsultas(id?: string) {
  revalidatePath('/interconsultas');
  if (id) revalidatePath(`/interconsultas/${id}`);
  revalidatePath('/facturacion');
  revalidatePath('/liquidaciones');
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

function hashToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

function newSecureToken(): string {
  return randomBytes(32).toString('base64url');
}

function tokenExpiresAt(days = INTERCONSULTATION_TOKEN_TTL_DAYS): string {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

function mapInterconsultation(row: Record<string, unknown>) {
  return {
    id: String(row.id),
    organizationId: String(row.organization_id),
    branchId: row.branch_id ? String(row.branch_id) : null,
    patientId: String(row.patient_id),
    ownerId: String(row.owner_id),
    requestedBy: row.requested_by ? String(row.requested_by) : null,
    title: String(row.title),
    clinicalQuestion: String(row.clinical_question),
    clinicalSummary: row.clinical_summary ? String(row.clinical_summary) : null,
    priority: row.priority as InterconsultationDetail['priority'],
    status: row.status as InterconsultationStatus,
    currency: String(row.currency ?? 'ARS'),
    clinicMarkupPercentage: Number(row.clinic_markup_percentage ?? 0),
    clinicMarkupAmount: Number(row.clinic_markup_amount ?? 0),
    professionalBaseAmount: Number(row.professional_base_amount ?? 0),
    clientFinalAmount: Number(row.client_final_amount ?? 0),
    acceptedResponseId: row.accepted_response_id ? String(row.accepted_response_id) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    closedAt: row.closed_at ? String(row.closed_at) : null,
  };
}

function resolveAppBaseUrl(): string {
  const raw = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL || 'http://localhost:3000';
  if (raw.startsWith('http://') || raw.startsWith('https://')) return raw.replace(/\/$/, '');
  return `https://${raw.replace(/\/$/, '')}`;
}

export async function canReadInterconsultations(): Promise<boolean> {
  return canPermissionAndFeature('interconsultations:read', FEATURES.PROFESSIONALS_INTERCONSULTATIONS);
}

export async function canWriteInterconsultations(): Promise<boolean> {
  return canPermissionAndFeature('interconsultations:write', FEATURES.PROFESSIONALS_INTERCONSULTATIONS);
}

export async function canApproveInterconsultations(): Promise<boolean> {
  return canPermissionAndFeature(
    'interconsultations:approve',
    FEATURES.PROFESSIONALS_INTERCONSULTATIONS
  );
}

export async function canBillInterconsultations(): Promise<boolean> {
  return canPermissionAndFeature(
    'interconsultations:billing',
    FEATURES.PROFESSIONALS_INTERCONSULTATIONS
  );
}

export async function getInterconsultationKpis(): Promise<InterconsultationKpis> {
  const allowed = await canReadInterconsultations();
  if (!allowed) {
    return { open: 0, waitingResponse: 0, quotesReceived: 0, pendingBilling: 0, pendingSettlement: 0 };
  }

  const session = await getSessionContext();
  if (!session) {
    return { open: 0, waitingResponse: 0, quotesReceived: 0, pendingBilling: 0, pendingSettlement: 0 };
  }

  const supabase = asDb(await createServerClient());
  const orgId = session.organizationId;

  const [openRes, waitingRes, quotesRes, billingRes, settlementRes] = await Promise.all([
    supabase
      .from('interconsultations')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', orgId)
      .is('deleted_at', null)
      .in('status', ['draft', 'requesting', 'quotes_received', 'approved', 'in_progress']),
    supabase
      .from('interconsultations')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', orgId)
      .is('deleted_at', null)
      .in('status', ['requesting']),
    supabase
      .from('interconsultations')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', orgId)
      .is('deleted_at', null)
      .eq('status', 'quotes_received'),
    supabase
      .from('interconsultation_billing_links')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', orgId)
      .is('deleted_at', null)
      .eq('status', 'pending'),
    supabase
      .from('interconsultation_settlement_links')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', orgId)
      .is('deleted_at', null)
      .eq('status', 'pending'),
  ]);

  return {
    open: openRes.count ?? 0,
    waitingResponse: waitingRes.count ?? 0,
    quotesReceived: quotesRes.count ?? 0,
    pendingBilling: billingRes.count ?? 0,
    pendingSettlement: settlementRes.count ?? 0,
  };
}

export async function listInterconsultations(
  filtersInput?: unknown
): Promise<{ rows: InterconsultationListRow[]; total: number }> {
  const allowed = await canReadInterconsultations();
  if (!allowed) return { rows: [], total: 0 };

  const session = await getSessionContext();
  if (!session) return { rows: [], total: 0 };

  const parsed = interconsultationListFiltersSchema.safeParse(filtersInput ?? {});
  const filters = parsed.success
    ? parsed.data
    : { page: 1, pageSize: 25, status: null, priority: null, patientId: null, professionalId: null };

  const supabase = asDb(await createServerClient());
  let query = supabase
    .from('interconsultations')
    .select(INTERCONSULTATION_LIST_COLUMNS, { count: 'exact' })
    .eq('organization_id', session.organizationId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false });

  if (filters.status) query = query.eq('status', filters.status);
  if (filters.priority) query = query.eq('priority', filters.priority);
  if (filters.patientId) query = query.eq('patient_id', filters.patientId);
  if (filters.from) query = query.gte('created_at', filters.from);
  if (filters.to) query = query.lte('created_at', filters.to);

  const from = (filters.page - 1) * filters.pageSize;
  const to = from + filters.pageSize - 1;
  const { data, error, count } = await query.range(from, to);
  if (error) {
    console.warn('[interconsultations] list', error.message);
    return { rows: [], total: 0 };
  }

  const rows = (data ?? []) as Record<string, unknown>[];
  if (rows.length === 0) return { rows: [], total: count ?? 0 };

  const patientIds = [...new Set(rows.map((r) => String(r.patient_id)))];
  const ownerIds = [...new Set(rows.map((r) => String(r.owner_id)))];
  const icIds = rows.map((r) => String(r.id));

  const [patientsRes, ownersRes, requestsRes, quotesRes] = await Promise.all([
    supabase.from('patients').select('id, name').in('id', patientIds).is('deleted_at', null),
    supabase.from('owners').select('id, full_name').in('id', ownerIds).is('deleted_at', null),
    supabase
      .from('interconsultation_requests')
      .select(
        'interconsultation_id, professional_id, external_professional_name, professionals(first_name, last_name)'
      )
      .in('interconsultation_id', icIds)
      .is('deleted_at', null),
    supabase
      .from('interconsultation_quotes')
      .select('id, interconsultation_request_id, interconsultation_requests!inner(interconsultation_id)')
      .in('interconsultation_requests.interconsultation_id', icIds)
      .is('deleted_at', null)
      .in('status', ['submitted', 'accepted']),
  ]);

  const patientName = new Map<string, string>(
    ((patientsRes.data ?? []) as Array<{ id: string; name: string }>).map((p) => [p.id, p.name])
  );
  const ownerName = new Map<string, string>(
    ((ownersRes.data ?? []) as Array<{ id: string; full_name: string }>).map((o) => [o.id, o.full_name])
  );

  const namesByIc = new Map<string, string[]>();
  for (const req of (requestsRes.data ?? []) as Array<Record<string, unknown>>) {
    const icId = String(req.interconsultation_id);
    const pro = req.professionals as { first_name?: string; last_name?: string } | null;
    const name =
      req.external_professional_name
        ? String(req.external_professional_name)
        : pro
          ? `${pro.first_name ?? ''} ${pro.last_name ?? ''}`.trim()
          : null;
    if (!name) continue;
    const list = namesByIc.get(icId) ?? [];
    if (!list.includes(name)) list.push(name);
    namesByIc.set(icId, list);
  }

  const quoteCountByIc = new Map<string, number>();
  for (const quote of (quotesRes.data ?? []) as Array<Record<string, unknown>>) {
    const req = quote.interconsultation_requests as { interconsultation_id?: string } | null;
    const icId = req?.interconsultation_id ? String(req.interconsultation_id) : null;
    if (!icId) continue;
    quoteCountByIc.set(icId, (quoteCountByIc.get(icId) ?? 0) + 1);
  }

  let filtered = rows;
  if (filters.professionalId) {
    const matching = new Set(
      ((requestsRes.data ?? []) as Array<Record<string, unknown>>)
        .filter((r) => String(r.professional_id ?? '') === filters.professionalId)
        .map((r) => String(r.interconsultation_id))
    );
    filtered = rows.filter((r) => matching.has(String(r.id)));
  }

  return {
    total: count ?? filtered.length,
    rows: filtered.map((row) => {
      const mapped = mapInterconsultation(row);
      return {
        ...mapped,
        patientName: patientName.get(mapped.patientId) ?? null,
        ownerName: ownerName.get(mapped.ownerId) ?? null,
        professionalNames: namesByIc.get(mapped.id) ?? [],
        quoteCount: quoteCountByIc.get(mapped.id) ?? 0,
      };
    }),
  };
}

export async function getInterconsultation(id: string): Promise<InterconsultationDetail | null> {
  const allowed = await canReadInterconsultations();
  if (!allowed) return null;
  const session = await getSessionContext();
  if (!session) return null;

  const supabase = asDb(await createServerClient());
  const { data, error } = await supabase
    .from('interconsultations')
    .select(INTERCONSULTATION_LIST_COLUMNS)
    .eq('id', id)
    .eq('organization_id', session.organizationId)
    .is('deleted_at', null)
    .maybeSingle();

  if (error || !data) return null;
  const base = mapInterconsultation(data as Record<string, unknown>);

  const [patientRes, ownerRes, requestsRes, responsesRes, billingRes, settlementRes] =
    await Promise.all([
      supabase
        .from('patients')
        .select('id, name, species, breed')
        .eq('id', base.patientId)
        .maybeSingle(),
      supabase.from('owners').select('id, full_name').eq('id', base.ownerId).maybeSingle(),
      supabase
        .from('interconsultation_requests')
        .select(
          'id, organization_id, interconsultation_id, professional_id, external_professional_name, external_professional_email, external_professional_phone, status, sent_at, viewed_at, responded_at, declined_at, created_at, updated_at, token_expires_at, professionals(first_name, last_name)'
        )
        .eq('interconsultation_id', id)
        .is('deleted_at', null)
        .order('created_at', { ascending: true }),
      supabase
        .from('interconsultation_responses')
        .select(
          'id, organization_id, interconsultation_id, interconsultation_request_id, professional_id, response_text, recommendations, attachments, completed_at, created_at, updated_at'
        )
        .eq('interconsultation_id', id)
        .is('deleted_at', null)
        .order('created_at', { ascending: true }),
      supabase
        .from('interconsultation_billing_links')
        .select('id, organization_id, interconsultation_id, invoice_id, status, created_at, updated_at')
        .eq('interconsultation_id', id)
        .is('deleted_at', null)
        .in('status', ['pending', 'invoiced'])
        .maybeSingle(),
      supabase
        .from('interconsultation_settlement_links')
        .select(
          'id, organization_id, interconsultation_id, professional_id, professional_settlement_id, amount, status, created_at, updated_at'
        )
        .eq('interconsultation_id', id)
        .is('deleted_at', null)
        .order('created_at', { ascending: true }),
    ]);

  const requestRows = (requestsRes.data ?? []) as Array<Record<string, unknown>>;
  const requestIds = requestRows.map((r) => String(r.id));
  const { data: quotesData } = requestIds.length
    ? await supabase
        .from('interconsultation_quotes')
        .select(
          'id, organization_id, interconsultation_request_id, professional_id, amount, currency, estimated_delivery, professional_message, status, created_at, updated_at'
        )
        .in('interconsultation_request_id', requestIds)
        .is('deleted_at', null)
        .order('created_at', { ascending: true })
    : { data: [] };

  const patient = patientRes.data as {
    name?: string;
    species?: string;
    breed?: string;
  } | null;
  const owner = ownerRes.data as { full_name?: string } | null;

  const requests = requestRows.map((r) => {
    const pro = r.professionals as { first_name?: string; last_name?: string } | null;
    return {
      id: String(r.id),
      organizationId: String(r.organization_id),
      interconsultationId: String(r.interconsultation_id),
      professionalId: r.professional_id ? String(r.professional_id) : null,
      externalProfessionalName: r.external_professional_name
        ? String(r.external_professional_name)
        : null,
      externalProfessionalEmail: r.external_professional_email
        ? String(r.external_professional_email)
        : null,
      externalProfessionalPhone: r.external_professional_phone
        ? String(r.external_professional_phone)
        : null,
      status: r.status as InterconsultationDetail['requests'][number]['status'],
      sentAt: r.sent_at ? String(r.sent_at) : null,
      viewedAt: r.viewed_at ? String(r.viewed_at) : null,
      respondedAt: r.responded_at ? String(r.responded_at) : null,
      declinedAt: r.declined_at ? String(r.declined_at) : null,
      createdAt: String(r.created_at),
      updatedAt: String(r.updated_at),
      tokenExpiresAt: r.token_expires_at ? String(r.token_expires_at) : null,
      professionalName: r.external_professional_name
        ? String(r.external_professional_name)
        : pro
          ? `${pro.first_name ?? ''} ${pro.last_name ?? ''}`.trim()
          : null,
    };
  });

  const requestNameById = new Map(requests.map((r) => [r.id, r.professionalName]));

  return {
    ...base,
    patientName: patient?.name ?? null,
    patientSpecies: patient?.species ?? null,
    patientBreed: patient?.breed ?? null,
    ownerName: owner?.full_name ?? null,
    requests,
    quotes: ((quotesData ?? []) as Array<Record<string, unknown>>).map((q) => ({
      id: String(q.id),
      organizationId: String(q.organization_id),
      interconsultationRequestId: String(q.interconsultation_request_id),
      professionalId: q.professional_id ? String(q.professional_id) : null,
      amount: Number(q.amount),
      currency: String(q.currency ?? 'ARS'),
      estimatedDelivery: q.estimated_delivery ? String(q.estimated_delivery) : null,
      professionalMessage: q.professional_message ? String(q.professional_message) : null,
      status: q.status as InterconsultationDetail['quotes'][number]['status'],
      createdAt: String(q.created_at),
      updatedAt: String(q.updated_at),
      professionalName: requestNameById.get(String(q.interconsultation_request_id)) ?? null,
    })),
    responses: ((responsesRes.data ?? []) as Array<Record<string, unknown>>).map((r) => ({
      id: String(r.id),
      organizationId: String(r.organization_id),
      interconsultationId: String(r.interconsultation_id),
      interconsultationRequestId: String(r.interconsultation_request_id),
      professionalId: r.professional_id ? String(r.professional_id) : null,
      responseText: String(r.response_text),
      recommendations: r.recommendations ? String(r.recommendations) : null,
      attachments: Array.isArray(r.attachments) ? r.attachments : [],
      completedAt: r.completed_at ? String(r.completed_at) : null,
      createdAt: String(r.created_at),
      updatedAt: String(r.updated_at),
    })),
    billingLink: billingRes.data
      ? {
          id: String((billingRes.data as Record<string, unknown>).id),
          organizationId: String((billingRes.data as Record<string, unknown>).organization_id),
          interconsultationId: String(
            (billingRes.data as Record<string, unknown>).interconsultation_id
          ),
          invoiceId: (billingRes.data as Record<string, unknown>).invoice_id
            ? String((billingRes.data as Record<string, unknown>).invoice_id)
            : null,
          status: (billingRes.data as Record<string, unknown>)
            .status as InterconsultationDetail['billingLink'] extends null
            ? never
            : NonNullable<InterconsultationDetail['billingLink']>['status'],
          createdAt: String((billingRes.data as Record<string, unknown>).created_at),
          updatedAt: String((billingRes.data as Record<string, unknown>).updated_at),
        }
      : null,
    settlementLinks: ((settlementRes.data ?? []) as Array<Record<string, unknown>>).map((s) => ({
      id: String(s.id),
      organizationId: String(s.organization_id),
      interconsultationId: String(s.interconsultation_id),
      professionalId: String(s.professional_id),
      professionalSettlementId: s.professional_settlement_id
        ? String(s.professional_settlement_id)
        : null,
      amount: Number(s.amount),
      status: s.status as InterconsultationDetail['settlementLinks'][number]['status'],
      createdAt: String(s.created_at),
      updatedAt: String(s.updated_at),
    })),
  };
}

export async function createInterconsultation(
  _prev: ActionResult<{ id: string }> | null,
  formData: FormData
): Promise<ActionResult<{ id: string }>> {
  try {
    const session = await requirePermissionAndFeature(
      'interconsultations:write',
      FEATURES.PROFESSIONALS_INTERCONSULTATIONS
    );
    const parsed = interconsultationCreateSchema.safeParse({
      patientId: formData.get('patientId'),
      ownerId: formData.get('ownerId'),
      branchId: formData.get('branchId') || session.branchId,
      title: formData.get('title'),
      clinicalQuestion: formData.get('clinicalQuestion'),
      clinicalSummary: formData.get('clinicalSummary') || null,
      priority: formData.get('priority') || 'normal',
      clinicMarkupPercentage: formData.get('clinicMarkupPercentage') || 0,
    });
    if (!parsed.success) {
      return {
        success: false,
        error: 'Datos inválidos',
        fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
      };
    }

    const organization = await getOrganization();
    const currency = parseOrganizationSettings(organization?.settings).currency ?? 'ARS';
    const supabase = asDb(await createServerClient());

    const { data, error } = await supabase
      .from('interconsultations')
      .insert({
        organization_id: session.organizationId,
        branch_id: parsed.data.branchId ?? session.branchId,
        patient_id: parsed.data.patientId,
        owner_id: parsed.data.ownerId,
        requested_by: session.userId,
        title: parsed.data.title,
        clinical_question: parsed.data.clinicalQuestion,
        clinical_summary: parsed.data.clinicalSummary ?? null,
        priority: parsed.data.priority,
        status: 'draft',
        currency,
        clinic_markup_percentage: parsed.data.clinicMarkupPercentage,
      })
      .select('id')
      .single();

    if (error || !data) {
      return { success: false, error: error?.message || 'No se pudo crear la interconsulta' };
    }

    revalidateInterconsultas(String(data.id));
    return { success: true, data: { id: String(data.id) } };
  } catch (error) {
    return actionError(error);
  }
}

export async function updateInterconsultation(
  _prev: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  try {
    const session = await requirePermissionAndFeature(
      'interconsultations:write',
      FEATURES.PROFESSIONALS_INTERCONSULTATIONS
    );
    const parsed = interconsultationUpdateSchema.safeParse({
      id: formData.get('id'),
      title: formData.get('title') || undefined,
      clinicalQuestion: formData.get('clinicalQuestion') || undefined,
      clinicalSummary: formData.has('clinicalSummary')
        ? formData.get('clinicalSummary') || null
        : undefined,
      priority: formData.get('priority') || undefined,
      clinicMarkupPercentage: formData.has('clinicMarkupPercentage')
        ? formData.get('clinicMarkupPercentage')
        : undefined,
    });
    if (!parsed.success) {
      return { success: false, error: 'Datos inválidos' };
    }

    const supabase = asDb(await createServerClient());
    const { data: existing } = await supabase
      .from('interconsultations')
      .select('id, status, professional_base_amount, clinic_markup_percentage')
      .eq('id', parsed.data.id)
      .eq('organization_id', session.organizationId)
      .is('deleted_at', null)
      .maybeSingle();

    if (!existing) return { success: false, error: 'Interconsulta no encontrada' };
    if (['completed', 'cancelled'].includes(String(existing.status))) {
      return { success: false, error: 'No se puede editar una interconsulta cerrada' };
    }

    const patch: Record<string, unknown> = {};
    if (parsed.data.title !== undefined) patch.title = parsed.data.title;
    if (parsed.data.clinicalQuestion !== undefined)
      patch.clinical_question = parsed.data.clinicalQuestion;
    if (parsed.data.clinicalSummary !== undefined)
      patch.clinical_summary = parsed.data.clinicalSummary;
    if (parsed.data.priority !== undefined) patch.priority = parsed.data.priority;

    const markup =
      parsed.data.clinicMarkupPercentage ?? Number(existing.clinic_markup_percentage ?? 0);
    if (parsed.data.clinicMarkupPercentage !== undefined) {
      patch.clinic_markup_percentage = markup;
    }
    const amounts = computeInterconsultationClientAmount({
      professionalBaseAmount: Number(existing.professional_base_amount ?? 0),
      clinicMarkupPercentage: markup,
    });
    patch.clinic_markup_amount = amounts.clinicMarkupAmount;
    patch.client_final_amount = amounts.clientFinalAmount;

    const { error } = await supabase
      .from('interconsultations')
      .update(patch)
      .eq('id', parsed.data.id)
      .eq('organization_id', session.organizationId);

    if (error) return { success: false, error: error.message };
    revalidateInterconsultas(parsed.data.id);
    return { success: true };
  } catch (error) {
    return actionError(error);
  }
}

export async function cancelInterconsultation(id: string): Promise<ActionResult> {
  try {
    const session = await requirePermissionAndFeature(
      'interconsultations:write',
      FEATURES.PROFESSIONALS_INTERCONSULTATIONS
    );
    const supabase = asDb(await createServerClient());
    const { data: existing } = await supabase
      .from('interconsultations')
      .select('id, status')
      .eq('id', id)
      .eq('organization_id', session.organizationId)
      .is('deleted_at', null)
      .maybeSingle();

    if (!existing) return { success: false, error: 'Interconsulta no encontrada' };
    const status = String(existing.status) as InterconsultationStatus;
    if (!canTransitionInterconsultationStatus(status, 'cancelled') && status !== 'cancelled') {
      return { success: false, error: 'No se puede cancelar en este estado' };
    }

    await supabase
      .from('interconsultations')
      .update({
        status: 'cancelled',
        closed_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('organization_id', session.organizationId);

    await supabase
      .from('interconsultation_requests')
      .update({ status: 'cancelled' })
      .eq('interconsultation_id', id)
      .eq('organization_id', session.organizationId)
      .in('status', ['pending', 'sent', 'viewed', 'quoted']);

    revalidateInterconsultas(id);
    return { success: true };
  } catch (error) {
    return actionError(error);
  }
}

export async function requestMultipleProfessionalQuotes(
  _prev: ActionResult<{ tokens: Array<{ requestId: string; url: string; whatsappMessage: string }> }> | null,
  formData: FormData
): Promise<ActionResult<{ tokens: Array<{ requestId: string; url: string; whatsappMessage: string }> }>> {
  try {
    const session = await requirePermissionAndFeature(
      'interconsultations:write',
      FEATURES.PROFESSIONALS_INTERCONSULTATIONS
    );

    let professionalsRaw: unknown = [];
    try {
      professionalsRaw = JSON.parse(String(formData.get('professionals') || '[]'));
    } catch {
      return { success: false, error: 'Listado de profesionales inválido' };
    }

    const parsed = interconsultationRequestQuotesSchema.safeParse({
      interconsultationId: formData.get('interconsultationId'),
      professionals: professionalsRaw,
    });
    if (!parsed.success) {
      return { success: false, error: 'Datos inválidos' };
    }

    const supabase = asDb(await createServerClient());
    const { data: ic } = await supabase
      .from('interconsultations')
      .select('id, status, patient_id, organization_id')
      .eq('id', parsed.data.interconsultationId)
      .eq('organization_id', session.organizationId)
      .is('deleted_at', null)
      .maybeSingle();

    if (!ic) return { success: false, error: 'Interconsulta no encontrada' };
    if (!['draft', 'requesting', 'quotes_received'].includes(String(ic.status))) {
      return { success: false, error: 'No se pueden enviar solicitudes en este estado' };
    }

    const { data: patient } = await supabase
      .from('patients')
      .select('name')
      .eq('id', ic.patient_id)
      .maybeSingle();
    const organization = await getOrganization();
    const clinicName = organization?.name ?? 'Clínica';
    const baseUrl = resolveAppBaseUrl();
    const tokens: Array<{ requestId: string; url: string; whatsappMessage: string }> = [];

    for (const target of parsed.data.professionals) {
      const token = newSecureToken();
      const tokenHash = hashToken(token);
      const expires = tokenExpiresAt();

      let professionalName =
        target.externalProfessionalName?.trim() ||
        'Profesional';

      if (target.professionalId) {
        const { data: pro } = await supabase
          .from('professionals')
          .select('first_name, last_name')
          .eq('id', target.professionalId)
          .eq('organization_id', session.organizationId)
          .is('deleted_at', null)
          .maybeSingle();
        if (!pro) {
          return { success: false, error: 'Profesional interno no encontrado' };
        }
        professionalName = `${pro.first_name} ${pro.last_name}`.trim();
      }

      const { data: req, error } = await supabase
        .from('interconsultation_requests')
        .insert({
          organization_id: session.organizationId,
          interconsultation_id: parsed.data.interconsultationId,
          professional_id: target.professionalId ?? null,
          external_professional_name: target.externalProfessionalName || null,
          external_professional_email: target.externalProfessionalEmail || null,
          external_professional_phone: target.externalProfessionalPhone || null,
          secure_token_hash: tokenHash,
          token_expires_at: expires,
          status: 'sent',
          sent_at: new Date().toISOString(),
        })
        .select('id')
        .single();

      if (error || !req) {
        return { success: false, error: error?.message || 'No se pudo crear la solicitud' };
      }

      const url = `${baseUrl}/interconsulta/responder/${token}`;
      tokens.push({
        requestId: String(req.id),
        url,
        whatsappMessage: buildInterconsultationWhatsAppRequestMessage({
          professionalName,
          clinicName,
          patientName: (patient as { name?: string } | null)?.name ?? 'paciente',
          url,
        }),
      });
    }

    if (String(ic.status) === 'draft') {
      await supabase
        .from('interconsultations')
        .update({ status: 'requesting' })
        .eq('id', parsed.data.interconsultationId)
        .eq('organization_id', session.organizationId);
    }

    revalidateInterconsultas(parsed.data.interconsultationId);
    return { success: true, data: { tokens } };
  } catch (error) {
    return actionError(error);
  }
}

export async function requestProfessionalQuote(
  prev: ActionResult<{ tokens: Array<{ requestId: string; url: string; whatsappMessage: string }> }> | null,
  formData: FormData
) {
  return requestMultipleProfessionalQuotes(prev, formData);
}

export async function resendInterconsultationRequest(
  requestId: string
): Promise<ActionResult<{ url: string; whatsappMessage: string }>> {
  try {
    const session = await requirePermissionAndFeature(
      'interconsultations:write',
      FEATURES.PROFESSIONALS_INTERCONSULTATIONS
    );
    const supabase = asDb(await createServerClient());
    const { data: req } = await supabase
      .from('interconsultation_requests')
      .select(
        'id, interconsultation_id, professional_id, external_professional_name, status, professionals(first_name, last_name)'
      )
      .eq('id', requestId)
      .eq('organization_id', session.organizationId)
      .is('deleted_at', null)
      .maybeSingle();

    if (!req) return { success: false, error: 'Solicitud no encontrada' };
    if (['accepted', 'declined', 'cancelled'].includes(String(req.status))) {
      return { success: false, error: 'No se puede reenviar esta solicitud' };
    }

    const token = newSecureToken();
    const { error } = await supabase
      .from('interconsultation_requests')
      .update({
        secure_token_hash: hashToken(token),
        token_expires_at: tokenExpiresAt(),
        status: 'sent',
        sent_at: new Date().toISOString(),
      })
      .eq('id', requestId)
      .eq('organization_id', session.organizationId);

    if (error) return { success: false, error: error.message };

    const { data: ic } = await supabase
      .from('interconsultations')
      .select('patient_id')
      .eq('id', req.interconsultation_id)
      .maybeSingle();
    const { data: patient } = ic
      ? await supabase.from('patients').select('name').eq('id', ic.patient_id).maybeSingle()
      : { data: null };
    const organization = await getOrganization();
    const pro = req.professionals as { first_name?: string; last_name?: string } | null;
    const professionalName =
      (req.external_professional_name as string | null) ||
      (pro ? `${pro.first_name ?? ''} ${pro.last_name ?? ''}`.trim() : 'Profesional');
    const url = `${resolveAppBaseUrl()}/interconsulta/responder/${token}`;
    const whatsappMessage = buildInterconsultationWhatsAppRequestMessage({
      professionalName,
      clinicName: organization?.name ?? 'Clínica',
      patientName: (patient as { name?: string } | null)?.name ?? 'paciente',
      url,
    });

    revalidateInterconsultas(String(req.interconsultation_id));
    return { success: true, data: { url, whatsappMessage } };
  } catch (error) {
    return actionError(error);
  }
}

export async function cancelInterconsultationRequest(requestId: string): Promise<ActionResult> {
  try {
    const session = await requirePermissionAndFeature(
      'interconsultations:write',
      FEATURES.PROFESSIONALS_INTERCONSULTATIONS
    );
    const supabase = asDb(await createServerClient());
    const { data: req } = await supabase
      .from('interconsultation_requests')
      .select('id, interconsultation_id, status')
      .eq('id', requestId)
      .eq('organization_id', session.organizationId)
      .is('deleted_at', null)
      .maybeSingle();
    if (!req) return { success: false, error: 'Solicitud no encontrada' };
    if (String(req.status) === 'accepted') {
      return { success: false, error: 'No se puede cancelar una solicitud ya aceptada' };
    }

    await supabase
      .from('interconsultation_requests')
      .update({ status: 'cancelled' })
      .eq('id', requestId)
      .eq('organization_id', session.organizationId);

    revalidateInterconsultas(String(req.interconsultation_id));
    return { success: true };
  } catch (error) {
    return actionError(error);
  }
}

export async function approveInterconsultationQuote(
  _prev: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  try {
    const session = await requirePermissionAndFeature(
      'interconsultations:approve',
      FEATURES.PROFESSIONALS_INTERCONSULTATIONS
    );
    const parsed = interconsultationQuoteApproveSchema.safeParse({
      quoteId: formData.get('quoteId'),
      interconsultationId: formData.get('interconsultationId'),
    });
    if (!parsed.success) return { success: false, error: 'Datos inválidos' };

    const supabase = asDb(await createServerClient());
    const { data: quote } = await supabase
      .from('interconsultation_quotes')
      .select('id, amount, currency, interconsultation_request_id, status')
      .eq('id', parsed.data.quoteId)
      .eq('organization_id', session.organizationId)
      .is('deleted_at', null)
      .maybeSingle();

    if (!quote || String(quote.status) !== 'submitted') {
      return { success: false, error: 'Presupuesto no disponible para aceptar' };
    }

    const { data: ic } = await supabase
      .from('interconsultations')
      .select('id, status, clinic_markup_percentage, patient_id')
      .eq('id', parsed.data.interconsultationId)
      .eq('organization_id', session.organizationId)
      .is('deleted_at', null)
      .maybeSingle();

    if (!ic || !['quotes_received', 'requesting'].includes(String(ic.status))) {
      return { success: false, error: 'La interconsulta no admite aceptación de presupuesto' };
    }

    const amounts = computeInterconsultationClientAmount({
      professionalBaseAmount: Number(quote.amount),
      clinicMarkupPercentage: Number(ic.clinic_markup_percentage ?? 0),
    });

    await supabase
      .from('interconsultation_quotes')
      .update({ status: 'accepted' })
      .eq('id', quote.id)
      .eq('organization_id', session.organizationId);

    await supabase
      .from('interconsultation_quotes')
      .update({ status: 'rejected' })
      .neq('id', quote.id)
      .eq('organization_id', session.organizationId)
      .in(
        'interconsultation_request_id',
        (
          await supabase
            .from('interconsultation_requests')
            .select('id')
            .eq('interconsultation_id', parsed.data.interconsultationId)
            .is('deleted_at', null)
        ).data?.map((r: { id: string }) => r.id) ?? []
      )
      .eq('status', 'submitted');

    await supabase
      .from('interconsultation_requests')
      .update({ status: 'accepted' })
      .eq('id', quote.interconsultation_request_id)
      .eq('organization_id', session.organizationId);

    await supabase
      .from('interconsultation_requests')
      .update({ status: 'cancelled' })
      .eq('interconsultation_id', parsed.data.interconsultationId)
      .neq('id', quote.interconsultation_request_id)
      .eq('organization_id', session.organizationId)
      .in('status', ['pending', 'sent', 'viewed', 'quoted']);

    await supabase
      .from('interconsultations')
      .update({
        status: 'approved',
        professional_base_amount: Number(quote.amount),
        clinic_markup_amount: amounts.clinicMarkupAmount,
        client_final_amount: amounts.clientFinalAmount,
      })
      .eq('id', parsed.data.interconsultationId)
      .eq('organization_id', session.organizationId);

    revalidateInterconsultas(parsed.data.interconsultationId);
    return { success: true };
  } catch (error) {
    return actionError(error);
  }
}

export async function rejectInterconsultationQuote(
  quoteId: string,
  interconsultationId: string
): Promise<ActionResult> {
  try {
    const session = await requirePermissionAndFeature(
      'interconsultations:approve',
      FEATURES.PROFESSIONALS_INTERCONSULTATIONS
    );
    const supabase = asDb(await createServerClient());
    const { error } = await supabase
      .from('interconsultation_quotes')
      .update({ status: 'rejected' })
      .eq('id', quoteId)
      .eq('organization_id', session.organizationId)
      .eq('status', 'submitted');
    if (error) return { success: false, error: error.message };
    revalidateInterconsultas(interconsultationId);
    return { success: true };
  } catch (error) {
    return actionError(error);
  }
}

export async function submitInterconsultationResponseClinic(
  _prev: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  try {
    const session = await requirePermissionAndFeature(
      'interconsultations:write',
      FEATURES.PROFESSIONALS_INTERCONSULTATIONS
    );
    const interconsultationId = String(formData.get('interconsultationId') || '');
    const requestId = String(formData.get('requestId') || '');
    const parsed = interconsultationResponseSubmitSchema.safeParse({
      responseText: formData.get('responseText'),
      recommendations: formData.get('recommendations') || null,
    });
    if (!parsed.success || !interconsultationId || !requestId) {
      return { success: false, error: 'Datos inválidos' };
    }

    const supabase = asDb(await createServerClient());
    const { data: req } = await supabase
      .from('interconsultation_requests')
      .select('id, professional_id, status')
      .eq('id', requestId)
      .eq('interconsultation_id', interconsultationId)
      .eq('organization_id', session.organizationId)
      .eq('status', 'accepted')
      .maybeSingle();
    if (!req) return { success: false, error: 'Solicitud aceptada no encontrada' };

    const { data: response, error } = await supabase
      .from('interconsultation_responses')
      .insert({
        organization_id: session.organizationId,
        interconsultation_id: interconsultationId,
        interconsultation_request_id: requestId,
        professional_id: req.professional_id,
        response_text: parsed.data.responseText,
        recommendations: parsed.data.recommendations ?? null,
        completed_at: new Date().toISOString(),
      })
      .select('id')
      .single();

    if (error || !response) {
      return { success: false, error: error?.message || 'No se pudo guardar la respuesta' };
    }

    await supabase
      .from('interconsultations')
      .update({
        status: 'in_progress',
        accepted_response_id: response.id,
      })
      .eq('id', interconsultationId)
      .eq('organization_id', session.organizationId);

    revalidateInterconsultas(interconsultationId);
    return { success: true };
  } catch (error) {
    return actionError(error);
  }
}

export async function markInterconsultationCompleted(id: string): Promise<ActionResult> {
  try {
    const session = await requirePermissionAndFeature(
      'interconsultations:write',
      FEATURES.PROFESSIONALS_INTERCONSULTATIONS
    );
    const supabase = asDb(await createServerClient());
    const detail = await getInterconsultation(id);
    if (!detail || detail.organizationId !== session.organizationId) {
      return { success: false, error: 'Interconsulta no encontrada' };
    }
    if (!['approved', 'in_progress'].includes(detail.status)) {
      return { success: false, error: 'Solo se puede completar una interconsulta aceptada o en curso' };
    }

    const acceptedRequest = detail.requests.find((r) => r.status === 'accepted');
    const acceptedQuote = detail.quotes.find((q) => q.status === 'accepted');

    await supabase
      .from('interconsultations')
      .update({
        status: 'completed',
        closed_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('organization_id', session.organizationId);

    // Pending billing (idempotent unique index)
    const { data: existingBilling } = await supabase
      .from('interconsultation_billing_links')
      .select('id')
      .eq('interconsultation_id', id)
      .is('deleted_at', null)
      .in('status', ['pending', 'invoiced'])
      .maybeSingle();

    if (!existingBilling) {
      await supabase.from('interconsultation_billing_links').insert({
        organization_id: session.organizationId,
        interconsultation_id: id,
        status: 'pending',
      });
    }

    if (acceptedRequest?.professionalId && acceptedQuote) {
      const { data: existingSettlement } = await supabase
        .from('interconsultation_settlement_links')
        .select('id')
        .eq('interconsultation_id', id)
        .eq('professional_id', acceptedRequest.professionalId)
        .is('deleted_at', null)
        .in('status', ['pending', 'linked'])
        .maybeSingle();

      if (!existingSettlement) {
        await supabase.from('interconsultation_settlement_links').insert({
          organization_id: session.organizationId,
          interconsultation_id: id,
          professional_id: acceptedRequest.professionalId,
          amount: acceptedQuote.amount,
          status: 'pending',
        });
      }
    }

    revalidateInterconsultas(id);
    return { success: true };
  } catch (error) {
    return actionError(error);
  }
}

export async function queueInterconsultationForBilling(id: string): Promise<ActionResult> {
  return markInterconsultationCompleted(id);
}

export async function attachInterconsultationToInvoice(
  _prev: ActionResult<{ invoiceId: string }> | null,
  formData: FormData
): Promise<ActionResult<{ invoiceId: string }>> {
  try {
    const session = await requirePermissionAndFeature(
      'interconsultations:billing',
      FEATURES.PROFESSIONALS_INTERCONSULTATIONS
    );
    // Also require billing write for invoice mutation
    await requirePermissionAndFeature('billing:write', FEATURES.BILLING);

    const parsed = interconsultationAttachInvoiceSchema.safeParse({
      interconsultationId: formData.get('interconsultationId'),
      invoiceId: formData.get('invoiceId') || null,
      createDraft: formData.get('createDraft') !== 'false',
    });
    if (!parsed.success) return { success: false, error: 'Datos inválidos' };

    const supabase = asDb(await createServerClient());
    const detail = await getInterconsultation(parsed.data.interconsultationId);
    if (!detail || detail.status !== 'completed') {
      return { success: false, error: 'Solo se pueden facturar interconsultas completadas' };
    }
    if (!detail.billingLink || detail.billingLink.status === 'invoiced') {
      return {
        success: false,
        error: detail.billingLink?.status === 'invoiced'
          ? 'Esta interconsulta ya fue facturada'
          : 'No hay cobro pendiente',
      };
    }
    if (detail.clientFinalAmount <= 0) {
      return { success: false, error: 'El monto final del cliente debe ser mayor a cero' };
    }

    let invoiceId = parsed.data.invoiceId ?? null;

    if (invoiceId) {
      const { data: invoice } = await supabase
        .from('invoices')
        .select('id, status, owner_id')
        .eq('id', invoiceId)
        .eq('organization_id', session.organizationId)
        .is('deleted_at', null)
        .maybeSingle();
      if (!invoice || String(invoice.status) !== 'borrador') {
        return { success: false, error: 'Solo se puede agregar a facturas en borrador' };
      }
      if (String(invoice.owner_id) !== detail.ownerId) {
        return { success: false, error: 'La factura debe ser del mismo propietario' };
      }
    } else if (parsed.data.createDraft) {
      const organization = await getOrganization();
      const currency =
        parseOrganizationSettings(organization?.settings).currency ?? detail.currency;
      const branchId = detail.branchId ?? session.branchId;
      if (!branchId) return { success: false, error: 'Seleccioná una sucursal activa' };

      const { data: invoice, error } = await supabase
        .from('invoices')
        .insert({
          organization_id: session.organizationId,
          branch_id: branchId,
          owner_id: detail.ownerId,
          patient_id: detail.patientId,
          created_by: session.userId,
          status: 'borrador',
          currency,
          notes: `Generada desde interconsulta ${detail.id}`,
        })
        .select('id')
        .single();
      if (error || !invoice) {
        return { success: false, error: error?.message || 'No se pudo crear la factura' };
      }
      invoiceId = String(invoice.id);
    } else {
      return { success: false, error: 'Indicá una factura o creá un borrador' };
    }

    const { data: maxSort } = await supabase
      .from('invoice_items')
      .select('sort_order')
      .eq('invoice_id', invoiceId)
      .order('sort_order', { ascending: false })
      .limit(1)
      .maybeSingle();

    const sortOrder = Number((maxSort as { sort_order?: number } | null)?.sort_order ?? -1) + 1;
    const { error: itemError } = await supabase.from('invoice_items').insert({
      organization_id: session.organizationId,
      invoice_id: invoiceId,
      description: buildInterconsultationInvoiceDescription(detail.title),
      quantity: 1,
      unit_price: detail.clientFinalAmount,
      line_total: detail.clientFinalAmount,
      sort_order: sortOrder,
    });
    if (itemError) return { success: false, error: 'No se pudo agregar el ítem a la factura' };

    const { error: totalsError } = await supabase.rpc('recalc_invoice_totals', {
      p_invoice_id: invoiceId,
    });
    if (totalsError) return { success: false, error: 'No se pudieron recalcular los totales' };

    const { error: linkError } = await supabase
      .from('interconsultation_billing_links')
      .update({ status: 'invoiced', invoice_id: invoiceId })
      .eq('id', detail.billingLink.id)
      .eq('organization_id', session.organizationId)
      .eq('status', 'pending');

    if (linkError) {
      return { success: false, error: 'La interconsulta ya estaba facturada o no se pudo vincular' };
    }

    revalidateInterconsultas(detail.id);
    return { success: true, data: { invoiceId: invoiceId! } };
  } catch (error) {
    return actionError(error);
  }
}

export async function queueInterconsultationForSettlement(id: string): Promise<ActionResult> {
  // Created automatically on complete; this is an idempotent ensure.
  return markInterconsultationCompleted(id);
}

export async function attachInterconsultationToProfessionalSettlement(
  _prev: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  try {
    const session = await requirePermissionAndFeature(
      'interconsultations:write',
      FEATURES.PROFESSIONALS_INTERCONSULTATIONS
    );
    await requirePermissionAndFeature(
      'professional_settlements:approve',
      FEATURES.PROFESSIONALS_SETTLEMENTS
    );

    const parsed = interconsultationAttachSettlementSchema.safeParse({
      interconsultationId: formData.get('interconsultationId'),
      settlementLinkId: formData.get('settlementLinkId'),
      professionalSettlementId: formData.get('professionalSettlementId'),
    });
    if (!parsed.success) return { success: false, error: 'Datos inválidos' };

    const supabase = asDb(await createServerClient());
    const { data: link } = await supabase
      .from('interconsultation_settlement_links')
      .select('id, status, amount, professional_id, interconsultation_id')
      .eq('id', parsed.data.settlementLinkId)
      .eq('interconsultation_id', parsed.data.interconsultationId)
      .eq('organization_id', session.organizationId)
      .is('deleted_at', null)
      .maybeSingle();

    if (!link || String(link.status) !== 'pending') {
      return { success: false, error: 'No hay liquidación pendiente para vincular' };
    }

    const { data: settlement } = await supabase
      .from('professional_settlements')
      .select('id, status, professional_id, currency')
      .eq('id', parsed.data.professionalSettlementId)
      .eq('organization_id', session.organizationId)
      .is('deleted_at', null)
      .maybeSingle();

    if (!settlement || String(settlement.status) !== 'draft') {
      return {
        success: false,
        error: 'Solo se puede vincular a liquidaciones en borrador (no aprobadas ni pagadas)',
      };
    }
    if (String(settlement.professional_id) !== String(link.professional_id)) {
      return { success: false, error: 'La liquidación no corresponde al profesional' };
    }

    // Double-settlement guard via source claims
    const { data: existingClaim } = await supabase
      .from('professional_settlement_source_claims')
      .select('id')
      .eq('organization_id', session.organizationId)
      .eq('source_type', 'interconsultation')
      .eq('source_id', parsed.data.interconsultationId)
      .maybeSingle();

    if (existingClaim) {
      return { success: false, error: 'Esta interconsulta ya fue liquidada' };
    }

    const { error: adjError } = await supabase.from('professional_settlement_adjustments').insert({
      organization_id: session.organizationId,
      settlement_id: settlement.id,
      adjustment_type: 'bonus',
      amount: Number(link.amount),
      reason: `Interconsulta ${parsed.data.interconsultationId}`,
      created_by: session.userId,
    });
    if (adjError) {
      return { success: false, error: adjError.message || 'No se pudo agregar el ajuste' };
    }

    const { error: claimError } = await supabase.from('professional_settlement_source_claims').insert({
      organization_id: session.organizationId,
      settlement_id: settlement.id,
      source_type: 'interconsultation',
      source_id: parsed.data.interconsultationId,
    });
    if (claimError) {
      return { success: false, error: 'No se pudo registrar el claim de liquidación (posible duplicado)' };
    }

    await supabase.rpc('recalculate_professional_settlement_totals', {
      p_settlement_id: settlement.id,
    });

    const { error: linkError } = await supabase
      .from('interconsultation_settlement_links')
      .update({
        status: 'linked',
        professional_settlement_id: settlement.id,
      })
      .eq('id', link.id)
      .eq('status', 'pending');

    if (linkError) return { success: false, error: linkError.message };

    revalidateInterconsultas(parsed.data.interconsultationId);
    return { success: true };
  } catch (error) {
    return actionError(error);
  }
}

/** Public external portal — uses anon-safe RPCs (token scoped). */
export async function getExternalInterconsultationByToken(token: string) {
  const supabase = asDb(await createServerClient());
  const { data, error } = await supabase.rpc('get_interconsultation_by_token', {
    p_token: token,
  });
  if (error) return { ok: false as const, error: 'No se pudo validar el enlace' };
  return data as Record<string, unknown>;
}

export async function submitInterconsultationQuoteByToken(
  token: string,
  input: { amount: number; estimatedDelivery?: string | null; professionalMessage?: string | null }
) {
  const supabase = asDb(await createServerClient());
  const { data, error } = await supabase.rpc('submit_interconsultation_quote_by_token', {
    p_token: token,
    p_amount: input.amount,
    p_estimated_delivery: input.estimatedDelivery ?? null,
    p_professional_message: input.professionalMessage ?? null,
  });
  if (error) return { ok: false as const, error: error.message };
  return data as Record<string, unknown>;
}

export async function submitInterconsultationResponseByToken(
  token: string,
  input: { responseText: string; recommendations?: string | null }
) {
  const supabase = asDb(await createServerClient());
  const { data, error } = await supabase.rpc('submit_interconsultation_response_by_token', {
    p_token: token,
    p_response_text: input.responseText,
    p_recommendations: input.recommendations ?? null,
  });
  if (error) return { ok: false as const, error: error.message };
  return data as Record<string, unknown>;
}

export async function prepareInterconsultationWhatsAppMessages(id: string): Promise<
  ActionResult<{
    accepted?: string;
    completed?: string;
  }>
> {
  try {
    const detail = await getInterconsultation(id);
    if (!detail) return { success: false, error: 'Interconsulta no encontrada' };
    const patientName = detail.patientName ?? 'paciente';
    return {
      success: true,
      data: {
        accepted: buildInterconsultationWhatsAppAcceptedMessage({ patientName }),
        completed: buildInterconsultationWhatsAppCompletedMessage({ patientName }),
      },
    };
  } catch (error) {
    return actionError(error);
  }
}

/** Dev/test helper — not used by UI. Keeps service role out of client. */
export async function hashInterconsultationTokenForTests(token: string): Promise<string> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Not available');
  }
  void createServiceClient;
  return hashToken(token);
}
