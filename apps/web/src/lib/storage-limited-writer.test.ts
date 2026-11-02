import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { expect, it } from 'vitest';

it('bounds the technical identity by reservation, actual size and immutable path despite permissive policies', async () => {
  const database = new PGlite();
  const writer = '00000000-0000-0000-0000-000000000010';
  const organization = '00000000-0000-0000-0000-000000000001';
  try {
    await database.exec(`
      CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
      CREATE SCHEMA auth; CREATE SCHEMA storage;
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('test.uid',true),'')::uuid $$;
      CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,email_confirmed_at timestamptz,deleted_at timestamptz);
      INSERT INTO auth.users VALUES ('${writer}','storage-writer-20261102@example.invalid',now(),null);
      CREATE TABLE public.organizations(id uuid PRIMARY KEY);
      CREATE TABLE public.organization_storage_quotas(organization_id uuid PRIMARY KEY,quota_bytes bigint);
      CREATE TABLE storage.objects(bucket_id text,name text,metadata jsonb);
      ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
      GRANT USAGE ON SCHEMA storage,auth TO authenticated;
      GRANT ALL ON storage.objects TO authenticated;
      CREATE POLICY legacy_allow ON storage.objects FOR ALL TO authenticated USING (true) WITH CHECK (true);
      INSERT INTO public.organizations VALUES ('${organization}');
      INSERT INTO public.organization_storage_quotas VALUES ('${organization}',100);
    `);
    await database.exec(readFileSync(resolve(process.cwd(), '../../supabase/migrations/20261102120604_organization_storage_reservations.sql'), 'utf8'));
    await database.exec(readFileSync(resolve(process.cwd(), '../../supabase/migrations/20261102125436_organization_storage_limited_writer.sql'), 'utf8'));
    await database.query('SELECT public.reserve_organization_storage($1,$2,$3,$4,$5)', [organization,'clinical-images',`${organization}/file`,2,'a'.repeat(64)]);
    await database.exec(`SELECT set_config('test.uid','${writer}',false); SET ROLE authenticated;`);
    const insert = (path: string, metadata: unknown, bucket = 'clinical-images') => database.query('INSERT INTO storage.objects VALUES ($1,$2,$3)',[bucket,path,metadata]);
    await expect(insert(`${organization}/unreserved`,{size:2})).rejects.toThrow();
    await expect(insert(`${organization}/file`,{size:3})).rejects.toThrow();
    await expect(insert(`${organization}/file`,{})).rejects.toThrow();
    await expect(insert(`${organization}/file`,{size:null,contentLength:2})).rejects.toThrow();
    await expect(insert(`${organization}/file`,{size:2},'patient-photos')).rejects.toThrow();
    await database.exec('BEGIN');
    await insert(`${organization}/file`,{contentLength:2});
    await database.exec('ROLLBACK');
    await insert(`${organization}/file`,{size:2});
    expect((await database.query('SELECT * FROM storage.objects')).rows).toHaveLength(1);
    expect((await database.query("UPDATE storage.objects SET name='moved' RETURNING *")).rows).toHaveLength(0);
    expect((await database.query('DELETE FROM storage.objects RETURNING *')).rows).toHaveLength(0);
    await database.exec("RESET ROLE; INSERT INTO storage.objects VALUES ('other','hidden','{}'); SET ROLE authenticated;");
    expect((await database.query('SELECT * FROM storage.objects')).rows).toHaveLength(1);
    await expect(database.query('SELECT * FROM storage_control.writer_identity')).rejects.toThrow();
    await database.exec('RESET ROLE; UPDATE public.organization_storage_reservations SET completed_at=now(); SET ROLE authenticated;');
    await expect(insert(`${organization}/file`,{size:2})).rejects.toThrow();
    await database.exec("SELECT set_config('test.uid','00000000-0000-0000-0000-000000000099',false)");
    await insert(`${organization}/legacy`,{size:2});
    expect((await database.query('SELECT * FROM storage.objects')).rows).toHaveLength(3);
    await database.exec('RESET ROLE');
    await database.exec(`CREATE FUNCTION storage_control.enforces_path(text) RETURNS boolean LANGUAGE sql AS $$ SELECT coalesce(current_setting('test.protocol_required',true),'false')='true' $$; SELECT set_config('test.protocol_required','true',false);`);
    await database.exec(readFileSync(resolve(process.cwd(), '../../supabase/migrations/20261102144123_organization_storage_direct_write_cutover.sql'), 'utf8'));
    await database.query('SELECT public.reserve_organization_storage($1,$2,$3,$4,$5)',[organization,'clinical-images',`${organization}/after-cutover`,2,'a'.repeat(64)]);
    await database.exec('SET ROLE authenticated');
    await expect(insert(`${organization}/after-cutover`,{size:2})).rejects.toThrow();
    expect((await database.query('SELECT * FROM storage.objects')).rows).toHaveLength(3);
    await insert('unmanaged/path',{size:2},'other');
    await database.exec(`SELECT set_config('test.uid','${writer}',false)`);
    await insert(`${organization}/after-cutover`,{size:2});
    expect((await database.query('SELECT * FROM storage.objects')).rows).toHaveLength(2);
    await expect(insert(`${organization}/after-cutover-copy`,{size:2})).rejects.toThrow();
    await database.exec("SELECT set_config('test.uid','00000000-0000-0000-0000-000000000099',false); SELECT set_config('test.protocol_required','false',false);");
    await insert(`${organization}/protocol-disabled`,{size:2});
  } finally {
    await database.close();
  }
}, 20000);
