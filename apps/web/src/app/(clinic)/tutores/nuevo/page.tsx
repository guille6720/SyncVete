import { redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { canManageOwners } from '@/actions/owners';
import { getUserBranches } from '@/actions/settings';
import { getSessionContext } from '@/actions/auth';
import { OwnerForm } from '@/components/owners/owner-form';
import { Button } from '@/components/ui/button';

export default async function NuevoTutorPage() {
  const canWrite = await canManageOwners();
  if (!canWrite) redirect('/tutores');

  const session = await getSessionContext();
  const branches = await getUserBranches();

  return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" asChild>
        <Link href="/tutores">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Volver a tutores
        </Link>
      </Button>
      <OwnerForm branches={branches} defaultBranchId={session?.branchId} />
    </div>
  );
}
