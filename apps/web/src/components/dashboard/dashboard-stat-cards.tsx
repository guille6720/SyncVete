import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import {
  BedDouble,
  Calendar,
  FlaskConical,
  Package,
  PawPrint,
  Bell,
  Receipt,
  Scissors,
  Syringe,
  TrendingUp,
  Users,
  Pill,
  Banknote,
  Images,
  Inbox,
  ScrollText,
  Stethoscope,
} from 'lucide-react';
import { getCurrentMonthLabel, isClinicPathEntitled, type DashboardSummary } from '@sincvete/shared';
import { cn } from '@/lib/utils';

interface DashboardStatCardsProps {
  summary: DashboardSummary;
  entitledHrefs?: string[] | null;
  /** priority = ops del día; secondary = resto; all = legacy completo */
  variant?: 'priority' | 'secondary' | 'all';
}

type StatTone = 'teal' | 'sky' | 'emerald' | 'amber' | 'rose' | 'cyan' | 'orange' | 'slate' | 'indigo' | 'lime';

const TONE_STYLES: Record<
  StatTone,
  { card: string; iconWrap: string; icon: string; value: string }
> = {
  teal: {
    card: 'border-teal-200/80 bg-gradient-to-br from-teal-50 to-white hover:border-teal-300 dark:border-teal-800 dark:from-teal-950/60 dark:to-slate-900 dark:hover:border-teal-600',
    iconWrap: 'bg-teal-100 text-teal-700 dark:bg-teal-900 dark:text-teal-200',
    icon: 'text-teal-700 dark:text-teal-200',
    value: 'text-teal-950 dark:text-teal-50',
  },
  sky: {
    card: 'border-sky-200/80 bg-gradient-to-br from-sky-50 to-white hover:border-sky-300 dark:border-sky-800 dark:from-sky-950/60 dark:to-slate-900 dark:hover:border-sky-600',
    iconWrap: 'bg-sky-100 text-sky-700 dark:bg-sky-900 dark:text-sky-200',
    icon: 'text-sky-700 dark:text-sky-200',
    value: 'text-sky-950 dark:text-sky-50',
  },
  emerald: {
    card: 'border-emerald-200/80 bg-gradient-to-br from-emerald-50 to-white hover:border-emerald-300 dark:border-emerald-800 dark:from-emerald-950/60 dark:to-slate-900 dark:hover:border-emerald-600',
    iconWrap: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-200',
    icon: 'text-emerald-700 dark:text-emerald-200',
    value: 'text-emerald-950 dark:text-emerald-50',
  },
  amber: {
    card: 'border-amber-200/80 bg-gradient-to-br from-amber-50 to-white hover:border-amber-300 dark:border-amber-800 dark:from-amber-950/60 dark:to-slate-900 dark:hover:border-amber-600',
    iconWrap: 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-200',
    icon: 'text-amber-700 dark:text-amber-200',
    value: 'text-amber-950 dark:text-amber-50',
  },
  rose: {
    card: 'border-rose-200/80 bg-gradient-to-br from-rose-50 to-white hover:border-rose-300 dark:border-rose-800 dark:from-rose-950/60 dark:to-slate-900 dark:hover:border-rose-600',
    iconWrap: 'bg-rose-100 text-rose-700 dark:bg-rose-900 dark:text-rose-200',
    icon: 'text-rose-700 dark:text-rose-200',
    value: 'text-rose-950 dark:text-rose-50',
  },
  cyan: {
    card: 'border-cyan-200/80 bg-gradient-to-br from-cyan-50 to-white hover:border-cyan-300 dark:border-cyan-800 dark:from-cyan-950/60 dark:to-slate-900 dark:hover:border-cyan-600',
    iconWrap: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900 dark:text-cyan-200',
    icon: 'text-cyan-700 dark:text-cyan-200',
    value: 'text-cyan-950 dark:text-cyan-50',
  },
  orange: {
    card: 'border-orange-200/80 bg-gradient-to-br from-orange-50 to-white hover:border-orange-300 dark:border-orange-800 dark:from-orange-950/60 dark:to-slate-900 dark:hover:border-orange-600',
    iconWrap: 'bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-200',
    icon: 'text-orange-700 dark:text-orange-200',
    value: 'text-orange-950 dark:text-orange-50',
  },
  slate: {
    card: 'border-slate-200/80 bg-gradient-to-br from-slate-50 to-white hover:border-slate-300 dark:border-slate-700 dark:from-slate-800 dark:to-slate-900 dark:hover:border-slate-500',
    iconWrap: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200',
    icon: 'text-slate-700 dark:text-slate-200',
    value: 'text-slate-950 dark:text-slate-50',
  },
  indigo: {
    card: 'border-indigo-200/80 bg-gradient-to-br from-indigo-50 to-white hover:border-indigo-300 dark:border-indigo-800 dark:from-indigo-950/60 dark:to-slate-900 dark:hover:border-indigo-600',
    iconWrap: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-200',
    icon: 'text-indigo-700 dark:text-indigo-200',
    value: 'text-indigo-950 dark:text-indigo-50',
  },
  lime: {
    card: 'border-lime-200/80 bg-gradient-to-br from-lime-50 to-white hover:border-lime-300 dark:border-lime-800 dark:from-lime-950/60 dark:to-slate-900 dark:hover:border-lime-600',
    iconWrap: 'bg-lime-100 text-lime-700 dark:bg-lime-900 dark:text-lime-200',
    icon: 'text-lime-700 dark:text-lime-200',
    value: 'text-lime-950 dark:text-lime-50',
  },
};

export function DashboardStatCards({
  summary,
  entitledHrefs = null,
  variant = 'all',
}: DashboardStatCardsProps) {
  const monthLabel = getCurrentMonthLabel();

  const stats: Array<{
    label: string;
    value: string;
    description: string;
    icon: LucideIcon;
    href?: string;
    tone: StatTone;
    group: 'priority' | 'secondary';
  }> = [
    {
      label: 'Citas hoy',
      value: String(summary.appointmentsToday),
      description: 'Agenda del día',
      icon: Calendar,
      href: '/agenda',
      tone: 'indigo',
      group: 'priority',
    },
    {
      label: 'Consultas del mes',
      value: String(summary.consultationsThisMonth),
      description: `Sala / atención · ${monthLabel}`,
      icon: Stethoscope,
      href: '/consultas',
      tone: 'cyan',
      group: 'priority',
    },
    {
      label: 'Pacientes activos',
      value: String(summary.activePatients),
      description: 'Sin fallecer ni inactivos',
      icon: PawPrint,
      href: '/pacientes',
      tone: 'teal',
      group: 'priority',
    },
    {
      label: 'Internados',
      value: String(summary.hospitalizationsActive),
      description: 'Internación u observación',
      icon: BedDouble,
      href: '/internacion',
      tone: 'rose',
      group: 'priority',
    },
    {
      label: 'Recetas activas',
      value: String(summary.prescriptionsActive),
      description: 'Pendientes de dispensar',
      icon: Pill,
      href: '/farmacia',
      tone: 'sky',
      group: 'priority',
    },
    {
      label: 'Vacunas vencidas',
      value: String(summary.vaccinationsOverdue),
      description: 'Última dosis por vacuna',
      icon: Syringe,
      href: '/vacunacion',
      tone: 'amber',
      group: 'priority',
    },
    {
      label: 'Tutores activos',
      value: String(summary.activeOwners),
      description: 'Tutores registrados',
      icon: Users,
      href: '/tutores',
      tone: 'sky',
      group: 'secondary',
    },
    {
      label: 'Altas del mes',
      value: String(summary.patientsThisMonth + summary.ownersThisMonth),
      description: `${summary.patientsThisMonth} pacientes · ${summary.ownersThisMonth} tutores · ${monthLabel}`,
      icon: TrendingUp,
      tone: 'emerald',
      group: 'secondary',
    },
    {
      label: 'En quirófano',
      value: String(summary.surgeriesActive),
      description: 'En curso o recuperación',
      icon: Scissors,
      href: '/cirugias',
      tone: 'orange',
      group: 'secondary',
    },
    {
      label: 'Lab pendientes',
      value: String(summary.labOrdersPending),
      description: 'Solicitadas o en proceso',
      icon: FlaskConical,
      href: '/laboratorio',
      tone: 'lime',
      group: 'secondary',
    },
    {
      label: 'Stock bajo',
      value: String(summary.inventoryLowStock),
      description: 'En o bajo el mínimo',
      icon: Package,
      href: '/inventario',
      tone: 'amber',
      group: 'secondary',
    },
    {
      label: 'Por cobrar',
      value: String(summary.invoicesOpen),
      description: 'Facturas emitidas con saldo',
      icon: Receipt,
      href: '/facturacion',
      tone: 'emerald',
      group: 'secondary',
    },
    {
      label: 'Caja abierta',
      value: String(summary.cashSessionsOpen),
      description: 'Turnos de caja sin cerrar',
      icon: Banknote,
      href: '/caja',
      tone: 'teal',
      group: 'secondary',
    },
    {
      label: 'Imágenes del mes',
      value: String(summary.clinicalImagesThisMonth),
      description: `Subidas · ${monthLabel}`,
      icon: Images,
      href: '/imagenes',
      tone: 'indigo',
      group: 'secondary',
    },
    {
      label: 'Sin leer',
      value: String(summary.notificationsUnread),
      description: 'Avisos de la clínica',
      icon: Inbox,
      href: '/notificaciones',
      tone: 'rose',
      group: 'secondary',
    },
    {
      label: 'Auditoría hoy',
      value: String(summary.auditEventsToday),
      description: 'Eventos registrados',
      icon: ScrollText,
      href: '/auditoria',
      tone: 'slate',
      group: 'secondary',
    },
    {
      label: 'Recordatorios',
      value: String(summary.remindersPending),
      description: 'Turnos, vacunas y saldos por avisar',
      icon: Bell,
      href: '/recordatorios',
      tone: 'orange',
      group: 'secondary',
    },
  ];

  const visible = (variant === 'all' ? stats : stats.filter((stat) => stat.group === variant)).filter(
    (stat) => !stat.href || isClinicPathEntitled(stat.href, entitledHrefs)
  );

  if (visible.length === 0) return null;

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
      {visible.map((stat) => {
        const tone = TONE_STYLES[stat.tone];
        const content = (
          <div
            className={cn(
              'group h-full rounded-xl border p-4 shadow-sm transition-all duration-200',
              tone.card,
              stat.href && 'hover:-translate-y-0.5 hover:shadow-md'
            )}
          >
            <div className="mb-3 flex items-start justify-between gap-3">
              <p className="text-sm font-medium text-slate-700 dark:text-slate-200">{stat.label}</p>
              <span
                className={cn(
                  'inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl',
                  tone.iconWrap
                )}
              >
                <stat.icon className={cn('h-5 w-5', tone.icon)} />
              </span>
            </div>
            <div className={cn('text-3xl font-bold tracking-tight', tone.value)}>{stat.value}</div>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{stat.description}</p>
          </div>
        );

        return stat.href ? (
          <Link key={stat.label} href={stat.href} className="block h-full">
            {content}
          </Link>
        ) : (
          <div key={stat.label} className="h-full">
            {content}
          </div>
        );
      })}
    </div>
  );
}
