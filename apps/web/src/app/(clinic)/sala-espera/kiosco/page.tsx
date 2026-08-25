import { redirect } from 'next/navigation';
import {
  buildWaitingRoomSurfaceHref,
  filterAppointmentsByWaitingRoomBranch,
  formatDateParam,
  getWeekStartDate,
  parseWaitingRoomBoardFilters,
  resolveWaitingRoomBranchLabel,
  resolveWaitingRoomListBranchId,
  type AppointmentListRow,
} from '@sincvete/shared';
import { getSessionContext } from '@/lib/session';
import { listAppointments } from '@/actions/appointments';
import {
  canManageWaitingRoom,
  listWaitingRoom,
} from '@/actions/waiting-room';
import { getOrganization, getUserBranches } from '@/actions/settings';
import { WaitingRoomKiosk } from '@/components/waiting-room/waiting-room-kiosk';

interface SalaEsperaKioscoPageProps {
  searchParams: Promise<{ wrBranch?: string }>;
}

export default async function SalaEsperaKioscoPage({ searchParams }: SalaEsperaKioscoPageProps) {
  const canWrite = await canManageWaitingRoom();
  if (!canWrite) redirect('/sala-espera');

  const session = await getSessionContext();
  if (!session) redirect('/login');

  const params = await searchParams;
  const today = formatDateParam(new Date());
  const weekStart = getWeekStartDate(today);
  const boardFilters = parseWaitingRoomBoardFilters(params);
  const listBranchId = resolveWaitingRoomListBranchId(boardFilters.branchId, session.branchId);

  const [entries, weekAppointments, organization, branches] = await Promise.all([
    listWaitingRoom({ date: today, branchId: listBranchId }),
    listAppointments({ weekStart }).catch(() => [] as AppointmentListRow[]),
    getOrganization(),
    getUserBranches(),
  ]);

  const checkedInIds = new Set(entries.map((row) => row.appointment_id));
  const branchAppointments = filterAppointmentsByWaitingRoomBranch(weekAppointments, listBranchId);
  const candidates = branchAppointments.filter((appointment) => {
    if (checkedInIds.has(appointment.id)) return false;
    const day = formatDateParam(new Date(appointment.starts_at));
    if (day !== today) return false;
    return (
      appointment.status === 'programada' ||
      appointment.status === 'confirmada' ||
      appointment.status === 'en_curso'
    );
  });

  const branchName = resolveWaitingRoomBranchLabel(
    boardFilters.branchId,
    session.branchId,
    branches
  );

  const wrBranchParam =
    boardFilters.branchId === 'all'
      ? 'all'
      : typeof boardFilters.branchId === 'string'
        ? boardFilters.branchId
        : undefined;
  const receptionHref = buildWaitingRoomSurfaceHref('/sala-espera', {
    wrBranch: wrBranchParam,
  });

  return (
    <WaitingRoomKiosk
      initialCandidates={candidates}
      clinicName={organization?.name ?? 'Clínica'}
      branchName={branchName}
      today={today}
      listBranchId={listBranchId}
      branchOptions={branches.map((branch) => ({ id: branch.id, name: branch.name }))}
      sessionBranchId={session.branchId}
      initialBranchFilter={boardFilters.branchId}
      receptionHref={receptionHref}
    />
  );
}
