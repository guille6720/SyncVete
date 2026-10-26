import { Badge } from '@/components/ui/badge';
import {
  APP_TIMEZONE,
  MANAGED_USER_STATUS_LABELS,
  ROLE_LABELS,
  type ManagedUserStatus,
  type Role,
} from '@sincvete/shared';

const STATUS_VARIANTS: Record<ManagedUserStatus, 'success' | 'warning' | 'destructive' | 'default'> = {
  active: 'success',
  invited: 'default',
  suspended: 'warning',
  disabled: 'destructive',
};

export function UserStatusBadge({ status }: { status: ManagedUserStatus }) {
  return <Badge variant={STATUS_VARIANTS[status]}>{MANAGED_USER_STATUS_LABELS[status]}</Badge>;
}

export function managedRoleLabel(role: Role): string {
  return role === 'owner' ? 'Administrador central' : ROLE_LABELS[role];
}

const dateTimeFormatter = new Intl.DateTimeFormat('es-AR', {
  timeZone: APP_TIMEZONE,
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : dateTimeFormatter.format(date);
}
