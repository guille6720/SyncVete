import { redirect } from 'next/navigation';
import {
  canReadProfessionals,
  canWriteProfessionals,
  listProfessionals,
} from '@/actions/professionals';
import { getAssignableStaff } from '@/actions/appointments';
import { getUserBranches } from '@/actions/settings';
import { getSeatUsageMeters } from '@/lib/entitlements';
import { getSessionContext } from '@/actions/auth';
import { ProfessionalForm } from '@/components/professionals/professional-form';
import { ProfessionalsList } from '@/components/professionals/professionals-list';
import { formatMeteredUsage, isQuotaNearLimit } from '@sincvete/shared';

export default async function ProfesionalesPage() {
  const canRead = await canReadProfessionals();
  if (!canRead) redirect('/dashboard');

  const session = await getSessionContext();
  const [professionals, canWrite, branches, staff, seats] = await Promise.all([
    listProfessionals(),
    canWriteProfessionals(),
    getUserBranches(),
    getAssignableStaff(),
    session ? getSeatUsageMeters(session.organizationId).catch(() => []) : Promise.resolve([]),
  ]);

  const professionalsSeat = seats.find((meter) => meter.featureKey === 'professionals.max');

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Profesionales</h1>
        <p className="text-muted-foreground">
          Registro de veterinarios y otros profesionales para compensación operativa
        </p>
        {professionalsSeat ? (
          <p className="mt-1 text-sm text-muted-foreground">
            <span
              className={
                isQuotaNearLimit(professionalsSeat) ? 'text-amber-700 dark:text-amber-300' : undefined
              }
            >
              Cupo: {formatMeteredUsage(professionalsSeat)}
            </span>
          </p>
        ) : null}
      </div>

      {canWrite && (
        <ProfessionalForm
          mode="create"
          branches={branches}
          staff={staff.map((member) => ({ userId: member.userId, fullName: member.fullName }))}
        />
      )}

      <div className="space-y-3">
        <h2 className="text-lg font-semibold">Equipo profesional</h2>
        <ProfessionalsList professionals={professionals} />
      </div>
    </div>
  );
}
