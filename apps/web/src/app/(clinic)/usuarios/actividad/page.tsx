import Link from 'next/link';
import { redirect } from 'next/navigation';
import { hasPermission } from '@sincvete/shared';
import { getSessionContext } from '@/actions/auth';
import { getManagedUsersPageData, listUserActivity } from '@/actions/managed-users';
import { ActivityExplorer } from '@/components/managed-users/activity-explorer';

export const metadata = { title: 'Actividad de usuarios' };

export default async function ManagedUsersActivityPage() {
  const session = await getSessionContext();
  if (!session) redirect('/login');
  if (
    session.kind !== 'staff' ||
    !hasPermission(session.permissions, ['users:manage', 'audit:read'])
  ) {
    redirect('/dashboard');
  }

  const [initial, pageData] = await Promise.all([
    listUserActivity({ page: 1, pageSize: 25 }),
    getManagedUsersPageData(),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/usuarios" className="text-sm text-muted-foreground hover:underline">
          ← Usuarios y permisos
        </Link>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">Actividad de usuarios</h1>
        <p className="text-muted-foreground">
          Acciones realizadas dentro de SyncVete por los usuarios de tu organización. Solo se
          registra actividad en la aplicación.
        </p>
      </div>
      <ActivityExplorer
        initial={initial}
        users={pageData.users.map((u) => ({ userId: u.userId, fullName: u.fullName }))}
        branches={pageData.branches}
      />
    </div>
  );
}
