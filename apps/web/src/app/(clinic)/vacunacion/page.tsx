import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import {
  listVaccinationDue,
  listVaccinations,
  canManageVaccinations,
  canReadVaccinations,
} from '@/actions/vaccinations';
import { VaccinationsDueBoard } from '@/components/vaccinations/vaccinations-due-board';
import { VaccinationsHistory } from '@/components/vaccinations/vaccinations-history';
import { moduleTourTargets } from '@sincvete/shared';

interface VacunacionPageProps {
  searchParams: Promise<{ page?: string; search?: string }>;
}

export default async function VacunacionPage({ searchParams }: VacunacionPageProps) {
  const canRead = await canReadVaccinations();
  if (!canRead) redirect('/dashboard');

  const params = await searchParams;
  const page = Math.max(1, Number(params.page) || 1);
  const search = params.search?.trim() ?? '';

  const [due, history, canWrite] = await Promise.all([
    listVaccinationDue(),
    listVaccinations({
      page,
      pageSize: 25,
      search: search || undefined,
    }),
    canManageVaccinations(),
  ]);

  const tour = moduleTourTargets('vacunacion');
  return (
    <div className="space-y-8" data-tour={tour.root}>
      <div data-tour={tour.header}>
        <h1 className="text-2xl font-bold tracking-tight">Vacunación</h1>
        <p className="text-muted-foreground">Refuerzos vencidos, por vencer y registro de dosis</p>
      </div>

      <VaccinationsDueBoard items={due} canWrite={canWrite} />

      <Suspense fallback={<div className="text-sm text-muted-foreground">Cargando historial...</div>}>
        <VaccinationsHistory data={history} initialSearch={search} />
      </Suspense>
    </div>
  );
}
