import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { listActivePrescriptions, listPrescriptions } from '@/actions/pharmacy';
import { getUserBranches } from '@/actions/settings';
import { PrescriptionsBoard } from '@/components/pharmacy/prescriptions-board';
import { PrescriptionsHistory } from '@/components/pharmacy/prescriptions-history';
import { buildListQuery } from '@/lib/list-return';
import { getSessionContext } from '@/lib/session';
import { PRESCRIPTION_STATUSES, type PrescriptionStatus } from '@sincvete/shared';

interface FarmaciaPageProps {
  searchParams: Promise<{ page?: string; search?: string; status?: string }>;
}

export default async function FarmaciaPage({ searchParams }: FarmaciaPageProps) {
  const [session, params] = await Promise.all([getSessionContext(), searchParams]);
  if (!session?.permissions.includes('clinical:read')) redirect('/dashboard');

  const page = Math.max(1, Number(params.page) || 1);
  const search = params.search?.trim() ?? '';
  const statusParam = params.status?.trim() ?? '';
  const status = PRESCRIPTION_STATUSES.includes(statusParam as PrescriptionStatus)
    ? (statusParam as PrescriptionStatus)
    : undefined;

  const [queue, history, branches] = await Promise.all([
    listActivePrescriptions(),
    listPrescriptions({
      page,
      pageSize: 25,
      search: search || undefined,
      status,
    }),
    getUserBranches(),
  ]);

  const branchName =
    branches.find((branch) => branch.id === session.branchId)?.name ?? null;
  const listQuery = buildListQuery({
    page: page > 1 ? String(page) : undefined,
    search: search || undefined,
    status: status || undefined,
  });

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Farmacia</h1>
        <p className="text-muted-foreground">
          Recetas, dispensación y descuento de stock
          {branchName ? ` · ${branchName}` : ''}
        </p>
      </div>

      <PrescriptionsBoard
        items={queue}
        canWrite={session.permissions.includes('clinical:write')}
        listQuery={listQuery}
      />

      <Suspense fallback={<div className="text-sm text-muted-foreground">Cargando historial...</div>}>
        <PrescriptionsHistory
          data={history}
          initialSearch={search}
          initialStatus={status ?? ''}
          branchName={branchName}
        />
      </Suspense>
    </div>
  );
}
