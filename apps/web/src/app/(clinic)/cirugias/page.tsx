import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import {
  listSurgeryBoard,
  listSurgeries,
  canManageSurgeries,
  canReadSurgeries,
} from '@/actions/surgeries';
import { SurgeriesBoard } from '@/components/surgeries/surgeries-board';
import { SurgeriesHistory } from '@/components/surgeries/surgeries-history';
import { SURGERY_STATUSES, type SurgeryStatus } from '@sincvete/shared';
import { moduleTourTargets } from '@sincvete/shared';

interface CirugiasPageProps {
  searchParams: Promise<{ page?: string; search?: string; status?: string }>;
}

export default async function CirugiasPage({ searchParams }: CirugiasPageProps) {
  const canRead = await canReadSurgeries();
  if (!canRead) redirect('/dashboard');

  const params = await searchParams;
  const page = Math.max(1, Number(params.page) || 1);
  const search = params.search?.trim() ?? '';
  const statusParam = params.status?.trim() ?? '';
  const status = SURGERY_STATUSES.includes(statusParam as SurgeryStatus)
    ? (statusParam as SurgeryStatus)
    : undefined;

  const [board, history, canWrite] = await Promise.all([
    listSurgeryBoard(),
    listSurgeries({
      page,
      pageSize: 25,
      search: search || undefined,
      status,
    }),
    canManageSurgeries(),
  ]);

  const tour = moduleTourTargets('cirugias');
  return (
    <div className="space-y-8" data-tour={tour.root}>
      <div data-tour={tour.header}>
        <h1 className="text-2xl font-bold tracking-tight">Cirugías</h1>
        <p className="text-muted-foreground">Quirófano, recuperación y registro operatorio</p>
      </div>

      <SurgeriesBoard items={board} canWrite={canWrite} />

      <Suspense fallback={<div className="text-sm text-muted-foreground">Cargando historial...</div>}>
        <SurgeriesHistory data={history} initialSearch={search} initialStatus={status ?? ''} />
      </Suspense>
    </div>
  );
}
