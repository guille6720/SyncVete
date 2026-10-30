import { beforeEach, describe, expect, it, vi } from 'vitest';
const org = 'a0000000-0000-4000-8000-000000000001';
const branch = 'a0000000-0000-4000-8000-000000000002';
const user = 'a0000000-0000-4000-8000-000000000003';
const id = 'a0000000-0000-4000-8000-000000000004';
const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  save: vi.fn(),
  permission: vi.fn(),
  session: vi.fn(),
  invalidate: vi.fn(),
  service: vi.fn(),
}));
vi.mock('@/lib/supabase/server', () => ({
  createServerClient: async () => ({ from: mocks.from }),
  createServiceClient: mocks.service,
}));
vi.mock('@/lib/permissions', () => ({
  requirePermissionAndFeature: mocks.permission,
  canPermissionAndFeature: vi.fn(),
  PermissionError: class extends Error {},
}));
vi.mock('@/lib/entitlements', () => ({
  FEATURES: { PROFESSIONALS_SETTLEMENTS: 'professionals.settlements' },
  planRestrictionResult: () => null,
  canUseFeature: vi.fn(),
  assertWithinLimit: vi.fn(),
  getSeatUsageMeters: vi.fn(),
}));
vi.mock('@/actions/auth', () => ({ getSessionContext: mocks.session }));
vi.mock('next/cache', () => ({ revalidatePath: mocks.invalidate }));
vi.mock('@/lib/professional-schedule-save', () => ({ saveProfessionalSchedules: mocks.save }));
import { updateProfessional } from './professionals';

describe('professional edit schedule submission', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.permission.mockResolvedValue({});
    mocks.session.mockResolvedValue({ organizationId: org, branchId: branch });
    mocks.save.mockResolvedValue(null);
    const professional = {
      id,
      organization_id: org,
      user_id: user,
      profile_id: user,
      first_name: 'Josefina',
      last_name: 'QA',
      relationship_type: 'independent',
      is_active: true,
    };
    const builder: Record<string, unknown> = { data: [{ branch_id: branch }], error: null };
    for (const name of ['select', 'eq', 'is', 'update']) builder[name] = vi.fn(() => builder);
    builder.maybeSingle = vi.fn(async () => ({ data: professional, error: null }));
    builder.single = vi.fn(async () => ({ data: professional, error: null }));
    mocks.from.mockReturnValue(builder);
  });
  const form = (hours?: string) => {
    const data = new FormData();
    data.set('id', id);
    if (hours !== undefined) data.set('schedulesJson', hours);
    return data;
  };
  it('does not ignore removing every day from an existing professional', async () => {
    expect((await updateProfessional(null, form('[]'))).success).toBe(true);
    expect(mocks.save).toHaveBeenCalledWith({ userId: user, branchIds: [branch], schedules: [] });
    expect(mocks.service).not.toHaveBeenCalled();
  });
  it('passes the whole edited week to the atomic replacement', async () => {
    const rows = [1, 5].map((weekday) => ({
      weekday,
      startTime: '14:00',
      endTime: '20:00',
      slotDurationMinutes: 15,
    }));
    expect((await updateProfessional(null, form(JSON.stringify(rows)))).success).toBe(true);
    expect(mocks.save).toHaveBeenCalledWith({ userId: user, branchIds: [branch], schedules: rows });
  });
  it('keeps schedules unchanged when the submission does not edit hours', async () => {
    expect((await updateProfessional(null, form())).success).toBe(true);
    expect(mocks.save).not.toHaveBeenCalled();
  });
  it('does not announce a successful edit when schedule persistence fails', async () => {
    mocks.save.mockResolvedValue('No se guardaron los horarios: falta actualizar el módulo');
    expect(await updateProfessional(null, form('[]'))).toMatchObject({
      success: false,
      error: expect.stringContaining('no se pudieron guardar los horarios'),
    });
  });
  it('rejects malformed hours before changing the professional record', async () => {
    expect((await updateProfessional(null, form('invalid json'))).success).toBe(false);
    expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.save).not.toHaveBeenCalled();
  });
});
