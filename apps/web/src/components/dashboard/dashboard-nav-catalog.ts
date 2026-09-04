import type { LucideIcon } from 'lucide-react';
import {
  BarChart3,
  BedDouble,
  Briefcase,
  Calendar,
  FlaskConical,
  Images,
  Inbox,
  MessageCircle,
  Package,
  PawPrint,
  Pill,
  Receipt,
  Banknote,
  Bell,
  ScrollText,
  Scissors,
  Settings,
  Sparkles,
  Stethoscope,
  Syringe,
  UserPlus,
  Users,
  Wallet,
} from 'lucide-react';

/** Stable IDs — future user-configurable quick actions can reference these. */
export type DashboardNavActionId =
  | 'waiting-room'
  | 'new-consultation'
  | 'new-prescription'
  | 'new-clinical-entry'
  | 'lab-order'
  | 'upload-image'
  | 'clinical-ai'
  | 'new-patient'
  | 'new-owner'
  | 'view-agenda'
  | 'register-vaccine'
  | 'schedule-surgery'
  | 'reminders'
  | 'admit-hospitalization'
  | 'new-product'
  | 'new-invoice'
  | 'cash-register'
  | 'professionals'
  | 'new-professional'
  | 'professional-settlements'
  | 'reports'
  | 'audit'
  | 'whatsapp'
  | 'notifications'
  | 'settings';

export type DashboardNavGroupId =
  | 'clinical'
  | 'patients'
  | 'agenda'
  | 'hospitalization'
  | 'management'
  | 'professionals'
  | 'reports'
  | 'communication'
  | 'settings';

export interface DashboardNavAction {
  id: DashboardNavActionId;
  label: string;
  href: string;
  icon: LucideIcon;
  requiresWrite: boolean;
  tone: string;
  groupId: DashboardNavGroupId;
}

export interface DashboardNavGroup {
  id: DashboardNavGroupId;
  label: string;
  icon: LucideIcon;
  tone: string;
}

export const DASHBOARD_NAV_GROUPS: DashboardNavGroup[] = [
  {
    id: 'clinical',
    label: 'Clínica',
    icon: Stethoscope,
    tone: 'bg-emerald-100 text-emerald-800 ring-emerald-200 hover:bg-emerald-200/80 dark:bg-emerald-950 dark:text-emerald-200 dark:ring-emerald-800 dark:hover:bg-emerald-900/80',
  },
  {
    id: 'patients',
    label: 'Pacientes',
    icon: PawPrint,
    tone: 'bg-teal-100 text-teal-800 ring-teal-200 hover:bg-teal-200/80 dark:bg-teal-950 dark:text-teal-200 dark:ring-teal-800 dark:hover:bg-teal-900/80',
  },
  {
    id: 'agenda',
    label: 'Agenda',
    icon: Calendar,
    tone: 'bg-indigo-100 text-indigo-800 ring-indigo-200 hover:bg-indigo-200/80 dark:bg-indigo-950 dark:text-indigo-200 dark:ring-indigo-800 dark:hover:bg-indigo-900/80',
  },
  {
    id: 'hospitalization',
    label: 'Internación',
    icon: BedDouble,
    tone: 'bg-rose-100 text-rose-800 ring-rose-200 hover:bg-rose-200/80 dark:bg-rose-950 dark:text-rose-200 dark:ring-rose-800 dark:hover:bg-rose-900/80',
  },
  {
    id: 'management',
    label: 'Gestión',
    icon: Package,
    tone: 'bg-slate-100 text-slate-800 ring-slate-200 hover:bg-slate-200/80 dark:bg-slate-900 dark:text-slate-200 dark:ring-slate-700 dark:hover:bg-slate-800/80',
  },
  {
    id: 'professionals',
    label: 'Profesionales',
    icon: Briefcase,
    tone: 'bg-violet-100 text-violet-800 ring-violet-200 hover:bg-violet-200/80 dark:bg-violet-950 dark:text-violet-200 dark:ring-violet-800 dark:hover:bg-violet-900/80',
  },
  {
    id: 'reports',
    label: 'Reportes',
    icon: BarChart3,
    tone: 'bg-cyan-100 text-cyan-800 ring-cyan-200 hover:bg-cyan-200/80 dark:bg-cyan-950 dark:text-cyan-200 dark:ring-cyan-800 dark:hover:bg-cyan-900/80',
  },
  {
    id: 'communication',
    label: 'Comunicación',
    icon: MessageCircle,
    tone: 'bg-lime-100 text-lime-800 ring-lime-200 hover:bg-lime-200/80 dark:bg-lime-950 dark:text-lime-200 dark:ring-lime-800 dark:hover:bg-lime-900/80',
  },
  {
    id: 'settings',
    label: 'Configuración',
    icon: Settings,
    tone: 'bg-slate-100 text-slate-700 ring-slate-200 hover:bg-slate-200/80 dark:bg-slate-900 dark:text-slate-200 dark:ring-slate-700 dark:hover:bg-slate-800/80',
  },
];

const ACTION_TONE =
  'bg-muted/80 text-foreground ring-border hover:bg-muted dark:bg-muted/40 dark:hover:bg-muted/70';

/** Full action catalog — routes unchanged from prior Acciones rápidas. */
export const DASHBOARD_NAV_ACTIONS: DashboardNavAction[] = [
  {
    id: 'waiting-room',
    label: 'Sala de espera',
    href: '/sala-espera',
    icon: Users,
    requiresWrite: false,
    tone: 'bg-teal-100 text-teal-800 ring-teal-200 hover:bg-teal-200/80 dark:bg-teal-950 dark:text-teal-200 dark:ring-teal-800',
    groupId: 'clinical',
  },
  {
    id: 'new-consultation',
    label: 'Nueva consulta',
    href: '/consultas/nueva',
    icon: Stethoscope,
    requiresWrite: false,
    tone: 'bg-emerald-100 text-emerald-800 ring-emerald-200 hover:bg-emerald-200/80 dark:bg-emerald-950 dark:text-emerald-200 dark:ring-emerald-800',
    groupId: 'clinical',
  },
  {
    id: 'new-prescription',
    label: 'Nueva receta',
    href: '/farmacia/nueva',
    icon: Pill,
    requiresWrite: false,
    tone: 'bg-sky-100 text-sky-800 ring-sky-200 hover:bg-sky-200/80 dark:bg-sky-950 dark:text-sky-200 dark:ring-sky-800',
    groupId: 'clinical',
  },
  {
    id: 'new-clinical-entry',
    label: 'Nueva entrada clínica',
    href: '/historia-clinica/nuevo',
    icon: Stethoscope,
    requiresWrite: false,
    tone: 'bg-cyan-100 text-cyan-800 ring-cyan-200 hover:bg-cyan-200/80 dark:bg-cyan-950 dark:text-cyan-200 dark:ring-cyan-800',
    groupId: 'clinical',
  },
  {
    id: 'lab-order',
    label: 'Orden de laboratorio',
    href: '/laboratorio/nueva',
    icon: FlaskConical,
    requiresWrite: false,
    tone: 'bg-lime-100 text-lime-800 ring-lime-200 hover:bg-lime-200/80 dark:bg-lime-950 dark:text-lime-200 dark:ring-lime-800',
    groupId: 'clinical',
  },
  {
    id: 'upload-image',
    label: 'Subir imagen',
    href: '/imagenes/nueva',
    icon: Images,
    requiresWrite: false,
    tone: 'bg-indigo-100 text-indigo-800 ring-indigo-200 hover:bg-indigo-200/80 dark:bg-indigo-950 dark:text-indigo-200 dark:ring-indigo-800',
    groupId: 'clinical',
  },
  {
    id: 'clinical-ai',
    label: 'IA clínica',
    href: '/ia-clinica',
    icon: Sparkles,
    requiresWrite: false,
    tone: 'bg-emerald-100 text-emerald-800 ring-emerald-200 hover:bg-emerald-200/80 dark:bg-emerald-950 dark:text-emerald-200 dark:ring-emerald-800',
    groupId: 'clinical',
  },
  {
    id: 'new-owner',
    label: 'Nuevo propietario',
    href: '/propietarios/nuevo',
    icon: UserPlus,
    requiresWrite: true,
    tone: 'bg-sky-100 text-sky-800 ring-sky-200 hover:bg-sky-200/80 dark:bg-sky-950 dark:text-sky-200 dark:ring-sky-800',
    groupId: 'patients',
  },
  {
    id: 'new-patient',
    label: 'Nuevo paciente',
    href: '/pacientes/nuevo',
    icon: PawPrint,
    requiresWrite: true,
    tone: 'bg-teal-100 text-teal-800 ring-teal-200 hover:bg-teal-200/80 dark:bg-teal-950 dark:text-teal-200 dark:ring-teal-800',
    groupId: 'patients',
  },
  {
    id: 'view-agenda',
    label: 'Ver agenda',
    href: '/agenda',
    icon: Calendar,
    requiresWrite: false,
    tone: 'bg-indigo-100 text-indigo-800 ring-indigo-200 hover:bg-indigo-200/80 dark:bg-indigo-950 dark:text-indigo-200 dark:ring-indigo-800',
    groupId: 'agenda',
  },
  {
    id: 'register-vaccine',
    label: 'Registrar vacuna',
    href: '/vacunacion/nueva',
    icon: Syringe,
    requiresWrite: false,
    tone: 'bg-amber-100 text-amber-800 ring-amber-200 hover:bg-amber-200/80 dark:bg-amber-950 dark:text-amber-200 dark:ring-amber-800',
    groupId: 'agenda',
  },
  {
    id: 'schedule-surgery',
    label: 'Programar cirugía',
    href: '/cirugias/nueva',
    icon: Scissors,
    requiresWrite: false,
    tone: 'bg-orange-100 text-orange-800 ring-orange-200 hover:bg-orange-200/80 dark:bg-orange-950 dark:text-orange-200 dark:ring-orange-800',
    groupId: 'agenda',
  },
  {
    id: 'reminders',
    label: 'Recordatorios',
    href: '/recordatorios',
    icon: Bell,
    requiresWrite: false,
    tone: 'bg-amber-100 text-amber-800 ring-amber-200 hover:bg-amber-200/80 dark:bg-amber-950 dark:text-amber-200 dark:ring-amber-800',
    groupId: 'agenda',
  },
  {
    id: 'admit-hospitalization',
    label: 'Admitir internación',
    href: '/internacion/nueva',
    icon: BedDouble,
    requiresWrite: false,
    tone: 'bg-rose-100 text-rose-800 ring-rose-200 hover:bg-rose-200/80 dark:bg-rose-950 dark:text-rose-200 dark:ring-rose-800',
    groupId: 'hospitalization',
  },
  {
    id: 'new-product',
    label: 'Nuevo producto',
    href: '/inventario/nuevo',
    icon: Package,
    requiresWrite: false,
    tone: 'bg-slate-100 text-slate-800 ring-slate-200 hover:bg-slate-200/80 dark:bg-slate-900 dark:text-slate-200 dark:ring-slate-700',
    groupId: 'management',
  },
  {
    id: 'new-invoice',
    label: 'Nueva factura',
    href: '/facturacion/nueva',
    icon: Receipt,
    requiresWrite: false,
    tone: 'bg-emerald-100 text-emerald-800 ring-emerald-200 hover:bg-emerald-200/80 dark:bg-emerald-950 dark:text-emerald-200 dark:ring-emerald-800',
    groupId: 'management',
  },
  {
    id: 'cash-register',
    label: 'Caja',
    href: '/caja',
    icon: Banknote,
    requiresWrite: false,
    tone: 'bg-teal-100 text-teal-800 ring-teal-200 hover:bg-teal-200/80 dark:bg-teal-950 dark:text-teal-200 dark:ring-teal-800',
    groupId: 'management',
  },
  {
    id: 'professionals',
    label: 'Profesionales',
    href: '/profesionales',
    icon: Briefcase,
    requiresWrite: false,
    tone: 'bg-violet-100 text-violet-800 ring-violet-200 hover:bg-violet-200/80 dark:bg-violet-950 dark:text-violet-200 dark:ring-violet-800',
    groupId: 'professionals',
  },
  {
    id: 'new-professional',
    label: 'Nuevo profesional',
    href: '/profesionales#nuevo',
    icon: UserPlus,
    requiresWrite: false,
    tone: ACTION_TONE,
    groupId: 'professionals',
  },
  {
    id: 'professional-settlements',
    label: 'Liquidaciones',
    href: '/liquidaciones',
    icon: Wallet,
    requiresWrite: false,
    tone: 'bg-violet-100 text-violet-800 ring-violet-200 hover:bg-violet-200/80 dark:bg-violet-950 dark:text-violet-200 dark:ring-violet-800',
    groupId: 'professionals',
  },
  {
    id: 'reports',
    label: 'Ver reportes',
    href: '/reportes',
    icon: BarChart3,
    requiresWrite: false,
    tone: 'bg-cyan-100 text-cyan-800 ring-cyan-200 hover:bg-cyan-200/80 dark:bg-cyan-950 dark:text-cyan-200 dark:ring-cyan-800',
    groupId: 'reports',
  },
  {
    id: 'audit',
    label: 'Auditoría',
    href: '/auditoria',
    icon: ScrollText,
    requiresWrite: false,
    tone: 'bg-slate-100 text-slate-800 ring-slate-200 hover:bg-slate-200/80 dark:bg-slate-900 dark:text-slate-200 dark:ring-slate-700',
    groupId: 'reports',
  },
  {
    id: 'whatsapp',
    label: 'WhatsApp',
    href: '/whatsapp',
    icon: MessageCircle,
    requiresWrite: false,
    tone: 'bg-lime-100 text-lime-800 ring-lime-200 hover:bg-lime-200/80 dark:bg-lime-950 dark:text-lime-200 dark:ring-lime-800',
    groupId: 'communication',
  },
  {
    id: 'notifications',
    label: 'Notificaciones',
    href: '/notificaciones',
    icon: Inbox,
    requiresWrite: false,
    tone: 'bg-rose-100 text-rose-800 ring-rose-200 hover:bg-rose-200/80 dark:bg-rose-950 dark:text-rose-200 dark:ring-rose-800',
    groupId: 'communication',
  },
  {
    id: 'settings',
    label: 'Configuración',
    href: '/configuracion',
    icon: Settings,
    requiresWrite: false,
    tone: 'bg-slate-100 text-slate-700 ring-slate-200 hover:bg-slate-200/80 dark:bg-slate-900 dark:text-slate-200 dark:ring-slate-700',
    groupId: 'settings',
  },
];

/**
 * Default quick actions (most frequent ops).
 * Swap this list (or load per-user prefs later) without rewriting nav UI.
 */
export const DEFAULT_QUICK_ACTION_IDS: DashboardNavActionId[] = [
  'new-consultation',
  'new-owner',
  'new-patient',
  'new-prescription',
  'waiting-room',
  'admit-hospitalization',
];

export function getDashboardNavActionById(
  id: DashboardNavActionId
): DashboardNavAction | undefined {
  return DASHBOARD_NAV_ACTIONS.find((action) => action.id === id);
}

export function resolveQuickActions(
  ids: readonly DashboardNavActionId[] = DEFAULT_QUICK_ACTION_IDS
): DashboardNavAction[] {
  return ids
    .map((id) => getDashboardNavActionById(id))
    .filter((action): action is DashboardNavAction => Boolean(action));
}

export function filterDashboardNavActions(
  actions: readonly DashboardNavAction[],
  opts: { canWritePatients: boolean; entitledHrefs: string[] | null; isEntitled: (href: string) => boolean }
): DashboardNavAction[] {
  return actions.filter((action) => {
    if (action.requiresWrite && !opts.canWritePatients) return false;
    const entitlementHref = action.href.split('#')[0] ?? action.href;
    return opts.isEntitled(entitlementHref);
  });
}

export function groupVisibleActions(
  actions: readonly DashboardNavAction[]
): Array<{ group: DashboardNavGroup; actions: DashboardNavAction[] }> {
  return DASHBOARD_NAV_GROUPS.map((group) => ({
    group,
    actions: actions.filter((action) => action.groupId === group.id),
  })).filter((entry) => entry.actions.length > 0);
}
