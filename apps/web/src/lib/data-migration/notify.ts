import 'server-only';

import { createServiceClient } from '@/lib/supabase/server';

export async function notifyDataMigrationEvent(input: {
  organizationId: string;
  branchId?: string | null;
  title: string;
  body: string;
  relatedType: 'data_import_batch' | 'data_export_job';
  relatedId: string;
  href?: string;
}) {
  try {
    const service = await createServiceClient();
    const { error } = await service.rpc('emit_notification', {
      p_organization_id: input.organizationId,
      p_branch_id: input.branchId ?? null,
      p_kind: 'migracion',
      p_title: input.title,
      p_body: input.body,
      p_href: input.href ?? '/configuracion?tab=import-export',
      p_related_type: input.relatedType,
      p_related_id: input.relatedId,
      p_dedupe_hours: 6,
    });
    if (error) {
      console.warn('[data-migration notify]', error.message);
    }
  } catch (err) {
    console.warn('[data-migration notify]', err);
  }
}
