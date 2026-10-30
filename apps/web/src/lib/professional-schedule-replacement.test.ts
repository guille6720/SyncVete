import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const org = 'a0000000-0000-4000-8000-000000000001';
const branch = 'a0000000-0000-4000-8000-000000000002';
const user = 'a0000000-0000-4000-8000-000000000003';
const branch2 = 'a0000000-0000-4000-8000-000000000004';
const user2 = 'a0000000-0000-4000-8000-000000000005';
const foreign = 'b0000000-0000-4000-8000-000000000001';
const row = { weekday: 1, start_time: '14:00', end_time: '20:00', slot_duration_minutes: 15 };
const week = [row, { ...row, weekday: 5 }];
let db: PGlite;
const call = (rows: unknown = week, branches = [branch], target = user) =>
  `select public.replace_professional_schedules('${target}',ARRAY[${branches.map((b) => `'${b}'`).join(',')}]::uuid[],'${JSON.stringify(rows).replaceAll("'", "''")}'::jsonb) n`;
const active = () =>
  db.query<{
    weekday: number;
    start_time: string;
    end_time: string;
    slot_duration_minutes: number;
  }>(
    `select weekday,start_time,end_time,slot_duration_minutes from professional_schedules where organization_id='${org}' and branch_id='${branch}' and user_id='${user}' and deleted_at is null and is_active order by weekday,start_time`
  );
async function unchangedAfterFailure(sql: string, error: RegExp) {
  await db.exec('savepoint attempted_save');
  await expect(db.query(sql)).rejects.toThrow(error);
  await db.exec('rollback to savepoint attempted_save; reset role;');
  expect((await active()).rows).toHaveLength(5);
}

describe('replace professional week with tenant and branch protection', () => {
  beforeAll(async () => {
    db = new PGlite();
    await db.exec(`
      create role authenticated; create role anon; create schema auth;
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.actor',true),'')::uuid$$;
      create function get_user_organization_id() returns uuid language sql stable as $$select nullif(current_setting('request.org',true),'')::uuid$$;
      create function has_permission(p text) returns boolean language sql stable as $$select current_setting('request.write',true)='true'$$;
      create function user_has_branch_access(b uuid) returns boolean language sql stable as $$select b::text=any(string_to_array(current_setting('request.branches',true),','))$$;
      create table branches(id uuid primary key,organization_id uuid,is_active boolean default true,deleted_at timestamptz);
      create table profiles(id uuid primary key,organization_id uuid,is_active boolean default true,deleted_at timestamptz);
      create table branch_members(id uuid default gen_random_uuid(),organization_id uuid,branch_id uuid,user_id uuid,is_active boolean default true,deleted_at timestamptz);
      create table professional_schedules(id uuid primary key default gen_random_uuid(),organization_id uuid,branch_id uuid,user_id uuid,weekday smallint,start_time time,end_time time,slot_duration_minutes integer,allowed_appointment_types text[],is_active boolean default true,deleted_at timestamptz);
      create unique index schedule_window on professional_schedules(organization_id,branch_id,user_id,weekday,start_time) where deleted_at is null;
      create table appointments(id uuid default gen_random_uuid(),user_id uuid,title text);
      insert into appointments(user_id,title) values('${user}','Existing appointment');
      insert into branches(id,organization_id) values('${branch}','${org}'),('${branch2}','${org}'),('${foreign}','${foreign}');
      insert into profiles(id,organization_id) values('${user}','${org}'),('${user2}','${org}'),('${foreign}','${foreign}');
      insert into branch_members(organization_id,branch_id,user_id) values('${org}','${branch}','${user}'),('${org}','${branch2}','${user}'),('${org}','${branch}','${user2}'),('${foreign}','${foreign}','${foreign}');
      insert into professional_schedules(organization_id,branch_id,user_id,weekday,start_time,end_time,slot_duration_minutes)
      select '${org}','${branch}','${user}',d,'09:00','18:00',20 from generate_series(1,5) d;
      insert into professional_schedules(organization_id,branch_id,user_id,weekday,start_time,end_time,slot_duration_minutes) values('${org}','${branch2}','${user}',2,'10:00','11:00',30),('${org}','${branch}','${user2}',3,'10:00','11:00',30),('${foreign}','${foreign}','${foreign}',4,'10:00','11:00',30);
      alter table professional_schedules enable row level security;
      create policy read_schedules on professional_schedules for select to authenticated using(organization_id=get_user_organization_id() and deleted_at is null);
      grant usage on schema public,auth to authenticated,anon;
      grant select on professional_schedules,appointments to authenticated;
    `);
    const migrations = resolve(process.cwd(), '../../supabase/migrations');
    const file = readdirSync(migrations).find((n) =>
      n.endsWith('_replace_professional_schedules.sql')
    )!;
    await db.exec(readFileSync(resolve(migrations, file), 'utf8'));
  });
  beforeEach(async () => {
    await db.exec(
      `begin;set role authenticated;set request.actor='${user}';set request.org='${org}';set request.write='true';set request.branches='${branch},${branch2}';`
    );
  });
  afterEach(async () => db.exec('rollback;reset role;'));
  afterAll(async () => db.close());

  it('replaces five old days with only Monday and Friday, preserving appointments and history', async () => {
    expect((await db.query<{ n: number }>(call())).rows[0].n).toBe(2);
    expect((await active()).rows).toEqual(
      week.map((r) => ({ ...r, start_time: '14:00:00', end_time: '20:00:00' }))
    );
    expect((await db.query('select * from appointments')).rows).toHaveLength(1);
    await db.exec('reset role');
    expect(
      (
        await db.query(
          `select id from professional_schedules where branch_id='${branch}' and user_id='${user}' and deleted_at is not null`
        )
      ).rows
    ).toHaveLength(5);
  });
  it('can explicitly clear the entire week', async () => {
    expect((await db.query<{ n: number }>(call([]))).rows[0].n).toBe(0);
    expect((await active()).rows).toHaveLength(0);
  });
  it('does not accumulate active windows on repeated saves', async () => {
    await db.query(call());
    await db.query(call());
    expect((await active()).rows).toHaveLength(2);
  });
  it('preserves other branches, professionals and clinics', async () => {
    await db.query(call());
    await db.exec('reset role');
    expect(
      (
        await db.query(
          `select id from professional_schedules where deleted_at is null and (branch_id='${branch2}' or user_id in ('${user2}','${foreign}'))`
        )
      ).rows
    ).toHaveLength(3);
  });
  it('replaces multiple authorized branches together and deduplicates selected branches', async () => {
    expect((await db.query<{ n: number }>(call(week, [branch, branch2, branch]))).rows[0].n).toBe(
      4
    );
  });
  it.each([
    [{ ...row, weekday: 8 }],
    [{ ...row, end_time: '13:00' }],
    [{ ...row, slot_duration_minutes: 0 }],
    [row, { ...row, start_time: '19:00' }],
    {},
    [null],
  ])('invalid input leaves the existing week intact: %s', async (rows) => {
    await unchangedAfterFailure(call(rows), /inválid|superpon|array|object/i);
  });
  it('rejects an inaccessible branch before changing any selected branch', async () => {
    await db.exec(`set request.branches='${branch}'`);
    await unchangedAfterFailure(call(week, [branch, branch2]), /Sin acceso/);
  });
  it('rejects another clinic even if a branch-access helper returned true', async () => {
    await db.exec(`set request.org='${foreign}'`);
    await unchangedAfterFailure(call(), /Sin acceso/);
  });
  it('rejects a professional from another clinic', async () => {
    await unchangedAfterFailure(call(week, [branch], foreign), /Profesional no disponible/);
  });
  it('requires an active professional membership', async () => {
    await db.exec(
      `reset role;update branch_members set is_active=false where branch_id='${branch}' and user_id='${user}';set role authenticated;`
    );
    await unchangedAfterFailure(call(), /Profesional no disponible/);
  });
  it('rejects read-only or unauthenticated callers', async () => {
    await db.exec(`set request.write='false'`);
    await unchangedAfterFailure(call(), /Sin permisos/);
  });
  it('requires an authenticated identity in addition to permissions', async () => {
    await db.exec(`set request.actor=''`);
    await unchangedAfterFailure(call(), /Sin permisos/);
  });
  it('rolls back archived and inserted rows if a later insertion fails', async () => {
    await db.exec(
      `reset role;create function qa_reject_friday() returns trigger language plpgsql as $$begin if new.weekday=5 then raise exception 'forced insertion failure';end if;return new;end$$;create trigger qa_failure before insert on professional_schedules for each row execute function qa_reject_friday();set role authenticated;`
    );
    await unchangedAfterFailure(call(), /forced insertion failure/);
  });
  it('is not executable by anonymous callers', async () => {
    await db.exec('reset role;set role anon');
    await expect(db.query(call())).rejects.toThrow('permission denied');
  });
});
