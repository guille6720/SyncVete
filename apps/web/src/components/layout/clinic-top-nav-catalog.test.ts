import { describe, expect, it } from 'vitest';
import { isClinicPathEntitled } from '@sincvete/shared';
import {
  CLINIC_TOP_NAV_MENUS,
  assertTopNavHrefsInSidebarCatalog,
  buildClinicTopNav,
  withTopNavActiveState,
} from './clinic-top-nav-catalog';

describe('clinic-top-nav-catalog', () => {
  it('keeps leaf top-nav hrefs in the sidebar catalog', () => {
    expect(assertTopNavHrefsInSidebarCatalog()).toEqual([]);
  });

  it('exposes module hubs instead of nested sidebar menus', () => {
    expect(CLINIC_TOP_NAV_MENUS.map((menu) => menu.label)).toEqual([
      'Inicio',
      'Clínica',
      'Pacientes',
      'Agenda',
      'Internación',
      'Gestión',
      'Profesionales',
      'Reportes',
      'Comunicación',
      'Usuarios',
      'Configuración',
    ]);
  });

  it('filters hubs by entitlements and resolves destinations', () => {
    const entitled = new Set(['/dashboard', '/agenda', '/inventario', '/configuracion']);
    const menus = buildClinicTopNav({
      entitledHrefs: [...entitled],
      showMySettlementsNav: false,
      academiaEnabled: false,
      isEntitled: (href) => isClinicPathEntitled(href, [...entitled]),
    });

    expect(menus.some((menu) => menu.id === 'inicio')).toBe(true);
    // Only one agenda child entitled → go straight to the module (no empty hub).
    expect(menus.find((menu) => menu.id === 'agenda')?.href).toBe('/agenda');
    expect(menus.find((menu) => menu.id === 'management')?.href).toBe('/inventario');
    expect(menus.some((menu) => menu.id === 'clinical')).toBe(false);
    expect(menus.some((menu) => menu.id === 'professionals')).toBe(false);
  });

  it('marks hub active from /modulos slug or child routes', () => {
    const base = buildClinicTopNav({
      entitledHrefs: null,
      showMySettlementsNav: true,
      academiaEnabled: true,
      isEntitled: () => true,
    });

    expect(withTopNavActiveState(base, '/modulos/clinica').find((m) => m.id === 'clinical')?.active).toBe(
      true
    );
    expect(withTopNavActiveState(base, '/vacunacion').find((m) => m.id === 'agenda')?.active).toBe(true);
    expect(withTopNavActiveState(base, '/dashboard').find((m) => m.id === 'inicio')?.active).toBe(true);
  });
});
