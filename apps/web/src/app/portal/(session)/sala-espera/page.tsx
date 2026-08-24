import { formatDateParam } from '@sincvete/shared';
import { getOwnerPortalWaitingRoom } from '@/actions/portal';
import { PortalWaitingRoomBoard } from '@/components/portal/portal-waiting-room-board';

export default async function PortalSalaEsperaPage() {
  const today = formatDateParam(new Date());
  const entries = await getOwnerPortalWaitingRoom(today);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Sala de espera</h1>
        <p className="text-muted-foreground">
          Seguimiento en vivo del estado de tus mascotas en la clínica
        </p>
      </div>
      <PortalWaitingRoomBoard initialEntries={entries} today={today} />
    </div>
  );
}
