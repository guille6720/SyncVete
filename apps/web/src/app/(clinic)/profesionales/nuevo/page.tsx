import { AgendaProblemNotice } from '@/components/appointments/agenda-problem-notice';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { canWriteProfessionals } from '@/actions/professionals';
import { canManageAppointments } from '@/actions/appointments';
import { getSessionContext } from '@/actions/auth';
import { randomUUID } from 'crypto';
import { getUserBranches } from '@/actions/settings';
import { ProfessionalForm } from '@/components/professionals/professional-form';
import { Button } from '@/components/ui/button';

export default async function NuevoProfesionalPage() {
  const canWrite = await canWriteProfessionals();
  if (!canWrite)
    return (
      <AgendaProblemNotice message="No tenés permiso para crear profesionales o tu plan no incluye esta función. Pedile a un administrador que revise professionals:write y el plan de la clínica." />
    );

  const [branches, session, canWriteAgenda] = await Promise.all([
    getUserBranches(),
    getSessionContext(),
    canManageAppointments(),
  ]);

  return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" asChild>
        <Link href="/profesionales">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Volver a profesionales
        </Link>
      </Button>
      <ProfessionalForm
        mode="create"
        branches={branches}
        draftId={randomUUID()}
        defaultBranchId={session?.branchId}
        canWriteAgenda={canWriteAgenda}
        canInvite={session?.permissions.includes('users:manage') ?? false}
      />
    </div>
  );
}
