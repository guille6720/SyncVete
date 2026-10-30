import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Suspense } from 'react';
import { Upload } from 'lucide-react';
import { listClinicalEntries } from '@/actions/clinical-entries';
import { ClinicalEntriesList } from '@/components/clinical/clinical-entries-list';
import { Button } from '@/components/ui/button';
import { getSessionContext } from '@/lib/session';
import { canPermissionAndFeature } from '@/lib/permissions';
import { FEATURES } from '@/lib/entitlements';
import {
  CLINICAL_ENTRY_TYPES,
  CLINICAL_HISTORY_PAGE_SIZE,
  type ClinicalEntryType,
} from '@sincvete/shared';

interface HistoriaClinicaPageProps {
  searchParams: Promise<{ page?: string; search?: string; type?: string }>;
}

async function ClinicalHistorySection({
  page,
  search,
  entryType,
  canWrite,
}: {
  page: number;
  search: string;
  entryType: ClinicalEntryType | undefined;
  canWrite: boolean;
}) {
  const data = await listClinicalEntries({
    page,
    pageSize: CLINICAL_HISTORY_PAGE_SIZE,
    search: search || undefined,
    entryType,
  });

  return (
    <ClinicalEntriesList
      data={data}
      canWrite={canWrite}
      initialSearch={search}
      initialEntryType={entryType ?? ''}
    />
  );
}

export default async function HistoriaClinicaPage({ searchParams }: HistoriaClinicaPageProps) {
  const [session, params, canImport, canRead] = await Promise.all([
    getSessionContext(),
    searchParams,
    canPermissionAndFeature('data:import', FEATURES.DATA_IMPORT_EXPORT),
    canPermissionAndFeature('clinical:read', FEATURES.CLINICAL_HISTORY),
  ]);
  if (!session?.permissions.includes('clinical:read') || !canRead) redirect('/dashboard');

  const page = Math.max(1, Number(params.page) || 1);
  const search = params.search?.trim() ?? '';
  const typeParam = params.type?.trim() ?? '';
  const entryType = CLINICAL_ENTRY_TYPES.includes(typeParam as ClinicalEntryType)
    ? (typeParam as ClinicalEntryType)
    : undefined;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Historias clínicas</h1>
          <p className="text-muted-foreground">
            Buscá por paciente, tutor, motivo o diagnóstico. Imprimí o descargá la historia completa
            o las atenciones de una fecha.
          </p>
        </div>
        {canImport && (
          <Button variant="outline" asChild>
            <Link href="/configuracion?tab=import-export&import=clinical_entries">
              <Upload className="mr-2 h-4 w-4" />
              Importar CSV
            </Link>
          </Button>
        )}
      </div>

      <Suspense
        fallback={<div className="text-sm text-muted-foreground">Cargando historia clínica…</div>}
      >
        <ClinicalHistorySection
          page={page}
          search={search}
          entryType={entryType}
          canWrite={session.permissions.includes('clinical:write')}
        />
      </Suspense>
    </div>
  );
}
