import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const org = 'a0000000-0000-4000-8000-000000000001';
const foreignOrg = 'b0000000-0000-4000-8000-000000000001';
const branch = 'a0000000-0000-4000-8000-000000000002';
const actor = 'a0000000-0000-4000-8000-000000000003';
const entry = 'a0000000-0000-4000-8000-000000000004';
const patient = 'a0000000-0000-4000-8000-000000000005';
let db: PGlite;

describe('clinical entry soft deletion and tenant protection', () => {
  beforeAll(async () => {
    db = new PGlite();
    await db.exec(`
      create role authenticated; create role anon; create schema auth;
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.actor',true),'')::uuid$$;
      create function public.get_user_organization_id() returns uuid language sql stable as $$select nullif(current_setting('request.org',true),'')::uuid$$;
      create function public.has_permission(p text) returns boolean language sql stable as $$
        select case p when 'clinical:read' then current_setting('request.read',true)='true'
        when 'clinical:write' then current_setting('request.write',true)='true' else false end$$;
      create function public.user_has_branch_access(b uuid) returns boolean language sql stable as $$select b::text=current_setting('request.branch',true)$$;
      create table public.clinical_entries(id uuid primary key,organization_id uuid,branch_id uuid,patient_id uuid,deleted_at timestamptz);
      create table public.audit_logs(actor_id uuid,entry_id uuid,old_deleted_at timestamptz,new_deleted_at timestamptz);
      create function public.audit_probe() returns trigger language plpgsql security definer as $$begin
        insert into public.audit_logs values(auth.uid(),new.id,old.deleted_at,new.deleted_at);return new;end;$$;
      create trigger audit_update after update on public.clinical_entries for each row execute function public.audit_probe();
      alter table public.clinical_entries enable row level security;
      create policy read_entry on public.clinical_entries for select using(organization_id=public.get_user_organization_id() and deleted_at is null and public.has_permission('clinical:read'));
      create policy update_entry on public.clinical_entries for update using(organization_id=public.get_user_organization_id() and deleted_at is null and public.has_permission('clinical:write'))
        with check(organization_id=public.get_user_organization_id() and public.has_permission('clinical:write'));
      grant usage on schema public,auth to authenticated,anon;
      grant select,update on public.clinical_entries to authenticated;
      insert into public.clinical_entries values('${entry}','${org}','${branch}','${patient}',null);
    `);
    const migrations = resolve(process.cwd(), '../../supabase/migrations');
    await db.exec(readFileSync(resolve(migrations, readdirSync(migrations).find(n => n.endsWith('_clinical_entry_soft_delete_rpc.sql'))!), 'utf8'));
  });
  beforeEach(async () => {
    await db.exec(`begin;set role authenticated;set request.actor='${actor}';set request.org='${org}';
      set request.branch='${branch}';set request.read='true';set request.write='true';`);
  });
  afterEach(async () => db.exec('rollback;reset role;'));
  afterAll(async () => db.close());
  it('reproduces rejection of the previous direct table update', async () => {
    await expect(db.exec(`update public.clinical_entries set deleted_at=now() where id='${entry}'`)).rejects.toThrow('row-level security');
  });
  it('archives the authorized entry, hides it, and preserves its audit trail', async () => {
    const result = await db.query(`select * from public.soft_delete_clinical_entry('${entry}')`);
    expect(result.rows).toEqual([{ id: entry, patient_id: patient }]);
    expect((await db.query('select * from public.clinical_entries')).rows).toHaveLength(0);
    await db.exec('reset role');
    expect((await db.query<{ n: number }>('select count(*)::int n from public.clinical_entries')).rows[0].n).toBe(1);
    expect((await db.query<{ deleted: boolean }>('select deleted_at is not null deleted from public.clinical_entries')).rows[0].deleted).toBe(true);
    expect((await db.query('select actor_id,entry_id from public.audit_logs')).rows).toEqual([{ actor_id: actor, entry_id: entry }]);
  });
  it('rejects an entry from a different clinic', async () => {
    await db.exec(`set request.org='${foreignOrg}'`);
    await expect(db.query(`select * from public.soft_delete_clinical_entry('${entry}')`)).rejects.toThrow('CLINICAL_ENTRY_NOT_FOUND');
  });
  it('rejects an inaccessible branch', async () => {
    await db.exec(`set request.branch='${foreignOrg}'`);
    await expect(db.query(`select * from public.soft_delete_clinical_entry('${entry}')`)).rejects.toThrow('CLINICAL_ENTRY_NOT_FOUND');
  });
  it('rejects a read-only clinician', async () => {
    await db.exec("set request.write='false'");
    await expect(db.query(`select * from public.soft_delete_clinical_entry('${entry}')`)).rejects.toThrow('CLINICAL_ENTRY_DELETE_FORBIDDEN');
  });
  it('honors a denied clinical read permission', async () => {
    await db.exec("set request.read='false'");
    await expect(db.query(`select * from public.soft_delete_clinical_entry('${entry}')`)).rejects.toThrow('CLINICAL_ENTRY_DELETE_FORBIDDEN');
  });
  it('does not accept a missing authenticated user', async () => {
    await db.exec("set request.actor=''");
    await expect(db.query(`select * from public.soft_delete_clinical_entry('${entry}')`)).rejects.toThrow('CLINICAL_ENTRY_DELETE_FORBIDDEN');
  });
  it('does not report success for a nonexistent record', async () => {
    await expect(db.query(`select * from public.soft_delete_clinical_entry('${foreignOrg}')`)).rejects.toThrow('CLINICAL_ENTRY_NOT_FOUND');
  });
  it('does not report a second deletion as successful', async () => {
    await db.query(`select * from public.soft_delete_clinical_entry('${entry}')`);
    await expect(db.query(`select * from public.soft_delete_clinical_entry('${entry}')`)).rejects.toThrow('CLINICAL_ENTRY_NOT_FOUND');
  });
  it('keeps the operation inaccessible to anonymous callers', async () => {
    await db.exec('reset role;set role anon');
    await expect(db.query(`select * from public.soft_delete_clinical_entry('${entry}')`)).rejects.toThrow('permission denied');
  });
});
