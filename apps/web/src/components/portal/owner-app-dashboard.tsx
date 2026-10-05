import Link from 'next/link';
import { OwnerPetIcon } from './owner-pet-icon';
import { CalendarDays, Syringe, HeartPulse, PawPrint, ChevronRight } from 'lucide-react';
import {
  formatDashboardDateTime,
  formatVaccinationDate,
  type OwnerPortalHome,
} from '@sincvete/shared';

export function OwnerAppDashboard({
  home,
  clinicName,
}: {
  home: OwnerPortalHome;
  clinicName?: string;
}) {
  const next = home.upcomingAppointments[0];
  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-muted-foreground">
          Solo para pacientes de {clinicName || home.clinic.name}
        </p>
        <h1 className="mt-1 text-2xl font-bold">Hola, {home.owner.fullName.split(' ')[0]}</h1>
        <p className="text-sm text-muted-foreground">Así están tus mascotas hoy.</p>
      </div>
      <section className="rounded-3xl bg-primary p-5 text-primary-foreground">
        <p className="mb-2 flex items-center gap-2 text-sm">
          <CalendarDays size={18} /> Próximo turno
        </p>
        <p className="text-xl font-semibold">{next?.patientName || 'Todo al día'}</p>
        <p className="mt-1 text-sm">
          {next
            ? formatDashboardDateTime(next.startsAt)
            : 'Podés consultar los horarios de tu veterinaria.'}
        </p>
        <Link
          className="mt-4 inline-flex items-center gap-2 rounded-xl bg-white/15 px-4 py-2 text-sm font-medium"
          href="/portal/turnos"
        >
          {next ? 'Ver mis turnos' : 'Pedir turno'}
          <ChevronRight size={16} />
        </Link>
      </section>
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Mis mascotas</h2>
          <Link className="text-sm text-primary" href="/portal/mascotas">
            Ver todas
          </Link>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {home.patients.map((pet) => (
            <Link
              href={`/portal/mascotas/${pet.id}`}
              key={pet.id}
              className="flex items-center gap-4 rounded-2xl border bg-card p-4"
            >
              <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-accent text-3xl">
                <OwnerPetIcon species={pet.species} />
              </span>
              <div>
                <p className="font-semibold">{pet.name}</p>
                <p className="text-sm text-muted-foreground">{pet.breed || pet.species}</p>
              </div>
              <ChevronRight className="ml-auto h-4 w-4 text-muted-foreground" />
            </Link>
          ))}
        </div>
        {!home.patients.length && (
          <p className="text-sm text-muted-foreground">
            Tu veterinaria todavía no vinculó mascotas a tu cuenta.
          </p>
        )}
      </section>
      <section className="grid grid-cols-2 gap-3">
        {[
          { href: '/portal/salud', label: 'Vacunas y salud', Icon: Syringe },
          { href: '/portal/salud#tratamientos', label: 'Tratamientos', Icon: HeartPulse },
          { href: '/portal/turnos', label: 'Agendar turno', Icon: CalendarDays },
          { href: '/portal/mascotas', label: 'Historial', Icon: PawPrint },
        ].map(({ href, label, Icon }) => (
          <Link key={label} href={href} className="rounded-2xl border bg-card p-4">
            <Icon className="mb-3 h-6 w-6 text-primary" />
            <p className="text-sm font-medium">{label}</p>
          </Link>
        ))}
      </section>
      {home.vaccinesDue.length > 0 && (
        <section className="rounded-2xl border bg-card p-4">
          <h2 className="mb-3 font-semibold">Próximas vacunas</h2>
          {home.vaccinesDue.map((v) => (
            <div key={v.id} className="mb-2 text-sm">
              <p className="font-medium">
                {v.patientName} · {v.vaccineName}
              </p>
              <p className="text-muted-foreground">{formatVaccinationDate(v.nextDueAt)}</p>
            </div>
          ))}
        </section>
      )}
      <section className="rounded-2xl bg-muted/50 p-4 text-sm">
        <p className="font-medium">{home.clinic.name}</p>
        {home.clinic.phone && (
          <a className="mt-1 block text-primary" href={`tel:${home.clinic.phone}`}>
            {home.clinic.phone}
          </a>
        )}
        {home.clinic.email && (
          <a className="mt-1 block break-all text-primary" href={`mailto:${home.clinic.email}`}>
            {home.clinic.email}
          </a>
        )}
      </section>
    </div>
  );
}
