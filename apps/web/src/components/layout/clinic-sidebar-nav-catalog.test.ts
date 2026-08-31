import { describe, expect, it } from 'vitest';
import { DASHBOARD_NAV_GROUPS } from '@/components/dashboard/dashboard-nav-catalog';
import {
  CLINIC_SIDEBAR_NAV_ITEMS,
  filterClinicSidebarNavItems,
  findActiveSidebarGroupId,
  groupClinicSidebarNavItems,
  isSidebarNavItemActive,
} from './clinic-sidebar-nav-catalog';

describe('clinic-sidebar-nav', () => {
  it('keeps unique hrefs and known groups', () => {
    const hrefs = CLINIC_SIDEBAR_NAV_ITEMS.map((item) => item.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);

    const groupIds = new Set(DASHBOARD_NAV_GROUPS.map((group) => group.id));
    for (const item of CLINIC_SIDEBAR_NAV_ITEMS) {
      if (item.groupId == null) continue;
      expect(groupIds.has(item.groupId)).toBe(true);
    }
  });

  it('filters entitlements and my-settlements gate', () => {
    const entitled = new Set(['/dashboard', '/agenda', '/liquidaciones/mis-liquidaciones']);
    const visible = filterClinicSidebarNavItems(CLINIC_SIDEBAR_NAV_ITEMS, {
      entitledHrefs: [...entitled],
      showMySettlementsNav: false,
      isEntitled: (href) => entitled.has(href),
    });

    expect(visible.some((item) => item.href === '/dashboard')).toBe(true);
    expect(visible.some((item) => item.href === '/agenda')).toBe(true);
    expect(visible.some((item) => item.href === '/liquidaciones/mis-liquidaciones')).toBe(false);
    expect(visible.some((item) => item.href === '/pacientes')).toBe(false);
  });

  it('groups with the same module categories as dashboard', () => {
    const { topLevel, groups } = groupClinicSidebarNavItems(CLINIC_SIDEBAR_NAV_ITEMS);
    expect(topLevel.map((item) => item.href)).toEqual(['/dashboard']);
    expect(groups.map((entry) => entry.group.id)).toEqual(
      DASHBOARD_NAV_GROUPS.filter((group) =>
        CLINIC_SIDEBAR_NAV_ITEMS.some((item) => item.groupId === group.id)
      ).map((group) => group.id)
    );
  });

  it('resolves active group preferring the longest href match', () => {
    expect(isSidebarNavItemActive('/agenda/nueva', '/agenda')).toBe(true);
    expect(
      findActiveSidebarGroupId('/liquidaciones/mis-liquidaciones', CLINIC_SIDEBAR_NAV_ITEMS)
    ).toBe('professionals');
  });

  it('includes Interconsultas under professionals group', () => {
    const item = CLINIC_SIDEBAR_NAV_ITEMS.find((entry) => entry.href === '/interconsultas');
    expect(item?.groupId).toBe('professionals');
    expect(item?.label).toBe('Interconsultas');
  });
});
