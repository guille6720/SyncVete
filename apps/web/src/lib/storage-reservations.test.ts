import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { expect, it } from 'vitest';

it('reserves capacity atomically, fails closed, and reconciles only observed uploads', async () => {
  const database = new PGlite();
  const organization = '00000000-0000-0000-0000-000000000001';
  const otherOrganization = '00000000-0000-0000-0000-000000000002';
  try {
    await database.exec(`
      CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
      CREATE SCHEMA storage;
      CREATE TABLE public.organizations(id uuid PRIMARY KEY);
      CREATE TABLE public.organization_storage_quotas(organization_id uuid PRIMARY KEY, quota_bytes bigint);
      CREATE TABLE storage.objects(bucket_id text, name text, metadata jsonb);
      INSERT INTO public.organizations VALUES ('${organization}'), ('${otherOrganization}');
      INSERT INTO public.organization_storage_quotas VALUES ('${organization}',100), ('${otherOrganization}',100);
      GRANT USAGE ON SCHEMA public TO service_role, authenticated, anon;
    `);
    await database.exec(readFileSync(resolve(process.cwd(), '../../supabase/migrations/20261102120604_organization_storage_reservations.sql'), 'utf8'));
    const reserve = (bytes: number, suffix: string, target = organization) => database.query<{ id: string }>(
      'SELECT public.reserve_organization_storage($1,$2,$3,$4,$5) AS id',
      [target, 'clinical-images', `${target}/${suffix}`, bytes, 'a'.repeat(64)],
    );
    await database.exec('SET ROLE service_role');
    const reservation = (await reserve(60, 'first')).rows[0].id;
    expect((await reserve(60, 'first')).rows[0].id).toBe(reservation);
    await expect(reserve(59, 'first')).rejects.toThrow('idempotency conflict');
    await expect(reserve(41, 'second')).rejects.toThrow('storage quota exceeded');
    await expect(reserve(0, 'invalid')).rejects.toThrow('invalid storage reservation');
    await expect(database.query('SELECT public.reserve_organization_storage($1,$2,$3,$4,$5)',
      [organization, 'clinical-images', `${otherOrganization}/cross`, 1, 'a'.repeat(64)])).rejects.toThrow('invalid storage reservation');
    expect((await reserve(100, 'independent', otherOrganization)).rows).toHaveLength(1);
    expect((await database.query<{ completed: boolean }>('SELECT public.complete_organization_storage($1) AS completed', [reservation])).rows[0].completed).toBe(false);
    await database.exec(`RESET ROLE; INSERT INTO storage.objects VALUES ('clinical-images','${organization}/first','{"size":60}'); SET ROLE service_role;`);
    expect((await database.query<{ completed: boolean }>('SELECT public.complete_organization_storage($1) AS completed', [reservation])).rows[0].completed).toBe(true);
    expect((await database.query<{ completed: boolean }>('SELECT public.complete_organization_storage($1) AS completed', [reservation])).rows[0].completed).toBe(true);
    expect((await reserve(60, 'first')).rows[0].id).toBe(reservation);
    await reserve(40, 'exact');
    await expect(reserve(1, 'overflow')).rejects.toThrow('storage quota exceeded');
    await database.exec(`RESET ROLE; UPDATE public.organization_storage_quotas SET quota_bytes=50 WHERE organization_id='${organization}'; SET ROLE service_role;`);
    await expect(reserve(1, 'downgrade')).rejects.toThrow('storage quota exceeded');
    await database.exec(`RESET ROLE; UPDATE storage.objects SET metadata='{}'; SET ROLE service_role;`);
    await expect(reserve(1, 'unknown')).rejects.toThrow('storage measurement incomplete');
    await database.exec('RESET ROLE; SET ROLE authenticated');
    await expect(reserve(1, 'forbidden')).rejects.toThrow();
    await expect(database.query('SELECT * FROM public.organization_storage_reservations')).rejects.toThrow();
    await database.exec('RESET ROLE; SET ROLE anon');
    await expect(reserve(1, 'anonymous')).rejects.toThrow();
  } finally {
    await database.close();
  }
}, 20000);
