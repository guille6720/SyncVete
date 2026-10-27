import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  update: vi.fn(),
  eq: vi.fn(),
  permission: vi.fn(),
  result: {
    data: { id: 'a0000000-0000-4000-8000-000000000005' } as { id: string } | null,
    error: null,
  },
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/actions/auth', () => ({ getSessionContext: vi.fn() }));
vi.mock('@/lib/entitlements', () => ({
  FEATURES: { INVENTORY: 'inventory' },
  planRestrictionResult: () => null,
}));
vi.mock('@/lib/permissions', () => ({
  requirePermissionAndFeature: mocks.permission,
  PermissionError: class extends Error {},
}));
vi.mock('@/lib/supabase/server', () => ({
  createServerClient: async () => {
    const query = {
      update: mocks.update,
      eq: mocks.eq,
      is: () => query,
      select: () => query,
      maybeSingle: async () => mocks.result,
    };
    mocks.update.mockReturnValue(query);
    mocks.eq.mockReturnValue(query);
    return { from: () => query };
  },
}));
import { updateCatalogPricing } from './purchase-catalog';

describe('inline catalog pricing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.permission.mockResolvedValue({ organizationId: 'organization-a' });
    mocks.result.data = { id: 'a0000000-0000-4000-8000-000000000005' };
  });
  const form = (margin = '30', currency = 'ARS', cost = '12500') => {
    const data = new FormData();
    data.set('unitCost', cost);
    data.set('marginPercent', margin);
    data.set('costCurrency', currency);
    return data;
  };
  it('updates only pricing fields inside the authenticated organization', async () => {
    expect(
      await updateCatalogPricing('a0000000-0000-4000-8000-000000000005', null, form())
    ).toEqual({ success: true });
    expect(mocks.update).toHaveBeenCalledWith({
      unit_cost: 12500,
      cost_currency: 'ARS',
      margin_percent: 30,
    });
    expect(mocks.eq).toHaveBeenCalledWith('organization_id', 'organization-a');
    expect(mocks.permission).toHaveBeenCalledWith('inventory:write', 'inventory');
  });
  it.each([
    ['-1', 'ARS', '10'],
    ['1001', 'ARS', '10'],
    ['30', 'EUR', '10'],
    ['30', 'ARS', '-5'],
  ])('rejects invalid pricing %s %s %s before writing', async (margin, currency, cost) => {
    expect(
      (
        await updateCatalogPricing(
          'a0000000-0000-4000-8000-000000000005',
          null,
          form(margin, currency, cost)
        )
      ).success
    ).toBe(false);
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it('does not report a successful write on an unavailable target', async () => {
    mocks.result.data = null;
    expect(
      (await updateCatalogPricing('a0000000-0000-4000-8000-000000000005', null, form())).success
    ).toBe(false);
  });
});
