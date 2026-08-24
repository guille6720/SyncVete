import 'server-only';

import { createServerClient } from '@/lib/supabase/server';

/**
 * Escape hatch for data-migration PostgREST chains.
 * Job tables and clinical provenance columns are hand-typed in `@sincvete/db`.
 * Keep `from()` loose for dynamic entity tables until codegen is complete.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic entity tables in import workers
export type MigrationDb = { from: (table: string) => any };

export async function migrationDb(): Promise<MigrationDb> {
  return (await createServerClient()) as unknown as MigrationDb;
}
