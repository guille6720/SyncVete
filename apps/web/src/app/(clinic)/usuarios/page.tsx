import { redirect } from 'next/navigation';
import { hasPermission } from '@sincvete/shared';
import { getSessionContext } from '@/actions/auth';
import { getManagedUsersPageData } from '@/actions/managed-users';
import { getProfessional, listProfessionalBranches } from '@/actions/professionals';
import { ManagedUsersClient } from '@/components/managed-users/managed-users-client';

export const metadata = { title: 'Usuarios y permisos' };

export default async function ManagedUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ professional?: string; returnTo?: string }>;
}) {
  const session = await getSessionContext();
  if (!session) redirect('/login');
  if (session.kind !== 'staff' || !hasPermission(session.permissions, 'users:manage')) {
    redirect('/dashboard');
  }

  const params = await searchParams;
  const data = await getManagedUsersPageData();
  let invitationDraft: { fullName: string; branchId: string } | undefined;
  if (params.professional && /^[0-9a-f-]{36}$/i.test(params.professional)) {
    const professional = await getProfessional(params.professional);
    if (professional) {
      const assigned = await listProfessionalBranches(professional.id);
      invitationDraft = {
        fullName: `${professional.first_name} ${professional.last_name}`,
        branchId: assigned[0]?.branch_id ?? '',
      };
    }
  }
  const returnTo =
    params.returnTo &&
    /^\/(agenda\/nueva\?|profesionales\/[0-9a-f-]{36}(?:$|\?))/i.test(params.returnTo)
      ? params.returnTo
      : undefined;

  return (
    <ManagedUsersClient
      invitationDraft={invitationDraft}
      returnTo={returnTo}
      overview={data.overview}
      users={data.users}
      invitations={data.invitations}
      branches={data.branches}
      actorPermissions={session.permissions}
      canViewActivity={hasPermission(session.permissions, 'audit:read')}
    />
  );
}
