import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { describe, expect, it } from 'vitest';

describe('storage SQL authorization', () => {
  it('limits the RPC and RLS to the current organization and denies anonymous writes', async () => {
    const database = new PGlite();
    try {
      await database.exec(`
        CREATE ROLE anon; CREATE ROLE authenticated;
        CREATE SCHEMA auth; CREATE SCHEMA storage;
        CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS
          $$ SELECT nullif(current_setting('test.user',true),'')::uuid $$;
        CREATE FUNCTION public.get_user_organization_id() RETURNS uuid LANGUAGE sql AS
          $$ SELECT nullif(current_setting('test.org',true),'')::uuid $$;
        CREATE FUNCTION public.has_permission(text) RETURNS boolean LANGUAGE sql AS
          $$ SELECT coalesce(current_setting('test.allowed',true),'false') = 'true' $$;
        CREATE TABLE public.organizations(id uuid PRIMARY KEY);
        CREATE TABLE public.plans(id uuid PRIMARY KEY, key text);
        CREATE TABLE public.organization_subscriptions(id uuid, organization_id uuid, plan_id uuid, status text, starts_at timestamptz, ends_at timestamptz, created_at timestamptz);
        CREATE TABLE storage.objects(bucket_id text, name text, metadata jsonb);
        INSERT INTO public.organizations VALUES ('00000000-0000-0000-0000-000000000001'), ('00000000-0000-0000-0000-000000000002');
        INSERT INTO storage.objects VALUES
          ('clinical-images','00000000-0000-0000-0000-000000000001/a','{"size":80}'),
          ('clinical-images','00000000-0000-0000-0000-000000000002/b','{"size":950}');
        GRANT USAGE ON SCHEMA public, auth TO authenticated;
      `);
      await database.exec(readFileSync(resolve(process.cwd(), '../../supabase/ops/storage-availability-staging.sql'), 'utf8'));
      await database.exec(`
        UPDATE public.organization_storage_quotas SET quota_bytes=100 WHERE organization_id='00000000-0000-0000-0000-000000000001';
        SELECT set_config('test.user','00000000-0000-0000-0000-000000000003',false);
        SELECT set_config('test.org','00000000-0000-0000-0000-000000000001',false);
        SELECT set_config('test.allowed','true',false);
        SET ROLE authenticated;
      `);
      const own = await database.query<{ status: { usedBytes: number; quotaBytes: number } }>('SELECT public.get_own_storage_status() AS status');
      expect(own.rows[0].status.usedBytes).toBe(80);
      expect(own.rows[0].status.quotaBytes).toBe(100);
      expect((await database.query('SELECT * FROM public.organization_storage_quotas')).rows).toHaveLength(1);
      await expect(database.exec('UPDATE public.organization_storage_quotas SET quota_bytes=99999')).rejects.toThrow();
      await database.exec(`SELECT set_config('test.allowed','false',false)`);
      await expect(database.query('SELECT public.get_own_storage_status()')).rejects.toThrow('forbidden');
      await database.exec('RESET ROLE; SET ROLE anon');
      await expect(database.query('SELECT public.get_own_storage_status()')).rejects.toThrow();
    } finally {
      await database.close();
    }
  }, 20000);
});
