import { Suspense } from 'react';
import {
  formatDateParam,
  getWeekStartDate,
  INVITABLE_ROLES,
  isClinicPathEntitled,
  type AppointmentListRow,
} from '@sincvete/shared';
import { getDashboardActivity, getDashboardContext, getDashboardSummary } from '@/actions/dashboard';
import { listAppointments } from '@/actions/appointments';
import { canReadWaitingRoom, listWaitingRoom } from '@/actions/waiting-room';
import {
  canReadProfessionalSettlements,
  getSettlementsSummary,
} from '@/actions/professional-settlements';
import { getOrganization } from '@/actions/settings';
import { parseOrganizationSettings } from '@sincvete/shared';
import { DashboardSettlementsSnapshot } from '@/components/dashboard/dashboard-settlements-snapshot';
import { getSessionContext } from '@/lib/session';
import { getClinicCommercialShell } from '@/lib/entitlements';
import { getClinicTodayLabel } from '@/lib/ui-v2/clinic-time';
import { DashboardActivityFeed } from '@/components/dashboard/dashboard-activity-feed';
import { DashboardRecentLists } from '@/components/dashboard/dashboard-recent-lists';
import { DashboardSpeciesBreakdown } from '@/components/dashboard/dashboard-species-breakdown';
import { DashboardWaitingRoomSnapshot } from '@/components/dashboard/dashboard-waiting-room-snapshot';
import { DashboardHeaderV2 } from '@/components/dashboard/ui-v2/dashboard-header-v2';
import { DashboardQuickActionsV2 } from '@/components/dashboard/ui-v2/dashboard-quick-actions-v2';
import { DashboardStatCardsV2 } from '@/components/dashboard/ui-v2/stat-cards-v2';
import { AppointmentsSummaryPanel } from '@/components/dashboard/ui-v2/appointments-summary-panel';
import { EmptyState, SurfaceCard } from '@/components/ui-v2/surface-card';

function SkeletonGrid({ count, label }: { count: number; label: string }) {
  return (
    <div
      className="grid animate-pulse gap-3 sm:grid-cols-2 xl:grid-cols-3"
      aria-busy="true"
      aria-label={label}
    >
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="h-28 rounded-xl border border-border bg-muted/40" />
      ))}
    </div>
  );
}

async function DashboardSettlementsSection({
  entitledHrefs,
}: {
  entitledHrefs: string[] | null;
}) {
  if (!isClinicPathEntitled('/liquidaciones', entitledHrefs)) return null;
  try {
    const canRead = await canReadProfessionalSettlements();
    if (!canRead) return null;
    const organization = await getOrganization();
    const currency = parseOrganizationSettings(organization?.settings).currency ?? 'ARS';
    const summary = await getSettlementsSummary(currency);
    return <DashboardSettlementsSnapshot summary={summary} />;
  } catch (error) {
    console.error('[dashboard-v2] settlements snapshot unavailable', error);
    return null;
  }
}

async function DashboardWaitingRoomSection({
  entitledHrefs,
}: {
  entitledHrefs: string[] | null;
}) {
  if (!isClinicPathEntitled('/sala-espera', entitledHrefs)) return null;
  const canRead = await canReadWaitingRoom();
  if (!canRead) return null;

  const today = formatDateParam(new Date());
  const weekStart = getWeekStartDate(today);
  const session = await getSessionContext();

  const [entries, weekAppointments] = await Promise.all([
    listWaitingRoom({ date: today, branchId: session?.branchId ?? undefined }),
    listAppointments({ weekStart }).catch(() => [] as AppointmentListRow[]),
  ]);

  const checkedInIds = new Set(entries.map((row) => row.appointment_id));
  const pendingCheckInCount = weekAppointments.filter((appointment) => {
    if (checkedInIds.has(appointment.id)) return false;
    const day = formatDateParam(new Date(appointment.starts_at));
    if (day !== today) return false;
    return (
      appointment.status === 'programada' ||
      appointment.status === 'confirmada' ||
      appointment.status === 'en_curso'
    );
  }).length;

  return (
    <DashboardWaitingRoomSnapshot
      initialEntries={entries}
      pendingCheckInCount={pendingCheckInCount}
      today={today}
      listBranchId={session?.branchId ?? undefined}
    />
  );
}

async function DashboardAppointmentsSection({ entitledHrefs }: { entitledHrefs: string[] | null }) {
  if (!isClinicPathEntitled('/agenda', entitledHrefs)) {
    return (
      <SurfaceCard>
        <EmptyState
          title="Agenda no disponible"
          description="Tu plan o permisos no incluyen el módulo de agenda."
        />
      </SurfaceCard>
    );
  }

  const session = await getSessionContext();
  const today = formatDateParam(new Date());
  const weekStart = getWeekStartDate(today);
  const appointments = await listAppointments({ weekStart }).catch(() => [] as AppointmentListRow[]);
  const todays = appointments
    .filter((row) => formatDateParam(new Date(row.starts_at)) === today)
    .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime());
  const showAlert = Boolean(
    session?.kind === 'staff' && session.role && INVITABLE_ROLES.includes(session.role)
  );

  return (
    <AppointmentsSummaryPanel
      appointments={todays}
      todayLabel={getClinicTodayLabel()}
      today={today}
      weekStart={weekStart}
      showAlert={showAlert}
    />
  );
}

async function DashboardPendingStrip({ entitledHrefs }: { entitledHrefs: string[] | null }) {
  const session = await getSessionContext();
  const summary = await getDashboardSummary(session?.branchId ?? null);
  return (
    <DashboardStatCardsV2
      summary={summary}
      entitledHrefs={entitledHrefs}
      variant="actionable"
    />
  );
}

async function DashboardSecondarySection({
  canViewActivity,
  entitledHrefs,
}: {
  canViewActivity: boolean;
  entitledHrefs: string[] | null;
}) {
  const session = await getSessionContext();
  const [summary, activity] = await Promise.all([
    getDashboardSummary(session?.branchId ?? null),
    canViewActivity ? getDashboardActivity() : Promise.resolve([]),
  ]);

  return (
    <section className="space-y-4" aria-labelledby="dashboard-secondary-heading">
      <div>
        <h2 id="dashboard-secondary-heading" className="text-sm font-semibold text-foreground">
          Indicadores y actividad
        </h2>
        <p className="text-xs text-muted-foreground">
          Métricas generales y registros recientes de la clínica
        </p>
      </div>
      <DashboardStatCardsV2 summary={summary} entitledHrefs={entitledHrefs} variant="secondary" />
      <div className="grid min-w-0 gap-4 xl:grid-cols-3">
        <DashboardSpeciesBreakdown summary={summary} />
        <div className="min-w-0 xl:col-span-2">
          {canViewActivity ? (
            <DashboardActivityFeed activity={activity} />
          ) : (
            <DashboardRecentLists
              recentPatients={summary.recentPatients}
              recentOwners={summary.recentOwners}
            />
          )}
        </div>
      </div>
      {canViewActivity ? (
        <DashboardRecentLists
          recentPatients={summary.recentPatients}
          recentOwners={summary.recentOwners}
        />
      ) : null}
    </section>
  );
}

/** UI V2 day-ops dashboard — same data/permissions as legacy; reordered for work focus. */
export async function DashboardViewV2() {
  const session = await getSessionContext();
  if (!session) return null;

  const context = await getDashboardContext();
  const commercial = await getClinicCommercialShell(session.organizationId);

  return (
    <div className="mx-auto min-w-0 max-w-[90rem] space-y-4 md:space-y-5">
      <DashboardHeaderV2 session={session} context={context} />

      <div className="grid min-w-0 gap-4 lg:grid-cols-2">
        <Suspense
          fallback={
            <div
              className="h-64 animate-pulse rounded-xl border border-border bg-muted/40"
              aria-busy
            />
          }
        >
          <DashboardAppointmentsSection entitledHrefs={commercial.entitledHrefs} />
        </Suspense>
        <Suspense
          fallback={
            <div
              className="h-64 animate-pulse rounded-xl border border-border bg-muted/40"
              aria-busy
            />
          }
        >
          <DashboardWaitingRoomSection entitledHrefs={commercial.entitledHrefs} />
        </Suspense>
      </div>

      <DashboardQuickActionsV2
        canWritePatients={context?.canWritePatients ?? false}
        entitledHrefs={commercial.entitledHrefs}
      />

      <Suspense fallback={<SkeletonGrid count={4} label="Cargando pendientes" />}>
        <DashboardPendingStrip entitledHrefs={commercial.entitledHrefs} />
      </Suspense>

      <Suspense fallback={null}>
        <DashboardSettlementsSection entitledHrefs={commercial.entitledHrefs} />
      </Suspense>

      <Suspense fallback={<SkeletonGrid count={8} label="Cargando detalle del dashboard" />}>
        <DashboardSecondarySection
          canViewActivity={context?.canViewActivity ?? false}
          entitledHrefs={commercial.entitledHrefs}
        />
      </Suspense>
    </div>
  );
}
