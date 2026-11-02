import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { expect, it } from 'vitest';

it('denies direct inserts and both sides of moves despite permissive policies, preserving reads', async () => {
  const database = new PGlite();
  try {
    await database.exec(`
      CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
      CREATE SCHEMA storage;
      CREATE TABLE storage.objects(bucket_id text, name text, metadata jsonb);
      ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
      GRANT USAGE ON SCHEMA storage TO anon, authenticated, service_role;
      GRANT ALL ON storage.objects TO anon, authenticated, service_role;
      CREATE POLICY existing_allow ON storage.objects FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
      INSERT INTO storage.objects VALUES ('patient-photos','clinic/photo','{"size":2}'), ('other','clinic/file','{"size":2}');
    `);
    await database.exec(readFileSync(resolve(process.cwd(), '../../supabase/ops/storage-direct-writes-staging-draft.sql'), 'utf8'));
    for (const role of ['authenticated', 'anon']) {
      await database.exec(`RESET ROLE; SET ROLE ${role}`);
      for (const bucket of ['patient-photos', 'clinical-images', 'data-migration']) {
        await expect(database.query('INSERT INTO storage.objects VALUES ($1,$2,$3)', [bucket, 'clinic/new', { size: 2 }])).rejects.toThrow();
      }
      expect((await database.query("SELECT * FROM storage.objects WHERE bucket_id='patient-photos'")).rows).toHaveLength(1);
      expect((await database.query("UPDATE storage.objects SET name='clinic/moved' WHERE bucket_id='patient-photos' RETURNING *")).rows).toHaveLength(0);
      await expect(database.query("UPDATE storage.objects SET bucket_id='patient-photos' WHERE bucket_id='other'")).rejects.toThrow();
      await expect(database.query("INSERT INTO storage.objects SELECT bucket_id,'clinic/copy',metadata FROM storage.objects WHERE bucket_id='patient-photos'")).rejects.toThrow();
    }
    await database.exec('RESET ROLE; SET ROLE service_role');
    await database.query("INSERT INTO storage.objects VALUES ('patient-photos','clinic/privileged','{}')");
    expect((await database.query("SELECT * FROM storage.objects WHERE name='clinic/privileged'")).rows).toHaveLength(1);
  } finally {
    await database.close();
  }
}, 20000);
