import {
  CLINIC_SIDEBAR_NAV_ITEMS,
  filterClinicSidebarNavItems,
  isSidebarNavItemActive,
  type ClinicSidebarNavItem,
} from '@/components/layout/clinic-sidebar-nav-catalog';

/**
 * Top-bar menus for UI V2 — labels match the product IA brief.
 * Items are resolved from CLINIC_SIDEBAR_NAV_ITEMS (single source of routes).
 */
export type ClinicTopNavMenuId =
  | 'inicio'
  | 'clinical'
  | 'agenda'
  | 'admin'
  | 'inventory'
  | 'professionals'
  | 'reports'
  | 'settings';

export type ClinicTopNavMenuDef =
  | { id: ClinicTopNavMenuId; label: string; kind: 'link'; href: string }
  | { id: ClinicTopNavMenuId; label: string; kind: 'menu'; itemHrefs: readonly string[] };

export const CLINIC_TOP_NAV_MENUS: readonly ClinicTopNavMenuDef[] = [
  { id: 'inicio', label: 'Inicio', kind: 'link', href: '/dashboard' },
  {
    id: 'clinical',
    label: 'Gestión clínica',
    kind: 'menu',
    itemHrefs: [
      '/sala-espera',
      '/consultas',
      '/historia-clinica',
      '/laboratorio',
      '/imagenes',
      '/farmacia',
      '/ia-clinica',
      '/tutores',
      '/pacientes',
      '/internacion',
    ],
  },
  {
    id: 'agenda',
    label: 'Agenda',
    kind: 'menu',
    itemHrefs: ['/agenda', '/vacunacion', '/cirugias', '/recordatorios'],
  },
  {
    id: 'admin',
    label: 'Administración',
    kind: 'menu',
    itemHrefs: ['/facturacion', '/caja'],
  },
  {
    id: 'inventory',
    label: 'Inventario',
    kind: 'menu',
    itemHrefs: ['/inventario'],
  },
  {
    id: 'professionals',
    label: 'Profesionales',
    kind: 'menu',
    itemHrefs: [
      '/profesionales',
      '/interconsultas',
      '/liquidaciones',
      '/liquidaciones/mis-liquidaciones',
    ],
  },
  {
    id: 'reports',
    label: 'Reportes',
    kind: 'menu',
    itemHrefs: ['/reportes', '/auditoria'],
  },
  {
    id: 'settings',
    label: 'Configuración',
    kind: 'menu',
    itemHrefs: ['/whatsapp', '/notificaciones', '/academia', '/configuracion'],
  },
] as const;

const ITEM_BY_HREF = new Map(CLINIC_SIDEBAR_NAV_ITEMS.map((item) => [item.href, item]));

export function resolveTopNavItems(
  hrefs: readonly string[],
  visible: readonly ClinicSidebarNavItem[]
): ClinicSidebarNavItem[] {
  const visibleHrefs = new Set(visible.map((item) => item.href));
  return hrefs
    .map((href) => ITEM_BY_HREF.get(href))
    .filter((item): item is ClinicSidebarNavItem => Boolean(item) && visibleHrefs.has(item!.href));
}

export type ClinicTopNavResolvedMenu =
  | { id: ClinicTopNavMenuId; label: string; kind: 'link'; href: string; active: boolean }
  | {
      id: ClinicTopNavMenuId;
      label: string;
      kind: 'menu';
      items: ClinicSidebarNavItem[];
      active: boolean;
    };

export function buildClinicTopNav(opts: {
  entitledHrefs: string[] | null;
  showMySettlementsNav: boolean;
  academiaEnabled?: boolean;
  isEntitled: (href: string) => boolean;
}): ClinicTopNavResolvedMenu[] {
  const visible = filterClinicSidebarNavItems(CLINIC_SIDEBAR_NAV_ITEMS, opts);
  const menus: ClinicTopNavResolvedMenu[] = [];

  for (const menu of CLINIC_TOP_NAV_MENUS) {
    if (menu.kind === 'link') {
      if (!opts.isEntitled(menu.href)) continue;
      menus.push({
        id: menu.id,
        label: menu.label,
        kind: 'link',
        href: menu.href,
        active: false,
      });
      continue;
    }

    const items = resolveTopNavItems(menu.itemHrefs, visible);
    if (items.length === 0) continue;
    menus.push({
      id: menu.id,
      label: menu.label,
      kind: 'menu',
      items,
      active: false,
    });
  }

  return menus;
}

export function withTopNavActiveState<
  T extends { kind: 'link'; href: string } | { kind: 'menu'; items: ClinicSidebarNavItem[] },
>(menus: T[], pathname: string): Array<T & { active: boolean }> {
  return menus.map((menu) => {
    if (menu.kind === 'link') {
      return { ...menu, active: isSidebarNavItemActive(pathname, menu.href) };
    }
    const active = menu.items.some((item) => isSidebarNavItemActive(pathname, item.href));
    return { ...menu, active };
  });
}

/** Every top-nav href must exist in the sidebar catalog (centralization check). */
export function assertTopNavHrefsInSidebarCatalog(): string[] {
  const missing: string[] = [];
  for (const menu of CLINIC_TOP_NAV_MENUS) {
    if (menu.kind === 'link') {
      if (!ITEM_BY_HREF.has(menu.href)) missing.push(menu.href);
      continue;
    }
    for (const href of menu.itemHrefs) {
      if (!ITEM_BY_HREF.has(href)) missing.push(href);
    }
  }
  return missing;
}
