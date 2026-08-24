import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import {
  BarChart3,
  BedDouble,
  Calendar,
  FlaskConical,
  Package,
  PawPrint,
  Receipt,
  Scissors,
  Settings,
  Stethoscope,
  Syringe,
  UserPlus,
  Bell,
  Sparkles,
  MessageCircle,
  Pill,
  Banknote,
  Images,
  Inbox,
  ScrollText,
  Users,
  Zap,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { isClinicPathEntitled } from '@sincvete/shared';

interface DashboardQuickActionsProps {
  canWritePatients: boolean;
  entitledHrefs?: string[] | null;
}

const ACTIONS: Array<{
  label: string;
  href: string;
  icon: LucideIcon;
  requiresWrite: boolean;
  tone: string;
}> = [
  {
    label: 'Ver agenda',
    href: '/agenda',
    icon: Calendar,
    requiresWrite: false,
    tone: 'bg-indigo-100 text-indigo-800 ring-indigo-200 hover:bg-indigo-200/80',
  },
  {
    label: 'Sala de espera',
    href: '/sala-espera',
    icon: Users,
    requiresWrite: false,
    tone: 'bg-teal-100 text-teal-800 ring-teal-200 hover:bg-teal-200/80',
  },
  {
    label: 'Nueva consulta',
    href: '/consultas/nueva',
    icon: Stethoscope,
    requiresWrite: false,
    tone: 'bg-emerald-100 text-emerald-800 ring-emerald-200 hover:bg-emerald-200/80',
  },
  {
    label: 'Nuevo paciente',
    href: '/pacientes/nuevo',
    icon: PawPrint,
    requiresWrite: true,
    tone: 'bg-teal-100 text-teal-800 ring-teal-200 hover:bg-teal-200/80',
  },
  {
    label: 'Nueva receta',
    href: '/farmacia/nueva',
    icon: Pill,
    requiresWrite: false,
    tone: 'bg-sky-100 text-sky-800 ring-sky-200 hover:bg-sky-200/80',
  },
  {
    label: 'Nueva entrada clínica',
    href: '/historia-clinica/nuevo',
    icon: Stethoscope,
    requiresWrite: false,
    tone: 'bg-cyan-100 text-cyan-800 ring-cyan-200 hover:bg-cyan-200/80',
  },
  {
    label: 'Nuevo propietario',
    href: '/propietarios/nuevo',
    icon: UserPlus,
    requiresWrite: true,
    tone: 'bg-sky-100 text-sky-800 ring-sky-200 hover:bg-sky-200/80',
  },
  {
    label: 'Admitir internación',
    href: '/internacion/nueva',
    icon: BedDouble,
    requiresWrite: false,
    tone: 'bg-rose-100 text-rose-800 ring-rose-200 hover:bg-rose-200/80',
  },
  {
    label: 'Registrar vacuna',
    href: '/vacunacion/nueva',
    icon: Syringe,
    requiresWrite: false,
    tone: 'bg-amber-100 text-amber-800 ring-amber-200 hover:bg-amber-200/80',
  },
  {
    label: 'Programar cirugía',
    href: '/cirugias/nueva',
    icon: Scissors,
    requiresWrite: false,
    tone: 'bg-orange-100 text-orange-800 ring-orange-200 hover:bg-orange-200/80',
  },
  {
    label: 'Orden de laboratorio',
    href: '/laboratorio/nueva',
    icon: FlaskConical,
    requiresWrite: false,
    tone: 'bg-lime-100 text-lime-800 ring-lime-200 hover:bg-lime-200/80',
  },
  {
    label: 'Nuevo producto',
    href: '/inventario/nuevo',
    icon: Package,
    requiresWrite: false,
    tone: 'bg-slate-100 text-slate-800 ring-slate-200 hover:bg-slate-200/80',
  },
  {
    label: 'Subir imagen',
    href: '/imagenes/nueva',
    icon: Images,
    requiresWrite: false,
    tone: 'bg-indigo-100 text-indigo-800 ring-indigo-200 hover:bg-indigo-200/80',
  },
  {
    label: 'Nueva factura',
    href: '/facturacion/nueva',
    icon: Receipt,
    requiresWrite: false,
    tone: 'bg-emerald-100 text-emerald-800 ring-emerald-200 hover:bg-emerald-200/80',
  },
  {
    label: 'Caja',
    href: '/caja',
    icon: Banknote,
    requiresWrite: false,
    tone: 'bg-teal-100 text-teal-800 ring-teal-200 hover:bg-teal-200/80',
  },
  {
    label: 'Ver reportes',
    href: '/reportes',
    icon: BarChart3,
    requiresWrite: false,
    tone: 'bg-cyan-100 text-cyan-800 ring-cyan-200 hover:bg-cyan-200/80',
  },
  {
    label: 'Auditoría',
    href: '/auditoria',
    icon: ScrollText,
    requiresWrite: false,
    tone: 'bg-slate-100 text-slate-800 ring-slate-200 hover:bg-slate-200/80',
  },
  {
    label: 'WhatsApp',
    href: '/whatsapp',
    icon: MessageCircle,
    requiresWrite: false,
    tone: 'bg-lime-100 text-lime-800 ring-lime-200 hover:bg-lime-200/80',
  },
  {
    label: 'Recordatorios',
    href: '/recordatorios',
    icon: Bell,
    requiresWrite: false,
    tone: 'bg-amber-100 text-amber-800 ring-amber-200 hover:bg-amber-200/80',
  },
  {
    label: 'Notificaciones',
    href: '/notificaciones',
    icon: Inbox,
    requiresWrite: false,
    tone: 'bg-rose-100 text-rose-800 ring-rose-200 hover:bg-rose-200/80',
  },
  {
    label: 'IA clínica',
    href: '/ia-clinica',
    icon: Sparkles,
    requiresWrite: false,
    tone: 'bg-emerald-100 text-emerald-800 ring-emerald-200 hover:bg-emerald-200/80',
  },
  {
    label: 'Configuración',
    href: '/configuracion',
    icon: Settings,
    requiresWrite: false,
    tone: 'bg-slate-100 text-slate-700 ring-slate-200 hover:bg-slate-200/80',
  },
];

export function DashboardQuickActions({
  canWritePatients,
  entitledHrefs = null,
}: DashboardQuickActionsProps) {
  const visibleActions = ACTIONS.filter(
    (action) =>
      (!action.requiresWrite || canWritePatients) &&
      isClinicPathEntitled(action.href, entitledHrefs)
  );

  return (
    <section className="rounded-xl border border-teal-200/70 bg-card/95 p-5 text-card-foreground shadow-sm backdrop-blur-sm dark:border-teal-800">
      <div className="mb-4 flex items-center gap-2">
        <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-teal-100 text-teal-700 dark:bg-teal-900 dark:text-teal-200">
          <Zap className="h-4 w-4" />
        </span>
        <div>
          <h2 className="text-base font-semibold text-foreground">Acciones rápidas</h2>
          <p className="text-sm text-muted-foreground">Operaciones frecuentes en 1 clic</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {visibleActions.map((action) => (
          <Link
            key={action.href}
            href={action.href}
            className={cn(
              'inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium ring-1 transition-colors',
              action.tone
            )}
          >
            <action.icon className="h-4 w-4" />
            {action.label}
          </Link>
        ))}
      </div>
    </section>
  );
}
