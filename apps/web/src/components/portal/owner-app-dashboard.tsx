import Link from 'next/link';
import { OwnerPetAvatar } from './owner-pet-avatar';
import {
  ownerAppNeonButton,
  ownerAppNeonCard,
  ownerAppNeonHero,
  ownerAppNeonIcon,
  ownerAppNeonToneAt,
  type OwnerAppNeonTone,
} from './owner-app-neon';
import { CalendarDays, Syringe, HeartPulse, PawPrint, ChevronRight } from 'lucide-react';
import {
  formatDashboardDateTime,
  formatVaccinationDate,
  type OwnerPortalHome,
} from '@sincvete/shared';
import { cn } from '@/lib/utils';

const MODULE_TONES: OwnerAppNeonTone[] = ['emerald', 'rose', 'cyan', 'violet'];

export function OwnerAppDashboard({
  home,
  clinicName,
}: {
  home: OwnerPortalHome;
  clinicName?: string;
}) {
  const next = home.upcomingAppointments[0];
  const petsById = new Map(home.patients.map((pet) => [pet.id, pet]));
  const scheduledPets = home.upcomingAppointments
    .map((appt) => (appt.patientId ? petsById.get(appt.patientId) : null))
    .filter((pet): pet is NonNullable<typeof pet> => Boolean(pet))
    .filter((pet, index, list) => list.findIndex((p) => p.id === pet.id) === index);
  const heroPets = scheduledPets.length
    ? scheduledPets.slice(0, 3)
    : home.patients.filter((p) => !p.isDeceased).slice(0, 3);
  const nextPet = next?.patientId ? petsById.get(next.patientId) : null;

  const modules = [
    { href: '/portal/salud', label: 'Vacunas y salud', Icon: Syringe, tone: MODULE_TONES[0] },
    {
      href: '/portal/salud#tratamientos',
      label: 'Tratamientos',
      Icon: HeartPulse,
      tone: MODULE_TONES[1],
    },
    { href: '/portal/turnos', label: 'Agendar turno', Icon: CalendarDays, tone: MODULE_TONES[2] },
    { href: '/portal/mascotas', label: 'Historial', Icon: PawPrint, tone: MODULE_TONES[3] },
  ] as const;

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-muted-foreground">
          Solo para pacientes de {clinicName || home.clinic.name}
        </p>
        <h1 className="mt-1 text-2xl font-bold">Hola, {home.owner.fullName.split(' ')[0]}</h1>
        <p className="text-sm text-muted-foreground">Así van tus mascotas hoy.</p>
      </div>
      <section
        className={cn(
          'relative overflow-hidden rounded-3xl bg-primary p-5 text-primary-foreground',
          ownerAppNeonHero()
        )}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <p className="mb-2 flex items-center gap-2 text-sm">
              <CalendarDays size={18} /> Próximo turno
            </p>
            <p className="text-xl font-semibold">{next?.patientName || 'Todo al día'}</p>
            <p className="mt-1 text-sm opacity-90">
              {next
                ? formatDashboardDateTime(next.startsAt)
                : 'Podés consultar los horarios de tu veterinaria.'}
            </p>
            <Link
              className={cn(
                'mt-4 inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium',
                ownerAppNeonButton()
              )}
              href="/portal/turnos"
            >
              {next ? 'Ver mis turnos' : 'Pedir turno'}
              <ChevronRight size={16} />
            </Link>
          </div>
          <div className="relative flex shrink-0 items-center">
            {heroPets.length > 0 ? (
              <div className="flex items-center -space-x-3">
                {heroPets.map((pet, index) => (
                  <OwnerPetAvatar
                    key={pet.id}
                    name={pet.name}
                    species={pet.species}
                    photoUrl={pet.photoUrl}
                    size={index === 0 && nextPet?.id === pet.id ? 'lg' : 'md'}
                    ring
                    className="border border-white/30"
                  />
                ))}
              </div>
            ) : (
              <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-white/15">
                <PawPrint className="h-10 w-10 opacity-80" />
              </div>
            )}
          </div>
        </div>
      </section>
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Mis mascotas</h2>
          <Link className="text-sm text-primary" href="/portal/mascotas">
            Ver todas
          </Link>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {home.patients.map((pet, index) => {
            const tone = ownerAppNeonToneAt(index);
            return (
              <Link
                href={`/portal/mascotas/${pet.id}`}
                key={pet.id}
                className={ownerAppNeonCard(tone, 'flex items-center gap-4 rounded-2xl p-4')}
              >
                <OwnerPetAvatar
                  name={pet.name}
                  species={pet.species}
                  photoUrl={pet.photoUrl}
                  size="md"
                />
                <div>
                  <p className="font-semibold">{pet.name}</p>
                  <p className="text-sm text-muted-foreground">{pet.breed || pet.species}</p>
                </div>
                <ChevronRight className="ml-auto h-4 w-4 text-muted-foreground" />
              </Link>
            );
          })}
        </div>
        {!home.patients.length && (
          <p className="text-sm text-muted-foreground">
            Tu veterinaria todavía no vinculó mascotas a tu cuenta.
          </p>
        )}
      </section>
      <section className="grid grid-cols-2 gap-3">
        {modules.map(({ href, label, Icon, tone }) => (
          <Link key={label} href={href} className={ownerAppNeonCard(tone, 'rounded-2xl p-4')}>
            <Icon className={cn('mb-3 h-6 w-6', ownerAppNeonIcon(tone))} />
            <p className="text-sm font-medium">{label}</p>
          </Link>
        ))}
      </section>
      {home.vaccinesDue.length > 0 && (
        <section className={ownerAppNeonCard('amber', 'rounded-2xl p-4')}>
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
      <section className={ownerAppNeonCard('sky', 'rounded-2xl p-4 text-sm')}>
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
