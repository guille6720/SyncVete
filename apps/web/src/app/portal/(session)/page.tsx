import { redirect } from 'next/navigation';
import { formatDateParam } from '@sincvete/shared';
import { getOwnerPortalHome, getOwnerPortalWaitingRoom } from '@/actions/portal';
import { PortalHome } from '@/components/portal/portal-home';
import { PortalWaitingRoomBoard } from '@/components/portal/portal-waiting-room-board';

export default async function PortalPage() {
  const home = await getOwnerPortalHome();
  if (!home) redirect('/login');

  const today = formatDateParam(new Date());
  const waitingRoom = await getOwnerPortalWaitingRoom(today);

  return (
    <div className="space-y-8">
      <PortalWaitingRoomBoard initialEntries={waitingRoom} today={today} compact />
      <PortalHome home={home} />
    </div>
  );
}
