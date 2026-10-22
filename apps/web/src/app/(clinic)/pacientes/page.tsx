import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { listPatients } from '@/actions/patients';
import { PatientsList } from '@/components/patients/patients-list';
import { getSessionContext } from '@/lib/session';
import { PATIENT_LIST_PAGE_SIZE, PATIENT_SPECIES } from '@sincvete/shared';

interface PacientesPageProps {
  searchParams: Promise<{ page?: string; search?: string; species?: string }>;
}

async function PatientsListSection({
  page,
  search,
  species,
  canWrite,
}: {
  page: number;
  search: string;
  species: (typeof PATIENT_SPECIES)[number] | undefined;
  canWrite: boolean;
}) {
  const data = await listPatients({
    page,
    pageSize: PATIENT_LIST_PAGE_SIZE,
    search: search || undefined,
    species,
  });

  return (
    <PatientsList
      data={data}
      canWrite={canWrite}
      initialSearch={search}
      initialSpecies={species ?? ''}
    />
  );
}

export default async function PacientesPage({ searchParams }: PacientesPageProps) {
  const [session, params] = await Promise.all([getSessionContext(), searchParams]);
  if (!session?.permissions.includes('patients:read')) redirect('/dashboard');

  const page = Math.max(1, Number(params.page) || 1);
  const search = params.search?.trim() ?? '';
  const speciesParam = params.species?.trim() ?? '';
  const species = PATIENT_SPECIES.includes(speciesParam as (typeof PATIENT_SPECIES)[number])
    ? (speciesParam as (typeof PATIENT_SPECIES)[number])
    : undefined;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Pacientes</h1>
        <p className="text-muted-foreground">Mascotas y animales de la clínica</p>
      </div>

      <Suspense fallback={<div className="text-sm text-muted-foreground">Cargando pacientes…</div>}>
        <PatientsListSection
          page={page}
          search={search}
          species={species}
          canWrite={session.permissions.includes('patients:write')}
        />
      </Suspense>
    </div>
  );
}
