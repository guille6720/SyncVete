import { Suspense } from 'react';
import {
  formatDateParam,
  getWeekStartDate,
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
import { DashboardActivityFeed } from '@/components/dashboard/dashboard-activity-feed';
import { DashboardHeader } from '@/components/dashboard/dashboard-header';
import { DashboardQuickActions } from '@/components/dashboard/dashboard-quick-actions';
import { DashboardRecentLists } from '@/components/dashboard/dashboard-recent-lists';
import { DashboardSpeciesBreakdown } from '@/components/dashboard/dashboard-species-breakdown';
import { DashboardStatCards } from '@/components/dashboard/dashboard-stat-cards';
import { DashboardWaitingRoomSnapshot } from '@/components/dashboard/dashboard-waiting-room-snapshot';

function DashboardPrioritySkeleton() {
  return (
    <div
      className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 animate-pulse"
      aria-busy="true"
      aria-label="Cargando indicadores del día"
    >
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="h-28 rounded-xl border bg-muted/40" />
      ))}
    </div>
  );
}

function DashboardSecondarySkeleton() {
  return (
    <div className="space-y-4 animate-pulse" aria-busy="true" aria-label="Cargando detalle del dashboard">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-28 rounded-xl border bg-muted/30" />
        ))}
      </div>
      <div className="grid gap-4 xl:grid-cols-3">
        <div className="h-56 rounded-xl border bg-muted/30" />
        <div className="h-56 rounded-xl border bg-muted/30 xl:col-span-2" />
      </div>
    </div>
  );
}

function DashboardWaitingRoomSkeleton() {
  return (
    <div
      className="h-44 animate-pulse rounded-xl border border-teal-200/70 bg-muted/40"
      aria-busy="true"
      aria-label="Cargando sala de espera"
    />
  );
}

function DashboardSettlementsSkeleton() {
  return (
    <div
      className="h-44 animate-pulse rounded-xl border border-violet-200/70 bg-muted/40"
      aria-busy="true"
      aria-label="Cargando liquidaciones"
    />
  );
}

/** Settlements snapshot when feature + permission allow. */
async function DashboardSettlementsSection({
  entitledHrefs,
}: {
  entitledHrefs: string[] | null;
}) {
  if (!isClinicPathEntitled('/liquidaciones', entitledHrefs)) return null;
  const canRead = await canReadProfessionalSettlements();
  if (!canRead) return null;

  const organization = await getOrganization();
  const currency = parseOrganizationSettings(organization?.settings).currency ?? 'ARS';
  const summary = await getSettlementsSummary(currency);

  return <DashboardSettlementsSnapshot summary={summary} />;
}

/** Live waiting-room snapshot — only when feature + permission allow. */
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

/** Ops of the day — awaits summary only (activity deferred). */
async function DashboardPrioritySection({ entitledHrefs }: { entitledHrefs: string[] | null }) {
  const session = await getSessionContext();
  const summary = await getDashboardSummary(session?.branchId ?? null);
  return <DashboardStatCards summary={summary} entitledHrefs={entitledHrefs} variant="priority" />;
}

/** Secondary widgets — reuses cached summary; activity runs in parallel. */
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
    <div className="space-y-6">
      <DashboardStatCards summary={summary} entitledHrefs={entitledHrefs} variant="secondary" />
      <div className="grid gap-4 xl:grid-cols-3">
        <DashboardSpeciesBreakdown summary={summary} />
        <div className="xl:col-span-2">
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
      {canViewActivity && (
        <DashboardRecentLists
          recentPatients={summary.recentPatients}
          recentOwners={summary.recentOwners}
        />
      )}
    </div>
  );
}

/**
 * First paint: header + quick actions (session/org already request-cached).
 * Then stream priority KPIs, then secondary widgets / activity.
 */
export async function DashboardView() {
  const session = await getSessionContext();
  if (!session) return null;

  const context = await getDashboardContext();
  const commercial = await getClinicCommercialShell(session.organizationId);

  return (
    <div className="relative space-y-6">
      <div
        className="pointer-events-none absolute -inset-x-4 -top-4 bottom-0 -z-10 opacity-[0.55] md:-inset-x-6"
        style={{
          backgroundImage:
            "radial-gradient(ellipse 80% 50% at 10% 0%, rgba(45,212,191,0.18), transparent 55%), radial-gradient(ellipse 60% 40% at 90% 10%, rgba(56,189,248,0.14), transparent 50%), url('/dashboard/paw-pattern.svg')",
          backgroundSize: 'auto, auto, 160px 160px',
        }}
        aria-hidden
      />
      <DashboardHeader session={session} context={context} />
      <DashboardQuickActions
        canWritePatients={context?.canWritePatients ?? false}
        entitledHrefs={commercial.entitledHrefs}
      />
      <Suspense fallback={<DashboardPrioritySkeleton />}>
        <DashboardPrioritySection entitledHrefs={commercial.entitledHrefs} />
      </Suspense>
      <Suspense fallback={<DashboardWaitingRoomSkeleton />}>
        <DashboardWaitingRoomSection entitledHrefs={commercial.entitledHrefs} />
      </Suspense>
      <Suspense fallback={<DashboardSettlementsSkeleton />}>
        <DashboardSettlementsSection entitledHrefs={commercial.entitledHrefs} />
      </Suspense>
      <Suspense fallback={<DashboardSecondarySkeleton />}>
        <DashboardSecondarySection
          canViewActivity={context?.canViewActivity ?? false}
          entitledHrefs={commercial.entitledHrefs}
        />
      </Suspense>
    </div>
  );
}
