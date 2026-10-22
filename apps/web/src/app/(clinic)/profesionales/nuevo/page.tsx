import { redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { canWriteProfessionals } from '@/actions/professionals';
import { getAssignableStaff } from '@/actions/appointments';
import { getUserBranches } from '@/actions/settings';
import { ProfessionalForm } from '@/components/professionals/professional-form';
import { Button } from '@/components/ui/button';

export default async function NuevoProfesionalPage() {
  const canWrite = await canWriteProfessionals();
  if (!canWrite) redirect('/profesionales');

  const [branches, staff] = await Promise.all([getUserBranches(), getAssignableStaff()]);

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
        staff={staff.map((member) => ({ userId: member.userId, fullName: member.fullName }))}
      />
    </div>
  );
}
