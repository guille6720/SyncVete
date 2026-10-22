import { ownerAppEnabled } from '@/lib/owner-app';
import { notFound } from 'next/navigation';
import { getOwnerPortalHome, getOwnerPortalPatient } from '@/actions/portal';
import { OwnerVaccineCalendar } from '@/components/portal/owner-vaccine-calendar';
import { formatDashboardDateTime } from '@sincvete/shared';

export default async function OwnerHealthPage() {
  if (!ownerAppEnabled()) notFound();
  const home = await getOwnerPortalHome();
  const pets = home
    ? (await Promise.all(home.patients.map((p) => getOwnerPortalPatient(p.id)))).filter(
        (p) => p !== null
      )
    : [];
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Salud</h1>
      <p className="text-sm text-muted-foreground">
        Vacunas y evolución registrada por tu veterinaria.
      </p>
      {pets.map((pet) => (
        <section key={pet.patient.id} className="space-y-3">
          <h2 className="text-lg font-semibold">Vacunas de {pet.patient.name}</h2>
          <OwnerVaccineCalendar vaccines={pet.vaccines} />
        </section>
      ))}
      <section id="tratamientos" className="scroll-mt-24 space-y-4">
        <h2 className="text-lg font-semibold">Tratamientos y evolución</h2>
        <p className="text-sm text-muted-foreground">
          Información de solo lectura. Ante cualquier duda, contactá a la veterinaria.
        </p>
        {pets.map((pet) => (
          <div key={pet.patient.id} className="rounded-2xl border bg-card p-5">
            <h3 className="mb-4 font-semibold">{pet.patient.name}</h3>
            <ol className="space-y-4 border-l-2 border-primary/20 pl-4">
              {pet.clinical
                .filter((row) => row.treatment || row.plan || row.diagnosis)
                .map((row) => (
                  <li key={row.id} className="space-y-1 text-sm">
                    <p className="font-medium text-primary">
                      {formatDashboardDateTime(row.entryDate)}
                    </p>
                    {row.title && <p className="font-semibold">{row.title}</p>}
                    {row.diagnosis && <p>{row.diagnosis}</p>}
                    {row.treatment && <p>Tratamiento: {row.treatment}</p>}
                    {row.plan && (
                      <p className="text-muted-foreground">Evolución / plan: {row.plan}</p>
                    )}
                  </li>
                ))}
            </ol>
            {!pet.clinical.some((row) => row.treatment || row.plan || row.diagnosis) && (
              <p className="text-sm text-muted-foreground">
                Todavía no hay tratamientos registrados.
              </p>
            )}
          </div>
        ))}
      </section>
      {!pets.length && <p>No hay mascotas vinculadas.</p>}
    </div>
  );
}
