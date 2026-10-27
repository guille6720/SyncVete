import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ update: vi.fn(), result: { data: { id: 'a0000000-0000-4000-8000-000000000005' } as { id: string } | null, error: null } }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createServerClient: async () => {
  const query = { update: mocks.update, eq: () => query, is: () => query, select: () => query, maybeSingle: async () => mocks.result };
  mocks.update.mockReturnValue(query);
  return { from: () => query };
} }));
vi.mock('@/actions/auth', () => ({ getSessionContext: vi.fn() }));
vi.mock('@/lib/permissions', () => ({ requirePermissionAndFeature: async () => ({}), requirePermission: vi.fn(), canPermissionAndFeature: vi.fn(), PermissionError: class extends Error {} }));
vi.mock('@/lib/entitlements', () => ({ FEATURES: { INVENTORY: 'inventory' }, planRestrictionResult: () => null }));
import { updateInventoryProduct } from './inventory';

describe('inventory catalog update', () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.result.data = { id: 'a0000000-0000-4000-8000-000000000005' }; });
  function form() {
    const data = new FormData();
    for (const field of ['sku', 'manufacturer', 'notes', 'unitPrice']) data.set(field, '');
    data.set('name', 'Vacuna editada'); data.set('category', 'vacuna'); data.set('unit', 'dosis');
    data.set('unitCost', '12.5'); data.set('marginPercent', '40'); data.set('costCurrency', 'USD'); data.set('isActive', 'true');
    return data;
  }
  it('accepts editing without a branch field and without a supplier', async () => {
    expect(await updateInventoryProduct('a0000000-0000-4000-8000-000000000005', null, form())).toMatchObject({ success: true });
    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ name: 'Vacuna editada', cost_currency: 'USD', supplier_party_id: null }));
  });
  it('does not report success when RLS hides the target', async () => {
    mocks.result.data = null;
    expect((await updateInventoryProduct('a0000000-0000-4000-8000-000000000005', null, form())).success).toBe(false);
  });
});
