import 'server-only';

import type { Json } from '@sincvete/db';
import { createServiceClient } from '@/lib/supabase/server';

export async function touchMigrationWorkerHeartbeat(input: {
  workerName: 'data-import' | 'data-export' | 'data-migration-cleanup';
  ok: boolean;
  detail?: Json;
}) {
  try {
    const service = await createServiceClient();
    const { error } = await service.rpc('touch_data_migration_worker_heartbeat', {
      p_worker_name: input.workerName,
      p_ok: input.ok,
      p_detail: input.detail ?? {},
    });
    if (error) {
      console.warn('[data-migration heartbeat]', error.message);
    }
  } catch (err) {
    console.warn('[data-migration heartbeat]', err);
  }
}
