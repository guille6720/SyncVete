import { getOwnerAppData } from '@/actions/owner-app';
import { ownerAppEnabled } from '@/lib/owner-app';
import { notFound } from 'next/navigation';
import { Bell } from 'lucide-react';
import { formatDashboardDateTime } from '@sincvete/shared';
import {
  ownerAppNeonCard,
  ownerAppNeonIcon,
  ownerAppNeonToneAt,
} from '@/components/portal/owner-app-neon';
import { cn } from '@/lib/utils';

export default async function OwnerNotificationsPage() {
  if (!ownerAppEnabled()) notFound();
  const { reminders } = await getOwnerAppData();
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Avisos</h1>
      <p className="text-sm text-muted-foreground">
        Recordatorios de vacunas y turnos: el día anterior y el mismo día a las 08:00, según la zona
        horaria de tu veterinaria.
      </p>
      {reminders.map((row, index) => {
        const tone = ownerAppNeonToneAt(index + 4);
        return (
          <article
            key={row.id}
            className={ownerAppNeonCard(tone, 'flex gap-3 rounded-2xl p-4')}
          >
            <Bell className={cn('h-5 w-5 shrink-0', ownerAppNeonIcon(tone))} />
            <div>
              <p className="text-sm">{row.message}</p>
              <p className="mt-2 text-xs text-muted-foreground">
                {formatDashboardDateTime(row.created_at)}
              </p>
            </div>
          </article>
        );
      })}
      {!reminders.length && (
        <p className={ownerAppNeonCard('amber', 'rounded-2xl p-5 text-sm')}>
          No tenés avisos pendientes.
        </p>
      )}
    </div>
  );
}
