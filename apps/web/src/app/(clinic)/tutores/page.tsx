import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { listOwners, canManageOwners, canReadOwners } from '@/actions/owners';
import { OwnersList } from '@/components/owners/owners-list';
import { moduleTourTargets } from '@sincvete/shared';

interface TutoresPageProps {
  searchParams: Promise<{ page?: string; search?: string }>;
}

export default async function TutoresPage({ searchParams }: TutoresPageProps) {
  const canRead = await canReadOwners();
  if (!canRead) redirect('/dashboard');

  const params = await searchParams;
  const page = Math.max(1, Number(params.page) || 1);
  const search = params.search?.trim() ?? '';

  const [data, canWrite] = await Promise.all([
    listOwners({ page, pageSize: 25, search: search || undefined }),
    canManageOwners(),
  ]);

  const tour = moduleTourTargets('tutores');
  return (
    <div className="space-y-6" data-tour={tour.root}>
      <div data-tour={tour.header}>
        <h1 className="text-2xl font-bold tracking-tight">Tutores</h1>
        <p className="text-muted-foreground">Tutores y clientes de la clínica</p>
      </div>

      <Suspense fallback={<div className="text-sm text-muted-foreground">Cargando...</div>}>
        <OwnersList data={data} canWrite={canWrite} initialSearch={search} />
      </Suspense>
    </div>
  );
}
