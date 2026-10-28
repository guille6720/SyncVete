import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Suspense } from 'react';
import { Upload } from 'lucide-react';
import { listPatients } from '@/actions/patients';
import { PatientsList } from '@/components/patients/patients-list';
import { Button } from '@/components/ui/button';
import { getSessionContext } from '@/lib/session';
import { canPermissionAndFeature } from '@/lib/permissions';
import { FEATURES } from '@/lib/entitlements';
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
  const [session, params, canImport] = await Promise.all([
    getSessionContext(),
    searchParams,
    canPermissionAndFeature('data:import', FEATURES.DATA_IMPORT_EXPORT),
  ]);
  if (!session?.permissions.includes('patients:read')) redirect('/dashboard');

  const page = Math.max(1, Number(params.page) || 1);
  const search = params.search?.trim() ?? '';
  const speciesParam = params.species?.trim() ?? '';
  const species = PATIENT_SPECIES.includes(speciesParam as (typeof PATIENT_SPECIES)[number])
    ? (speciesParam as (typeof PATIENT_SPECIES)[number])
    : undefined;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Pacientes</h1>
          <p className="text-muted-foreground">Mascotas y animales de la clínica</p>
        </div>
        {canImport && (
          <Button variant="outline" asChild>
            <Link href="/configuracion?tab=import-export&import=patients">
              <Upload className="mr-2 h-4 w-4" />
              Importar CSV
            </Link>
          </Button>
        )}
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
