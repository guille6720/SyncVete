import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const migrations = resolve(process.cwd(), '../../supabase/migrations');
const original = readFileSync(resolve(migrations, '20261014120000_central_admin_managed_users.sql'), 'utf8');
const start = original.indexOf('CREATE OR REPLACE FUNCTION public.assert_managed_seat_available(');
const seatGuard = original.slice(start, original.indexOf('$$;', start) + 3);
const clinic = 'a0000000-0000-4000-8000-000000000001';
const otherClinic = 'b0000000-0000-4000-8000-000000000001';
const actor = 'a0000000-0000-4000-8000-000000000002';
let db: PGlite;

describe('platform admin managed-user quota', () => {
  beforeAll(async () => {
    db = new PGlite();
    await db.exec(`
      create role authenticated; create role anon; create schema auth;
      create function auth.uid() returns uuid language sql stable as
        $$select nullif(current_setting('request.actor',true),'')::uuid$$;
      create table public.platform_admins(user_id uuid primary key,is_active boolean);
      create table public.profiles(id uuid primary key,organization_id uuid,is_active boolean);
      create table public.managed_user_settings(organization_id uuid primary key,managed_user_limit integer);
      create function public.is_platform_admin() returns boolean language sql stable security definer
        as $$select exists(select 1 from public.platform_admins where user_id=auth.uid() and is_active)$$;
      create function public.get_user_organization_id() returns uuid language sql stable security definer
        as $$select organization_id from public.profiles where id=auth.uid() and is_active$$;
      create function public.managed_user_count(uuid) returns integer language sql stable
        as $$select 12$$;
      grant usage on schema public,auth to authenticated,anon;
    `);
    await db.exec(readFileSync(resolve(migrations, '20261028122050_platform_admin_managed_seat_exemption.sql'), 'utf8'));
    await db.exec(seatGuard);
    await db.exec(`
      create function public.quota_probe(uuid) returns integer language plpgsql security definer as $$
      begin perform public.assert_managed_seat_available($1); return public.managed_user_limit($1); end; $$;
      revoke all on function public.quota_probe(uuid) from public,anon;
      grant execute on function public.quota_probe(uuid) to authenticated;
    `);
  });
  afterAll(async () => db.close());
  beforeEach(async () => {
    await db.exec(`reset role;truncate public.platform_admins,public.profiles,public.managed_user_settings;
      insert into public.profiles values('${actor}','${clinic}',true);
      select set_config('request.actor','${actor}',false);`);
  });
  it('preserves the default quota for ordinary clinic accounts', async () => {
    expect((await db.query<{ n: number }>(`select public.managed_user_limit('${clinic}') n`)).rows[0].n).toBe(10);
    await expect(db.query(`select public.quota_probe('${clinic}')`)).rejects.toThrow('MANAGED_USER_LIMIT_REACHED:10');
  });
  it('preserves configured quotas for ordinary clinic accounts', async () => {
    await db.exec(`insert into public.managed_user_settings values('${clinic}',20);set role authenticated;`);
    expect((await db.query<{ n: number }>(`select public.quota_probe('${clinic}') n`)).rows[0].n).toBe(20);
  });
  it('permits an active platform admin above the quota in their own clinic', async () => {
    await db.exec(`insert into public.platform_admins values('${actor}',true);set role authenticated;`);
    expect((await db.query<{ n: number | null }>(`select public.quota_probe('${clinic}') n`)).rows[0].n).toBeNull();
  });
  it('does not exempt a different organization', async () => {
    await db.exec(`insert into public.platform_admins values('${actor}',true);set role authenticated;`);
    await expect(db.query(`select public.quota_probe('${otherClinic}')`)).rejects.toThrow('MANAGED_USER_LIMIT_REACHED:10');
  });
  it('does not exempt a deactivated platform admin', async () => {
    await db.exec(`insert into public.platform_admins values('${actor}',false);set role authenticated;`);
    await expect(db.query(`select public.quota_probe('${clinic}')`)).rejects.toThrow('MANAGED_USER_LIMIT_REACHED:10');
  });
  it('does not exempt an inactive clinic profile', async () => {
    await db.exec(`insert into public.platform_admins values('${actor}',true);
      update public.profiles set is_active=false;set role authenticated;`);
    await expect(db.query(`select public.quota_probe('${clinic}')`)).rejects.toThrow('MANAGED_USER_LIMIT_REACHED:10');
  });
  it('keeps the internal helper inaccessible directly to clinic accounts', async () => {
    await db.exec('set role authenticated');
    await expect(db.query(`select public.managed_user_limit('${clinic}')`)).rejects.toThrow('permission denied');
  });
  it('does not expose quota checks to anonymous callers', async () => {
    await db.exec("select set_config('request.actor','',false);set role anon;");
    await expect(db.query(`select public.quota_probe('${clinic}')`)).rejects.toThrow('permission denied');
  });
});
