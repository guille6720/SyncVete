'use server';

import { revalidatePath } from 'next/cache';
import {
  buildPaginatedResult,
  cashMovementSchema,
  cashSessionCloseSchema,
  cashSessionListSchema,
  cashSessionOpenSchema,
  computeExpectedCash,
  type ActionResult,
  type CashMovementListRow,
  type CashSessionListRow,
  type PaginatedResult,
} from '@sincvete/shared';
import { createServerClient } from '@/lib/supabase/server';
import { PermissionError, requirePermission, requirePermissionAndFeature, canPermissionAndFeature } from '@/lib/permissions';
import { getSessionContext } from '@/actions/auth';
import { FEATURES, planRestrictionResult } from '@/lib/entitlements';

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

function rpcErrorMessage(error: { message?: string }, fallback: string): string {
  const message = error.message?.trim();
  if (message && message.length > 0 && message.length < 200 && !message.includes('function')) {
    return message;
  }
  return fallback;
}

function toSessionRow(row: CashSessionListRow & { total_count?: number }): CashSessionListRow {
  const { total_count: _total, ...entry } = row;
  void _total;
  return {
    ...entry,
    opening_amount: Number(entry.opening_amount ?? 0),
    expected_cash: entry.expected_cash == null ? null : Number(entry.expected_cash),
    counted_cash: entry.counted_cash == null ? null : Number(entry.counted_cash),
    difference: entry.difference == null ? null : Number(entry.difference),
    movement_count: Number(entry.movement_count ?? 0),
    deleted_at: entry.deleted_at ?? null,
  };
}

function toMovementRow(row: CashMovementListRow): CashMovementListRow {
  return {
    ...row,
    amount: Number(row.amount ?? 0),
    deleted_at: row.deleted_at ?? null,
    professional_payment_id: row.professional_payment_id ?? null,
    professional_settlement_id: row.professional_settlement_id ?? null,
  };
}

export async function getOpenCashSession(): Promise<CashSessionListRow | null> {
  await requirePermission('billing:read');
  const session = await getSessionContext();
  const supabase = await createServerClient();

  const { data, error } = await supabase.rpc('get_open_cash_session', {
    p_branch_id: session?.branchId ?? null,
  });

  if (error) throw error;
  const row = data?.[0];
  return row ? toSessionRow(row as CashSessionListRow) : null;
}

export async function listCashSessions(
  input: {
    page?: number;
    pageSize?: number;
    branchId?: string;
    status?: string;
  } = {}
): Promise<PaginatedResult<CashSessionListRow>> {
  await requirePermission('billing:read');
  const parsed = cashSessionListSchema.parse(input);
  const session = await getSessionContext();
  const supabase = await createServerClient();

  const { data, error } = await supabase.rpc('search_cash_sessions', {
    p_branch_id: parsed.branchId ?? session?.branchId ?? null,
    p_status: parsed.status || null,
    p_page: parsed.page,
    p_page_size: parsed.pageSize,
  });

  if (error) throw error;

  const rows = data ?? [];
  const total = rows[0]?.total_count ?? 0;
  const sessions = rows.map((row) =>
    toSessionRow(row as CashSessionListRow & { total_count: number })
  );

  return buildPaginatedResult(sessions, Number(total), parsed.page, parsed.pageSize);
}

export async function getCashSession(id: string): Promise<{
  session: CashSessionListRow;
  movements: CashMovementListRow[];
} | null> {
  await requirePermission('billing:read');
  const supabase = await createServerClient();

  const { data: cashSession, error } = await supabase
    .from('cash_sessions')
    .select('*')
    .eq('id', id)
    .is('deleted_at', null)
    .single();

  if (error || !cashSession) return null;

  const [{ data: branch }, openerResult, closerResult, movementsResult] = await Promise.all([
    supabase.from('branches').select('name').eq('id', cashSession.branch_id).single(),
    cashSession.opened_by
      ? supabase.from('profiles').select('full_name').eq('id', cashSession.opened_by).single()
      : Promise.resolve({ data: null }),
    cashSession.closed_by
      ? supabase.from('profiles').select('full_name').eq('id', cashSession.closed_by).single()
      : Promise.resolve({ data: null }),
    supabase.rpc('list_cash_movements', { p_session_id: id }),
  ]);

  if (movementsResult.error) throw movementsResult.error;

  const movements = (movementsResult.data ?? []).map((row) =>
    toMovementRow(row as CashMovementListRow)
  );

  const expected =
    cashSession.status === 'cerrada' && cashSession.expected_cash != null
      ? Number(cashSession.expected_cash)
      : computeExpectedCash(Number(cashSession.opening_amount ?? 0), movements);

  return {
    session: toSessionRow({
      ...(cashSession as CashSessionListRow),
      expected_cash: expected,
      movement_count: movements.length,
      opened_by_name: openerResult.data?.full_name ?? null,
      closed_by_name: closerResult.data?.full_name ?? null,
      branch_name: branch?.name ?? 'Sucursal',
    }),
    movements,
  };
}

export async function listCashMovements(sessionId: string): Promise<CashMovementListRow[]> {
  await requirePermission('billing:read');
  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc('list_cash_movements', {
    p_session_id: sessionId,
  });
  if (error) throw error;
  return (data ?? []).map((row) => toMovementRow(row as CashMovementListRow));
}

export async function openCashSessionAction(
  _prev: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  try {
    const session = await requirePermissionAndFeature('billing:write', FEATURES.CASH_REGISTER);
    const parsed = cashSessionOpenSchema.safeParse({
      branchId: formData.get('branchId') || session.branchId,
      openingAmount: formData.get('openingAmount') || 0,
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
    const { error } = await supabase.rpc('open_cash_session', {
      p_branch_id: parsed.data.branchId,
      p_opening_amount: parsed.data.openingAmount,
      p_notes: parsed.data.notes ?? null,
    });

    if (error) {
      return { success: false, error: rpcErrorMessage(error, 'No se pudo abrir la caja') };
    }

    revalidatePath('/caja');
    revalidatePath('/dashboard');
    return { success: true };
  } catch (error) {
    return actionError(error);
  }
}

export async function addCashMovementAction(
  sessionId: string,
  _prev: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  try {
    await requirePermissionAndFeature('billing:write', FEATURES.CASH_REGISTER);
    const parsed = cashMovementSchema.safeParse({
      kind: formData.get('kind'),
      amount: formData.get('amount'),
      method: formData.get('method') || 'efectivo',
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
    const { error } = await supabase.rpc('add_cash_movement', {
      p_session_id: sessionId,
      p_kind: parsed.data.kind,
      p_amount: parsed.data.amount,
      p_method: parsed.data.method,
      p_notes: parsed.data.notes ?? null,
    });

    if (error) {
      return { success: false, error: rpcErrorMessage(error, 'No se pudo registrar el movimiento') };
    }

    revalidatePath('/caja');
    revalidatePath(`/caja/${sessionId}`);
    revalidatePath('/dashboard');
    return { success: true };
  } catch (error) {
    return actionError(error);
  }
}

export async function closeCashSessionAction(
  sessionId: string,
  _prev: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  try {
    await requirePermissionAndFeature('billing:write', FEATURES.CASH_REGISTER);
    const parsed = cashSessionCloseSchema.safeParse({
      countedCash: formData.get('countedCash'),
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
    const { error } = await supabase.rpc('close_cash_session', {
      p_session_id: sessionId,
      p_counted_cash: parsed.data.countedCash,
      p_notes: parsed.data.notes ?? null,
    });

    if (error) {
      return { success: false, error: rpcErrorMessage(error, 'No se pudo cerrar la caja') };
    }

    revalidatePath('/caja');
    revalidatePath(`/caja/${sessionId}`);
    revalidatePath('/dashboard');
    return { success: true };
  } catch (error) {
    return actionError(error);
  }
}

export async function canManageCash(): Promise<boolean> {
  return canPermissionAndFeature('billing:write', FEATURES.CASH_REGISTER);
}

export async function canReadCash(): Promise<boolean> {
  return canPermissionAndFeature('billing:read', FEATURES.CASH_REGISTER);
}
