'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Bell } from 'lucide-react';
import { listOwnerPortalAlerts, markOwnerPortalAlertsRead } from '@/actions/portal';
import { usePortalWaitingRoomLive } from '@/hooks/use-portal-waiting-room-live';
import { Button } from '@/components/ui/button';
import type { OwnerPortalAlert } from '@sincvete/shared';

export function PortalWaitingRoomAlerts() {
  const [alerts, setAlerts] = useState<OwnerPortalAlert[]>([]);
  const notifiedIds = useRef(new Set<string>());

  const refresh = useCallback(async () => {
    try {
      const next = await listOwnerPortalAlerts(true);
      setAlerts(next);

      for (const alert of next) {
        if (notifiedIds.current.has(alert.id)) continue;
        notifiedIds.current.add(alert.id);
        if (typeof window === 'undefined' || !('Notification' in window)) continue;
        if (Notification.permission === 'granted') {
          try {
            new Notification(alert.title, {
              body: alert.body ?? undefined,
              tag: alert.id,
            });
          } catch {
            // ignore Notification constructor errors (e.g. insecure context)
          }
        }
      }
    } catch (error) {
      console.error('[portal alerts] refresh failed', error);
    }
  }, []);

  usePortalWaitingRoomLive(() => {
    void refresh();
  });

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    if (Notification.permission === 'default') {
      void Notification.requestPermission();
    }
  }, []);

  if (alerts.length === 0) return null;

  const top = alerts[0];

  const dismiss = () => {
    const ids = alerts.map((a) => a.id);
    const previous = alerts;
    setAlerts([]);
    void (async () => {
      const result = await markOwnerPortalAlertsRead(ids);
      if (!result.success) {
        setAlerts(previous);
        console.error('[portal alerts] dismiss failed', result.error);
      }
    })();
  };

  return (
    <div className="mb-4 rounded-xl border border-emerald-300 bg-emerald-50 p-4 dark:border-emerald-800 dark:bg-emerald-950/40">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex gap-3">
          <Bell className="mt-0.5 h-5 w-5 text-emerald-700 dark:text-emerald-300" />
          <div>
            <p className="font-semibold text-emerald-900 dark:text-emerald-100">{top.title}</p>
            {top.body && (
              <p className="mt-1 text-sm text-emerald-800 dark:text-emerald-200">{top.body}</p>
            )}
            {alerts.length > 1 && (
              <p className="mt-1 text-xs text-emerald-700/80 dark:text-emerald-300/80">
                +{alerts.length - 1} aviso{alerts.length - 1 === 1 ? '' : 's'} más
              </p>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" asChild>
            <Link href={top.href || '/portal/sala-espera'}>Ver sala</Link>
          </Button>
          <Button size="sm" variant="outline" onClick={dismiss}>
            Entendido
          </Button>
        </div>
      </div>
    </div>
  );
}
