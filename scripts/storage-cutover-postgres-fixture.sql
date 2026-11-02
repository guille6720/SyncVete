\set ON_ERROR_STOP on
\ir storage-guard-postgres-fixture.sql
\ir ../supabase/migrations/20261102144123_organization_storage_direct_write_cutover.sql
SELECT public.reserve_organization_storage('00000000-0000-0000-0000-000000000001','clinical-images','00000000-0000-0000-0000-000000000001/cutover-positive',2,repeat('a',64));
SELECT set_config('test.uid','00000000-0000-0000-0000-000000000099',false);
SET ROLE authenticated;
DO $$ BEGIN
  BEGIN
    INSERT INTO storage.objects VALUES ('clinical-images','00000000-0000-0000-0000-000000000001/cutover-positive','{"size":2}');
    RAISE EXCEPTION 'ordinary authenticated writer bypass accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;
SELECT set_config('test.uid','00000000-0000-0000-0000-000000000010',false);
INSERT INTO storage.objects VALUES ('clinical-images','00000000-0000-0000-0000-000000000001/cutover-positive','{"size":2}');
RESET ROLE;
