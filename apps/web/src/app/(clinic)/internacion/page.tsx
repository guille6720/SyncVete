import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import {
  listActiveHospitalizations,
  listHospitalizations,
  canManageHospitalizations,
  canReadHospitalizations,
} from '@/actions/hospitalizations';
import { HospitalizationsBoard } from '@/components/hospitalizations/hospitalizations-board';
import { HospitalizationsHistory } from '@/components/hospitalizations/hospitalizations-history';
import { HOSPITALIZATION_STATUSES, type HospitalizationStatus } from '@sincvete/shared';
import { moduleTourTargets } from '@sincvete/shared';

interface InternacionPageProps {
  searchParams: Promise<{ page?: string; search?: string; status?: string }>;
}

export default async function InternacionPage({ searchParams }: InternacionPageProps) {
  const canRead = await canReadHospitalizations();
  if (!canRead) redirect('/dashboard');

  const params = await searchParams;
  const page = Math.max(1, Number(params.page) || 1);
  const search = params.search?.trim() ?? '';
  const statusParam = params.status?.trim() ?? '';
  const status = HOSPITALIZATION_STATUSES.includes(statusParam as HospitalizationStatus)
    ? (statusParam as HospitalizationStatus)
    : undefined;

  const [board, history, canWrite] = await Promise.all([
    listActiveHospitalizations(),
    listHospitalizations({
      page,
      pageSize: 25,
      search: search || undefined,
      status,
    }),
    canManageHospitalizations(),
  ]);

  const tour = moduleTourTargets('internacion');
  return (
    <div className="space-y-8" data-tour={tour.root}>
      <div data-tour={tour.header}>
        <h1 className="text-2xl font-bold tracking-tight">Internación</h1>
        <p className="text-muted-foreground">Pacientes internados, evoluciones y altas</p>
      </div>

      <HospitalizationsBoard items={board} canWrite={canWrite} />

      <Suspense fallback={<div className="text-sm text-muted-foreground">Cargando historial...</div>}>
        <HospitalizationsHistory
          data={history}
          initialSearch={search}
          initialStatus={status ?? ''}
        />
      </Suspense>
    </div>
  );
}
