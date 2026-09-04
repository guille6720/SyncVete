import { redirect } from 'next/navigation';
import Link from 'next/link';
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
  const canRead = await canReadProfessionals();
  if (!canRead) redirect('/dashboard');

  const session = await getSessionContext();
  const [professionals, canWrite, seats, organization] = await Promise.all([
    listProfessionalsWithSummary(),
    canWriteProfessionals(),
    session ? getSeatUsageMeters(session.organizationId).catch(() => []) : Promise.resolve([]),
    getOrganization(),
  ]);

  const currency = parseOrganizationSettings(organization?.settings).currency ?? 'ARS';
  const professionalsSeat = seats.find((meter) => meter.featureKey === 'professionals.max');

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Profesionales</h1>
          <p className="text-muted-foreground">Equipo profesional de la clínica</p>
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
        {canWrite && (
          <Button asChild>
            <Link href="/profesionales/nuevo">
              <Plus className="mr-2 h-4 w-4" />
              Nuevo profesional
            </Link>
          </Button>
        )}
      </div>

      <ProfessionalsList professionals={professionals} currency={currency} />
    </div>
  );
}
