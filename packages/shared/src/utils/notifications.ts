import {
  NOTIFICATION_KINDS,
  type NotificationKind,
} from '../constants/notifications';

const KIND_HREF: Record<NotificationKind, (id: string) => string> = {
  cita: (id) => `/agenda/${id}`,
  laboratorio: (id) => `/laboratorio/${id}`,
  stock: (id) => `/inventario/${id}`,
  internacion: (id) => `/internacion/${id}`,
  factura: (id) => `/facturacion/${id}`,
  receta: (id) => `/farmacia/${id}`,
  plan: () => '/configuracion?tab=plan',
  migracion: () => '/configuracion?tab=import-export',
};

export function isNotificationKind(value: string): value is NotificationKind {
  return (NOTIFICATION_KINDS as readonly string[]).includes(value);
}

export function isNotificationUnread(readAt: string | null | undefined): boolean {
  return !readAt;
}

export function buildNotificationHref(kind: NotificationKind, relatedId: string): string {
  return KIND_HREF[kind](relatedId);
}

export function isSafeNotificationHref(href: string): boolean {
  return href.startsWith('/') && !href.startsWith('//') && !href.includes('://');
}
