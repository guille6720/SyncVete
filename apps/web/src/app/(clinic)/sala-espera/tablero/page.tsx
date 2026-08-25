import { redirect } from 'next/navigation';
import Link from 'next/link';
import { ChevronLeft, ChevronRight, UserRound } from 'lucide-react';
import {
  addDaysIso,
  buildWaitingRoomSurfaceHref,
  filterAppointmentsByWaitingRoomBranch,
  formatDateParam,
  formatDashboardDate,
  getWeekStartDate,
  parseDateParam,
  parseOrganizationSettings,
  parseWaitingRoomBoardFilters,
  resolveWaitingRoomBranchLabel,
  resolveWaitingRoomListBranchId,
  type AppointmentListRow,
} from '@sincvete/shared';
import { getSessionContext } from '@/lib/session';
import { listAppointments } from '@/actions/appointments';
import { canReadWaitingRoom, listWaitingRoom } from '@/actions/waiting-room';
import { getOrganization, getUserBranches } from '@/actions/settings';
import { WaitingRoomTablero } from '@/components/waiting-room/waiting-room-tablero';
import { Button } from '@/components/ui/button';

interface SalaEsperaTableroPageProps {
  searchParams: Promise<{ date?: string; mine?: string; wrBranch?: string }>;
}

export default async function SalaEsperaTableroPage({ searchParams }: SalaEsperaTableroPageProps) {
  const canRead = await canReadWaitingRoom();
  if (!canRead) redirect('/dashboard');

  const session = await getSessionContext();
  if (!session) redirect('/login');

  const params = await searchParams;
  const today = formatDateParam(new Date());
  const selectedDate = parseDateParam(params.date);
  const isToday = selectedDate === today;
  const mineOnly = params.mine === '1' || params.mine === 'true';
  const boardFilters = parseWaitingRoomBoardFilters(params);
  const prevDate = addDaysIso(selectedDate, -1);
  const nextDate = addDaysIso(selectedDate, 1);
  const weekStart = getWeekStartDate(selectedDate);
  const currentUserId = session.userId;
  const listBranchId = resolveWaitingRoomListBranchId(boardFilters.branchId, session.branchId);

  const wrBranchParam =
    boardFilters.branchId === 'all'
      ? 'all'
      : typeof boardFilters.branchId === 'string'
        ? boardFilters.branchId
        : undefined;

  const surfaceOpts = {
    date: selectedDate,
    mine: mineOnly,
    today,
    wrBranch: wrBranchParam,
  };

  const [entries, weekAppointments, organization, branches] = await Promise.all([
    listWaitingRoom({ date: selectedDate, branchId: listBranchId }),
    isToday
      ? listAppointments({ weekStart }).catch(() => [] as AppointmentListRow[])
      : Promise.resolve([] as AppointmentListRow[]),
    getOrganization(),
    getUserBranches(),
  ]);

  const orgSettings = parseOrganizationSettings(organization?.settings);
  const boardSoundEnabled = orgSettings.waitingRoomBoardSoundEnabled === true;

  const visibleEntries =
    mineOnly && currentUserId
      ? entries.filter((row) => row.assigned_user_id === currentUserId)
      : entries;

  const checkedInIds = new Set(entries.map((row) => row.appointment_id));
  const branchAppointments = filterAppointmentsByWaitingRoomBranch(
    weekAppointments,
    listBranchId
  );
  const pendingCheckInCount = isToday
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
      }).length
    : 0;

  const branchName = resolveWaitingRoomBranchLabel(
    boardFilters.branchId,
    session.branchId,
    branches
  );

  const receptionHref = buildWaitingRoomSurfaceHref('/sala-espera', {
    wrBranch: wrBranchParam,
  });

  return (
    <WaitingRoomTablero
      initialEntries={visibleEntries}
      pendingCheckInCount={pendingCheckInCount}
      clinicName={organization?.name ?? 'Clínica'}
      branchName={branchName}
      selectedDate={selectedDate}
      isToday={isToday}
      mineOnly={mineOnly}
      assignedUserId={currentUserId}
      boardSoundEnabled={boardSoundEnabled}
      listBranchId={listBranchId}
      branchOptions={branches.map((branch) => ({ id: branch.id, name: branch.name }))}
      sessionBranchId={session.branchId}
      initialBranchFilter={boardFilters.branchId}
      receptionHref={receptionHref}
      dateNav={
        <div className="flex flex-wrap items-center justify-center gap-2">
          <Button
            variant="outline"
            size="sm"
            asChild
            className="border-white/20 bg-white/5 text-slate-200 hover:bg-white/10 hover:text-white"
          >
            <Link
              href={buildWaitingRoomSurfaceHref('/sala-espera/tablero', {
                ...surfaceOpts,
                date: prevDate,
              })}
              aria-label="Día anterior"
            >
              <ChevronLeft className="h-4 w-4" />
            </Link>
          </Button>
          <p className="min-w-[10rem] text-center text-sm font-medium capitalize text-slate-200">
            {formatDashboardDate(`${selectedDate}T12:00:00-03:00`)}
            {isToday ? ' · Hoy' : ''}
            {mineOnly ? ' · Mi cola' : ''}
          </p>
          <Button
            variant="outline"
            size="sm"
            asChild
            className="border-white/20 bg-white/5 text-slate-200 hover:bg-white/10 hover:text-white"
          >
            <Link
              href={buildWaitingRoomSurfaceHref('/sala-espera/tablero', {
                ...surfaceOpts,
                date: nextDate,
              })}
              aria-label="Día siguiente"
            >
              <ChevronRight className="h-4 w-4" />
            </Link>
          </Button>
          {!isToday && (
            <Button
              variant="ghost"
              size="sm"
              asChild
              className="text-slate-300 hover:bg-white/10 hover:text-white"
            >
              <Link
                href={buildWaitingRoomSurfaceHref('/sala-espera/tablero', {
                  mine: mineOnly,
                  today,
                  wrBranch: wrBranchParam,
                })}
              >
                Hoy
              </Link>
            </Button>
          )}
          <Button
            variant={mineOnly ? 'default' : 'outline'}
            size="sm"
            asChild
            className={
              mineOnly
                ? undefined
                : 'border-white/20 bg-white/5 text-slate-200 hover:bg-white/10 hover:text-white'
            }
          >
            <Link
              href={buildWaitingRoomSurfaceHref('/sala-espera/tablero', {
                ...surfaceOpts,
                mine: !mineOnly,
              })}
            >
              <UserRound className="h-4 w-4" />
              {mineOnly ? 'Ver todos' : 'Mi cola'}
            </Link>
          </Button>
        </div>
      }
    />
  );
}
