import { redirect } from 'next/navigation';
import { formatDateParam } from '@sincvete/shared';
import { getOwnerPortalHome, getOwnerPortalWaitingRoom } from '@/actions/portal';
import { PortalHome } from '@/components/portal/portal-home';
import { PortalWaitingRoomBoard } from '@/components/portal/portal-waiting-room-board';
import { getOwnerAppBrand, getOwnerAppData } from '@/actions/owner-app';
import { getSessionContext } from '@/actions/auth';
import { OwnerAppAgenda } from '@/components/portal/owner-app-agenda';

export default async function PortalPage() {
  const home = await getOwnerPortalHome();
  if (!home) redirect('/login');

  const today = formatDateParam(new Date());
  const waitingRoom = await getOwnerPortalWaitingRoom(today);
  const session = await getSessionContext();
  const brand = session ? await getOwnerAppBrand(session.organizationId) : null;
  const app = brand?.enabled ? await getOwnerAppData() : null;

  return (
    <div className="space-y-8">
      {app && (
        <OwnerAppAgenda
          slots={app.slots}
          reminders={app.reminders}
          bookings={app.bookings}
          patients={home.patients}
        />
      )}
      <PortalWaitingRoomBoard initialEntries={waitingRoom} today={today} compact />
      <PortalHome home={home} />
    </div>
  );
}
