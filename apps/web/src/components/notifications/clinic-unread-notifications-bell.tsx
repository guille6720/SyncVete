import { countUnreadNotifications } from '@/actions/notifications';
import { NotificationBell } from '@/components/notifications/notification-bell';

/** Streams unread badge off the clinic layout critical path. */
export async function ClinicUnreadNotificationsBell() {
  const unreadCount = await countUnreadNotifications();
  return <NotificationBell unreadCount={unreadCount} />;
}
