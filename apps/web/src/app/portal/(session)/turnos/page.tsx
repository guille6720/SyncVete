import { getOwnerAppData, getOwnerProfessionalAvailability } from '@/actions/owner-app';
import { OwnerProfessionalBooking } from '@/components/portal/owner-professional-booking';
import { getOwnerPortalHome } from '@/actions/portal';
import { OwnerAppAgenda } from '@/components/portal/owner-app-agenda';
import { ownerAppEnabled } from '@/lib/owner-app';
import { notFound } from 'next/navigation';
export default async function OwnerAppointmentsPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; professional?: string }>;
}) {
  if (!ownerAppEnabled()) notFound();
  const { date, professional } = await searchParams;
  const [home, app, availability] = await Promise.all([
    getOwnerPortalHome(),
    getOwnerAppData(),
    getOwnerProfessionalAvailability(date),
  ]);
  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold">Turnos</h1>
      <p className="text-sm text-muted-foreground">
        Elegí profesional, fecha y horario para tu mascota.
      </p>
      <OwnerProfessionalBooking
        key={`${availability.date}:${professional || ''}`}
        initialProfessionalId={professional}
        availability={availability}
        patients={home?.patients || []}
      />
      <OwnerAppAgenda
        {...app}
        patients={home?.patients || []}
        showReminders={false}
        showReservation={false}
      />
    </div>
  );
}
