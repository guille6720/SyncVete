import { describe, expect, it } from 'vitest';
import { isClinicPathEntitled } from '@sincvete/shared';
import { CLINIC_SIDEBAR_NAV_ITEMS } from './clinic-sidebar-nav-catalog';
import {
  CLINIC_TOP_NAV_MENUS,
  assertTopNavHrefsInSidebarCatalog,
  buildClinicTopNav,
  resolveTopNavItems,
  withTopNavActiveState,
} from './clinic-top-nav-catalog';

describe('clinic-top-nav-catalog', () => {
  it('keeps every top-nav href in the sidebar catalog (single source)', () => {
    expect(assertTopNavHrefsInSidebarCatalog()).toEqual([]);
  });

  it('exposes the required top-level menu labels', () => {
    expect(CLINIC_TOP_NAV_MENUS.map((menu) => menu.label)).toEqual([
      'Inicio',
      'Gestión clínica',
      'Agenda',
      'Administración',
      'Inventario',
      'Profesionales',
      'Reportes',
      'Configuración',
    ]);
  });

  it('filters menu items by entitlements / RBAC gates', () => {
    const entitled = new Set(['/dashboard', '/agenda', '/inventario', '/configuracion']);
    const menus = buildClinicTopNav({
      entitledHrefs: [...entitled],
      showMySettlementsNav: false,
      academiaEnabled: false,
      isEntitled: (href) => isClinicPathEntitled(href, [...entitled]),
    });

    expect(menus.some((menu) => menu.id === 'inicio')).toBe(true);
    expect(menus.some((menu) => menu.id === 'agenda')).toBe(true);
    expect(menus.some((menu) => menu.id === 'inventory')).toBe(true);
    expect(menus.some((menu) => menu.id === 'clinical')).toBe(false);
    expect(menus.some((menu) => menu.id === 'professionals')).toBe(false);

    const agenda = menus.find((menu) => menu.id === 'agenda');
    expect(agenda?.kind).toBe('menu');
    if (agenda?.kind === 'menu') {
      expect(agenda.items.map((item) => item.href)).toEqual(['/agenda']);
    }
  });

  it('marks active menu from the current pathname', () => {
    const menus = withTopNavActiveState(
      buildClinicTopNav({
        entitledHrefs: null,
        showMySettlementsNav: true,
        academiaEnabled: true,
        isEntitled: () => true,
      }),
      '/vacunacion'
    );
    const agenda = menus.find((menu) => menu.id === 'agenda');
    expect(agenda?.active).toBe(true);
    expect(menus.find((menu) => menu.id === 'inicio')?.active).toBe(false);
  });

  it('resolves top-nav items only from the shared sidebar catalog', () => {
    const items = resolveTopNavItems(['/agenda', '/missing'], CLINIC_SIDEBAR_NAV_ITEMS);
    expect(items.map((item) => item.href)).toEqual(['/agenda']);
  });
});
