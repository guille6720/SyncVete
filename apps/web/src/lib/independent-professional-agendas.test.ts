import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const org = 'a0000000-0000-4000-8000-000000000001';
const branch = 'a0000000-0000-4000-8000-000000000002';
const user = 'a0000000-0000-4000-8000-000000000003';
const pro = 'a0000000-0000-4000-8000-000000000004';
const pro2 = 'a0000000-0000-4000-8000-000000000005';
const foreign = 'b0000000-0000-4000-8000-000000000001';
const draft = 'a0000000-0000-4000-8000-000000000006';
const week = [1, 5].map((weekday) => ({
  weekday,
  start_time: '14:00',
  end_time: '20:00',
  slot_duration_minutes: 15,
}));
let db: PGlite;
const json = (v: unknown) => `'${JSON.stringify(v).replaceAll("'", "''")}'::jsonb`;
const save = (id = pro, rows: unknown = week, branches = [branch], create = false) =>
  `select save_professional_with_agenda('${id}',${json({ first_name: 'Josefina', last_name: 'QA', relationship_type: 'independent' })},ARRAY[${branches.map((b) => `'${b}'`).join(',')}]::uuid[],${rows === null ? 'NULL' : json(rows)},${create}) value`;
const book = (id = pro, start = '2026-11-02T17:00:00Z', end = '2026-11-02T17:15:00Z') =>
  `insert into appointments(organization_id,branch_id,patient_id,owner_id,assigned_professional_id,starts_at,ends_at) values('${org}','${branch}','${user}','${user}','${id}','${start}','${end}') returning id,assigned_user_id,assigned_professional_id`;
async function failure(sql: string, reason: RegExp) {
  await db.exec('savepoint attempt');
  await expect(db.query(sql)).rejects.toThrow(reason);
  await db.exec('rollback to savepoint attempt');
}

describe('independent professional agenda migration and workflow', () => {
  beforeAll(async () => {
    db = new PGlite();
    await db.exec(`
      create role authenticated;create role anon;create schema auth;
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.actor',true),'')::uuid$$;
      create function get_user_organization_id() returns uuid language sql stable as $$select nullif(current_setting('request.org',true),'')::uuid$$;
      create function has_permission(p text) returns boolean language sql stable as $$select p=any(string_to_array(current_setting('request.permissions',true),','))$$;
      create function user_has_branch_access(b uuid) returns boolean language sql stable as $$select b::text=any(string_to_array(current_setting('request.branches',true),','))$$;
      create type professional_relationship_type as enum('independent','employee');
      create table branches(id uuid primary key,organization_id uuid,is_active boolean default true,deleted_at timestamptz);
      create table profiles(id uuid primary key,organization_id uuid,full_name text,is_active boolean default true,deleted_at timestamptz);
      create table branch_members(organization_id uuid,branch_id uuid,user_id uuid,role text,is_active boolean default true,deleted_at timestamptz);
      create table professionals(id uuid primary key default gen_random_uuid(),organization_id uuid,user_id uuid,profile_id uuid,first_name text not null,last_name text not null,specialty text,relationship_type professional_relationship_type default 'independent',document_number text,tax_id text,professional_license text,professional_license_jurisdiction text,start_date date,end_date date,is_active boolean default true,invoice_required boolean default false,notes text,created_at timestamptz default now(),created_by uuid,updated_at timestamptz default now(),deleted_at timestamptz);
      create table professional_branches(id uuid default gen_random_uuid(),organization_id uuid,professional_id uuid,branch_id uuid,is_active boolean default true,deleted_at timestamptz);
      create unique index professional_branches_active on professional_branches(professional_id,branch_id) where deleted_at is null;
      create table professional_schedules(id uuid primary key default gen_random_uuid(),organization_id uuid,branch_id uuid,user_id uuid not null,weekday smallint,start_time time,end_time time,slot_duration_minutes int,allowed_appointment_types text[],is_active boolean default true,created_at timestamptz default now(),updated_at timestamptz default now(),deleted_at timestamptz,check(end_time>start_time));
      create table professional_time_blocks(id uuid default gen_random_uuid(),organization_id uuid,branch_id uuid,user_id uuid,starts_at timestamptz,ends_at timestamptz,deleted_at timestamptz);
      create table owners(id uuid primary key,organization_id uuid,full_name text,deleted_at timestamptz);
      create table patients(id uuid primary key,organization_id uuid,owner_id uuid,name text,species text,deleted_at timestamptz);
      create table appointments(id uuid primary key default gen_random_uuid(),organization_id uuid,branch_id uuid,patient_id uuid,owner_id uuid,assigned_user_id uuid,starts_at timestamptz,ends_at timestamptz,status text default 'programada',appointment_type text default 'consulta',is_overbook boolean default false,title text,room text,deleted_at timestamptz);
      create function trg_fn_appointments_availability() returns trigger language plpgsql as $$begin return new;end;$$;
      create trigger trg_appointments_availability before insert on appointments for each row execute function trg_fn_appointments_availability();
      insert into branches(id,organization_id) values('${branch}','${org}'),('${foreign}','${foreign}');
      insert into profiles(id,organization_id,full_name) values('${user}','${org}','Shared account');
      insert into branch_members(organization_id,branch_id,user_id,role) values('${org}','${branch}','${user}','veterinarian');
      insert into professionals(id,organization_id,user_id,first_name,last_name) values('${pro}','${org}','${user}','Josefina','QA'),('${pro2}','${org}','${user}','Lorena','QA'),('${foreign}','${foreign}',NULL,'Foreign','QA');
      insert into professional_branches(organization_id,professional_id,branch_id) values('${org}','${pro}','${branch}'),('${org}','${pro2}','${branch}'),('${foreign}','${foreign}','${foreign}');
      insert into professional_schedules(organization_id,branch_id,user_id,weekday,start_time,end_time,slot_duration_minutes) values('${org}','${branch}','${user}',1,'09:00','18:00',20);
      insert into owners(id,organization_id,full_name) values('${user}','${org}','Tutor QA');
      insert into patients(id,organization_id,owner_id,name,species) values('${user}','${org}','${user}','Luna QA','dog');
      alter table appointments enable row level security;
      create policy own_appointments on appointments to authenticated using(organization_id=get_user_organization_id() and user_has_branch_access(branch_id)) with check(organization_id=get_user_organization_id() and user_has_branch_access(branch_id) and has_permission('appointments:write'));
      grant usage on schema public,auth to authenticated,anon;grant select,insert,update on appointments to authenticated;
    `);
    await db.exec(
      readFileSync(
        resolve(
          process.cwd(),
          '../../supabase/migrations/20261030171506_independent_professional_agendas.sql'
        ),
        'utf8'
      )
    );
    await db.exec(
      readFileSync(
        resolve(
          process.cwd(),
          '../../supabase/migrations/20261030173928_fix_professional_branch_atomic_upsert.sql'
        ),
        'utf8'
      )
    );
  });
  beforeEach(async () =>
    db.exec(
      `begin;set role authenticated;set request.actor='${user}';set request.org='${org}';set request.branches='${branch}';set request.permissions='professionals:write,appointments:read,appointments:write';`
    )
  );
  afterEach(async () => db.exec('rollback;reset role;'));
  afterAll(async () => db.close());
  it('creates a professional and complete week without an auth account', async () => {
    const result = await db.query<{ value: { id: string; user_id: null } }>(
      save(draft, week, [branch], true)
    );
    expect(result.rows[0].value).toMatchObject({ id: draft, user_id: null });
    expect(
      (await db.query(`select * from list_agenda_schedules('${draft}','${branch}')`)).rows
    ).toHaveLength(2);
    expect((await db.query<{ id: string }>(book(draft))).rows).toHaveLength(1);
  });
  it('copies shared hours into separate calendars and retains legacy hours', async () => {
    expect(
      (await db.query(`select * from list_agenda_schedules('${pro}','${branch}')`)).rows
    ).toHaveLength(1);
    expect(
      (await db.query(`select * from list_agenda_schedules('${pro2}','${branch}')`)).rows
    ).toHaveLength(1);
    await db.query(save());
    expect(
      (await db.query(`select * from list_agenda_schedules('${pro2}','${branch}')`)).rows
    ).toHaveLength(1);
    expect(
      (await db.query(`select * from list_agenda_schedules('${user}','${branch}')`)).rows
    ).toHaveLength(1);
  });
  it('restores an inactive branch atomically using the real partial unique index', async () => {
    await db.exec(
      `reset role;update professional_branches set is_active=false where professional_id='${pro}';set role authenticated;`
    );
    await db.query(save());
    const listed = await db.query<{ list_agenda_professionals: { professionalId: string } }>(
      'select * from list_agenda_professionals()'
    );
    expect(listed.rows.some((r) => r.list_agenda_professionals.professionalId === pro)).toBe(true);
  });
  it('creates a new assignment while preserving an archived one', async () => {
    await db.exec(
      `reset role;update professional_branches set deleted_at=now(),is_active=false where professional_id='${pro}';set role authenticated;`
    );
    await db.query(save());
    await db.exec('reset role');
    expect(
      (await db.query(`select * from professional_branches where professional_id='${pro}'`)).rows
    ).toHaveLength(2);
  });
  it('returns both professionals by their own name despite sharing a login', async () => {
    const result = await db.query<{
      list_agenda_professionals: { professionalId: string; fullName: string };
    }>('select * from list_agenda_professionals()');
    expect(result.rows.map((r) => r.list_agenda_professionals.fullName)).toEqual(
      expect.arrayContaining(['Josefina QA', 'Lorena QA'])
    );
  });
  it('repeated saves do not accumulate active schedules or duplicate the ficha', async () => {
    await db.query(save(draft, week, [branch], true));
    await db.query(save(draft, week, [branch], true));
    expect(
      (await db.query(`select * from list_agenda_schedules('${draft}','${branch}')`)).rows
    ).toHaveLength(2);
  });
  it('clearing a week prevents new appointments and retains the existing booking', async () => {
    await db.query(save());
    await db.query(book());
    await db.query(save(pro, []));
    await failure(book(pro, '2026-11-02T18:00:00Z', '2026-11-02T18:15:00Z'), /no tiene horarios/);
    expect((await db.query('select * from appointments')).rows).toHaveLength(1);
    await db.query(`update appointments set status='completada'`);
  });
  it('rejects occupied slots but permits distinct professionals with the same account', async () => {
    await db.query(save());
    await db.query(save(pro2));
    await db.query(book());
    await failure(book(), /acaba de ocuparse/);
    expect((await db.query(book(pro2))).rows).toHaveLength(1);
  });
  it('rejects a time outside the week and a visit spanning midnight', async () => {
    await db.query(save());
    await failure(book(pro, '2026-11-03T17:00:00Z', '2026-11-03T17:15:00Z'), /fuera de la agenda/);
    await failure(book(pro, '2026-11-03T02:50:00Z', '2026-11-03T03:10:00Z'), /fuera de la agenda/);
  });
  it('preserves old shared-account appointments and reserves those ranges conservatively', async () => {
    await db.query(save());
    await db.query(save(pro2));
    await db.exec(
      `insert into appointments(organization_id,branch_id,patient_id,owner_id,assigned_user_id,starts_at,ends_at) values('${org}','${branch}','${user}','${user}','${user}','2026-11-02T17:00:00Z','2026-11-02T17:15:00Z')`
    );
    await failure(book(), /acaba de ocuparse/);
    await failure(book(pro2), /acaba de ocuparse/);
  });
  it.each([
    {},
    [null],
    [{ ...week[0], weekday: 8 }],
    [{ ...week[0], end_time: '13:00' }],
    [week[0], week[0]],
  ])('invalid hours roll back ficha and branch changes: %s', async (rows) => {
    await failure(save(draft, rows, [branch], true), /inválid|superpon|object|array/);
    await db.exec('reset role');
    expect((await db.query(`select * from professionals where id='${draft}'`)).rows).toHaveLength(
      0
    );
  });
  it('rejects foreign professional, foreign branch and missing permission', async () => {
    await failure(save(foreign), /no disponible/);
    await failure(save(pro, week, [foreign]), /acceso/);
    await db.exec("set request.permissions='appointments:read'");
    await failure(save(), /permiso/);
    expect(
      (await db.query(`select * from list_agenda_schedules('${foreign}','${foreign}')`)).rows
    ).toHaveLength(0);
  });
  it('does not expose routines to unauthenticated users', async () => {
    await db.exec('set role anon');
    await failure('select * from list_agenda_professionals()', /permission denied/);
    await failure(save(), /permission denied/);
  });
  it('blocks direct foreign-professional assignments', async () => {
    await failure(book(foreign), /no disponible/);
  });
  it('calendar names and filters use professional identity', async () => {
    await db.query(save());
    await db.query(save(pro2));
    await db.query(book());
    await db.query(book(pro2));
    const rows = await db.query<{ list_agenda_appointments: { assigned_user_name: string } }>(
      `select * from list_agenda_appointments('2026-11-02','2026-11-02','${branch}',NULL,'${pro}')`
    );
    expect(rows.rows).toHaveLength(1);
    expect(rows.rows[0].list_agenda_appointments.assigned_user_name).toBe('Josefina QA');
    const busy = await db.query(
      `select * from agenda_busy_ranges('${pro}','${branch}','2026-11-02')`
    );
    expect(busy.rows).toHaveLength(1);
  });
});
