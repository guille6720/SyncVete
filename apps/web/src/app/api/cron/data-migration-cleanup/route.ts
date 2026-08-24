import { NextResponse } from 'next/server';
import { authorizeCronSecret } from '@sincvete/shared';
import type { Json } from '@sincvete/db';
import { createServiceClient } from '@/lib/supabase/server';
import { touchMigrationWorkerHeartbeat } from '@/lib/data-migration/heartbeat';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function unauthorized() {
  return NextResponse.json({ error: 'no autorizado' }, { status: 401 });
}

async function run(request: Request) {
  const secret = process.env.CRON_SECRET;
  const allowed = authorizeCronSecret({
    authorizationHeader: request.headers.get('authorization'),
    cronSecretHeader: request.headers.get('x-cron-secret'),
    secret,
  });
  if (!secret) {
    return NextResponse.json({ error: 'CRON_SECRET no configurado' }, { status: 503 });
  }
  if (!allowed) return unauthorized();

  try {
    const service = await createServiceClient();
    const { data: expiredResult, error: expiredError } = await service.rpc(
      'cleanup_expired_data_export_jobs'
    );
    if (expiredError) throw new Error(expiredError.message);

    const { data: staleResult, error: staleError } = await service.rpc(
      'cleanup_stale_data_import_batches',
      { p_max_age_hours: 168 }
    );
    if (staleError) throw new Error(staleError.message);

    const { data: expiredJobs } = await service
      .from('data_export_jobs')
      .select('id, storage_path')
      .eq('status', 'expired')
      .not('storage_path', 'is', null)
      .limit(50);

    let deletedObjects = 0;
    for (const job of expiredJobs ?? []) {
      if (!job.storage_path) continue;
      const { error } = await service.storage.from('data-migration').remove([job.storage_path]);
      if (!error) {
        deletedObjects += 1;
        await service
          .from('data_export_jobs')
          .update({ storage_path: null, progress_message: 'Expirado · artefacto eliminado' })
          .eq('id', job.id);
      }
    }

    const payload = {
      ok: true as const,
      expired: expiredResult,
      staleImports: staleResult,
      deletedObjects,
    };
    await touchMigrationWorkerHeartbeat({
      workerName: 'data-migration-cleanup',
      ok: true,
      detail: {
        expired: expiredResult as Json,
        staleImports: staleResult as Json,
        deletedObjects,
      },
    });
    return NextResponse.json(payload);
  } catch (error) {
    console.error('[cron/data-migration-cleanup]', error);
    await touchMigrationWorkerHeartbeat({
      workerName: 'data-migration-cleanup',
      ok: false,
      detail: { error: error instanceof Error ? error.message : 'cleanup failed' },
    });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'cleanup failed' },
      { status: 500 }
    );
  }
}

export async function GET(request: Request) {
  return run(request);
}

export async function POST(request: Request) {
  return run(request);
}
