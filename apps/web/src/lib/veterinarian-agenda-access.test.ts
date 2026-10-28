import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { beforeAll, beforeEach, afterEach, afterAll, describe, expect, it } from 'vitest';

const orgA = 'a0000000-0000-4000-8000-000000000001';
const orgB = 'b0000000-0000-4000-8000-000000000001';
const vet = 'a0000000-0000-4000-8000-000000000002';
const colleague = 'a0000000-0000-4000-8000-000000000003';
const foreignVet = 'b0000000-0000-4000-8000-000000000002';
const migrations = resolve(process.cwd(), '../../supabase/migrations');
const source = readFileSync(
  resolve(migrations, '20261014120000_central_admin_managed_users.sql'),
  'utf8'
);
const functionSql = (name: string) => {
  const start = source.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`);
  return source.slice(start, source.indexOf('$$;', start) + 3);
};
let db: PGlite;
describe('veterinarian professional agenda access', () => {
  beforeAll(async () => {
    db = new PGlite();
    await db.exec(`
      create role authenticated; create role anon; create schema auth;
      create type public.user_role as enum ('owner','admin','veterinarian','nurse','receptionist','cashier','lab_tech','readonly');
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.actor',true),'')::uuid$$;
      create table public.profiles(id uuid primary key,organization_id uuid,is_active boolean default true,deleted_at timestamptz,active_branch_id uuid);
      create table public.branch_members(user_id uuid,organization_id uuid,branch_id uuid,role public.user_role,permissions jsonb,is_active boolean default true,deleted_at timestamptz,created_at timestamptz default now());
      create table public.user_permission_overrides(user_id uuid,organization_id uuid,permission_key text,enabled boolean);
      create function public.get_user_organization_id() returns uuid language sql stable security definer as $$select organization_id from public.profiles where id=auth.uid() and is_active and deleted_at is null$$;
      create function public.user_has_branch_access(b uuid) returns boolean language sql stable security definer as $$select exists(select 1 from public.branch_members where user_id=auth.uid() and branch_id=b and is_active and deleted_at is null)$$;
      grant usage on schema public,auth to authenticated;
      grant select on public.profiles,public.branch_members,public.user_permission_overrides to authenticated;
    `);
    await db.exec(functionSql('permission_catalog'));
    await db.exec(functionSql('role_permissions'));
    await db.exec(functionSql('permission_parent'));
    await db.exec(functionSql('has_permission'));
    const before = (
      await db.query<{ role: string; permissions: string[] }>(
        `select r::text role,public.role_permissions(r) permissions from unnest(enum_range(null::public.user_role)) r`
      )
    ).rows;
    await db.exec(
      readFileSync(
        resolve(
          migrations,
          readdirSync(migrations).find((n) => n.endsWith('_veterinarian_professional_agendas.sql'))!
        ),
        'utf8'
      )
    );
    const after = (
      await db.query<{ role: string; permissions: string[] }>(
        `select r::text role,public.role_permissions(r) permissions from unnest(enum_range(null::public.user_role)) r`
      )
    ).rows;
    for (const entry of before) {
      const expected =
        entry.role === 'veterinarian'
          ? [...entry.permissions, 'professionals:read']
          : entry.permissions;
      expect(after.find((r) => r.role === entry.role)?.permissions.sort()).toEqual(
        [...expected].sort()
      );
    }
    await db.exec(`
      insert into public.profiles(id,organization_id,active_branch_id) values ('${vet}','${orgA}','${orgA}'),('${colleague}','${orgA}','${orgA}'),('${foreignVet}','${orgB}','${orgB}');
      insert into public.branch_members(user_id,organization_id,branch_id,role) values ('${vet}','${orgA}','${orgA}','veterinarian'),('${colleague}','${orgA}','${orgA}','veterinarian'),('${foreignVet}','${orgB}','${orgB}','veterinarian');
      create table public.professionals(id uuid primary key,organization_id uuid,deleted_at timestamptz);
      create table public.professional_schedules(user_id uuid,organization_id uuid,branch_id uuid,deleted_at timestamptz);
      alter table public.professionals enable row level security;
      alter table public.professional_schedules enable row level security;
      create policy professionals_read on public.professionals for select using(organization_id=public.get_user_organization_id() and deleted_at is null and public.has_permission('professionals:read'));
      create policy professionals_write on public.professionals for update using(organization_id=public.get_user_organization_id() and public.has_permission('professionals:write'));
      create policy schedules_read on public.professional_schedules for select using(organization_id=public.get_user_organization_id() and deleted_at is null and public.has_permission('appointments:read') and public.user_has_branch_access(branch_id));
      grant select,update on public.professionals to authenticated;
      grant select on public.professional_schedules to authenticated;
      insert into public.professionals values('${colleague}','${orgA}',null),('${foreignVet}','${orgB}',null);
      insert into public.professional_schedules values('${colleague}','${orgA}','${orgA}',null),('${foreignVet}','${orgB}','${orgB}',null);
    `);
  }, 30000);
  beforeEach(async () => {
    await db.exec(`begin;set role authenticated;set request.actor='${vet}'`);
  });
  afterEach(async () => {
    await db.exec('rollback;reset role');
  });
  afterAll(async () => {
    await db?.close();
  });
  it('reads another professional and their schedule within the clinic', async () => {
    expect((await db.query('select * from public.professionals')).rows).toHaveLength(1);
    expect(
      (await db.query<{ user_id: string }>('select * from public.professional_schedules')).rows[0]
        .user_id
    ).toBe(colleague);
  });
  it('keeps professional editing and financial permissions denied', async () => {
    const { rows } = await db.query<{ allowed: boolean }>(
      `select public.has_permission(p) allowed from unnest(array['professionals:write','professional_compensation:read','professional_settlements:read','users:manage']) p`
    );
    expect(rows.every((r) => r.allowed === false)).toBe(true);
    expect(
      (await db.query(`update public.professionals set deleted_at=now() returning id`)).rows
    ).toHaveLength(0);
  });
  it('keeps other clinics and unauthorized branches inaccessible', async () => {
    expect(
      (await db.query(`select * from public.professionals where organization_id='${orgB}'`)).rows
    ).toHaveLength(0);
    expect(
      (await db.query(`select * from public.professional_schedules where branch_id='${orgB}'`)).rows
    ).toHaveLength(0);
  });
  it('still honors explicit personal restrictions', async () => {
    await db.exec(
      `reset role;insert into public.user_permission_overrides values('${vet}','${orgA}','professionals:read',false);set role authenticated`
    );
    expect((await db.query('select * from public.professionals')).rows).toHaveLength(0);
  });
  it('keeps deliberate custom grants and suspended memberships restricted', async () => {
    await db.exec(
      `reset role;update public.branch_members set permissions='["appointments:read"]' where user_id='${vet}';set role authenticated`
    );
    expect((await db.query('select * from public.professionals')).rows).toHaveLength(0);
    await db.exec(
      `reset role;update public.branch_members set is_active=false where user_id='${vet}';set role authenticated`
    );
    expect((await db.query('select * from public.professional_schedules')).rows).toHaveLength(0);
  });
});
