import { NextResponse } from 'next/server';
import { authorizeCronSecret } from '@sincvete/shared';
import { processNextQueuedExportJobs } from '@/lib/data-migration/export';
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
    const result = await processNextQueuedExportJobs({ maxJobs: 2 });
    await touchMigrationWorkerHeartbeat({
      workerName: 'data-export',
      ok: true,
      detail: { results: JSON.parse(JSON.stringify(result)) },
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error('[cron/data-export]', error);
    await touchMigrationWorkerHeartbeat({
      workerName: 'data-export',
      ok: false,
      detail: { error: error instanceof Error ? error.message : 'failed' },
    });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'falló el worker de export' },
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
