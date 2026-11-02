\set ON_ERROR_STOP on
CREATE SCHEMA auth;
CREATE SCHEMA storage;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT NULL::uuid $$;
CREATE TABLE auth.users(id uuid PRIMARY KEY);
CREATE TABLE public.organizations(id uuid PRIMARY KEY);
CREATE TABLE public.plans(id uuid PRIMARY KEY,key text);
CREATE TABLE public.organization_subscriptions(id uuid,organization_id uuid,plan_id uuid,status text,starts_at timestamptz,ends_at timestamptz,created_at timestamptz);
CREATE FUNCTION public.get_user_organization_id() RETURNS uuid LANGUAGE sql AS $$ SELECT NULL::uuid $$;
CREATE FUNCTION public.has_permission(text) RETURNS boolean LANGUAGE sql AS $$ SELECT false $$;
CREATE TABLE storage.objects(bucket_id text,name text,metadata jsonb);
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
GRANT USAGE ON SCHEMA storage TO authenticated,service_role;
GRANT ALL ON storage.objects TO authenticated,service_role;
CREATE POLICY old_insert ON storage.objects FOR INSERT TO authenticated WITH CHECK (true);
INSERT INTO public.organizations VALUES ('00000000-0000-0000-0000-000000000001');
\ir ../supabase/ops/storage-production-bootstrap.sql
DO $$ BEGIN
  IF EXISTS(SELECT FROM storage_control.writer_identity) THEN RAISE EXCEPTION 'unexpected production writer'; END IF;
END $$;
SET ROLE service_role;
INSERT INTO storage.objects VALUES ('clinical-images','00000000-0000-0000-0000-000000000001/old-client','{"size":1}');
RESET ROLE;
UPDATE storage_control.write_enforcement SET enabled=true;
SET ROLE service_role;
DO $$ BEGIN
  BEGIN
    INSERT INTO storage.objects VALUES ('clinical-images','00000000-0000-0000-0000-000000000001/unreserved','{"size":2}');
    RAISE EXCEPTION 'unreserved write accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
SELECT public.reserve_organization_storage('00000000-0000-0000-0000-000000000001','clinical-images','00000000-0000-0000-0000-000000000001/reserved',2,repeat('a',64)) AS receipt \gset
INSERT INTO storage.objects VALUES ('clinical-images','00000000-0000-0000-0000-000000000001/reserved','{"size":2}');
SELECT public.complete_organization_storage(:'receipt');
RESET ROLE;
SET ROLE authenticated;
DO $$ BEGIN
  BEGIN
    INSERT INTO storage.objects VALUES ('clinical-images','00000000-0000-0000-0000-000000000001/ordinary','{"size":1}');
    RAISE EXCEPTION 'ordinary write accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
