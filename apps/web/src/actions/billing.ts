'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import {
  buildPaginatedResult,
  invoiceCreateSchema,
  invoiceListSchema,
  invoiceUpdateSchema,
  parseOrganizationSettings,
  paymentSchema,
  type ActionResult,
  type Invoice,
  type InvoiceItem,
  type InvoiceListRow,
  type PaginatedResult,
  type PaymentListRow,
} from '@sincvete/shared';
import { createServerClient } from '@/lib/supabase/server';
import { PermissionError, requirePermission, requirePermissionAndFeature, canPermissionAndFeature } from '@/lib/permissions';
import { getSessionContext } from '@/actions/auth';
import { FEATURES, planRestrictionResult } from '@/lib/entitlements';
import { getOrganization } from '@/actions/settings';

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

function toInvoiceRow(row: InvoiceListRow & { total_count?: number }): InvoiceListRow {
  const { total_count: _total, ...entry } = row;
  void _total;
  return {
    ...entry,
    subtotal: Number(entry.subtotal ?? 0),
    tax_amount: Number(entry.tax_amount ?? 0),
    total: Number(entry.total ?? 0),
    paid_amount: Number(entry.paid_amount ?? 0),
    balance: Number(entry.balance ?? 0),
    item_count: Number(entry.item_count ?? 0),
    deleted_at: entry.deleted_at ?? null,
  };
}

function parseItemsFromForm(formData: FormData) {
  const descriptions = formData.getAll('description').map(String);
  return descriptions.map((description, index) => ({
    description,
    quantity: formData.get(`quantity_${index}`) ?? formData.getAll('quantity')[index],
    unitPrice: formData.get(`unitPrice_${index}`) ?? formData.getAll('unitPrice')[index],
  }));
}

export async function listOpenInvoices(): Promise<InvoiceListRow[]> {
  await requirePermission('billing:read');
  const session = await getSessionContext();
  const supabase = await createServerClient();

  const { data, error } = await supabase.rpc('list_open_invoices', {
    p_branch_id: session?.branchId ?? null,
  });

  if (error) throw error;
  return (data ?? []).map((row) => toInvoiceRow(row as InvoiceListRow));
}

export async function listInvoices(
  input: {
    page?: number;
    pageSize?: number;
    search?: string;
    ownerId?: string;
    patientId?: string;
    branchId?: string;
    status?: string;
  } = {}
): Promise<PaginatedResult<InvoiceListRow>> {
  await requirePermission('billing:read');
  const parsed = invoiceListSchema.parse(input);
  const session = await getSessionContext();
  const supabase = await createServerClient();

  const { data, error } = await supabase.rpc('search_invoices', {
    p_search: parsed.search?.trim() || null,
    p_owner_id: parsed.ownerId || null,
    p_patient_id: parsed.patientId || null,
    p_branch_id: parsed.branchId ?? session?.branchId ?? null,
    p_status: parsed.status || null,
    p_page: parsed.page,
    p_page_size: parsed.pageSize,
  });

  if (error) throw error;

  const rows = data ?? [];
  const total = rows[0]?.total_count ?? 0;
  const invoices = rows.map((row) =>
    toInvoiceRow(row as InvoiceListRow & { total_count: number })
  );

  return buildPaginatedResult(invoices, Number(total), parsed.page, parsed.pageSize);
}

export async function getInvoice(id: string): Promise<{
  invoice: InvoiceListRow;
  items: InvoiceItem[];
  payments: PaymentListRow[];
} | null> {
  await requirePermission('billing:read');
  const supabase = await createServerClient();

  const { data: invoice, error } = await supabase
    .from('invoices')
    .select('*')
    .eq('id', id)
    .is('deleted_at', null)
    .single();

  if (error || !invoice) return null;

  const [{ data: owner }, { data: patient }, profileResult, { data: items }, { data: payments }] =
    await Promise.all([
      supabase.from('owners').select('full_name').eq('id', invoice.owner_id).single(),
      invoice.patient_id
        ? supabase.from('patients').select('name, species').eq('id', invoice.patient_id).single()
        : Promise.resolve({ data: null }),
      invoice.created_by
        ? supabase.from('profiles').select('full_name').eq('id', invoice.created_by).single()
        : Promise.resolve({ data: null }),
      supabase
        .from('invoice_items')
        .select('*')
        .eq('invoice_id', id)
        .is('deleted_at', null)
        .order('sort_order', { ascending: true }),
      supabase
        .from('payments')
        .select('*')
        .eq('invoice_id', id)
        .is('deleted_at', null)
        .order('paid_at', { ascending: false }),
    ]);

  if (!owner) return null;

  const performerIds = [
    ...new Set(
      (payments ?? [])
        .map((p) => p.recorded_by)
        .filter((value): value is string => Boolean(value))
    ),
  ];
  const payProfiles =
    performerIds.length > 0
      ? await supabase.from('profiles').select('id, full_name').in('id', performerIds)
      : { data: [] as Array<{ id: string; full_name: string }> };
  const nameById = new Map((payProfiles.data ?? []).map((p) => [p.id, p.full_name]));

  const typed = invoice as Invoice;

  return {
    invoice: {
      ...typed,
      subtotal: Number(typed.subtotal ?? 0),
      tax_amount: Number(typed.tax_amount ?? 0),
      total: Number(typed.total ?? 0),
      paid_amount: Number(typed.paid_amount ?? 0),
      balance: Number(typed.balance ?? 0),
      item_count: (items ?? []).length,
      owner_full_name: owner.full_name,
      patient_name: patient?.name ?? null,
      patient_species: (patient?.species as InvoiceListRow['patient_species']) ?? null,
      created_by_name: profileResult.data?.full_name ?? null,
    },
    items: (items ?? []).map((item) => ({
      ...item,
      quantity: Number(item.quantity),
      unit_price: Number(item.unit_price),
      line_total: Number(item.line_total),
    })) as InvoiceItem[],
    payments: (payments ?? []).map((payment) => ({
      ...payment,
      amount: Number(payment.amount),
      recorded_by_name: payment.recorded_by ? (nameById.get(payment.recorded_by) ?? null) : null,
    })) as PaymentListRow[],
  };
}

export async function createInvoice(
  _prev: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  try {
    const session = await requirePermissionAndFeature('billing:write', FEATURES.BILLING);
    const parsed = invoiceCreateSchema.safeParse({
      ownerId: formData.get('ownerId'),
      patientId: formData.get('patientId'),
      branchId: formData.get('branchId'),
      consultationId: formData.get('consultationId'),
      dueAt: formData.get('dueAt'),
      notes: formData.get('notes'),
      items: parseItemsFromForm(formData),
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

    const organization = await getOrganization();
    const currency = parseOrganizationSettings(organization?.settings).currency ?? 'ARS';

    const supabase = await createServerClient();
    const { data: invoice, error } = await supabase
      .from('invoices')
      .insert({
        organization_id: session.organizationId,
        branch_id: branchId,
        owner_id: parsed.data.ownerId,
        patient_id: parsed.data.patientId ?? null,
        consultation_id: parsed.data.consultationId ?? null,
        created_by: session.userId,
        status: 'borrador',
        currency,
        due_at: parsed.data.dueAt ?? null,
        notes: parsed.data.notes ?? null,
      })
      .select('id')
      .single();

    if (error || !invoice) {
      return { success: false, error: error?.message || 'No se pudo crear la factura' };
    }

    const { error: itemsError } = await supabase.from('invoice_items').insert(
      parsed.data.items.map((item, index) => ({
        organization_id: session.organizationId,
        invoice_id: invoice.id,
        description: item.description,
        quantity: item.quantity,
        unit_price: item.unitPrice,
        line_total: Math.round(item.quantity * item.unitPrice * 100) / 100,
        sort_order: index,
      }))
    );

    if (itemsError) {
      return { success: false, error: 'No se pudieron guardar los ítems' };
    }

    const { error: totalsError } = await supabase.rpc('recalc_invoice_totals', {
      p_invoice_id: invoice.id,
    });
    if (totalsError) {
      return { success: false, error: 'No se pudieron calcular los totales' };
    }

    revalidatePath('/facturacion');
    revalidatePath('/dashboard');
    if (parsed.data.patientId) revalidatePath(`/pacientes/${parsed.data.patientId}`);
    redirect(`/facturacion/${invoice.id}`);
  } catch (error) {
    return actionError(error);
  }
}

export async function updateInvoice(
  invoiceId: string,
  _prev: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  try {
    const session = await requirePermissionAndFeature('billing:write', FEATURES.BILLING);
    const parsed = invoiceUpdateSchema.safeParse({
      dueAt: formData.get('dueAt'),
      notes: formData.get('notes'),
      items: parseItemsFromForm(formData),
    });

    if (!parsed.success) {
      return {
        success: false,
        error: 'Datos inválidos',
        fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
      };
    }

    const supabase = await createServerClient();
    const { data: current } = await supabase
      .from('invoices')
      .select('status')
      .eq('id', invoiceId)
      .is('deleted_at', null)
      .single();

    if (!current || current.status !== 'borrador') {
      return { success: false, error: 'Solo se puede editar un borrador' };
    }

    const { error: updateError } = await supabase
      .from('invoices')
      .update({
        due_at: parsed.data.dueAt ?? null,
        notes: parsed.data.notes ?? null,
      })
      .eq('id', invoiceId)
      .eq('status', 'borrador');

    if (updateError) {
      return { success: false, error: 'No se pudo actualizar la factura' };
    }

    await supabase.from('invoice_items').delete().eq('invoice_id', invoiceId);

    const { error: itemsError } = await supabase.from('invoice_items').insert(
      parsed.data.items.map((item, index) => ({
        organization_id: session.organizationId,
        invoice_id: invoiceId,
        description: item.description,
        quantity: item.quantity,
        unit_price: item.unitPrice,
        line_total: Math.round(item.quantity * item.unitPrice * 100) / 100,
        sort_order: index,
      }))
    );

    if (itemsError) {
      return { success: false, error: 'No se pudieron guardar los ítems' };
    }

    const { error: totalsError } = await supabase.rpc('recalc_invoice_totals', {
      p_invoice_id: invoiceId,
    });
    if (totalsError) {
      return { success: false, error: 'No se pudieron calcular los totales' };
    }

    revalidatePath('/facturacion');
    revalidatePath(`/facturacion/${invoiceId}`);
    revalidatePath('/dashboard');
    return { success: true };
  } catch (error) {
    return actionError(error);
  }
}

export async function issueInvoiceAction(invoiceId: string): Promise<ActionResult> {
  try {
    await requirePermissionAndFeature('billing:write', FEATURES.BILLING);
    const supabase = await createServerClient();
    const { error } = await supabase.rpc('issue_invoice', { p_invoice_id: invoiceId });

    if (error) {
      return { success: false, error: error.message || 'No se pudo emitir la factura' };
    }

    revalidatePath('/facturacion');
    revalidatePath(`/facturacion/${invoiceId}`);
    revalidatePath('/dashboard');
    return { success: true };
  } catch (error) {
    return actionError(error);
  }
}

export async function registerPaymentAction(
  invoiceId: string,
  _prev: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  try {
    await requirePermissionAndFeature('billing:write', FEATURES.BILLING);
    const parsed = paymentSchema.safeParse({
      amount: formData.get('amount'),
      method: formData.get('method') || 'efectivo',
      reference: formData.get('reference'),
      notes: formData.get('notes'),
    });

    if (!parsed.success) {
      return {
        success: false,
        error: 'Datos inválidos',
        fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
      };
    }

    const supabase = await createServerClient();
    const { error } = await supabase.rpc('register_payment', {
      p_invoice_id: invoiceId,
      p_amount: parsed.data.amount,
      p_method: parsed.data.method,
      p_reference: parsed.data.reference ?? null,
      p_notes: parsed.data.notes ?? null,
    });

    if (error) {
      return { success: false, error: error.message || 'No se pudo registrar el pago' };
    }

    revalidatePath('/facturacion');
    revalidatePath(`/facturacion/${invoiceId}`);
    revalidatePath('/dashboard');
    revalidatePath('/caja');
    return { success: true };
  } catch (error) {
    return actionError(error);
  }
}

export async function voidInvoiceAction(invoiceId: string): Promise<ActionResult> {
  try {
    await requirePermissionAndFeature(['billing:write', 'billing:cancel'], FEATURES.BILLING);
    const supabase = await createServerClient();
    const { error } = await supabase.rpc('void_invoice', { p_invoice_id: invoiceId });

    if (error) {
      return { success: false, error: error.message || 'No se pudo anular la factura' };
    }

    revalidatePath('/facturacion');
    revalidatePath(`/facturacion/${invoiceId}`);
    revalidatePath('/dashboard');
    return { success: true };
  } catch (error) {
    return actionError(error);
  }
}

export async function canManageBilling(): Promise<boolean> {
  return canPermissionAndFeature('billing:write', FEATURES.BILLING);
}

export async function canReadBilling(): Promise<boolean> {
  return canPermissionAndFeature('billing:read', FEATURES.BILLING);
}
