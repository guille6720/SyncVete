import { accessSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const expectedProject = 'prj_q7UXLUU0wuo0D6KxdPjCw3AfyxrN';
if (process.env.VERCEL_PROJECT_ID !== expectedProject) {
  throw new Error('Storage deployment check requires the staging application project');
}
if (process.env.NEXT_PUBLIC_SUPABASE_URL !== 'https://owmcrqvnfubyjxrlyhlc.supabase.co') {
  throw new Error('Storage deployment check requires the staging database');
}
if (process.env.STORAGE_LIMITED_WRITER_ENABLED !== 'true') {
  throw new Error('Storage deployment requires the limited writer');
}
for (const key of ['STORAGE_WRITER_EMAIL', 'STORAGE_WRITER_PASSWORD', 'STORAGE_WRITER_USER_ID']) {
  if (!process.env[key]) throw new Error('Storage writer configuration is incomplete');
}
for (const path of [
  '../apps/web/src/lib/storage-upload.ts',
  '../apps/web/src/lib/supabase/storage-writer.ts',
  '../supabase/migrations/20261102120604_organization_storage_reservations.sql',
  '../supabase/migrations/20261102144123_organization_storage_direct_write_cutover.sql',
]) {
  accessSync(fileURLToPath(new URL(path, import.meta.url)));
}
console.log('Staging storage deployment prerequisites verified');
