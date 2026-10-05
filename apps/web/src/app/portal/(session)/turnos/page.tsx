import { getOwnerAppData } from '@/actions/owner-app';
import { getOwnerPortalHome } from '@/actions/portal';
import { OwnerAppAgenda } from '@/components/portal/owner-app-agenda';
import { ownerAppEnabled } from '@/lib/owner-app';
import { notFound } from 'next/navigation';
export default async function OwnerAppointmentsPage() {
  if (!ownerAppEnabled()) notFound();
  const [home, app] = await Promise.all([getOwnerPortalHome(), getOwnerAppData()]);
  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold">Turnos</h1>
      <p className="text-sm text-muted-foreground">
        Elegí tu mascota y uno de los horarios publicados por la veterinaria.
      </p>
      <OwnerAppAgenda {...app} patients={home?.patients || []} showReminders={false} />
    </div>
  );
}
