\set ON_ERROR_STOP on
\ir storage-writer-postgres-fixture.sql
\ir ../supabase/migrations/20261102134227_organization_storage_write_guard.sql
INSERT INTO storage_control.enforced_organizations VALUES ('00000000-0000-0000-0000-000000000001');
GRANT USAGE ON SCHEMA storage TO service_role;
GRANT ALL ON storage.objects TO service_role;
SET ROLE service_role;
SELECT public.reserve_organization_storage('00000000-0000-0000-0000-000000000001','clinical-images','00000000-0000-0000-0000-000000000001/guarded',2,repeat('a',64));
BEGIN;
INSERT INTO storage.objects VALUES ('clinical-images','00000000-0000-0000-0000-000000000001/guarded','{"contentLength":2}');
ROLLBACK;
INSERT INTO storage.objects VALUES ('clinical-images','00000000-0000-0000-0000-000000000001/guarded','{"size":2}');
DO $$ BEGIN
  BEGIN
    INSERT INTO storage.objects VALUES ('clinical-images','00000000-0000-0000-0000-000000000001/unreserved','{"size":2}');
    RAISE EXCEPTION 'privileged bypass accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    UPDATE storage.objects SET name='moved' WHERE name='00000000-0000-0000-0000-000000000001/guarded';
    RAISE EXCEPTION 'privileged move accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    UPDATE public.organization_storage_quotas SET quota_bytes=1000000;
    RAISE EXCEPTION 'privileged quota forgery accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;
RESET ROLE;
