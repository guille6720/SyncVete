import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import {
  canReadNotifications,
  countUnreadNotifications,
  listNotifications,
} from '@/actions/notifications';
import { NotificationsInbox } from '@/components/notifications/notifications-inbox';
import { NOTIFICATION_KINDS, type NotificationKind } from '@sincvete/shared';
import { moduleTourTargets } from '@sincvete/shared';

interface NotificacionesPageProps {
  searchParams: Promise<{ page?: string; search?: string; kind?: string; unread?: string }>;
}

export default async function NotificacionesPage({ searchParams }: NotificacionesPageProps) {
  const canRead = await canReadNotifications();
  if (!canRead) redirect('/dashboard');

  const params = await searchParams;
  const page = Math.max(1, Number(params.page) || 1);
  const search = params.search?.trim() ?? '';
  const kindParam = params.kind?.trim() ?? '';
  const kind = NOTIFICATION_KINDS.includes(kindParam as NotificationKind)
    ? (kindParam as NotificationKind)
    : undefined;
  const unreadOnly = params.unread === '1';

  const [data, unreadCount] = await Promise.all([
    listNotifications({
      page,
      pageSize: 25,
      search: search || undefined,
      kind,
      unreadOnly,
    }),
    countUnreadNotifications(),
  ]);

  const tour = moduleTourTargets('notificaciones');
  return (
    <div className="space-y-8" data-tour={tour.root}>
      <div data-tour={tour.header}>
        <h1 className="text-2xl font-bold tracking-tight">Notificaciones</h1>
        <p className="text-muted-foreground">
          Avisos de la clínica: citas, laboratorio, stock, internación, facturas y recetas
        </p>
      </div>

      <Suspense fallback={<div className="text-sm text-muted-foreground">Cargando bandeja...</div>}>
        <NotificationsInbox
          data={data}
          unreadCount={unreadCount}
          initialSearch={search}
          initialKind={kind ?? ''}
          initialUnreadOnly={unreadOnly}
        />
      </Suspense>
    </div>
  );
}
