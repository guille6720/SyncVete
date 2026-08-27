import { redirect } from 'next/navigation';
import Link from 'next/link';
import {
  ChevronLeft,
  ChevronRight,
  LayoutDashboard,
  MonitorPlay,
  TabletSmartphone,
  UserRound,
} from 'lucide-react';
import {
  addDaysIso,
  appendWaitingRoomBoardFilterParams,
  buildWaitingRoomSurfaceHref,
  filterAppointmentsByWaitingRoomBranch,
  formatDateParam,
  formatDashboardDate,
  getWeekStartDate,
  parseDateParam,
  parseOrganizationSettings,
  parseWaitingRoomBoardFilters,
  resolveWaitingRoomListBranchId,
  type AppointmentListRow,
  type WaitingRoomBoardFilters,
} from '@sincvete/shared';
import { listAppointments } from '@/actions/appointments';
import {
  canManageWaitingRoom,
  canReadWaitingRoom,
  listWaitingRoom,
} from '@/actions/waiting-room';
import { canManageConsultations } from '@/actions/consultations';
import { canSendWhatsApp } from '@/actions/whatsapp';
import { getOrganization, getUserBranches } from '@/actions/settings';
import { getSessionContext } from '@/lib/session';
import { WaitingRoomBoard } from '@/components/waiting-room/waiting-room-board';
import { WaitingRoomOpsDashboard } from '@/components/waiting-room/waiting-room-ops-dashboard';
import { Button } from '@/components/ui/button';

interface SalaEsperaPageProps {
  searchParams: Promise<{
    date?: string;
    mine?: string;
    q?: string;
    wrStatus?: string;
    wrAssigned?: string;
    wrBranch?: string;
  }>;
}

function salaEsperaHref(opts: {
  date?: string;
  mine?: boolean;
  today?: string;
  boardFilters?: WaitingRoomBoardFilters;
}) {
  const params = new URLSearchParams();
  if (opts.date && opts.today && opts.date !== opts.today) {
    params.set('date', opts.date);
  } else if (opts.date && !opts.today) {
    params.set('date', opts.date);
  }
  if (opts.mine) params.set('mine', '1');
  const withFilters = opts.boardFilters
    ? appendWaitingRoomBoardFilterParams(params, opts.boardFilters)
    : params;
  const query = withFilters.toString();
  return query ? `/sala-espera?${query}` : '/sala-espera';
}

export default async function SalaEsperaPage({ searchParams }: SalaEsperaPageProps) {
  const [canRead, params] = await Promise.all([canReadWaitingRoom(), searchParams]);
  if (!canRead) redirect('/dashboard');

  const today = formatDateParam(new Date());
  const selectedDate = parseDateParam(params.date);
  const isToday = selectedDate === today;
  const mineOnly = params.mine === '1' || params.mine === 'true';
  const boardFilters = parseWaitingRoomBoardFilters(params);
  const prevDate = addDaysIso(selectedDate, -1);
  const nextDate = addDaysIso(selectedDate, 1);
  const weekStart = getWeekStartDate(selectedDate);

  const [canWrite, canWhatsApp, canStartConsultation, organization, session, branches] =
    await Promise.all([
      canManageWaitingRoom(),
      canSendWhatsApp(),
      canManageConsultations(),
      getOrganization(),
      getSessionContext(),
      getUserBranches(),
    ]);

  const orgSettings = parseOrganizationSettings(organization?.settings);
  const roomPresets = orgSettings.waitingRoomRooms ?? [];
  const whatsAppAutoEnabled = orgSettings.waitingRoomWhatsAppAutoEnabled === true;
  const boardSoundEnabled = orgSettings.waitingRoomBoardSoundEnabled === true;
  const currentUserId = session?.userId ?? null;
  const listBranchId = resolveWaitingRoomListBranchId(
    boardFilters.branchId,
    session?.branchId
  );

  const [entries, weekAppointments] = await Promise.all([
    listWaitingRoom({ date: selectedDate, branchId: listBranchId }),
    isToday
      ? listAppointments({ weekStart }).catch(() => [] as AppointmentListRow[])
      : Promise.resolve([] as AppointmentListRow[]),
  ]);

  const visibleEntries =
    mineOnly && currentUserId
      ? entries.filter((row) => row.assigned_user_id === currentUserId)
      : entries;

  const checkedInIds = new Set(entries.map((row) => row.appointment_id));
  const branchAppointments = filterAppointmentsByWaitingRoomBranch(
    weekAppointments,
    listBranchId
  );
  const checkInCandidates = isToday
    ? branchAppointments.filter((appointment) => {
        if (checkedInIds.has(appointment.id)) return false;
        const day = formatDateParam(new Date(appointment.starts_at));
        if (day !== today) return false;
        if (mineOnly && currentUserId && appointment.assigned_user_id !== currentUserId) {
          return false;
        }
        return (
          appointment.status === 'programada' ||
          appointment.status === 'confirmada' ||
          appointment.status === 'en_curso'
        );
      })
    : [];

  const hrefOpts = { mine: mineOnly, today, boardFilters };
  const wrBranchParam =
    boardFilters.branchId === 'all'
      ? 'all'
      : typeof boardFilters.branchId === 'string'
        ? boardFilters.branchId
        : undefined;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Sala de espera</h1>
          <p className="text-muted-foreground">
            Cola operativa · check-in, llamados y seguimiento de atención
            {mineOnly ? ' · solo tus turnos' : ''}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" asChild>
            <Link
              href={buildWaitingRoomSurfaceHref('/sala-espera/tablero', { wrBranch: wrBranchParam })}
              target="_blank"
              rel="noreferrer"
            >
              <LayoutDashboard className="h-4 w-4" />
              Tablero
            </Link>
          </Button>
          {canWrite && (
            <Button variant="outline" asChild>
              <Link
                href={buildWaitingRoomSurfaceHref('/sala-espera/kiosco', { wrBranch: wrBranchParam })}
                target="_blank"
                rel="noreferrer"
              >
                <TabletSmartphone className="h-4 w-4" />
                Kiosco
              </Link>
            </Button>
          )}
          <Button variant="outline" asChild>
            <Link
              href={buildWaitingRoomSurfaceHref('/sala-espera/pantalla', { wrBranch: wrBranchParam })}
              target="_blank"
              rel="noreferrer"
            >
              <MonitorPlay className="h-4 w-4" />
              Pantalla TV
            </Link>
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" asChild>
          <Link
            href={salaEsperaHref({ date: prevDate, ...hrefOpts })}
            aria-label="Día anterior"
          >
            <ChevronLeft className="h-4 w-4" />
          </Link>
        </Button>
        <p className="min-w-[10rem] text-center text-sm font-medium">
          {formatDashboardDate(`${selectedDate}T12:00:00-03:00`)}
          {isToday ? ' · Hoy' : ''}
        </p>
        <Button variant="outline" size="sm" asChild>
          <Link
            href={salaEsperaHref({ date: nextDate, ...hrefOpts })}
            aria-label="Día siguiente"
          >
            <ChevronRight className="h-4 w-4" />
          </Link>
        </Button>
        {!isToday && (
          <Button variant="ghost" size="sm" asChild>
            <Link href={salaEsperaHref(hrefOpts)}>Hoy</Link>
          </Button>
        )}
        <Button variant={mineOnly ? 'default' : 'outline'} size="sm" asChild>
          <Link
            href={salaEsperaHref({
              date: selectedDate,
              mine: !mineOnly,
              today,
              boardFilters,
            })}
          >
            <UserRound className="h-4 w-4" />
            {mineOnly ? 'Ver todos' : 'Mi cola'}
          </Link>
        </Button>
      </div>

      <WaitingRoomOpsDashboard
        entries={visibleEntries}
        pendingCheckInCount={checkInCandidates.length}
        today={selectedDate}
        mineOnly={mineOnly}
        assignedUserId={currentUserId}
        listBranchId={listBranchId}
      />

      <WaitingRoomBoard
        key={`${selectedDate}-${mineOnly}-${params.q ?? ''}-${params.wrStatus ?? ''}-${params.wrAssigned ?? ''}-${params.wrBranch ?? ''}`}
        entries={visibleEntries}
        checkInCandidates={checkInCandidates}
        canWrite={canWrite}
        canSendWhatsApp={canWhatsApp}
        canStartConsultation={canStartConsultation}
        whatsAppAutoEnabled={whatsAppAutoEnabled}
        boardSoundEnabled={boardSoundEnabled}
        todayLabel={selectedDate}
        isToday={isToday}
        roomPresets={roomPresets}
        initialFilters={boardFilters}
        syncFiltersToUrl
        branchOptions={branches.map((b) => ({ id: b.id, name: b.name }))}
        sessionBranchId={session?.branchId ?? null}
        listBranchId={listBranchId}
      />
    </div>
  );
}
