import 'server-only';

import {
  DATA_MIGRATION_AUDIT_ACTIONS,
} from '@sincvete/shared';
import { migrationDb } from '@/lib/data-migration/db';

export async function logDataMigrationAudit(input: {
  organizationId: string;
  userId: string | null;
  action: (typeof DATA_MIGRATION_AUDIT_ACTIONS)[keyof typeof DATA_MIGRATION_AUDIT_ACTIONS];
  entityType: 'data_import_batches' | 'data_export_jobs' | 'data_migration';
  entityId: string;
  newData?: Record<string, unknown>;
}) {
  try {
    const supabase = await migrationDb();
    await supabase.from('audit_logs').insert({
      organization_id: input.organizationId,
      user_id: input.userId,
      action: input.action,
      entity_type: input.entityType,
      entity_id: input.entityId,
      new_data: (input.newData ?? null) as never,
    });
  } catch (err) {
    console.warn('[data-migration audit]', err);
  }
}
