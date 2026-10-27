import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const orgA = 'a0000000-0000-4000-8000-000000000001';
const orgB = 'b0000000-0000-4000-8000-000000000001';
const userA = 'a0000000-0000-4000-8000-000000000002';
const userA2 = 'a0000000-0000-4000-8000-000000000003';
const userB = 'b0000000-0000-4000-8000-000000000002';
let db: PGlite;

describe('audit member filters and database isolation', () => {
  beforeAll(async () => {
    db = new PGlite();
    await db.exec(`
      create role authenticated; create role anon;
      create schema auth;
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.actor',true),'')::uuid$$;
      create function public.get_user_organization_id() returns uuid language sql stable as $$select nullif(current_setting('request.org',true),'')::uuid$$;
      create function public.has_permission(p text) returns boolean language sql stable as $$select current_setting('request.audit',true)='true'$$;
      create function public.audit_event_summary(a text,e text,o jsonb,n jsonb) returns text language sql stable as $$select a||' '||e$$;
      create table public.profiles(id uuid primary key,organization_id uuid,full_name text,is_active boolean,deleted_at timestamptz);
      create table public.branch_members(organization_id uuid,user_id uuid,role text,is_active boolean,deleted_at timestamptz);
      create table public.branches(id uuid primary key,organization_id uuid,name text);
      create table public.audit_logs(id uuid primary key,organization_id uuid,branch_id uuid,user_id uuid,action text,entity_type text,entity_id uuid,old_data jsonb,new_data jsonb,created_at timestamptz);
      alter table public.profiles enable row level security;
      alter table public.branch_members enable row level security;
      alter table public.audit_logs enable row level security;
      alter table public.branches enable row level security;
      create policy tenant on public.profiles for select using (organization_id=public.get_user_organization_id() and deleted_at is null);
      create policy tenant on public.branch_members for select using (organization_id=public.get_user_organization_id() and deleted_at is null);
      create policy tenant on public.branches for select using (organization_id=public.get_user_organization_id());
      create policy audit_read on public.audit_logs for select using (organization_id=public.get_user_organization_id() and public.has_permission('audit:read'));
      grant usage on schema public,auth to authenticated,anon;
      grant select on public.profiles,public.branch_members,public.branches,public.audit_logs to authenticated;
      insert into public.profiles values ('${userA}','${orgA}','Alex',true,null),('${userA2}','${orgA}','Alex',false,null),('${userB}','${orgB}','Otra clínica',true,null);
      insert into public.branch_members values ('${orgA}','${userA}','veterinarian',true,null),('${orgA}','${userA}','admin',true,null),('${orgA}','${userA2}','nurse',false,null),('${orgB}','${userB}','owner',true,null);
      insert into public.audit_logs
      select ('c0000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,'${orgA}',null,'${userA}','update','patients',null,null,'{"title":"Control"}', '2026-10-27T15:00:00Z' from generate_series(1,30) i;
      insert into public.audit_logs
      select ('d0000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,'${orgA}',null,'${userA2}','create','professional_payments',null,null,'{"title":"Control"}', '2026-10-26T15:00:00Z' from generate_series(1,5) i;
      insert into public.audit_logs values ('e0000000-0000-4000-8000-000000000001','${orgB}',null,'${userB}','create','patients',null,null,null,'2026-10-27T15:00:00Z');
    `);
    await db.exec(
      readFileSync(
        resolve(process.cwd(), '../../supabase/migrations/20261027203034_audit_member_filter.sql'),
        'utf8'
      )
    );
  }, 30000);
  beforeEach(async () => {
    await db.exec(
      `begin; set role authenticated; set request.org='${orgA}'; set request.actor='${userA}'; set request.audit='true';`
    );
  });
  afterEach(async () => {
    await db.exec('rollback; reset role');
  });
  afterAll(async () => {
    await db?.close();
  });

  it('lists all clinic members once with every category, including inactive colleagues', async () => {
    const { rows } = await db.query<{ user_id: string; roles: string[]; is_active: boolean }>(
      'select * from public.list_audit_members()'
    );
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.user_id === userA)?.roles).toEqual(['admin', 'veterinarian']);
    expect(rows.find((r) => r.user_id === userA2)?.is_active).toBe(false);
    expect(rows.some((r) => r.user_id === userB)).toBe(false);
  });
  it('filters by identity even when two colleagues have the same name', async () => {
    const { rows } = await db.query<{ user_id: string; total_count: number }>(
      `select * from public.search_audit_logs_by_member(p_user_id=>'${userA2}')`
    );
    expect(rows).toHaveLength(5);
    expect(rows.every((r) => r.user_id === userA2 && Number(r.total_count) === 5)).toBe(true);
  });
  it('applies the member filter before counting and stable pagination', async () => {
    const first = await db.query<{ id: string; total_count: number }>(
      `select * from public.search_audit_logs_by_member(p_user_id=>'${userA}',p_page_size=>2)`
    );
    const next = await db.query<{ id: string; total_count: number }>(
      `select * from public.search_audit_logs_by_member(p_user_id=>'${userA}',p_page=>2,p_page_size=>2)`
    );
    expect(first.rows).toHaveLength(2);
    expect(next.rows).toHaveLength(2);
    expect(Number(next.rows[0].total_count)).toBe(30);
    expect(new Set([...first.rows, ...next.rows].map((r) => r.id)).size).toBe(4);
  });
  it('combines member, action, text, date and entity-family filters', async () => {
    const query = `select * from public.search_audit_logs_by_member(p_user_id=>'${userA2}',p_action=>'create',p_search=>'Control',p_entity_type=>'liquidaciones_family',p_from=>'2026-10-26T00:00:00Z',p_to=>'2026-10-27T00:00:00Z')`;
    expect((await db.query(query)).rows).toHaveLength(5);
    expect(
      (await db.query(query.replace("p_action=>'create'", "p_action=>'delete'"))).rows
    ).toHaveLength(0);
  });
  it('restores all clinic activity when the member filter is cleared', async () => {
    const { rows } = await db.query<{ total_count: number }>(
      'select * from public.search_audit_logs_by_member(p_page_size=>100)'
    );
    expect(rows).toHaveLength(35);
    expect(Number(rows[0].total_count)).toBe(35);
  });
  it('returns no foreign-clinic activity for a forged member ID', async () => {
    expect(
      (await db.query(`select * from public.search_audit_logs_by_member(p_user_id=>'${userB}')`))
        .rows
    ).toHaveLength(0);
    await db.exec(`set request.org='${orgB}'; set request.actor='${userB}'`);
    expect((await db.query('select * from public.list_audit_members()')).rows).toHaveLength(1);
    expect(
      (await db.query('select * from public.search_audit_logs_by_member()')).rows
    ).toHaveLength(1);
  });
  it('denies both operations without audit permission or authentication', async () => {
    await db.exec("set request.audit='false'");
    expect((await db.query('select * from public.list_audit_members()')).rows).toHaveLength(0);
    expect(
      (await db.query('select * from public.search_audit_logs_by_member()')).rows
    ).toHaveLength(0);
    await db.exec("set request.audit='true'; set request.actor=''");
    expect((await db.query('select * from public.list_audit_members()')).rows).toHaveLength(0);
    expect(
      (await db.query('select * from public.search_audit_logs_by_member()')).rows
    ).toHaveLength(0);
  });
  it('keeps caller RLS and excludes anonymous function execution', async () => {
    const { rows } = await db.query<{ prosecdef: boolean; anon_exec: boolean }>(
      `select p.prosecdef,has_function_privilege('anon',p.oid,'EXECUTE') anon_exec from pg_proc p where proname in ('list_audit_members','search_audit_logs_by_member')`
    );
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => !r.prosecdef && !r.anon_exec)).toBe(true);
  });
});
