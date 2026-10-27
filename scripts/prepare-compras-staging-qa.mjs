import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const publicConfig = JSON.parse(readFileSync(resolve(root, '.env.compras-public.json'), 'utf8'));
if (new URL(publicConfig.url).hostname !== 'owmcrqvnfubyjxrlyhlc.supabase.co') throw new Error('Only SyncVete-Staging is allowed');
const run = randomUUID().slice(0, 8);
const organizationId = randomUUID();
const otherOrganizationId = randomUUID();
const branchId = randomUUID();
const otherBranchId = randomUUID();
const users = ['writer', 'reader', 'other'].map((kind) => ({ kind, id: randomUUID(), email: `compras-${kind}-${run}@qa.invalid`, password: randomBytes(24).toString('hex') }));
const quote = (value) => `'${String(value).replaceAll("'", "''")}'`;
const sql = [`begin; insert into public.organizations(id,name,slug,plan) values (${quote(organizationId)},'QA Compras ${run}','qa-compras-${run}','enterprise'),(${quote(otherOrganizationId)},'QA Otra Compras ${run}','qa-compras-otra-${run}','enterprise');`,
  `insert into public.branches(id,organization_id,name,code,is_main) values (${quote(branchId)},${quote(organizationId)},'QA Compras','QA',true),(${quote(otherBranchId)},${quote(otherOrganizationId)},'QA Otra','QA',true);`,
  `update public.organization_subscriptions set plan_id=(select id from public.plans where key='enterprise'),status='active',ends_at=null,trial_ends_at=null where organization_id in (${quote(organizationId)},${quote(otherOrganizationId)});`];
for (const user of users) {
  const org = user.kind === 'other' ? otherOrganizationId : organizationId;
  const branch = user.kind === 'other' ? otherBranchId : branchId;
  sql.push(`insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,email_change,email_change_token_new,recovery_token) values ('00000000-0000-0000-0000-000000000000',${quote(user.id)},'authenticated','authenticated',${quote(user.email)},extensions.crypt(${quote(user.password)},extensions.gen_salt('bf')),now(),'{"provider":"email","providers":["email"]}','{}',now(),now(),'','','','');`);
  sql.push(`insert into auth.identities(id,provider_id,user_id,identity_data,provider,last_sign_in_at,created_at,updated_at) values (gen_random_uuid(),${quote(user.id)},${quote(user.id)},jsonb_build_object('sub',${quote(user.id)},'email',${quote(user.email)}),'email',now(),now(),now());`);
  sql.push(`insert into public.profiles(id,organization_id,full_name,active_branch_id) values (${quote(user.id)},${quote(org)},'QA Compras ${user.kind}',${quote(branch)});`);
  sql.push(`insert into public.branch_members(organization_id,branch_id,user_id,role,permissions) values (${quote(org)},${quote(branch)},${quote(user.id)},'${user.kind === 'reader' ? 'readonly' : 'admin'}',${user.kind === 'reader' ? `'["inventory:read"]'::jsonb` : 'null'});`);
}
sql.push('commit;');
mkdirSync(resolve(root, 'test-results'), { recursive: true });
writeFileSync(resolve(root, '.env.compras-qa.json'), JSON.stringify({ ...publicConfig, run, organizationId, otherOrganizationId, branchId, users }));
writeFileSync(resolve(root, 'test-results/create-compras-qa.sql'), sql.join('\n'));
writeFileSync(resolve(root, 'test-results/cleanup-compras-qa.sql'), `begin; update public.profiles set is_active=false where id in (${users.map((user) => quote(user.id)).join(',')}); delete from auth.users where id in (${users.map((user) => quote(user.id)).join(',')}); update public.organizations set deleted_at=now() where id in (${quote(organizationId)},${quote(otherOrganizationId)}); commit;`);
console.log(JSON.stringify({ run, organizationId, otherOrganizationId, fixture: 'test-results/create-compras-qa.sql' }));
