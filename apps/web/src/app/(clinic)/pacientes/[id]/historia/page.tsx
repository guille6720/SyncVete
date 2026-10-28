import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { listClinicalEntries } from '@/actions/clinical-entries';
import { getPatient } from '@/actions/patients';
import { ClinicalEntriesList } from '@/components/clinical/clinical-entries-list';
import { ClinicalHistoryExport } from '@/components/clinical/clinical-history-export';
import { Button } from '@/components/ui/button';
import { getSessionContext } from '@/lib/session';
import { CLINICAL_HISTORY_PAGE_SIZE, SPECIES_EMOJI } from '@sincvete/shared';
import { Suspense } from 'react';

interface PatientHistoriaPageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ page?: string; search?: string }>;
}

export default async function PatientHistoriaPage({
  params,
  searchParams,
}: PatientHistoriaPageProps) {
  const [session, { id }, query] = await Promise.all([getSessionContext(), params, searchParams]);
  if (!session?.permissions.includes('clinical:read')) redirect('/dashboard');

  const page = Math.max(1, Number(query.page) || 1);
  const search = query.search?.trim() ?? '';

  const [patient, data] = await Promise.all([
    getPatient(id),
    listClinicalEntries({
      page,
      pageSize: CLINICAL_HISTORY_PAGE_SIZE,
      search: search || undefined,
      patientId: id,
    }),
  ]);
  if (!patient) notFound();

  const canWrite = session.permissions.includes('clinical:write');
  const totalEntries = data.total;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Button variant="ghost" size="sm" asChild className="-ml-2 mb-2">
            <Link href={`/pacientes/${id}`}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Volver al paciente
            </Link>
          </Button>
          <h1 className="text-2xl font-bold tracking-tight">
            {SPECIES_EMOJI[patient.species]} {patient.name}
          </h1>
          <p className="text-muted-foreground">
            Historia clínica · {totalEntries} entrada{totalEntries !== 1 ? 's' : ''}
            {totalEntries > CLINICAL_HISTORY_PAGE_SIZE
              ? ` · mostrando ${CLINICAL_HISTORY_PAGE_SIZE} por página`
              : ''}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <ClinicalHistoryExport patientId={id} patientName={patient.name} />
          <Button variant="outline" asChild>
            <Link href={`/imagenes?patientId=${id}`}>Imágenes</Link>
          </Button>
          {canWrite && (
            <Button asChild>
              <Link href={`/historia-clinica/nuevo?patientId=${id}`}>Nueva entrada</Link>
            </Button>
          )}
        </div>
      </div>

      <Suspense fallback={<div className="text-sm text-muted-foreground">Cargando...</div>}>
        <ClinicalEntriesList
          data={data}
          canWrite={canWrite}
          initialSearch={search}
          patientId={id}
          patientName={patient.name}
          showLoadOlder
        />
      </Suspense>
    </div>
  );
}
