import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Plus } from 'lucide-react';
import {
  canReadProfessionals,
  canWriteProfessionals,
  listProfessionalsWithSummary,
} from '@/actions/professionals';
import { getOrganization } from '@/actions/settings';
import { getSeatUsageMeters } from '@/lib/entitlements';
import { getSessionContext } from '@/actions/auth';
import { ProfessionalsList } from '@/components/professionals/professionals-list';
import { Button } from '@/components/ui/button';
import { formatMeteredUsage, isQuotaNearLimit, parseOrganizationSettings } from '@sincvete/shared';

export default async function ProfesionalesPage() {
  const { svPerfOperation } = await import('@/lib/perf/nav-timing');
  const [canRead, session] = await svPerfOperation('/profesionales', 'authz', () =>
    Promise.all([canReadProfessionals(), getSessionContext()])
  );
  if (!canRead) redirect('/dashboard');

  const [professionals, canWrite, seats, organization] = await svPerfOperation(
    '/profesionales',
    'parallelList',
    () =>
      Promise.all([
        listProfessionalsWithSummary(),
        canWriteProfessionals(),
        session ? getSeatUsageMeters(session.organizationId).catch(() => []) : Promise.resolve([]),
        getOrganization(),
      ])
  );

  const currency = parseOrganizationSettings(organization?.settings).currency ?? 'ARS';
  const professionalsSeat = seats.find((meter) => meter.featureKey === 'professionals.max');

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Profesionales</h1>
          <p className="text-muted-foreground">
            Alta, acceso, agenda, honorarios y liquidaciones en un solo módulo
          </p>
          {professionalsSeat ? (
            <p className="mt-1 text-sm text-muted-foreground">
              <span
                className={
                  isQuotaNearLimit(professionalsSeat)
                    ? 'text-amber-700 dark:text-amber-300'
                    : undefined
                }
              >
                Cupo: {formatMeteredUsage(professionalsSeat)}
              </span>
            </p>
          ) : null}
        </div>
        {canWrite ? (
          <Button asChild>
            <Link href="/profesionales/nuevo">
              <Plus className="mr-2 h-4 w-4" />
              Nuevo profesional
            </Link>
          </Button>
        ) : null}
      </div>

      <div className="space-y-3">
        <h2 className="text-lg font-semibold">Equipo profesional</h2>
        <ProfessionalsList professionals={professionals} currency={currency} canWrite={canWrite} />
      </div>
    </div>
  );
}
