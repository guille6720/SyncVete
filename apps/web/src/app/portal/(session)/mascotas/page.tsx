import { ownerAppEnabled } from '@/lib/owner-app';
import { notFound } from 'next/navigation';
import { getOwnerPortalHome } from '@/actions/portal';
import Link from 'next/link';
import { OwnerPetIcon } from '@/components/portal/owner-pet-icon';
export default async function OwnerPetsPage() {
  if (!ownerAppEnabled()) notFound();
  const home = await getOwnerPortalHome();
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Mis mascotas</h1>
      <p className="text-sm text-muted-foreground">
        Los datos y el historial los actualiza tu veterinaria.
      </p>
      {home?.patients.map((pet) => (
        <Link
          key={pet.id}
          href={`/portal/mascotas/${pet.id}`}
          className="flex items-center gap-4 rounded-2xl border bg-card p-5"
        >
          <span className="text-3xl">
            <OwnerPetIcon species={pet.species} />
          </span>
          <div>
            <h2 className="font-semibold">{pet.name}</h2>
            <p className="text-sm text-muted-foreground">
              {pet.breed || pet.species}
              {pet.isDeceased ? ' · Fallecido' : ''}
            </p>
          </div>
        </Link>
      ))}
      {!home?.patients.length && <p>No hay mascotas vinculadas.</p>}
    </div>
  );
}
