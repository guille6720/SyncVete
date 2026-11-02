import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ createClient: vi.fn(), signIn: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('@supabase/supabase-js', () => ({ createClient: mocks.createClient }));
import { createStorageWriterClient } from './storage-writer';

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://owmcrqvnfubyjxrlyhlc.supabase.co');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'fictitious-public-key');
  vi.stubEnv('STORAGE_WRITER_EMAIL', 'writer@example.invalid');
  vi.stubEnv('STORAGE_WRITER_PASSWORD', 'fictitious-test-password');
  vi.stubEnv('STORAGE_WRITER_USER_ID', 'fictitious-writer-id');
  mocks.createClient.mockReturnValue({ auth: { signInWithPassword: mocks.signIn } });
  mocks.signIn.mockResolvedValue({ data: { user: { id: 'fictitious-writer-id' }, session: { user: { id: 'fictitious-writer-id' } } }, error: null });
});
afterEach(() => vi.unstubAllEnvs());

it('authenticates an isolated client with the public key and pinned writer identity', async () => {
  await createStorageWriterClient();
  expect(mocks.createClient).toHaveBeenCalledWith('https://owmcrqvnfubyjxrlyhlc.supabase.co', 'fictitious-public-key', {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  expect(mocks.signIn).toHaveBeenCalledWith({ email: 'writer@example.invalid', password: 'fictitious-test-password' });
});

it('rejects any project other than staging before authenticating', async () => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://other.example.invalid');
  await expect(createStorageWriterClient()).rejects.toThrow('verified staging');
  expect(mocks.createClient).not.toHaveBeenCalled();
});

it('rejects missing writer configuration without using service credentials', async () => {
  vi.stubEnv('STORAGE_WRITER_PASSWORD', '');
  await expect(createStorageWriterClient()).rejects.toThrow('configuration is incomplete');
  expect(mocks.createClient).not.toHaveBeenCalled();
});

it('rejects identity substitution', async () => {
  mocks.signIn.mockResolvedValue({ data: { user: { id: 'different' }, session: { user: { id: 'different' } } }, error: null });
  await expect(createStorageWriterClient()).rejects.toThrow('authentication failed');
});

it('does not disclose provider errors or credentials when authentication fails', async () => {
  mocks.signIn.mockResolvedValue({ data: { user: null, session: null }, error: { message: 'sensitive provider detail' } });
  await expect(createStorageWriterClient()).rejects.toThrow(/^Storage writer authentication failed$/);
});
