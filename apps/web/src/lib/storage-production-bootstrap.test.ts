import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { expect, it } from 'vitest';

it('bootstraps production without a staging identity and gates privileged writes during cutover', async () => {
  const db = new PGlite();
  const org = '00000000-0000-0000-0000-000000000001';
  try {
    await db.exec(`
      CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
      CREATE SCHEMA auth; CREATE SCHEMA storage;
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
      INSERT INTO public.organizations VALUES ('${org}');
    `);
    await db.exec(readFileSync(resolve(process.cwd(), '../../supabase/ops/storage-production-bootstrap.sql'), 'utf8'));
    expect((await db.query<{ count: number }>('SELECT count(*)::int AS count FROM storage_control.writer_identity')).rows[0].count).toBe(0);
    await db.exec(`SET ROLE service_role; INSERT INTO storage.objects VALUES ('clinical-images','${org}/old-client','{"size":1}'); RESET ROLE;`);
    await db.exec('UPDATE storage_control.write_enforcement SET enabled=true');
    await db.exec('SET ROLE service_role');
    await expect(db.exec(`INSERT INTO storage.objects VALUES ('clinical-images','${org}/unreserved','{"size":2}')`)).rejects.toThrow('pending storage reservation');
    const receipt = await db.query<{ id: string }>('SELECT public.reserve_organization_storage($1,$2,$3,$4,$5) AS id', [org, 'clinical-images', `${org}/reserved`, 2, 'a'.repeat(64)]);
    await db.exec(`INSERT INTO storage.objects VALUES ('clinical-images','${org}/reserved','{"size":2}')`);
    expect((await db.query<{ done: boolean }>('SELECT public.complete_organization_storage($1) AS done', [receipt.rows[0].id])).rows[0].done).toBe(true);
    await expect(db.exec('UPDATE public.organization_storage_quotas SET quota_bytes=1')).rejects.toThrow();
    await db.exec('RESET ROLE; SET ROLE authenticated;');
    await expect(db.exec(`INSERT INTO storage.objects VALUES ('clinical-images','${org}/ordinary','{"size":1}')`)).rejects.toThrow();
  } finally {
    await db.close();
  }
}, 20000);
