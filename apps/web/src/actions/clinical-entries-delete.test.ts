import { beforeEach, describe, expect, it, vi } from 'vitest';

const entryId = 'a0000000-0000-4000-8000-000000000004';
const patientId = 'a0000000-0000-4000-8000-000000000005';
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), permission: vi.fn(), invalidate: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createServerClient: async () => ({ rpc: mocks.rpc }) }));
vi.mock('@/lib/permissions', () => ({ requirePermissionAndFeature: mocks.permission, requirePermission: vi.fn(), canPermissionAndFeature: vi.fn(), PermissionError: class extends Error {} }));
vi.mock('@/actions/auth', () => ({ getSessionContext: vi.fn() }));
vi.mock('@/lib/entitlements', () => ({ FEATURES: { CLINICAL_HISTORY: 'clinical.history' }, planRestrictionResult: () => null }));
vi.mock('@/lib/cache-revalidate', () => ({ revalidateClinicalEntry: mocks.invalidate, revalidateClinicalEntryList: vi.fn(), revalidatePatientHistoria: vi.fn() }));
import { deleteClinicalEntry } from './clinical-entries';

describe('deleteClinicalEntry result handling', () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.permission.mockResolvedValue({}); });
  it('invalidates the detail and patient history only after confirmed deletion', async () => {
    mocks.rpc.mockResolvedValue({ data: [{ id: entryId, patient_id: patientId }], error: null });
    expect(await deleteClinicalEntry(entryId)).toEqual({ success: true });
    expect(mocks.permission).toHaveBeenCalledWith('clinical:write', 'clinical.history');
    expect(mocks.rpc).toHaveBeenCalledWith('soft_delete_clinical_entry', { p_entry_id: entryId });
    expect(mocks.invalidate).toHaveBeenCalledWith(entryId, patientId);
  });
  it.each([null, []])('does not pretend an empty response succeeded: %s', async data => {
    mocks.rpc.mockResolvedValue({ data, error: null });
    expect((await deleteClinicalEntry(entryId)).success).toBe(false);
    expect(mocks.invalidate).not.toHaveBeenCalled();
  });
  it('reports permission failures', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: '42501' } });
    expect(await deleteClinicalEntry(entryId)).toMatchObject({ success: false, error: expect.stringContaining('permisos') });
  });
  it('reports missing or previously deleted records', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: 'P0002' } });
    expect(await deleteClinicalEntry(entryId)).toMatchObject({ success: false, error: expect.stringContaining('no está disponible') });
  });
});
