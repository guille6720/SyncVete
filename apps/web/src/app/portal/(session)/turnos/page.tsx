import { getOwnerProfessionalAvailability } from '@/actions/owner-app';
import { getOwnerPortalHome } from '@/actions/portal';
import { OwnerTurnosCalendar } from '@/components/portal/owner-turnos-calendar';
import { ownerAppEnabled } from '@/lib/owner-app';
import { notFound } from 'next/navigation';

export default async function OwnerAppointmentsPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; professional?: string }>;
}) {
  if (!ownerAppEnabled()) notFound();
  const { date, professional } = await searchParams;
  const [home, availability] = await Promise.all([
    getOwnerPortalHome(),
    getOwnerProfessionalAvailability(date),
  ]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Turnos</h1>
        <p className="text-sm text-muted-foreground">
          Calendario de tu veterinaria. Elegí un día, profesional y horario.
        </p>
      </div>
      <OwnerTurnosCalendar
        availability={availability}
        patients={home?.patients || []}
        appointments={home?.upcomingAppointments || []}
        initialProfessionalId={professional}
      />
    </div>
  );
}
