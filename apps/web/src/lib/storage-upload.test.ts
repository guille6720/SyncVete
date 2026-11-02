import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), upload: vi.fn(), download: vi.fn(), permission: vi.fn(), writer: vi.fn(), writerUpload: vi.fn(), writerDownload: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: async () => ({ rpc: mocks.rpc, storage: { from: () => ({ upload: mocks.upload, download: mocks.download }) } }),
}));
vi.mock('@/lib/permissions', () => ({ requirePermission: mocks.permission }));
vi.mock('@/lib/supabase/storage-writer', () => ({ createStorageWriterClient: mocks.writer }));
import { uploadWithStorageReservation } from './storage-upload';

const input = {
  organizationId: 'clinic', bucket: 'clinical-images' as const, path: 'clinic/file',
  body: new Uint8Array([1, 2]), contentType: 'image/png',
};

afterEach(() => vi.unstubAllEnvs());

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://owmcrqvnfubyjxrlyhlc.supabase.co');
  vi.stubEnv('STORAGE_LIMITED_WRITER_ENABLED', 'false');
  mocks.permission.mockResolvedValue({ organizationId: 'clinic' });
  mocks.rpc.mockResolvedValueOnce({ data: 'reservation', error: null })
    .mockResolvedValue({ data: true, error: null });
  mocks.upload.mockResolvedValue({ error: null });
  mocks.download.mockResolvedValue({ data: new Blob([new Uint8Array([1, 2])]), error: null });
});

it('reserves before uploading immutable bytes and completes only after success', async () => {
  expect(await uploadWithStorageReservation(input)).toEqual({ error: null });
  expect(mocks.rpc.mock.calls[0]).toEqual(['reserve_organization_storage', {
    target_organization: 'clinic', target_bucket: 'clinical-images', target_path: 'clinic/file', requested_bytes: 2,
    requested_sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
  }]);
  expect(mocks.upload).toHaveBeenCalledWith('clinic/file', input.body, { contentType: 'image/png', upsert: false });
  expect(mocks.rpc.mock.calls[1][0]).toBe('complete_organization_storage');
});

it('never uploads when quota reservation is rejected', async () => {
  mocks.rpc.mockReset().mockResolvedValue({ data: null, error: { message: 'storage quota exceeded' } });
  expect((await uploadWithStorageReservation(input)).error?.message).toBe('storage quota exceeded');
  expect(mocks.upload).not.toHaveBeenCalled();
});

it('uses the limited identity for object operations while keeping reservation RPC on the server', async () => {
  vi.stubEnv('STORAGE_LIMITED_WRITER_ENABLED', 'true');
  mocks.writer.mockResolvedValue({ storage: { from: () => ({ upload: mocks.writerUpload, download: mocks.writerDownload }) } });
  mocks.writerUpload.mockResolvedValue({ error: null });
  mocks.writerDownload.mockResolvedValue({ data: new Blob([new Uint8Array([1, 2])]), error: null });
  expect(await uploadWithStorageReservation(input)).toEqual({ error: null });
  expect(mocks.upload).not.toHaveBeenCalled();
  expect(mocks.download).not.toHaveBeenCalled();
  expect(mocks.writerUpload).toHaveBeenCalledTimes(1);
  expect(mocks.writerDownload).toHaveBeenCalledTimes(1);
  expect(mocks.rpc).toHaveBeenCalledTimes(2);
});

it('never falls back to privileged upload when the limited identity fails', async () => {
  vi.stubEnv('STORAGE_LIMITED_WRITER_ENABLED', 'true');
  mocks.writer.mockRejectedValue(new Error('Storage writer authentication failed'));
  await expect(uploadWithStorageReservation(input)).rejects.toThrow('Storage writer authentication failed');
  expect(mocks.upload).not.toHaveBeenCalled();
  expect(mocks.rpc).toHaveBeenCalledTimes(1);
});

it('reconciles a duplicate response after an uncertain successful upload', async () => {
  mocks.upload.mockResolvedValue({ error: { message: 'already exists', statusCode: '409' } });
  expect(await uploadWithStorageReservation(input)).toEqual({ error: null });
  expect(mocks.rpc.mock.calls[1][0]).toBe('complete_organization_storage');
});

it('reconciles a completed receipt when the immutable writer policy rejects another insert', async () => {
  mocks.upload.mockResolvedValue({ error: { message: 'row level security violation', statusCode: '403' } });
  expect(await uploadWithStorageReservation(input)).toEqual({ error: null });
  expect(mocks.rpc.mock.calls[1][0]).toBe('complete_organization_storage');
});

it('does not treat a forbidden insert as success without matching remote bytes', async () => {
  mocks.upload.mockResolvedValue({ error: { message: 'forbidden', statusCode: '403' } });
  mocks.download.mockResolvedValue({ data: new Blob([new Uint8Array([2, 1])]), error: null });
  expect((await uploadWithStorageReservation(input)).error?.message).toContain('fingerprint mismatch');
  expect(mocks.rpc).toHaveBeenCalledTimes(1);
});

it('retains reservation on provider error or uncertain timeout', async () => {
  mocks.upload.mockResolvedValue({ error: { message: 'timeout' } });
  expect((await uploadWithStorageReservation(input)).error?.message).toBe('timeout');
  expect(mocks.rpc).toHaveBeenCalledTimes(1);
});

it('rejects a duplicate with different bytes of the same size', async () => {
  mocks.upload.mockResolvedValue({ error: { message: 'already exists', statusCode: '409' } });
  mocks.download.mockResolvedValue({ data: new Blob([new Uint8Array([2, 1])]), error: null });
  expect((await uploadWithStorageReservation(input)).error?.message).toContain('fingerprint mismatch');
  expect(mocks.rpc).toHaveBeenCalledTimes(1);
});

it('retains capacity when reading back the object fails', async () => {
  mocks.download.mockResolvedValue({ data: null, error: { message: 'timeout' } });
  expect((await uploadWithStorageReservation(input)).error?.message).toContain('reconciliation');
  expect(mocks.rpc).toHaveBeenCalledTimes(1);
});

it('rejects a foreign organization before using service privileges', async () => {
  mocks.permission.mockResolvedValue({ organizationId: 'other' });
  await expect(uploadWithStorageReservation(input)).rejects.toThrow('Forbidden');
  expect(mocks.rpc).not.toHaveBeenCalled();
});

it('rejects foreign paths and empty bodies', async () => {
  await expect(uploadWithStorageReservation({ ...input, path: 'other/file' })).rejects.toThrow('Invalid');
  await expect(uploadWithStorageReservation({ ...input, body: new Uint8Array() })).rejects.toThrow('Invalid');
  expect(mocks.upload).not.toHaveBeenCalled();
});

it('fails closed outside verified environments even for workers', async () => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://production.example');
  await expect(uploadWithStorageReservation({ ...input, asService: true })).rejects.toThrow('verified deployment');
  expect(mocks.rpc).not.toHaveBeenCalled();
});

it('allows the explicitly enabled production deployment to reserve and verify using its own service client', async () => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://lhdksiptpsubktikdses.supabase.co');
  vi.stubEnv('VERCEL_PROJECT_ID', 'prj_Inb0VWS9TnRW0jDohy3vvVjpSgtZ');
  vi.stubEnv('VERCEL_ENV', 'production');
  vi.stubEnv('STORAGE_RESERVATIONS_ENABLED', 'true');
  expect(await uploadWithStorageReservation(input)).toEqual({ error: null });
  expect(mocks.permission).toHaveBeenCalled();
  expect(mocks.writer).not.toHaveBeenCalled();
  expect(mocks.rpc).toHaveBeenCalledTimes(2);
});

it.each([
  ['VERCEL_PROJECT_ID', 'prj_q7UXLUU0wuo0D6KxdPjCw3AfyxrN'],
  ['VERCEL_ENV', 'preview'],
  ['STORAGE_RESERVATIONS_ENABLED', 'false'],
])('rejects a production database with mismatched %s', async (key, value) => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://lhdksiptpsubktikdses.supabase.co');
  vi.stubEnv('VERCEL_PROJECT_ID', 'prj_Inb0VWS9TnRW0jDohy3vvVjpSgtZ');
  vi.stubEnv('VERCEL_ENV', 'production');
  vi.stubEnv('STORAGE_RESERVATIONS_ENABLED', 'true');
  vi.stubEnv(key, value);
  await expect(uploadWithStorageReservation({ ...input, asService: true })).rejects.toThrow('verified deployment');
  expect(mocks.rpc).not.toHaveBeenCalled();
});

it('never tries the staging-only technical identity in production', async () => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://lhdksiptpsubktikdses.supabase.co');
  vi.stubEnv('VERCEL_PROJECT_ID', 'prj_Inb0VWS9TnRW0jDohy3vvVjpSgtZ');
  vi.stubEnv('VERCEL_ENV', 'production');
  vi.stubEnv('STORAGE_RESERVATIONS_ENABLED', 'true');
  vi.stubEnv('STORAGE_LIMITED_WRITER_ENABLED', 'true');
  await expect(uploadWithStorageReservation(input)).rejects.toThrow('not been provisioned');
  expect(mocks.rpc).not.toHaveBeenCalled();
});

it('reports reconciliation failure without releasing uncertain capacity', async () => {
  mocks.rpc.mockReset().mockResolvedValueOnce({ data: 'reservation', error: null })
    .mockResolvedValue({ data: false, error: null });
  expect((await uploadWithStorageReservation(input)).error?.message).toContain('reconciliation');
  expect(mocks.rpc).toHaveBeenCalledTimes(2);
});
