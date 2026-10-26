import {
  CLINIC_SIDEBAR_NAV_ITEMS,
  filterClinicSidebarNavItems,
  getSidebarGroupDestination,
  groupClinicSidebarNavItems,
  isSidebarNavItemActive,
} from '@/components/layout/clinic-sidebar-nav-catalog';
import type { DashboardNavGroupId } from '@/components/dashboard/dashboard-nav-catalog';
import {
  getModuleGroupIdFromSlug,
  getModuleHubPath,
} from '@/lib/ui-v2/module-hubs';

/**
 * Top-bar entries for UI V2 — open module hubs in the main panel (not sidebar accordions).
 * Destinations resolve from CLINIC_SIDEBAR_NAV_ITEMS (single source of routes).
 */
export type ClinicTopNavMenuId =
  | 'inicio'
  | 'clinical'
  | 'patients'
  | 'agenda'
  | 'hospitalization'
  | 'management'
  | 'professionals'
  | 'reports'
  | 'communication'
  | 'users'
  | 'settings';

export type ClinicTopNavMenuDef =
  | { id: ClinicTopNavMenuId; label: string; kind: 'link'; href: string }
  | { id: ClinicTopNavMenuId; label: string; kind: 'hub'; groupId: DashboardNavGroupId };

export const CLINIC_TOP_NAV_MENUS: readonly ClinicTopNavMenuDef[] = [
  { id: 'inicio', label: 'Inicio', kind: 'link', href: '/dashboard' },
  { id: 'clinical', label: 'Clínica', kind: 'hub', groupId: 'clinical' },
  { id: 'patients', label: 'Pacientes', kind: 'hub', groupId: 'patients' },
  { id: 'agenda', label: 'Agenda', kind: 'hub', groupId: 'agenda' },
  { id: 'hospitalization', label: 'Internación', kind: 'hub', groupId: 'hospitalization' },
  { id: 'management', label: 'Gestión', kind: 'hub', groupId: 'management' },
  { id: 'professionals', label: 'Profesionales', kind: 'hub', groupId: 'professionals' },
  { id: 'reports', label: 'Reportes', kind: 'hub', groupId: 'reports' },
  { id: 'communication', label: 'Comunicación', kind: 'hub', groupId: 'communication' },
  { id: 'users', label: 'Usuarios', kind: 'hub', groupId: 'users' },
  { id: 'settings', label: 'Configuración', kind: 'hub', groupId: 'settings' },
] as const;

export type ClinicTopNavResolvedMenu = {
  id: ClinicTopNavMenuId;
  label: string;
  href: string;
  active: boolean;
  groupId?: DashboardNavGroupId;
  childHrefs?: string[];
};

export function buildClinicTopNav(opts: {
  entitledHrefs: string[] | null;
  showMySettlementsNav: boolean;
  academiaEnabled?: boolean;
  permissions?: readonly string[];
  isEntitled: (href: string) => boolean;
}): ClinicTopNavResolvedMenu[] {
  const visible = filterClinicSidebarNavItems(CLINIC_SIDEBAR_NAV_ITEMS, opts);
  const { groups } = groupClinicSidebarNavItems(visible);
  const byGroup = new Map(groups.map((entry) => [entry.group.id, entry.items]));
  const menus: ClinicTopNavResolvedMenu[] = [];

  for (const menu of CLINIC_TOP_NAV_MENUS) {
    if (menu.kind === 'link') {
      if (!opts.isEntitled(menu.href)) continue;
      menus.push({ id: menu.id, label: menu.label, href: menu.href, active: false });
      continue;
    }

    const items = byGroup.get(menu.groupId) ?? [];
    if (items.length === 0) continue;
    menus.push({
      id: menu.id,
      label: menu.label,
      href: getSidebarGroupDestination(menu.groupId, items, getModuleHubPath),
      active: false,
      groupId: menu.groupId,
      childHrefs: items.map((item) => item.href),
    });
  }

  return menus;
}

export function withTopNavActiveState(
  menus: ClinicTopNavResolvedMenu[],
  pathname: string
): ClinicTopNavResolvedMenu[] {
  const hubGroup = (() => {
    const match = pathname.match(/^\/modulos\/([^/]+)/);
    return match?.[1] ? getModuleGroupIdFromSlug(match[1]) : null;
  })();

  return menus.map((menu) => {
    const childActive = Boolean(
      menu.childHrefs?.some((href) => isSidebarNavItemActive(pathname, href))
    );
    const hubActive = Boolean(menu.groupId && hubGroup === menu.groupId);
    const selfActive = isSidebarNavItemActive(pathname, menu.href);
    return { ...menu, active: childActive || hubActive || selfActive };
  });
}

/** Hub destinations are synthetic; leaf hrefs must exist in the sidebar catalog. */
export function assertTopNavHrefsInSidebarCatalog(): string[] {
  const missing: string[] = [];
  const known = new Set(CLINIC_SIDEBAR_NAV_ITEMS.map((item) => item.href));
  for (const menu of CLINIC_TOP_NAV_MENUS) {
    if (menu.kind === 'link' && !known.has(menu.href)) missing.push(menu.href);
  }
  return missing;
}
