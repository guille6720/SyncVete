import { redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { canWriteProfessionals } from '@/actions/professionals';
import { getUserBranches } from '@/actions/settings';
import { getSessionContext } from '@/actions/auth';
import { ProfessionalCreateWizard } from '@/components/professionals/professional-create-wizard';
import { Button } from '@/components/ui/button';
import { hasPermission } from '@sincvete/shared';

export default async function NuevoProfesionalPage() {
  const [canWrite, session, branches] = await Promise.all([
    canWriteProfessionals(),
    getSessionContext(),
    getUserBranches(),
  ]);
  if (!canWrite) redirect('/profesionales');

  const canManageUsers = Boolean(session && hasPermission(session.permissions, 'users:manage'));
  const defaultBranchId = session?.branchId ?? branches[0]?.id ?? null;

  return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" asChild>
        <Link href="/profesionales">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Volver a profesionales
        </Link>
      </Button>

      <div>
        <h1 className="text-2xl font-bold tracking-tight">Nuevo profesional</h1>
        <p className="text-muted-foreground">
          Datos, usuario/contraseña, permisos por especialidad y agenda inicial. Después configurás
          honorarios y liquidaciones en la ficha.
        </p>
      </div>

      <ProfessionalCreateWizard
        branches={branches}
        defaultBranchId={defaultBranchId}
        canManageUsers={canManageUsers}
      />
    </div>
  );
}
