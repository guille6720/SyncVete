import type { LucideIcon } from 'lucide-react';
import {
  Banknote,
  BarChart3,
  BedDouble,
  Bell,
  Briefcase,
  Calendar,
  ClipboardList,
  FlaskConical,
  Hourglass,
  Images,
  Inbox,
  LayoutDashboard,
  MessageCircle,
  MessagesSquare,
  Package,
  PawPrint,
  Pill,
  Receipt,
  Scissors,
  ScrollText,
  Settings,
  Sparkles,
  Stethoscope,
  Syringe,
  Users,
  Wallet,
} from 'lucide-react';
import {
  DASHBOARD_NAV_GROUPS,
  type DashboardNavGroup,
  type DashboardNavGroupId,
} from '@/components/dashboard/dashboard-nav-catalog';

export interface ClinicSidebarNavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  /** null = top-level (Dashboard). */
  groupId: DashboardNavGroupId | null;
  /** Only show when AppShell enables my-settlements nav. */
  requiresMySettlements?: boolean;
}

/** Browse destinations for the clinic sidebar — same module groups as dashboard. */
export const CLINIC_SIDEBAR_NAV_ITEMS: ClinicSidebarNavItem[] = [
  { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard, groupId: null },

  { label: 'Sala de espera', href: '/sala-espera', icon: Hourglass, groupId: 'clinical' },
  { label: 'Consultas', href: '/consultas', icon: Stethoscope, groupId: 'clinical' },
  { label: 'Historia clínica', href: '/historia-clinica', icon: ClipboardList, groupId: 'clinical' },
  { label: 'Laboratorio', href: '/laboratorio', icon: FlaskConical, groupId: 'clinical' },
  { label: 'Imágenes', href: '/imagenes', icon: Images, groupId: 'clinical' },
  { label: 'Farmacia', href: '/farmacia', icon: Pill, groupId: 'clinical' },
  { label: 'IA clínica', href: '/ia-clinica', icon: Sparkles, groupId: 'clinical' },

  { label: 'Pacientes', href: '/pacientes', icon: PawPrint, groupId: 'patients' },
  { label: 'Propietarios', href: '/propietarios', icon: Users, groupId: 'patients' },

  { label: 'Agenda', href: '/agenda', icon: Calendar, groupId: 'agenda' },
  { label: 'Vacunación', href: '/vacunacion', icon: Syringe, groupId: 'agenda' },
  { label: 'Cirugías', href: '/cirugias', icon: Scissors, groupId: 'agenda' },
  { label: 'Recordatorios', href: '/recordatorios', icon: Bell, groupId: 'agenda' },

  { label: 'Internación', href: '/internacion', icon: BedDouble, groupId: 'hospitalization' },

  { label: 'Inventario', href: '/inventario', icon: Package, groupId: 'management' },
  { label: 'Facturación', href: '/facturacion', icon: Receipt, groupId: 'management' },
  { label: 'Caja', href: '/caja', icon: Banknote, groupId: 'management' },

  { label: 'Profesionales', href: '/profesionales', icon: Briefcase, groupId: 'professionals' },
  { label: 'Interconsultas', href: '/interconsultas', icon: MessagesSquare, groupId: 'professionals' },
  { label: 'Liquidaciones', href: '/liquidaciones', icon: Wallet, groupId: 'professionals' },
  {
    label: 'Mis liquidaciones',
    href: '/liquidaciones/mis-liquidaciones',
    icon: Wallet,
    groupId: 'professionals',
    requiresMySettlements: true,
  },

  { label: 'Reportes', href: '/reportes', icon: BarChart3, groupId: 'reports' },
  { label: 'Auditoría', href: '/auditoria', icon: ScrollText, groupId: 'reports' },

  { label: 'WhatsApp', href: '/whatsapp', icon: MessageCircle, groupId: 'communication' },
  { label: 'Notificaciones', href: '/notificaciones', icon: Inbox, groupId: 'communication' },

  { label: 'Configuración', href: '/configuracion', icon: Settings, groupId: 'settings' },
];

export function filterClinicSidebarNavItems(
  items: readonly ClinicSidebarNavItem[],
  opts: {
    entitledHrefs: string[] | null;
    showMySettlementsNav: boolean;
    isEntitled: (href: string) => boolean;
  }
): ClinicSidebarNavItem[] {
  return items.filter((item) => {
    if (item.requiresMySettlements && !opts.showMySettlementsNav) return false;
    return opts.isEntitled(item.href);
  });
}

export function groupClinicSidebarNavItems(
  items: readonly ClinicSidebarNavItem[]
): {
  topLevel: ClinicSidebarNavItem[];
  groups: Array<{ group: DashboardNavGroup; items: ClinicSidebarNavItem[] }>;
} {
  const topLevel = items.filter((item) => item.groupId == null);
  const groups = DASHBOARD_NAV_GROUPS.map((group) => ({
    group,
    items: items.filter((item) => item.groupId === group.id),
  })).filter((entry) => entry.items.length > 0);

  return { topLevel, groups };
}

export function isSidebarNavItemActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function findActiveSidebarGroupId(
  pathname: string,
  items: readonly ClinicSidebarNavItem[]
): DashboardNavGroupId | null {
  // Prefer longest matching href so /liquidaciones/mis-liquidaciones wins over /liquidaciones.
  const matches = items
    .filter((item) => item.groupId != null && isSidebarNavItemActive(pathname, item.href))
    .sort((a, b) => b.href.length - a.href.length);
  return matches[0]?.groupId ?? null;
}
