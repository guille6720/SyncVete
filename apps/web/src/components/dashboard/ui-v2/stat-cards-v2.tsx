import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import {
  Banknote,
  BedDouble,
  Bell,
  Calendar,
  FlaskConical,
  Images,
  Inbox,
  Package,
  PawPrint,
  Pill,
  Receipt,
  Scissors,
  ScrollText,
  Stethoscope,
  Syringe,
  TrendingUp,
  Users,
} from 'lucide-react';
import { getCurrentMonthLabel, isClinicPathEntitled, type DashboardSummary } from '@sincvete/shared';
import { cn } from '@/lib/utils';
import { SurfaceCard } from '@/components/ui-v2/surface-card';

type StatTone =
  | 'teal'
  | 'sky'
  | 'emerald'
  | 'amber'
  | 'rose'
  | 'cyan'
  | 'orange'
  | 'slate'
  | 'lime';

const TONE: Record<StatTone, string> = {
  teal: 'bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-200',
  sky: 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200',
  emerald: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200',
  amber: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200',
  rose: 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-200',
  cyan: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-950 dark:text-cyan-200',
  orange: 'bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-200',
  slate: 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200',
  lime: 'bg-lime-100 text-lime-800 dark:bg-lime-950 dark:text-lime-200',
};

type StatGroup = 'actionable' | 'priority' | 'secondary';

interface DashboardStatCardsV2Props {
  summary: DashboardSummary;
  entitledHrefs?: string[] | null;
  variant?: StatGroup | 'all';
}

export function DashboardStatCardsV2({
  summary,
  entitledHrefs = null,
  variant = 'all',
}: DashboardStatCardsV2Props) {
  const monthLabel = getCurrentMonthLabel();

  const stats: Array<{
    label: string;
    value: number;
    description: string;
    icon: LucideIcon;
    href?: string;
    tone: StatTone;
    group: StatGroup;
    /** Pending / actionable metric — emphasize when count > 0. */
    pending?: boolean;
  }> = [
    {
      label: 'Vacunas vencidas',
      value: summary.vaccinationsOverdue,
      description: 'Última dosis por vacuna',
      icon: Syringe,
      href: '/vacunacion',
      tone: 'amber',
      group: 'actionable',
      pending: true,
    },
    {
      label: 'Recetas activas',
      value: summary.prescriptionsActive,
      description: 'Pendientes de dispensar',
      icon: Pill,
      href: '/farmacia',
      tone: 'sky',
      group: 'actionable',
      pending: true,
    },
    {
      label: 'Lab pendientes',
      value: summary.labOrdersPending,
      description: 'Solicitadas o en proceso',
      icon: FlaskConical,
      href: '/laboratorio',
      tone: 'orange',
      group: 'actionable',
      pending: true,
    },
    {
      label: 'Recordatorios',
      value: summary.remindersPending,
      description: 'Turnos, vacunas y saldos por avisar',
      icon: Bell,
      href: '/recordatorios',
      tone: 'rose',
      group: 'actionable',
      pending: true,
    },
    {
      label: 'Citas hoy',
      value: summary.appointmentsToday,
      description: 'Agenda del día',
      icon: Calendar,
      href: '/agenda',
      tone: 'teal',
      group: 'priority',
    },
    {
      label: 'Consultas del mes',
      value: summary.consultationsThisMonth,
      description: `Sala / atención · ${monthLabel}`,
      icon: Stethoscope,
      href: '/consultas',
      tone: 'cyan',
      group: 'priority',
    },
    {
      label: 'Pacientes activos',
      value: summary.activePatients,
      description: 'Sin fallecer ni inactivos',
      icon: PawPrint,
      href: '/pacientes',
      tone: 'teal',
      group: 'priority',
    },
    {
      label: 'Internados',
      value: summary.hospitalizationsActive,
      description: 'Internación u observación',
      icon: BedDouble,
      href: '/internacion',
      tone: 'rose',
      group: 'priority',
      pending: true,
    },
    {
      label: 'Tutores activos',
      value: summary.activeOwners,
      description: 'Tutores registrados',
      icon: Users,
      href: '/tutores',
      tone: 'sky',
      group: 'secondary',
    },
    {
      label: 'Altas del mes',
      value: summary.patientsThisMonth + summary.ownersThisMonth,
      description: `${summary.patientsThisMonth} pacientes · ${summary.ownersThisMonth} tutores · ${monthLabel}`,
      icon: TrendingUp,
      tone: 'emerald',
      group: 'secondary',
    },
    {
      label: 'En quirófano',
      value: summary.surgeriesActive,
      description: 'En curso o recuperación',
      icon: Scissors,
      href: '/cirugias',
      tone: 'orange',
      group: 'secondary',
      pending: true,
    },
    {
      label: 'Stock bajo',
      value: summary.inventoryLowStock,
      description: 'En o bajo el mínimo',
      icon: Package,
      href: '/inventario',
      tone: 'amber',
      group: 'secondary',
      pending: true,
    },
    {
      label: 'Por cobrar',
      value: summary.invoicesOpen,
      description: 'Facturas emitidas con saldo',
      icon: Receipt,
      href: '/facturacion',
      tone: 'emerald',
      group: 'secondary',
      pending: true,
    },
    {
      label: 'Caja abierta',
      value: summary.cashSessionsOpen,
      description: 'Turnos de caja sin cerrar',
      icon: Banknote,
      href: '/caja',
      tone: 'teal',
      group: 'secondary',
    },
    {
      label: 'Imágenes del mes',
      value: summary.clinicalImagesThisMonth,
      description: `Subidas · ${monthLabel}`,
      icon: Images,
      href: '/imagenes',
      tone: 'cyan',
      group: 'secondary',
    },
    {
      label: 'Sin leer',
      value: summary.notificationsUnread,
      description: 'Avisos de la clínica',
      icon: Inbox,
      href: '/notificaciones',
      tone: 'rose',
      group: 'secondary',
      pending: true,
    },
    {
      label: 'Auditoría hoy',
      value: summary.auditEventsToday,
      description: 'Eventos registrados',
      icon: ScrollText,
      href: '/auditoria',
      tone: 'slate',
      group: 'secondary',
    },
  ];

  const visible = (
    variant === 'all' ? stats : stats.filter((stat) => stat.group === variant)
  ).filter((stat) => !stat.href || isClinicPathEntitled(stat.href, entitledHrefs));

  if (visible.length === 0) return null;

  return (
    <div
      className={cn(
        'grid min-w-0 gap-3 sm:grid-cols-2',
        variant === 'actionable' ? 'xl:grid-cols-4' : 'xl:grid-cols-3 2xl:grid-cols-4'
      )}
    >
      {visible.map((stat) => {
        const needsAttention = Boolean(stat.pending && stat.value > 0);
        const body = (
          <SurfaceCard
            padding="sm"
            className={cn(
              'h-full min-w-0 transition-colors hover:bg-[var(--clinic-soft)]/50',
              needsAttention
                ? 'border-amber-300/80 bg-amber-50/60 ring-1 ring-amber-200/70 dark:border-amber-800 dark:bg-amber-950/30 dark:ring-amber-900/50'
                : 'hover:border-primary/35'
            )}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 space-y-1">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {stat.label}
                </p>
                <p className="font-display text-2xl font-semibold tabular-nums tracking-tight text-foreground">
                  {stat.value}
                </p>
                <p className="text-xs text-muted-foreground">{stat.description}</p>
                {needsAttention ? (
                  <p className="text-[11px] font-medium text-amber-800 dark:text-amber-200">
                    Requiere atención
                  </p>
                ) : null}
              </div>
              <span
                className={cn(
                  'inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg',
                  TONE[stat.tone]
                )}
              >
                <stat.icon className="h-5 w-5" aria-hidden />
              </span>
            </div>
          </SurfaceCard>
        );

        return stat.href ? (
          <Link
            key={stat.label}
            href={stat.href}
            className="block min-w-0 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {body}
          </Link>
        ) : (
          <div key={stat.label} className="min-w-0">
            {body}
          </div>
        );
      })}
    </div>
  );
}
