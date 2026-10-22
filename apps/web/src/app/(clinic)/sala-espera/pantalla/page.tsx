import { redirect } from 'next/navigation';
import {
  buildWaitingRoomSurfaceHref,
  formatDateParam,
  parseWaitingRoomBoardFilters,
  resolveWaitingRoomBranchLabel,
  resolveWaitingRoomListBranchId,
} from '@sincvete/shared';
import { getSessionContext } from '@/lib/session';
import { canReadWaitingRoom, listWaitingRoom } from '@/actions/waiting-room';
import { getOrganization, getUserBranches } from '@/actions/settings';
import { WaitingRoomDisplay } from '@/components/waiting-room/waiting-room-display';

interface SalaEsperaPantallaPageProps {
  searchParams: Promise<{ wrBranch?: string }>;
}

export default async function SalaEsperaPantallaPage({ searchParams }: SalaEsperaPantallaPageProps) {
  const canRead = await canReadWaitingRoom();
  if (!canRead) redirect('/dashboard');

  const session = await getSessionContext();
  if (!session) redirect('/login');

  const params = await searchParams;
  const today = formatDateParam(new Date());
  const boardFilters = parseWaitingRoomBoardFilters(params);
  const listBranchId = resolveWaitingRoomListBranchId(boardFilters.branchId, session.branchId);

  const [entries, organization, branches] = await Promise.all([
    listWaitingRoom({ date: today, branchId: listBranchId }),
    getOrganization(),
    getUserBranches(),
  ]);

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
    <WaitingRoomDisplay
      initialEntries={entries}
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
