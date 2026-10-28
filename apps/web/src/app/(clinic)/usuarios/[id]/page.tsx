import { notFound, redirect } from 'next/navigation';
import { hasPermission } from '@sincvete/shared';
import { getSessionContext } from '@/actions/auth';
import { getManagedUserDetail, listUserActivity } from '@/actions/managed-users';
import { UserDetailClient } from '@/components/managed-users/user-detail-client';

export const metadata = { title: 'Usuario' };

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}

export default async function ManagedUserDetailPage({ params, searchParams }: PageProps) {
  const session = await getSessionContext();
  if (!session) redirect('/login');
  if (session.kind !== 'staff' || !hasPermission(session.permissions, 'users:manage')) {
    redirect('/dashboard');
  }

  const { id } = await params;
  const { tab } = await searchParams;
  const detail = await getManagedUserDetail(id);
  if (!detail) notFound();

  const canViewActivity = hasPermission(session.permissions, 'audit:read');
  const activity = canViewActivity
    ? await listUserActivity({ userId: id, page: 1, pageSize: 25 })
    : null;

  const initialTab =
    tab === 'permisos' || tab === 'actividad' || tab === 'general' ? tab : 'general';

  return (
    <UserDetailClient
      user={detail.user}
      access={detail.access}
      branches={detail.branches}
      isSelf={detail.isSelf}
      currentUserIsCentralAdmin={detail.currentUserIsCentralAdmin}
      actorPermissions={session.permissions}
      activity={activity}
      initialTab={initialTab === 'actividad' && !activity ? 'general' : initialTab}
    />
  );
}
