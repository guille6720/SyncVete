import 'server-only';
import { createHash } from 'node:crypto';

import { createServiceClient } from '@/lib/supabase/server';
import { requirePermission } from '@/lib/permissions';
import { createStorageWriterClient } from '@/lib/supabase/storage-writer';
import { readServerEnv } from '@/lib/server-env';

type UploadInput = {
  organizationId: string;
  bucket: 'clinical-images' | 'patient-photos' | 'data-migration';
  path: string;
  body: File | Blob | Uint8Array;
  contentType: string;
  asService?: boolean;
};

export async function uploadWithStorageReservation(input: UploadInput) {
  const staging = process.env.NEXT_PUBLIC_SUPABASE_URL === 'https://owmcrqvnfubyjxrlyhlc.supabase.co';
  const production = process.env.NEXT_PUBLIC_SUPABASE_URL === 'https://lhdksiptpsubktikdses.supabase.co'
    && readServerEnv('VERCEL_PROJECT_ID') === 'prj_Inb0VWS9TnRW0jDohy3vvVjpSgtZ'
    && readServerEnv('VERCEL_ENV') === 'production'
    && readServerEnv('STORAGE_RESERVATIONS_ENABLED') === 'true';
  if (!staging && !production) {
    throw new Error('Storage reservations require a verified deployment environment');
  }
  if (production && readServerEnv('STORAGE_LIMITED_WRITER_ENABLED') === 'true') {
    throw new Error('Production storage writer configuration has not been provisioned');
  }
  if (!input.asService) {
    const permission = input.bucket === 'clinical-images' ? 'clinical:write'
      : input.bucket === 'patient-photos' ? 'patients:write'
        : input.path.includes('/exports/') ? 'data:export' : 'data:import';
    const session = await requirePermission(permission);
    if (session.organizationId !== input.organizationId) throw new Error('Forbidden storage organization');
  }
  const bytes = input.body instanceof Uint8Array ? input.body.byteLength : input.body.size;
  if (!Number.isSafeInteger(bytes) || bytes <= 0 || input.path.split('/')[0] !== input.organizationId) {
    throw new Error('Invalid storage upload');
  }
  const client = await createServiceClient();
  const content = input.body instanceof Uint8Array ? new Uint8Array(input.body) : new Uint8Array(await input.body.arrayBuffer());
  const fingerprint = createHash('sha256').update(content).digest('hex');
  const rpc = client.rpc.bind(client) as unknown as (
    name: string, args: Record<string, unknown>
  ) => Promise<{ data: unknown; error: { message: string } | null }>;
  const reservation = await rpc('reserve_organization_storage', {
    target_organization: input.organizationId,
    target_bucket: input.bucket,
    target_path: input.path,
    requested_bytes: bytes,
    requested_sha256: fingerprint,
  });
  if (reservation.error || typeof reservation.data !== 'string') {
    return { error: { message: reservation.error?.message ?? 'Storage reservation failed' } };
  }
  const writer = readServerEnv('STORAGE_LIMITED_WRITER_ENABLED') === 'true'
    ? await createStorageWriterClient() : client;
  const result = await writer.storage.from(input.bucket).upload(input.path, content, {
    contentType: input.contentType,
    upsert: false,
  });
  const uploadStatus = String((result.error as { statusCode?: string } | null)?.statusCode);
  if (!result.error || uploadStatus === '409' || uploadStatus === '403') {
    const observed = await writer.storage.from(input.bucket).download(input.path);
    if (observed.error || !observed.data) {
      return { error: { message: 'Upload requires storage reconciliation' } };
    }
    const observedContent = new Uint8Array(await observed.data.arrayBuffer());
    if (observedContent.byteLength !== bytes || createHash('sha256').update(observedContent).digest('hex') !== fingerprint) {
      return { error: { message: 'Storage content fingerprint mismatch' } };
    }
    const completion = await rpc('complete_organization_storage', { reservation_id: reservation.data });
    if (completion.error || completion.data !== true) {
      return { error: { message: 'Upload requires storage reconciliation' } };
    }
    return { error: null };
  }
  return { error: result.error };
}
