import Link from 'next/link';
import { Stethoscope } from 'lucide-react';
import { countMyPendingConsultations } from '@/actions/consultations';
import { getSessionContext } from '@/lib/session';
import { INVITABLE_ROLES, isClinicPathEntitled } from '@sincvete/shared';
import { cn } from '@/lib/utils';

interface DashboardConsultationAlertProps {
  entitledHrefs?: string[] | null;
}

export async function DashboardConsultationAlert({
  entitledHrefs = null,
}: DashboardConsultationAlertProps) {
  if (!isClinicPathEntitled('/consultas', entitledHrefs)) return null;

  const session = await getSessionContext();
  if (!session?.role || session.kind !== 'staff') return null;
  if (!INVITABLE_ROLES.includes(session.role)) return null;

  const count = await countMyPendingConsultations();
  if (count <= 0) return null;

  const message =
    count === 1
      ? 'Tenés 1 consulta pendiente'
      : `Tenés ${count} consultas pendientes`;

  return (
    <Link
      href="/consultas"
      className={cn(
        'sv-consultas-alert-blink flex items-center gap-3 rounded-xl border border-amber-400',
        'bg-amber-50 px-4 py-3 text-amber-950',
        'dark:border-amber-400 dark:bg-amber-950/40 dark:text-amber-50',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
      )}
      aria-live="polite"
    >
      <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-200 text-amber-900 dark:bg-amber-800 dark:text-amber-50">
        <Stethoscope className="h-5 w-5" aria-hidden />
      </span>
      <div className="min-w-0">
        <p className="text-sm font-semibold tracking-tight">{message}</p>
        <p className="text-xs text-amber-800/90 dark:text-amber-100/80">
          Abrí Consultas para atenderlas
        </p>
      </div>
      <span className="ml-auto rounded-md bg-amber-500 px-2.5 py-1 text-xs font-bold tabular-nums text-white">
        {count}
      </span>
    </Link>
  );
}
