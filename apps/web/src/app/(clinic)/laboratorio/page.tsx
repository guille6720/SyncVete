import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { listLabQueue, listLabOrders, canManageLab, canReadLab } from '@/actions/lab';
import { LabQueue } from '@/components/lab/lab-queue';
import { LabHistory } from '@/components/lab/lab-history';
import { LAB_ORDER_STATUSES, type LabOrderStatus } from '@sincvete/shared';
import { moduleTourTargets } from '@sincvete/shared';

interface LaboratorioPageProps {
  searchParams: Promise<{ page?: string; search?: string; status?: string }>;
}

export default async function LaboratorioPage({ searchParams }: LaboratorioPageProps) {
  const canRead = await canReadLab();
  if (!canRead) redirect('/dashboard');

  const params = await searchParams;
  const page = Math.max(1, Number(params.page) || 1);
  const search = params.search?.trim() ?? '';
  const statusParam = params.status?.trim() ?? '';
  const status = LAB_ORDER_STATUSES.includes(statusParam as LabOrderStatus)
    ? (statusParam as LabOrderStatus)
    : undefined;

  const [queue, history, canWrite] = await Promise.all([
    listLabQueue(),
    listLabOrders({
      page,
      pageSize: 25,
      search: search || undefined,
      status,
    }),
    canManageLab(),
  ]);

  const tour = moduleTourTargets('laboratorio');
  return (
    <div className="space-y-8" data-tour={tour.root}>
      <div data-tour={tour.header}>
        <h1 className="text-2xl font-bold tracking-tight">Laboratorio</h1>
        <p className="text-muted-foreground">Órdenes, resultados e interpretación</p>
      </div>

      <LabQueue items={queue} canWrite={canWrite} />

      <Suspense fallback={<div className="text-sm text-muted-foreground">Cargando historial...</div>}>
        <LabHistory data={history} initialSearch={search} initialStatus={status ?? ''} />
      </Suspense>
    </div>
  );
}
