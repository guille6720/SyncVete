import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ update: vi.fn(), eq: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({
  createServerClient: async () => ({ from: () => ({ update: mocks.update }) }),
}));
vi.mock('@/lib/permissions', () => ({
  requirePermissionAndFeature: async () => ({}),
  requirePermission: vi.fn(),
  canPermissionAndFeature: vi.fn(),
  PermissionError: class extends Error {},
}));
vi.mock('@/lib/entitlements', () => ({
  FEATURES: { OWNERS: 'owners' },
  planRestrictionResult: () => null,
}));

import { updateOwner } from './owners';

describe('saving owner activation', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.update.mockReturnValue({ eq: mocks.eq });
    mocks.eq.mockResolvedValue({ error: null });
  });
  it.each([true, false])('saves the checked state %s with the hidden fallback', async (active) => {
    const form = new FormData();
    for (const field of ['email', 'phone', 'phoneWhatsapp', 'documentNumber', 'address', 'city', 'province', 'postalCode', 'notes', 'branchId'])
      form.set(field, '');
    form.set('fullName', 'Test Owner');
    form.set('isActive', 'false');
    if (active) form.append('isActive', 'true');
    const result = await updateOwner('11111111-1111-4111-8111-111111111111', null, form);
    expect(result).toEqual(expect.objectContaining({ success: true }));
    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ is_active: active }));
  });
});
