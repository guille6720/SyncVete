import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const org = '11111111-0000-4000-8000-000000000001';
const otherOrg = '22222222-0000-4000-8000-000000000002';
const branch = 'eeeeeeee-0000-4000-8000-000000000001';
const patient = 'dddddddd-0000-4000-8000-000000000001';
const otherPatient = 'dddddddd-0000-4000-8000-000000000002';
let db: PGlite;
const scalar = async <T>(sql: string, params: unknown[] = []) =>
  (await db.query<{ value: T }>(sql, params)).rows[0]?.value;

async function session(kind: 'staff' | 'owner' | 'other' | 'service' | 'anon') {
  await db.exec('RESET ROLE');
  const uid =
    kind === 'staff'
      ? 'aaaaaaaa-0000-4000-8000-000000000001'
      : kind === 'owner'
        ? 'bbbbbbbb-0000-4000-8000-000000000001'
        : kind === 'other'
          ? 'bbbbbbbb-0000-4000-8000-000000000002'
          : '';
  await db.query(
    "SELECT set_config('test.uid',$1,false),set_config('test.org',$2,false),set_config('test.staff',$3,false),set_config('test.role',$4,false)",
    [
      uid,
      kind === 'other' ? otherOrg : org,
      String(kind === 'staff'),
      kind === 'service' ? 'service_role' : kind === 'anon' ? 'anon' : 'authenticated',
    ]
  );
  await db.exec(
    `SET ROLE ${kind === 'service' ? 'service_role' : kind === 'anon' ? 'anon' : 'authenticated'}`
  );
}

describe('owner PWA SQL contracts (isolated Postgres)', () => {
  beforeAll(async () => {
    db = new PGlite({ extensions: { pgcrypto } });
    await db.exec(readFileSync(resolve('src/__tests__/fixtures/owner-app.sql'), 'utf8'));
    const existing = readFileSync(
      resolve('../../supabase/migrations/20260827010000_appointments_module_complete_phase1.sql'),
      'utf8'
    );
    for (const name of ['appointment_has_overlap', 'trg_fn_appointments_availability']) {
      const start = existing.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`);
      const end = existing.indexOf('$$;', start) + 3;
      await db.exec(existing.slice(start, end));
    }
    await db.exec(
      'CREATE TRIGGER availability BEFORE INSERT OR UPDATE ON appointments FOR EACH ROW EXECUTE FUNCTION trg_fn_appointments_availability()'
    );
    const migration = readFileSync(
      resolve('../../supabase/migrations/20261005014349_owner_pwa_staging.sql'),
      'utf8'
    );
    await expect(db.exec(migration)).rejects.toThrow('STAGING ONLY');
    await db.exec("SET app.owner_pwa_staging='on'");
    await db.exec(migration);
    await session('staff');
    await db.query('SELECT save_owner_app_brand($1::jsonb)', [
      {
        appName: 'app-IMILVET',
        logoUrl: '',
        primaryColor: '#16745c',
        welcomeText: 'Hola',
        enabled: true,
      },
    ]);
  }, 30000);
  afterAll(async () => {
    await db?.close();
  });

  it('publishes only in the current clinic and rejects foreign pets, duplicate booking and foreign cancellation', async () => {
    await session('staff');
    const slot = await scalar<string>(
      "SELECT publish_owner_app_slot($1,now()+interval '2 days') AS value",
      [branch]
    );
    await expect(
      db.query("SELECT publish_owner_app_slot($1,now()+interval '2 days')", [
        'eeeeeeee-0000-4000-8000-000000000002',
      ])
    ).rejects.toThrow();
    await session('owner');
    await expect(
      db.query('SELECT book_owner_app_slot($1,$2)', [slot, otherPatient])
    ).rejects.toThrow('Unavailable');
    const appointment = await scalar<string>('SELECT book_owner_app_slot($1,$2) AS value', [
      slot,
      patient,
    ]);
    await expect(db.query('SELECT book_owner_app_slot($1,$2)', [slot, patient])).rejects.toThrow(
      'Unavailable'
    );
    await session('other');
    await expect(db.query('SELECT cancel_owner_app_booking($1)', [appointment])).rejects.toThrow();
    await session('owner');
    await db.query('SELECT cancel_owner_app_booking($1)', [appointment]);
    expect(
      (await scalar<{ slots: unknown[] }>('SELECT get_owner_app_data() AS value'))?.slots.length
    ).toBe(1);
  });

  it('enforces anonymous and owner/staff boundaries, even when called directly through RPC', async () => {
    await session('anon');
    await expect(db.query('SELECT get_owner_app_data()')).rejects.toThrow('permission denied');
    expect(await scalar('SELECT get_owner_app_brand($1) AS value', [otherOrg])).toBeNull();
    await session('owner');
    await expect(db.query('SELECT queue_owner_app_reminders()')).rejects.toThrow(
      'permission denied'
    );
    await expect(
      db.query('SELECT save_owner_app_brand($1::jsonb)', [{ appName: 'Changed' }])
    ).rejects.toThrow('Forbidden');
    await db.exec('RESET ROLE');
    await db.query(
      "INSERT INTO owner_app_reminders(organization_id,owner_id,event_key,message,source_id,source_type,source_revision) VALUES($1,$2,'foreign','Secret',gen_random_uuid(),'vaccine','2099-06-10')",
      [otherOrg, 'cccccccc-0000-4000-8000-000000000002']
    );
    await session('owner');
    expect(await scalar<number>('SELECT count(*)::int AS value FROM owner_app_reminders')).toBe(0);
  });

  it('queues both notices at 08:00 local, deduplicates retries and leases emails', async () => {
    await db.exec('RESET ROLE');
    await db.query(
      "INSERT INTO appointments(organization_id,branch_id,patient_id,owner_id,starts_at,ends_at,status) VALUES($1,$2,$3,$4,'2099-06-10T13:00:00Z','2099-06-10T13:30:00Z','programada')",
      [org, branch, patient, 'cccccccc-0000-4000-8000-000000000001']
    );
    await db.query(
      "INSERT INTO vaccinations(organization_id,owner_id,patient_id,vaccine_name,administered_at,next_due_at) VALUES($1,$2,$3,'Rabia','2098-06-10','2099-06-10')",
      [org, 'cccccccc-0000-4000-8000-000000000001', patient]
    );
    await session('service');
    expect(
      await scalar('SELECT queue_owner_app_reminders($1) AS value', ['2099-06-09T10:59:59Z'])
    ).toBe(0);
    expect(
      await scalar('SELECT queue_owner_app_reminders($1) AS value', ['2099-06-09T11:00:00Z'])
    ).toBe(2);
    expect(
      await scalar('SELECT queue_owner_app_reminders($1) AS value', ['2099-06-09T11:05:00Z'])
    ).toBe(0);
    expect(
      await scalar('SELECT queue_owner_app_reminders($1) AS value', ['2099-06-10T11:00:00Z'])
    ).toBe(2);
    const claimed = await scalar<{ id: string }[]>('SELECT claim_owner_app_emails() AS value');
    expect(claimed?.length).toBe(4);
    expect(await scalar('SELECT claim_owner_app_emails() AS value')).toEqual([]);
    for (const item of claimed!) await db.query('SELECT complete_owner_app_email($1)', [item.id]);
    expect(await scalar('SELECT claim_owner_app_emails() AS value')).toEqual([]);
  });

  it('does not send reminders for canceled appointments or superseded vaccine doses', async () => {
    await db.exec('RESET ROLE');
    await db.exec(
      "UPDATE appointments SET status='cancelada'; UPDATE vaccinations SET next_due_at='2099-06-12'"
    );
    await db.query(
      "INSERT INTO vaccinations(organization_id,owner_id,patient_id,vaccine_name,administered_at,next_due_at) VALUES($1,$2,$3,'Rabia','2099-06-01','2100-06-01')",
      [org, 'cccccccc-0000-4000-8000-000000000001', patient]
    );
    await session('service');
    expect(
      await scalar('SELECT queue_owner_app_reminders($1) AS value', ['2099-06-11T11:00:00Z'])
    ).toBe(0);
  });

  it('honors different clinic timezones and skips queued notices after cancellation', async () => {
    await db.exec('RESET ROLE');
    await db.query('INSERT INTO owner_app_settings VALUES($1,$2)', [
      otherOrg,
      {
        appName: 'app-Other',
        logoUrl: '',
        primaryColor: '#16745c',
        welcomeText: '',
        enabled: true,
      },
    ]);
    await db.query(
      "INSERT INTO appointments(organization_id,branch_id,patient_id,owner_id,starts_at,ends_at,status) VALUES($1,$2,$3,$4,'2099-06-20T04:00:00Z','2099-06-20T04:30:00Z','programada')",
      [
        otherOrg,
        'eeeeeeee-0000-4000-8000-000000000002',
        otherPatient,
        'cccccccc-0000-4000-8000-000000000002',
      ]
    );
    await session('service');
    expect(
      await scalar('SELECT queue_owner_app_reminders($1) AS value', ['2099-06-18T22:59:59Z'])
    ).toBe(0);
    expect(
      await scalar('SELECT queue_owner_app_reminders($1) AS value', ['2099-06-18T23:00:00Z'])
    ).toBe(1);
    await db.exec("RESET ROLE; UPDATE appointments SET status='cancelada'");
    await session('service');
    expect(await scalar('SELECT claim_owner_app_emails() AS value')).toEqual([]);
  });

  it('revokes an existing owner session immediately at the data boundary', async () => {
    await db.exec('RESET ROLE');
    await db.query('UPDATE owners SET portal_user_id=NULL WHERE id=$1', [
      'cccccccc-0000-4000-8000-000000000001',
    ]);
    await session('owner');
    await expect(db.query('SELECT get_owner_app_data()')).rejects.toThrow('Forbidden');
    expect(await scalar('SELECT count(*)::int AS value FROM owner_app_reminders')).toBe(0);
  });
});
