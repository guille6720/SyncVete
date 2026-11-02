import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { expect, it } from 'vitest';
import { resolveFeatureEntitlement } from '../../../../packages/shared/src/entitlements/resolve';

const migrations = resolve(process.cwd(), '../../supabase/migrations');
const organization = '00000000-0000-0000-0000-000000000001';
const newOrganization = '00000000-0000-0000-0000-000000000002';
const sql = (name: string) => readFileSync(resolve(migrations, name), 'utf8');

async function setup() {
  const db = new PGlite();
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth; CREATE SCHEMA storage;
    CREATE TABLE auth.users(id uuid PRIMARY KEY, email text, email_confirmed_at timestamptz, deleted_at timestamptz);
    INSERT INTO auth.users VALUES ('00000000-0000-0000-0000-000000000010','storage-writer-20261102@example.invalid',now(),null);
    CREATE TABLE public.organizations(id uuid PRIMARY KEY);
    INSERT INTO public.organizations VALUES ('${organization}'), ('${newOrganization}');
    CREATE TABLE storage.objects(bucket_id text,name text,metadata jsonb);
    ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('test.uid',true),'')::uuid $$;
    CREATE FUNCTION public.get_user_organization_id() RETURNS uuid LANGUAGE sql AS $$ SELECT '${organization}'::uuid $$;
    CREATE FUNCTION public.has_permission(text) RETURNS boolean LANGUAGE sql AS $$ SELECT coalesce(current_setting('test.permission',true),'true') = 'true' $$;
    GRANT USAGE ON SCHEMA public,auth,storage TO authenticated,service_role;
  `);
  const phase1 = sql('20260817180000_entitlements_phase1.sql');
  const phase9 = sql('20260818190000_entitlements_phase9_addons.sql');
  await db.exec(`CREATE TYPE public.subscription_status AS ENUM ('trialing','active','past_due','cancelled','expired');
    CREATE TYPE public.feature_value_type AS ENUM ('boolean','limit');`);
  for (const table of ['plans', 'features', 'plan_features', 'organization_subscriptions', 'organization_feature_overrides']) {
    await db.exec(phase1.match(new RegExp(`CREATE TABLE public\\.${table} \\([\\s\\S]*?\\n\\);`))![0]);
  }
  for (const table of ['addons', 'addon_features', 'organization_addons']) {
    await db.exec(phase9.match(new RegExp(`CREATE TABLE public\\.${table} \\([\\s\\S]*?\\n\\);`))![0]);
  }
  for (const migration of [
    '20261030210103_organization_storage_observation.sql',
    '20261102120604_organization_storage_reservations.sql',
    '20261102125436_organization_storage_limited_writer.sql',
    '20261102134227_organization_storage_write_guard.sql',
    '20261102144123_organization_storage_direct_write_cutover.sql',
    '20261102151820_organization_storage_release_readiness.sql',
  ]) await db.exec(sql(migration));
  await db.exec(`
    UPDATE public.organization_storage_quotas SET quota_bytes=256;
    INSERT INTO public.features(key,name,feature_type,default_enabled,default_limit)
      VALUES ('storage.max_mb','Storage','limit',false,0);
    INSERT INTO public.plans(key,name) VALUES ('basic','Basic'),('pro','Pro'),('premium','Premium'),('superadmin_internal','Internal');
    INSERT INTO public.plan_features(plan_id,feature_id,enabled,limit_value)
      SELECT p.id,f.id,true,CASE p.key WHEN 'basic' THEN 1024 WHEN 'pro' THEN 10240 WHEN 'premium' THEN 51200 ELSE null END
      FROM public.plans p CROSS JOIN public.features f;
    INSERT INTO public.organization_subscriptions(organization_id,plan_id,status)
      SELECT '${organization}',id,'active' FROM public.plans WHERE key='basic';
    SELECT set_config('test.uid','00000000-0000-0000-0000-000000000010',false);
  `);
  return db;
}

function reserve(db: PGlite, bytes: number, path: string, org = organization) {
  return db.query<{ id: string }>('SELECT public.reserve_organization_storage($1,$2,$3,$4,$5) id',
    [org, 'clinical-images', `${org}/${path}`, bytes, 'a'.repeat(64)]);
}

async function status(db: PGlite) {
  return (await db.query<{ status: { quotaBytes: number | null; quotaUnlimited: boolean; pendingBytes: number; usedBytes: number; committedBytes: number } }>(
    'SELECT public.get_own_storage_status() status')).rows[0].status;
}

it('keeps staging quotas opt-in, serializes reservations, and refreshes new organizations, plan changes and expiry', async () => {
  const db = await setup();
  try {
    expect((await status(db)).quotaBytes).toBe(256);
    await db.exec('SET ROLE service_role');
    const first = (await reserve(db, 100, 'completed')).rows[0].id;
    const contenders = await Promise.allSettled([reserve(db, 150, 'winner-a'), reserve(db, 150, 'winner-b')]);
    expect(contenders.filter(row => row.status === 'fulfilled')).toHaveLength(1);
    expect(contenders.filter(row => row.status === 'rejected')).toHaveLength(1);
    await db.exec(`RESET ROLE; INSERT INTO storage.objects VALUES ('clinical-images','${organization}/completed','{"size":100}'); SET ROLE service_role;`);
    await db.query('SELECT public.complete_organization_storage($1)', [first]);
    await expect(db.query('SELECT storage_control.refresh_quota($1)', [organization])).rejects.toThrow();
    await db.exec(`RESET ROLE; UPDATE storage_control.write_enforcement SET sync_entitlements=true;`);
    expect(await status(db)).toMatchObject({ quotaBytes: 1024 * 1048576, pendingBytes: 150, usedBytes: 100, committedBytes: 250 });
    await db.exec(`UPDATE public.organization_subscriptions SET plan_id=(SELECT id FROM public.plans WHERE key='pro');`);
    expect((await status(db)).quotaBytes).toBe(10240 * 1048576);
    await db.exec(`UPDATE public.organization_subscriptions SET plan_id=(SELECT id FROM public.plans WHERE key='premium');`);
    expect((await status(db)).quotaBytes).toBe(51200 * 1048576);
    await db.exec(`UPDATE public.organization_subscriptions SET status='trialing',trial_ends_at=now()-interval '1 second';`);
    expect((await status(db)).quotaBytes).toBe(0);
    await db.exec('SET ROLE service_role');
    await expect(reserve(db, 1, 'after-expiry')).rejects.toThrow('quota exceeded');
    expect((await reserve(db, 100, 'completed')).rows[0].id).toBe(first);
    expect((await db.query<{ completed: boolean }>('SELECT public.complete_organization_storage($1) completed', [first])).rows[0].completed).toBe(true);
    await expect(reserve(db, 1, 'new-no-plan', newOrganization)).rejects.toThrow('quota exceeded');
    await db.exec('RESET ROLE');
    await db.query('SELECT storage_control.refresh_quota($1)', [newOrganization]);
    expect((await db.query<{ quota_bytes: number }>('SELECT quota_bytes FROM public.organization_storage_quotas WHERE organization_id=$1', [newOrganization])).rows[0].quota_bytes).toBe(0);
    await db.exec(`INSERT INTO public.organization_subscriptions(organization_id,plan_id,status) SELECT '${newOrganization}',id,'active' FROM public.plans WHERE key='basic'; SET ROLE service_role;`);
    await reserve(db, 1, 'new-with-plan', newOrganization);
    await db.exec('RESET ROLE');
    expect((await db.query<{ quota_bytes: number }>('SELECT quota_bytes FROM public.organization_storage_quotas WHERE organization_id=$1', [newOrganization])).rows[0].quota_bytes).toBe(1024 * 1048576);
    await db.exec(`UPDATE public.organization_subscriptions SET status='past_due',ends_at=now()+interval '1 hour' WHERE organization_id='${organization}';`);
    expect((await status(db)).quotaBytes).toBe(51200 * 1048576);
    await db.exec(`UPDATE public.organization_subscriptions SET ends_at=now()-interval '1 second' WHERE organization_id='${organization}';`);
    expect((await status(db)).quotaBytes).toBe(0);
    expect((await db.query<{ enabled: boolean }>('SELECT enabled FROM storage_control.write_enforcement')).rows[0].enabled).toBe(false);
    await db.exec('SET ROLE anon');
    await expect(db.query('SELECT public.get_own_storage_status()')).rejects.toThrow();
    await db.exec("RESET ROLE; SELECT set_config('test.permission','false',false); SET ROLE authenticated;");
    await expect(db.query('SELECT public.get_own_storage_status()')).rejects.toThrow('forbidden');
  } finally { await db.close(); }
}, 30000);

it('matches resolver add-on, override and unlimited precedence, evaluating windows at each call', async () => {
  const db = await setup();
  const feature = { key: 'storage.max_mb', featureType: 'limit' as const, defaultEnabled: false, defaultLimit: 0, isActive: true };
  try {
    await db.exec(`UPDATE storage_control.write_enforcement SET sync_entitlements=true;
      INSERT INTO public.addons(key,name) VALUES ('extra-storage','Extra storage');
      INSERT INTO public.addon_features(addon_id,feature_id,limit_value) SELECT a.id,f.id,5120 FROM public.addons a CROSS JOIN public.features f;
      INSERT INTO public.organization_addons(organization_id,addon_id) SELECT '${organization}',id FROM public.addons;
    `);
    const expected = resolveFeatureEntitlement('storage.max_mb', {
      features: [feature], planFeatures: [{ featureKey: feature.key, enabled: true, limitValue: 1024 }],
      addonFeatures: [{ featureKey: feature.key, enabled: true, limitValue: 5120 }], overrides: [], hasActiveSubscription: true,
    });
    expect((await status(db)).quotaBytes).toBe(expected.limit! * 1048576);
    await db.exec(`UPDATE public.organization_addons SET starts_at=now()+interval '1 hour';`);
    expect((await status(db)).quotaBytes).toBe(1024 * 1048576);
    await db.exec(`UPDATE public.organization_addons SET starts_at=now()-interval '1 hour',ends_at=now()-interval '1 second';`);
    expect((await status(db)).quotaBytes).toBe(1024 * 1048576);
    await db.exec(`UPDATE public.organization_addons SET ends_at=null;
      UPDATE public.addon_features SET limit_value=null;`);
    expect(await status(db)).toMatchObject({ quotaBytes: null, quotaUnlimited: true });
    await db.exec(`INSERT INTO public.organization_feature_overrides(organization_id,feature_id,enabled,limit_value)
      SELECT '${organization}',id,null,2 FROM public.features;`);
    expect((await status(db)).quotaBytes).toBe(2 * 1048576);
    await db.exec(`UPDATE public.organization_feature_overrides SET enabled=false;`);
    expect((await status(db)).quotaBytes).toBe(0);
    await db.exec(`UPDATE public.organization_feature_overrides SET enabled=null,limit_value=null;`);
    expect((await status(db)).quotaBytes).toBe(0);
    await db.exec(`UPDATE public.organization_feature_overrides SET limit_value=2,ends_at=clock_timestamp()+interval '200 milliseconds';`);
    expect((await status(db)).quotaBytes).toBe(2 * 1048576);
    await new Promise(done => setTimeout(done, 250));
    expect(await status(db)).toMatchObject({ quotaBytes: null, quotaUnlimited: true });
    await db.exec(`UPDATE public.organization_feature_overrides SET ends_at=null,limit_value=null;`);
    await db.exec(`UPDATE public.features SET default_limit=null;`);
    expect(await status(db)).toMatchObject({ quotaBytes: null, quotaUnlimited: true });
    await db.exec(`UPDATE public.organization_feature_overrides SET ends_at=now()-interval '1 second';
      UPDATE public.organization_addons SET cancelled_at=now();
      UPDATE public.organization_subscriptions SET plan_id=(SELECT id FROM public.plans WHERE key='superadmin_internal');`);
    expect(await status(db)).toMatchObject({ quotaBytes: null, quotaUnlimited: true });
    expect((await db.query<{ quota_bytes: number }>('SELECT quota_bytes FROM public.organization_storage_quotas WHERE organization_id=$1', [organization])).rows[0].quota_bytes).toBe(9007199254740991);
    await db.exec(`INSERT INTO public.organization_feature_overrides(organization_id,feature_id,enabled,limit_value)
      SELECT '${organization}',id,true,2 FROM public.features;
      INSERT INTO public.organization_feature_overrides(organization_id,feature_id,enabled,limit_value)
      SELECT '${organization}',id,true,3 FROM public.features;`);
    await expect(status(db)).rejects.toThrow('ambiguous active storage overrides');
    await db.exec(`UPDATE public.features SET is_active=false;`);
    expect((await status(db)).quotaBytes).toBe(0);
  } finally { await db.close(); }
}, 30000);

it('uses catalog defaults, suppresses inactive or expired add-ons, and rejects invalid capacities without forging grants', async () => {
  const db = await setup();
  try {
    await db.exec(`UPDATE storage_control.write_enforcement SET sync_entitlements=true;
      UPDATE public.plan_features SET enabled=false;
      UPDATE public.features SET default_enabled=true,default_limit=3;`);
    expect((await status(db)).quotaBytes).toBe(0);
    await db.exec(`UPDATE public.organization_subscriptions SET status='cancelled';`);
    expect((await status(db)).quotaBytes).toBe(3 * 1048576);
    await db.exec(`INSERT INTO public.addons(key,name) VALUES ('storage-extra','Storage extra');
      INSERT INTO public.addon_features(addon_id,feature_id,limit_value) SELECT a.id,f.id,10 FROM public.addons a CROSS JOIN public.features f;
      INSERT INTO public.organization_addons(organization_id,addon_id) SELECT '${organization}',id FROM public.addons;`);
    expect((await status(db)).quotaBytes).toBe(3 * 1048576);
    await db.exec(`UPDATE public.organization_subscriptions SET status='active';`);
    expect((await status(db)).quotaBytes).toBe(10 * 1048576);
    await db.exec(`UPDATE public.addons SET is_active=false;`);
    expect((await status(db)).quotaBytes).toBe(0);
    await db.exec(`UPDATE public.plan_features SET enabled=true,limit_value=-1;`);
    await expect(status(db)).rejects.toThrow('invalid storage entitlement capacity');
    await db.exec(`UPDATE public.plan_features SET limit_value=9007199254740991;`);
    await expect(status(db)).rejects.toThrow('invalid storage entitlement capacity');
    await db.exec('SET ROLE service_role');
    await expect(db.exec('UPDATE storage_control.write_enforcement SET sync_entitlements=false')).rejects.toThrow();
    await expect(db.exec(`UPDATE public.organization_storage_quotas SET quota_bytes=9007199254740991`)).rejects.toThrow();
    await expect(db.query('SELECT storage_control.effective_capacity($1)', [organization])).rejects.toThrow();
  } finally { await db.close(); }
}, 30000);
