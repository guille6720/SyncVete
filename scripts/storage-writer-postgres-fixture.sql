\set ON_ERROR_STOP on
CREATE SCHEMA auth;
CREATE SCHEMA storage;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('test.uid',true),'')::uuid $$;
CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,email_confirmed_at timestamptz,deleted_at timestamptz);
INSERT INTO auth.users VALUES ('00000000-0000-0000-0000-000000000010','storage-writer-20261102@example.invalid',now(),null);
CREATE TABLE public.organizations(id uuid PRIMARY KEY);
CREATE TABLE public.organization_storage_quotas(organization_id uuid PRIMARY KEY,quota_bytes bigint);
CREATE TABLE storage.objects(bucket_id text,name text,metadata jsonb);
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
GRANT USAGE ON SCHEMA storage,auth TO authenticated;
GRANT ALL ON storage.objects TO authenticated;
CREATE POLICY legacy_allow ON storage.objects FOR ALL TO authenticated USING (true) WITH CHECK (true);
INSERT INTO public.organizations VALUES ('00000000-0000-0000-0000-000000000001');
INSERT INTO public.organization_storage_quotas VALUES ('00000000-0000-0000-0000-000000000001',100);
\ir ../supabase/migrations/20261102120604_organization_storage_reservations.sql
\ir ../supabase/migrations/20261102125436_organization_storage_limited_writer.sql
SELECT public.reserve_organization_storage('00000000-0000-0000-0000-000000000001','clinical-images','00000000-0000-0000-0000-000000000001/file',2,repeat('a',64));
SELECT set_config('test.uid','00000000-0000-0000-0000-000000000010',false);
SET ROLE authenticated;
BEGIN;
INSERT INTO storage.objects VALUES ('clinical-images','00000000-0000-0000-0000-000000000001/file','{"contentLength":2}');
ROLLBACK;
INSERT INTO storage.objects VALUES ('clinical-images','00000000-0000-0000-0000-000000000001/file','{"size":2}');
DO $$ BEGIN
  BEGIN
    INSERT INTO storage.objects VALUES ('clinical-images','00000000-0000-0000-0000-000000000001/unreserved','{"size":2}');
    RAISE EXCEPTION 'unreserved upload accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    INSERT INTO storage.objects VALUES ('clinical-images','00000000-0000-0000-0000-000000000001/file','{"size":3}');
    RAISE EXCEPTION 'oversize upload accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  UPDATE storage.objects SET name='moved';
  IF FOUND THEN RAISE EXCEPTION 'writer update accepted'; END IF;
  DELETE FROM storage.objects;
  IF FOUND THEN RAISE EXCEPTION 'writer delete accepted'; END IF;
END $$;
RESET ROLE;
