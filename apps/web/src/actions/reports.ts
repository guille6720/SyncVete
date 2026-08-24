'use server';

import {
  getReportPeriod,
  reportRangeSchema,
  type ClinicReport,
  type PatientSpecies,
  type ReportBilling,
  type ReportDailyRow,
  type ReportInventory,
  type ReportOperations,
  type ReportWaitingRoom,
  type ReportWaitingRoomEntry,
} from '@sincvete/shared';
import { createServerClient } from '@/lib/supabase/server';
import { getSessionContext } from '@/actions/auth';
import { FEATURES, canUseFeature, requireFeature } from '@/lib/entitlements';

function num(value: unknown): number {
  return Number(value ?? 0);
}

function numOrNull(value: unknown): number | null {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function parseOperations(raw: unknown): ReportOperations | null {
  if (!raw || typeof raw !== 'object') return null;
  const data = raw as Record<string, unknown>;
  return {
    newPatients: num(data.new_patients),
    newOwners: num(data.new_owners),
    appointmentsTotal: num(data.appointments_total),
    appointmentsCompleted: num(data.appointments_completed),
    appointmentsCancelled: num(data.appointments_cancelled),
    consultationsCompleted: num(data.consultations_completed),
    hospitalizationsAdmitted: num(data.hospitalizations_admitted),
    vaccinationsRecorded: num(data.vaccinations_recorded),
    surgeriesCompleted: num(data.surgeries_completed),
    labOrdersCompleted: num(data.lab_orders_completed),
    appointmentsByStatus: Array.isArray(data.appointments_by_status)
      ? data.appointments_by_status.map((item) => {
          const row = item as { status?: string; count?: number };
          return { status: row.status ?? '', count: num(row.count) };
        })
      : [],
    consultationsBySpecies: Array.isArray(data.consultations_by_species)
      ? data.consultations_by_species.map((item) => {
          const row = item as { species?: string; count?: number };
          return {
            species: row.species as PatientSpecies,
            count: num(row.count),
          };
        })
      : [],
  };
}

function parseBilling(raw: unknown): ReportBilling | null {
  if (!raw || typeof raw !== 'object') return null;
  const data = raw as Record<string, unknown>;
  return {
    invoicesIssuedCount: num(data.invoices_issued_count),
    invoicesIssuedTotal: num(data.invoices_issued_total),
    invoicesVoidedCount: num(data.invoices_voided_count),
    paymentsCount: num(data.payments_count),
    paymentsTotal: num(data.payments_total),
    openBalance: num(data.open_balance),
    paymentsByMethod: Array.isArray(data.payments_by_method)
      ? data.payments_by_method.map((item) => {
          const row = item as { method?: string; count?: number; amount?: number };
          return {
            method: row.method ?? '',
            count: num(row.count),
            amount: num(row.amount),
          };
        })
      : [],
  };
}

function parseInventory(raw: unknown): ReportInventory | null {
  if (!raw || typeof raw !== 'object') return null;
  const data = raw as Record<string, unknown>;
  return {
    lowStockCount: num(data.low_stock_count),
    movementsEntrada: num(data.movements_entrada),
    movementsSalida: num(data.movements_salida),
    movementsAjuste: num(data.movements_ajuste),
    movementsDescarte: num(data.movements_descarte),
  };
}

function parseWaitingRoom(raw: unknown): ReportWaitingRoom | null {
  if (!raw || typeof raw !== 'object') return null;
  const data = raw as Record<string, unknown>;
  return {
    checkIns: num(data.check_ins),
    completed: num(data.completed),
    removed: num(data.removed),
    called: num(data.called),
    avgMinutesToCall: numOrNull(data.avg_minutes_to_call),
    avgMinutesToComplete: numOrNull(data.avg_minutes_to_complete),
    byStatus: Array.isArray(data.by_status)
      ? data.by_status.map((item) => {
          const row = item as { status?: string; count?: number };
          return { status: row.status ?? '', count: num(row.count) };
        })
      : [],
    daily: Array.isArray(data.daily)
      ? data.daily.map((item) => {
          const row = item as { day?: string; check_ins?: number; completed?: number };
          return {
            day: String(row.day ?? '').slice(0, 10),
            checkIns: num(row.check_ins),
            completed: num(row.completed),
          };
        })
      : [],
  };
}

function parseDaily(raw: unknown): ReportDailyRow[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((item) => {
    const row = item as {
      day?: string;
      appointments?: number;
      consultations?: number;
      payments_total?: number;
    };
    const day = String(row.day ?? '').slice(0, 10);
    return {
      day,
      appointments: num(row.appointments),
      consultations: num(row.consultations),
      payments_total: num(row.payments_total),
    };
  });
}

function parseWaitingRoomReportEntries(raw: unknown): ReportWaitingRoomEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((item) => {
    const row = item as Record<string, unknown>;
    return {
      entryId: String(row.entry_id ?? ''),
      checkedInAt: String(row.checked_in_at ?? ''),
      patientName: String(row.patient_name ?? ''),
      ownerFullName: String(row.owner_full_name ?? ''),
      assignedUserName: row.assigned_user_name != null ? String(row.assigned_user_name) : null,
      appointmentStartsAt: String(row.appointment_starts_at ?? ''),
      status: String(row.status ?? ''),
      room: row.room != null ? String(row.room) : null,
      calledAt: row.called_at != null ? String(row.called_at) : null,
      completedAt: row.completed_at != null ? String(row.completed_at) : null,
      removed: Boolean(row.removed),
      minutesToCall: numOrNull(row.minutes_to_call),
      minutesDwell: numOrNull(row.minutes_dwell),
    };
  });
}

export async function getWaitingRoomReportEntries(input: {
  from: string;
  to: string;
}): Promise<ReportWaitingRoomEntry[]> {
  const session = await getSessionContext();
  if (!session) return [];

  const parsed = reportRangeSchema.safeParse(input);
  if (!parsed.success) return [];

  const [entitled, hasWr] = await Promise.all([
    canUseFeature({
      organizationId: session.organizationId,
      featureKey: FEATURES.WAITING_ROOM,
    }),
    Promise.resolve(session.permissions.includes('waiting_room:read')),
  ]);

  if (!entitled || !hasWr || !session.permissions.includes('reports:read')) {
    return [];
  }

  await requireFeature(session.organizationId, FEATURES.BASIC_REPORTS);

  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc('list_waiting_room_report_entries', {
    p_from: parsed.data.from,
    p_to: parsed.data.to,
    p_branch_id: session.branchId ?? null,
  });

  if (error) {
    console.error('[reports] list_waiting_room_report_entries', error.message);
    return [];
  }

  return parseWaitingRoomReportEntries(data);
}

export async function canReadReports(): Promise<boolean> {
  const session = await getSessionContext();
  if (!session) return false;
  return session.permissions.includes('reports:read');
}

export async function canUseBasicReports(): Promise<boolean> {
  const session = await getSessionContext();
  if (!session || !session.permissions.includes('reports:read')) return false;
  return canUseFeature({ organizationId: session.organizationId, featureKey: FEATURES.BASIC_REPORTS });
}

export async function getClinicReport(input?: {
  from?: string;
  to?: string;
}): Promise<ClinicReport> {
  const fallback = getReportPeriod('month');
  const parsed = reportRangeSchema.safeParse({
    from: input?.from || fallback.from,
    to: input?.to || fallback.to,
  });
  const range = parsed.success ? parsed.data : fallback;

  const empty: ClinicReport = {
    from: range.from,
    to: range.to,
    operations: null,
    billing: null,
    inventory: null,
    waitingRoom: null,
    daily: [],
  };

  const session = await getSessionContext();
  if (!session) {
    return empty;
  }
  await requireFeature(session.organizationId, FEATURES.BASIC_REPORTS);
  const [includeAdvanced, includeWaitingRoom] = await Promise.all([
    canUseFeature({
      organizationId: session.organizationId,
      featureKey: FEATURES.ADVANCED_REPORTS,
    }),
    canUseFeature({
      organizationId: session.organizationId,
      featureKey: FEATURES.WAITING_ROOM,
    }),
  ]);

  const supabase = await createServerClient();
  const [{ data, error }, waitingRoomResult] = await Promise.all([
    supabase.rpc('get_clinic_report', {
      p_from: range.from,
      p_to: range.to,
      p_branch_id: session.branchId ?? null,
    }),
    includeWaitingRoom && session.permissions.includes('waiting_room:read')
      ? supabase.rpc('get_waiting_room_report', {
          p_from: range.from,
          p_to: range.to,
          p_branch_id: session.branchId ?? null,
        })
      : Promise.resolve({ data: null, error: null }),
  ]);

  if (error) throw error;

  void (async () => {
    try {
      await supabase.rpc('record_commercial_feature_signal', {
        p_feature_key: FEATURES.BASIC_REPORTS,
        p_event_type: 'feature_used',
      });
      if (includeAdvanced) {
        await supabase.rpc('record_commercial_feature_signal', {
          p_feature_key: FEATURES.ADVANCED_REPORTS,
          p_event_type: 'feature_used',
        });
      }
    } catch {
      // Best-effort commercial signal.
    }
  })();

  const raw = (data ?? {}) as Record<string, unknown>;
  const waitingRoom =
    waitingRoomResult.error != null ? null : parseWaitingRoom(waitingRoomResult.data);

  return {
    from: String(raw.from ?? range.from).slice(0, 10),
    to: String(raw.to ?? range.to).slice(0, 10),
    operations: parseOperations(raw.operations),
    billing: includeAdvanced ? parseBilling(raw.billing) : null,
    inventory: includeAdvanced ? parseInventory(raw.inventory) : null,
    waitingRoom,
    daily: parseDaily(raw.daily),
  };
}
