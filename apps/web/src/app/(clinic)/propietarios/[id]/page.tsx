import { notFound, redirect } from 'next/navigation';
import { getOwner, canReadOwners, canManageOwners } from '@/actions/owners';
import { getOwnerPortalStatus } from '@/actions/portal';
import { canSendWhatsApp } from '@/actions/whatsapp';
import { listOwnerWaitingRoomHistory, canReadWaitingRoom } from '@/actions/waiting-room';
import { OwnerDetail } from '@/components/owners/owner-detail';
import { FEATURES, canUseFeature, getClinicCommercialShell } from '@/lib/entitlements';
import { getSessionContext } from '@/lib/session';
import { isClinicPathEntitled } from '@sincvete/shared';

interface OwnerPageProps {
  params: Promise<{ id: string }>;
}

export default async function PropietarioDetailPage({ params }: OwnerPageProps) {
  const canRead = await canReadOwners();
  if (!canRead) redirect('/dashboard');

  const { id } = await params;
  const session = await getSessionContext();
  const [owner, canWrite, portalStatus, canWhatsApp, portalEnabled, commercial, canReadWr] =
    await Promise.all([
      getOwner(id),
      canManageOwners(),
      getOwnerPortalStatus(id),
      canSendWhatsApp(),
      session
        ? canUseFeature({ organizationId: session.organizationId, featureKey: FEATURES.OWNER_PORTAL })
        : Promise.resolve(false),
      session ? getClinicCommercialShell(session.organizationId) : Promise.resolve({ entitledHrefs: null }),
      canReadWaitingRoom(),
    ]);

  if (!owner) notFound();

  const waitingRoomHistory =
    canReadWr && isClinicPathEntitled('/sala-espera', commercial.entitledHrefs)
      ? await listOwnerWaitingRoomHistory(id)
      : [];

  return (
    <OwnerDetail
      owner={owner}
      canWrite={canWrite}
      canSendWhatsApp={canWhatsApp}
      portalEnabled={portalEnabled}
      portalStatus={portalStatus}
      entitledHrefs={commercial.entitledHrefs}
      waitingRoomHistory={waitingRoomHistory}
    />
  );
}
