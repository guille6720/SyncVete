import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { expect, it } from 'vitest';

it('enforces reservations even for bypassrls writers while allowing a staged activation', async () => {
  const database = new PGlite();
  const organization = '00000000-0000-0000-0000-000000000001';
  const other = '00000000-0000-0000-0000-000000000002';
  try {
    await database.exec(`
      CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
      CREATE SCHEMA storage; CREATE SCHEMA storage_control;
      CREATE TABLE public.organizations(id uuid PRIMARY KEY);
      CREATE TABLE public.organization_storage_quotas(organization_id uuid PRIMARY KEY,quota_bytes bigint);
      CREATE TABLE storage.objects(bucket_id text,name text,metadata jsonb,version text DEFAULT '1',updated_at timestamptz,last_accessed_at timestamptz);
      ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
      GRANT USAGE ON SCHEMA storage TO service_role;
      GRANT ALL ON storage.objects TO service_role;
      INSERT INTO public.organizations VALUES ('${organization}'),('${other}');
      INSERT INTO public.organization_storage_quotas VALUES ('${organization}',100),('${other}',100);
    `);
    await database.exec(readFileSync(resolve(process.cwd(),'../../supabase/migrations/20261102120604_organization_storage_reservations.sql'),'utf8'));
    await database.exec(readFileSync(resolve(process.cwd(),'../../supabase/migrations/20261102134227_organization_storage_write_guard.sql'),'utf8'));
    await database.query('INSERT INTO storage_control.enforced_organizations VALUES ($1)',[organization]);
    await database.exec('SET ROLE service_role');
    const insert = (path: string, metadata: unknown, bucket = 'clinical-images') => database.query('INSERT INTO storage.objects(bucket_id,name,metadata) VALUES ($1,$2,$3)',[bucket,path,metadata]);
    await insert(`${other}/legacy`,{size:2});
    await expect(insert(`${organization}/unreserved`,{size:2})).rejects.toThrow('pending storage reservation');
    for (const bucket of ['clinical-images','patient-photos','data-migration']) {
      const path = `${organization}/${bucket}`;
      const receipt = await database.query<{id:string}>('SELECT public.reserve_organization_storage($1,$2,$3,$4,$5) AS id',[organization,bucket,path,2,'a'.repeat(64)]);
      await expect(insert(path,{size:3},bucket)).rejects.toThrow('pending storage reservation');
      await expect(insert(path,{},bucket)).rejects.toThrow('size required');
      await database.exec('BEGIN');
      await insert(path,{contentLength:2},bucket);
      await database.exec('ROLLBACK');
      await insert(path,{size:2},bucket);
      await database.query('UPDATE storage.objects SET last_accessed_at=now() WHERE name=$1',[path]);
      await expect(database.query("UPDATE storage.objects SET version='replacement' WHERE name=$1",[path])).rejects.toThrow('immutable');
      await expect(database.query("UPDATE storage.objects SET bucket_id='other' WHERE name=$1",[path])).rejects.toThrow('immutable');
      await expect(database.query("UPDATE storage.objects SET name='moved' WHERE name=$1",[path])).rejects.toThrow('immutable');
      expect((await database.query<{done:boolean}>('SELECT public.complete_organization_storage($1) AS done',[receipt.rows[0].id])).rows[0].done).toBe(true);
      await expect(insert(path,{size:2},bucket)).rejects.toThrow('pending storage reservation');
    }
    await expect(database.query('INSERT INTO public.organization_storage_reservations(organization_id,bucket_id,object_path,bytes,content_sha256) VALUES ($1,$2,$3,$4,$5)',[organization,'clinical-images',`${organization}/forged`,1,'a'.repeat(64)])).rejects.toThrow();
    await expect(database.query('UPDATE storage_control.write_enforcement SET enabled=false')).rejects.toThrow();
    await database.exec('RESET ROLE; UPDATE storage_control.write_enforcement SET enabled=true; SET ROLE service_role;');
    await expect(insert(`${other}/now-guarded`,{size:2})).rejects.toThrow('pending storage reservation');
    await expect(insert('invalid/path',{size:2})).rejects.toThrow('invalid reserved storage path');
    await expect(database.query("UPDATE storage.objects SET bucket_id='clinical-images',name=$1 WHERE name=$2",[`${organization}/moved`,`${other}/legacy`])).rejects.toThrow('immutable');
  } finally {
    await database.close();
  }
},20000);
