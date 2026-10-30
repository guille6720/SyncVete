import { beforeEach, describe, expect, it, vi } from 'vitest';
const org = 'a0000000-0000-4000-8000-000000000001';
const branch = 'a0000000-0000-4000-8000-000000000002';
const id = 'a0000000-0000-4000-8000-000000000004';
const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  rpc: vi.fn(),
  permission: vi.fn(),
  invalidate: vi.fn(),
  service: vi.fn(),
  quota: vi.fn(),
}));
vi.mock('@/lib/supabase/server', () => ({
  createServerClient: async () => ({ from: mocks.from, rpc: mocks.rpc }),
  createServiceClient: mocks.service,
}));
vi.mock('@/lib/permissions', () => ({
  requirePermissionAndFeature: mocks.permission,
  canPermissionAndFeature: vi.fn(),
  PermissionError: class extends Error {},
}));
vi.mock('@/lib/entitlements', () => ({
  FEATURES: {
    PROFESSIONALS_SETTLEMENTS: 'professionals.settlements',
    PROFESSIONALS_MAX: 'professionals.max',
    APPOINTMENTS: 'appointments',
  },
  planRestrictionResult: () => null,
  canUseFeature: vi.fn(),
  assertWithinLimit: mocks.quota,
}));
vi.mock('@/actions/auth', () => ({ getSessionContext: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: mocks.invalidate }));
import { createProfessional, updateProfessional } from './professionals';
const form = (hours?: string) => {
  const d = new FormData();
  d.set('id', id);
  d.set('draftId', id);
  d.set('firstName', 'Josefina');
  d.set('lastName', 'QA');
  d.set('branchIds', branch);
  if (hours !== undefined) d.set('schedulesJson', hours);
  return d;
};
describe('atomic professional and agenda submission', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.permission.mockResolvedValue({ organizationId: org, branchId: branch });
    mocks.rpc.mockResolvedValue({
      data: {
        id,
        organization_id: org,
        first_name: 'Josefina',
        last_name: 'QA',
        relationship_type: 'independent',
        is_active: true,
      },
      error: null,
    });
    const q: Record<string, unknown> = { count: 0, error: null };
    for (const method of ['select', 'eq', 'is']) q[method] = vi.fn(() => q);
    q.maybeSingle = vi.fn(async () => ({ data: null, error: null }));
    mocks.from.mockReturnValue(q);
  });
  it('can create a calendar without email, auth identity or service credentials', async () => {
    expect((await createProfessional(null, form('[]'))).success).toBe(true);
    expect(mocks.rpc).toHaveBeenCalledWith(
      'save_professional_with_agenda',
      expect.objectContaining({ p_create: true, p_id: id, p_schedules: [] })
    );
    expect(mocks.service).not.toHaveBeenCalled();
    expect(mocks.quota).toHaveBeenCalled();
  });
  it('does not ignore removing all days', async () => {
    expect((await updateProfessional(null, form('[]'))).success).toBe(true);
    expect(mocks.rpc).toHaveBeenCalledWith(
      'save_professional_with_agenda',
      expect.objectContaining({ p_id: id, p_schedules: [] })
    );
  });
  it('passes the entire edited week together with the ficha', async () => {
    const rows = [1, 5].map((weekday) => ({
      weekday,
      startTime: '14:00',
      endTime: '20:00',
      slotDurationMinutes: 15,
    }));
    await updateProfessional(null, form(JSON.stringify(rows)));
    expect(mocks.rpc).toHaveBeenCalledWith(
      'save_professional_with_agenda',
      expect.objectContaining({
        p_schedules: rows.map((r) => ({
          weekday: r.weekday,
          start_time: r.startTime,
          end_time: r.endTime,
          slot_duration_minutes: r.slotDurationMinutes,
        })),
      })
    );
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
  });
  it('keeps hours unchanged when the form does not edit hours', async () => {
    await updateProfessional(null, form());
    expect(mocks.rpc).toHaveBeenCalledWith(
      'save_professional_with_agenda',
      expect.objectContaining({ p_schedules: null })
    );
  });
  it('never announces success or invalidates caches after persistence failure', async () => {
    mocks.rpc.mockResolvedValue({
      data: null,
      error: { message: 'Horarios inválidos. Revisá las franjas.' },
    });
    expect((await updateProfessional(null, form('[]'))).success).toBe(false);
    expect(mocks.invalidate).not.toHaveBeenCalled();
  });
  it('rejects malformed hours before any database writes', async () => {
    expect((await updateProfessional(null, form('invalid'))).success).toBe(false);
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.from).not.toHaveBeenCalled();
  });
  it('requires hours for the first-turn shortcut and preserves the form', async () => {
    const d = form('[]');
    d.set('nextStep', 'appointment');
    expect(await createProfessional(null, d)).toMatchObject({
      success: false,
      error: expect.stringContaining('día y horario'),
    });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it('returns the chosen next step and invitation intent after an edit', async () => {
    const d = form(
      JSON.stringify([
        { weekday: 1, startTime: '14:00', endTime: '20:00', slotDurationMinutes: 15 },
      ])
    );
    d.set('nextStep', 'appointment');
    d.set('prepareInvite', 'true');
    expect(await updateProfessional(null, d)).toMatchObject({
      success: true,
      workflow: { nextStep: 'appointment', branchId: branch, prepareInvite: true },
    });
  });
  it('does not accept an unconfirmed RPC response as success', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: null });
    expect((await updateProfessional(null, form('[]'))).success).toBe(false);
  });
});
