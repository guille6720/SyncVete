'use client';

import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';
import { ChevronLeft, ChevronRight, Search } from 'lucide-react';
import {
  markAllNotificationsRead,
  openNotification,
} from '@/actions/notifications';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { useDebouncedValue } from '@/lib/hooks/use-debounced-value';
import { cn } from '@/lib/utils';
import {
  NOTIFICATION_KINDS,
  NOTIFICATION_KIND_LABELS,
  NOTIFICATION_KIND_VARIANT,
  formatRelativeTime,
  isNotificationUnread,
  type PaginatedResult,
  type StaffNotificationListRow,
} from '@sincvete/shared';

interface NotificationsInboxProps {
  data: PaginatedResult<StaffNotificationListRow>;
  unreadCount: number;
  initialSearch?: string;
  initialKind?: string;
  initialUnreadOnly?: boolean;
}

export function NotificationsInbox({
  data,
  unreadCount,
  initialSearch = '',
  initialKind = '',
  initialUnreadOnly = false,
}: NotificationsInboxProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [search, setSearch] = useState(initialSearch);
  const debouncedSearch = useDebouncedValue(search);
  const [, startTransition] = useTransition();

  useEffect(() => {
    const current = searchParams.get('search') ?? '';
    if (debouncedSearch === current) return;

    const params = new URLSearchParams(searchParams.toString());
    if (debouncedSearch) params.set('search', debouncedSearch);
    else params.delete('search');
    params.delete('page');

    startTransition(() => {
      router.replace(`${pathname}?${params.toString()}`);
    });
  }, [debouncedSearch, pathname, router, searchParams]);

  const goToPage = (page: number) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('page', String(page));
    router.push(`${pathname}?${params.toString()}`);
  };

  const setKind = (kind: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (kind) params.set('kind', kind);
    else params.delete('kind');
    params.delete('page');
    router.push(`${pathname}?${params.toString()}`);
  };

  const setUnreadOnly = (value: boolean) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set('unread', '1');
    else params.delete('unread');
    params.delete('page');
    router.push(`${pathname}?${params.toString()}`);
  };

  const handleOpen = async (notification: StaffNotificationListRow) => {
    const result = await openNotification(notification.id);
    if (!result.success || !result.data) return;
    startTransition(() => {
      router.push(result.data!.href);
      router.refresh();
    });
  };

  const handleMarkAll = async () => {
    const result = await markAllNotificationsRead();
    if (result.success) router.refresh();
  };

  return (
    <div className="space-y-4" data-tour="notificaciones-list">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold" data-tour="notificaciones-read">Bandeja</h2>
          <p className="text-sm text-muted-foreground">
            {unreadCount} sin leer
          </p>
        </div>
        {unreadCount > 0 && (
          <Button variant="outline" size="sm" onClick={handleMarkAll}>
            Marcar todas como leídas
          </Button>
        )}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative max-w-md flex-1" data-tour="notificaciones-search">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar por título..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select
          value={initialKind}
          onChange={(e) => setKind(e.target.value)}
          className="w-full sm:w-48"
        >
          <option value="">Todos los tipos</option>
          {NOTIFICATION_KINDS.map((kind) => (
            <option key={kind} value={kind}>
              {NOTIFICATION_KIND_LABELS[kind]}
            </option>
          ))}
        </Select>
        <Select
          value={initialUnreadOnly ? '1' : ''}
          onChange={(e) => setUnreadOnly(e.target.value === '1')}
          className="w-full sm:w-44"
        >
          <option value="">Todas</option>
          <option value="1">Solo no leídas</option>
        </Select>
      </div>

      {data.data.length === 0 ? (
        <div className="rounded-lg border border-dashed p-10 text-center">
          <p className="text-sm text-muted-foreground">No hay notificaciones.</p>
        </div>
      ) : (
        <>
          <ul className="divide-y rounded-lg border">
            {data.data.map((item) => {
              const unread = isNotificationUnread(item.read_at);
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => handleOpen(item)}
                    className={cn(
                      'flex w-full flex-col gap-1 px-4 py-3 text-left hover:bg-accent/60',
                      unread && 'bg-accent/40'
                    )}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <p className={cn('font-medium', unread && 'text-foreground')}>{item.title}</p>
                      <Badge variant={NOTIFICATION_KIND_VARIANT[item.kind]}>
                        {NOTIFICATION_KIND_LABELS[item.kind]}
                      </Badge>
                      {unread && (
                        <span className="text-xs font-medium text-primary">Nueva</span>
                      )}
                    </div>
                    {item.body && (
                      <p className="text-sm text-muted-foreground">{item.body}</p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      {formatRelativeTime(item.created_at)}
                    </p>
                  </button>
                </li>
              );
            })}
          </ul>

          {data.totalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                {data.total} aviso{data.total !== 1 ? 's' : ''} · Página {data.page} de{' '}
                {data.totalPages}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={data.page <= 1}
                  onClick={() => goToPage(data.page - 1)}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={data.page >= data.totalPages}
                  onClick={() => goToPage(data.page + 1)}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
