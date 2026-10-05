import { getOwnerAppData } from '@/actions/owner-app';
import { ownerAppEnabled } from '@/lib/owner-app';
import { notFound } from 'next/navigation';
import { Bell } from 'lucide-react';
import { formatDashboardDateTime } from '@sincvete/shared';
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
      {reminders.map((row) => (
        <article key={row.id} className="flex gap-3 rounded-2xl border bg-card p-4">
          <Bell className="h-5 w-5 shrink-0 text-primary" />
          <div>
            <p className="text-sm">{row.message}</p>
            <p className="mt-2 text-xs text-muted-foreground">
              {formatDashboardDateTime(row.created_at)}
            </p>
          </div>
        </article>
      ))}
      {!reminders.length && (
        <p className="rounded-2xl bg-muted p-5 text-sm">No tenés avisos pendientes.</p>
      )}
    </div>
  );
}
