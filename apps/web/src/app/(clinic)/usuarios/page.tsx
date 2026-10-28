import { redirect } from 'next/navigation';
import { hasPermission } from '@sincvete/shared';
import { getSessionContext } from '@/actions/auth';
import { getManagedUsersPageData } from '@/actions/managed-users';
import { ManagedUsersClient } from '@/components/managed-users/managed-users-client';

export const metadata = { title: 'Usuarios y permisos' };

export default async function ManagedUsersPage() {
  const session = await getSessionContext();
  if (!session) redirect('/login');
  if (session.kind !== 'staff' || !hasPermission(session.permissions, 'users:manage')) {
    redirect('/dashboard');
  }

  const data = await getManagedUsersPageData();

  return (
    <ManagedUsersClient
      overview={data.overview}
      users={data.users}
      invitations={data.invitations}
      branches={data.branches}
      actorPermissions={session.permissions}
      canViewActivity={hasPermission(session.permissions, 'audit:read')}
    />
  );
}
