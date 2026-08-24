import { redirect } from 'next/navigation';
import { formatDateParam } from '@sincvete/shared';
import { getSessionContext } from '@/lib/session';
import { canReadWaitingRoom, listWaitingRoom } from '@/actions/waiting-room';
import { getOrganization, getUserBranches } from '@/actions/settings';
import { WaitingRoomDisplay } from '@/components/waiting-room/waiting-room-display';

export default async function SalaEsperaPantallaPage() {
  const canRead = await canReadWaitingRoom();
  if (!canRead) redirect('/dashboard');

  const session = await getSessionContext();
  if (!session) redirect('/login');

  const today = formatDateParam(new Date());

  const [entries, organization, branches] = await Promise.all([
    listWaitingRoom({ date: today }),
    getOrganization(),
    getUserBranches(),
  ]);

  const branchName =
    branches.find((b) => b.id === session.branchId)?.name ??
    branches.find((b) => b.is_main)?.name ??
    null;

  return (
    <WaitingRoomDisplay
      initialEntries={entries}
      clinicName={organization?.name ?? 'Clínica'}
      branchName={branchName}
      today={today}
    />
  );
}
