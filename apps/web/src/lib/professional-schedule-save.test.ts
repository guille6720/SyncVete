import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), invalidate: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createServerClient: async () => ({ rpc: mocks.rpc }) }));
vi.mock('next/cache', () => ({ revalidatePath: mocks.invalidate }));
import { saveProfessionalSchedules } from './professional-schedule-save';
const row = { weekday: 1, startTime: '14:00', endTime: '20:00', slotDurationMinutes: 15 };
const input = {
  userId: 'a0000000-0000-4000-8000-000000000001',
  branchIds: ['a0000000-0000-4000-8000-000000000002'],
  schedules: [row, { ...row, weekday: 5 }],
};
describe('atomic professional schedule save', () => {
  beforeEach(() => vi.clearAllMocks());
  it('sends one replacement containing the entire week and refreshes booking screens', async () => {
    mocks.rpc.mockResolvedValue({ data: 2, error: null });
    expect(await saveProfessionalSchedules(input)).toBeNull();
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(mocks.rpc).toHaveBeenCalledWith('replace_professional_schedules', {
      p_user_id: input.userId,
      p_branch_ids: input.branchIds,
      p_schedules: input.schedules.map((r) => ({
        weekday: r.weekday,
        start_time: `${r.startTime}:00`,
        end_time: `${r.endTime}:00`,
        slot_duration_minutes: 15,
      })),
    });
    expect(mocks.invalidate).toHaveBeenCalledWith('/agenda/turnos');
    expect(mocks.invalidate).toHaveBeenCalledWith('/agenda/nueva');
  });
  it('sends an empty replacement when the user removes every day', async () => {
    mocks.rpc.mockResolvedValue({ data: 0, error: null });
    expect(await saveProfessionalSchedules({ ...input, schedules: [] })).toBeNull();
    expect(mocks.rpc.mock.calls[0][1].p_schedules).toEqual([]);
  });
  it('does not report success or invalidate caches when the migration is missing', async () => {
    mocks.rpc.mockResolvedValue({
      data: null,
      error: { message: 'Could not find the function in the schema cache' },
    });
    expect(await saveProfessionalSchedules(input)).toContain('No se guardaron');
    expect(mocks.invalidate).not.toHaveBeenCalled();
  });
  it('surfaces permission errors without pretending the week was saved', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'Sin acceso a la sucursal' } });
    expect(await saveProfessionalSchedules(input)).toBe('Sin acceso a la sucursal');
    expect(mocks.invalidate).not.toHaveBeenCalled();
  });
  it('rejects unconfirmed or incomplete responses', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: null });
    expect(await saveProfessionalSchedules(input)).toContain('No se pudo confirmar');
    mocks.rpc.mockResolvedValue({ data: 1, error: null });
    expect(await saveProfessionalSchedules(input)).toContain('No se pudo confirmar');
  });
  it('requires a branch and deduplicates branch selection', async () => {
    expect(await saveProfessionalSchedules({ ...input, branchIds: [] })).toContain('sucursal');
    expect(mocks.rpc).not.toHaveBeenCalled();
    mocks.rpc.mockResolvedValue({ data: 2, error: null });
    expect(
      await saveProfessionalSchedules({
        ...input,
        branchIds: [...input.branchIds, ...input.branchIds],
      })
    ).toBeNull();
  });
});
