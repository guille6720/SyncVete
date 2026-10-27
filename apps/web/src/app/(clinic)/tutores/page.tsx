import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Suspense } from 'react';
import { Upload } from 'lucide-react';
import { listOwners, canManageOwners, canReadOwners } from '@/actions/owners';
import { OwnersList } from '@/components/owners/owners-list';
import { Button } from '@/components/ui/button';
import { canPermissionAndFeature } from '@/lib/permissions';
import { FEATURES } from '@/lib/entitlements';
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

  const [data, canWrite, canImport] = await Promise.all([
    listOwners({ page, pageSize: 25, search: search || undefined }),
    canManageOwners(),
    canPermissionAndFeature('data:import', FEATURES.DATA_IMPORT_EXPORT),
  ]);

  const tour = moduleTourTargets('tutores');
  return (
    <div className="space-y-6" data-tour={tour.root}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between" data-tour={tour.header}>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Tutores</h1>
          <p className="text-muted-foreground">Tutores y clientes de la clínica</p>
        </div>
        {canImport && (
          <Button variant="outline" asChild>
            <Link href="/configuracion?tab=import-export&import=owners">
              <Upload className="mr-2 h-4 w-4" />
              Importar CSV
            </Link>
          </Button>
        )}
      </div>

      <Suspense fallback={<div className="text-sm text-muted-foreground">Cargando...</div>}>
        <OwnersList data={data} canWrite={canWrite} initialSearch={search} />
      </Suspense>
    </div>
  );
}
