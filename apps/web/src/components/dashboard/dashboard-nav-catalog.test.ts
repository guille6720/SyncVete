import { describe, expect, it } from 'vitest';
import {
  DASHBOARD_NAV_ACTIONS,
  DASHBOARD_NAV_GROUPS,
  DEFAULT_QUICK_ACTION_IDS,
  filterDashboardNavActions,
  groupVisibleActions,
  resolveQuickActions,
} from './dashboard-nav-catalog';

describe('dashboard-nav-catalog', () => {
  it('keeps unique action ids and known groups', () => {
    const ids = DASHBOARD_NAV_ACTIONS.map((action) => action.id);
    expect(new Set(ids).size).toBe(ids.length);

    const groupIds = new Set(DASHBOARD_NAV_GROUPS.map((group) => group.id));
    for (const action of DASHBOARD_NAV_ACTIONS) {
      expect(groupIds.has(action.groupId)).toBe(true);
    }
  });

  it('resolves default quick actions in order', () => {
    const quick = resolveQuickActions(DEFAULT_QUICK_ACTION_IDS);
    expect(quick.map((action) => action.id)).toEqual([...DEFAULT_QUICK_ACTION_IDS]);
  });

  it('filters write-gated and entitlement-gated actions', () => {
    const entitled = new Set(['/consultas/nueva', '/pacientes/nuevo', '/sala-espera']);
    const visible = filterDashboardNavActions(DASHBOARD_NAV_ACTIONS, {
      canWritePatients: false,
      entitledHrefs: [...entitled],
      isEntitled: (href) => entitled.has(href),
    });

    expect(visible.some((action) => action.id === 'new-consultation')).toBe(true);
    expect(visible.some((action) => action.id === 'waiting-room')).toBe(true);
    expect(visible.some((action) => action.id === 'new-patient')).toBe(false);
    expect(visible.some((action) => action.id === 'cash-register')).toBe(false);
  });

  it('groups only non-empty categories', () => {
    const clinicalOnly = DASHBOARD_NAV_ACTIONS.filter((action) => action.groupId === 'clinical');
    const grouped = groupVisibleActions(clinicalOnly);
    expect(grouped).toHaveLength(1);
    expect(grouped[0]?.group.id).toBe('clinical');
  });

  it('reuses existing clinic routes for professionals module', () => {
    const professionals = DASHBOARD_NAV_ACTIONS.find((action) => action.id === 'professionals');
    const settlements = DASHBOARD_NAV_ACTIONS.find(
      (action) => action.id === 'professional-settlements'
    );
    const create = DASHBOARD_NAV_ACTIONS.find((action) => action.id === 'new-professional');

    expect(professionals?.href).toBe('/profesionales');
    expect(settlements?.href).toBe('/liquidaciones');
    expect(create?.href).toBe('/profesionales#nuevo');
  });
});
