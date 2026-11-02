import 'server-only';

import { createClient } from '@supabase/supabase-js';
import { readServerEnv } from '@/lib/server-env';

export async function createStorageWriterClient() {
  const url = readServerEnv('NEXT_PUBLIC_SUPABASE_URL');
  const apiKey = readServerEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY');
  const email = readServerEnv('STORAGE_WRITER_EMAIL');
  const password = readServerEnv('STORAGE_WRITER_PASSWORD');
  const expectedUserId = readServerEnv('STORAGE_WRITER_USER_ID');
  if (url !== 'https://owmcrqvnfubyjxrlyhlc.supabase.co') {
    throw new Error('Storage writer requires the verified staging project');
  }
  if (!apiKey || !email || !password || !expectedUserId) {
    throw new Error('Storage writer configuration is incomplete');
  }
  const client = createClient(url, apiKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data.session || data.user?.id !== expectedUserId || data.session.user.id !== expectedUserId) {
    throw new Error('Storage writer authentication failed');
  }
  return client;
}
