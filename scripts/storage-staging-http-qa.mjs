import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const project = 'owmcrqvnfubyjxrlyhlc';
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
assert.equal(url, `https://${project}.supabase.co`, 'QA must target staging');
assert.equal(process.env.VERCEL_ENV, 'preview', 'QA must run in Preview');
assert.equal(process.env.VERCEL_PROJECT_ID, 'prj_q7UXLUU0wuo0D6KxdPjCw3AfyxrN', 'QA must use the staging Vercel project');
assert.equal(process.env.STORAGE_QA_ALLOW_PERSISTENT_FIXTURES, 'true', 'Persistent fictitious fixtures require explicit opt-in');
for (const name of ['NEXT_PUBLIC_SUPABASE_ANON_KEY','SUPABASE_SERVICE_ROLE_KEY','STORAGE_WRITER_EMAIL','STORAGE_WRITER_PASSWORD','STORAGE_WRITER_USER_ID']) {
  assert.ok(process.env[name], `Missing configuration: ${name}`);
}
const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(30000) }) } };
const client = () => createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, options);
const service = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, options);
const writer = client();
const checks = [];
const fixtures = [];
const existingRun = process.env.STORAGE_QA_EXISTING_RUN;
if (existingRun) assert.match(existingRun, /^[a-f0-9-]{36}$/, 'Invalid fixture run');
const run = existingRun ?? randomUUID();
function success(result, label) {
  assert.ok(!result.error, `${label} failed (provider details withheld)`);
  return result.data;
}
function denied(result, label) {
  assert.ok(result.error, `${label}: operation unexpectedly succeeded`);
  checks.push(label);
}
const authenticated = success(await writer.auth.signInWithPassword({ email: process.env.STORAGE_WRITER_EMAIL, password: process.env.STORAGE_WRITER_PASSWORD }), 'writer login');
assert.equal(authenticated.user.id, process.env.STORAGE_WRITER_USER_ID, 'writer identity mismatch');
checks.push('writer login and pinned identity');
console.log('STORAGE_QA writer authenticated; secret values withheld');

for (const label of ['A','B']) {
  const email = `storage-qa-${label.toLowerCase()}-${run}@example.invalid`;
  const identity = client();
  let userId;
  let organizationId;
  if (existingRun) {
    const organization = success(await service.from('organizations').select('id').eq('slug',`storage-qa-${label.toLowerCase()}-${run}`).single(),`existing clinic ${label}`);
    const profile = success(await service.from('profiles').select('id').eq('organization_id',organization.id).single(),`existing fixture profile ${label}`);
    const user = success(await service.auth.admin.getUserById(profile.id),`existing fixture account ${label}`).user;
    assert.equal(user.email,email,'Existing fixture email mismatch');
    const link = success(await service.auth.admin.generateLink({type:'magiclink',email}),`fixture session ${label}`);
    assert.equal(link.user.id,user.id,'Fixture identity mismatch');
    success(await identity.auth.verifyOtp({token_hash:link.properties.hashed_token,type:'email'}),`verify fixture session ${label}`);
    userId=user.id;
    organizationId=organization.id;
  } else {
    const password = randomBytes(40).toString('base64url');
    const user = success(await service.auth.admin.createUser({ email, password, email_confirm: true }), `create fictitious user ${label}`).user;
    success(await identity.auth.signInWithPassword({ email, password }), `login fictitious user ${label}`);
    const setup = success(await identity.rpc('handle_new_user_signup', {
      p_full_name: `Storage QA ${label}`, p_organization_name: `Storage QA ficticia ${label} ${run}`, p_organization_slug: `storage-qa-${label.toLowerCase()}-${run}`,
    }), `setup fictitious clinic ${label}`);
    assert.ok(setup.organization_id, 'fixture organization missing');
    success(await service.from('organization_storage_quotas').insert({ organization_id: setup.organization_id, quota_bytes: 256 }), `fixture quota ${label}`);
    userId=user.id;
    organizationId=setup.organization_id;
  }
  const quota = success(await service.from('organization_storage_quotas').select('quota_bytes').eq('organization_id',organizationId).single(),`verify fixture quota ${label}`);
  assert.equal(quota.quota_bytes,256,'Fixture quota mismatch');
  fixtures.push({ label, userId, organizationId, identity });
}
checks.push('two authenticated fictitious clinics');
console.log('STORAGE_QA fixtures', JSON.stringify(fixtures.map(({label,userId,organizationId}) => ({label,userId,organizationId}))));
const body = new Uint8Array(60).fill(17);
const hash = createHash('sha256').update(body).digest('hex');
async function reserve(fixture, bucket, path, bytes = body.byteLength, fingerprint = hash) {
  return service.rpc('reserve_organization_storage', { target_organization: fixture.organizationId, target_bucket: bucket, target_path: path, requested_bytes: bytes, requested_sha256: fingerprint });
}
const uploads = [];
for (const fixture of fixtures) {
  for (const bucket of ['clinical-images','patient-photos','data-migration']) {
    const path = `${fixture.organizationId}/storage-qa/${run}/${bucket}.png`;
    const reservation = success(await reserve(fixture,bucket,path), `reserve ${fixture.label} ${bucket}`);
    const contentType = bucket === 'data-migration' ? 'text/csv' : 'image/png';
    const previous = await writer.storage.from(bucket).download(path);
    if (previous.error) {
      const upload = await writer.storage.from(bucket).upload(path,body,{contentType,upsert:false});
      assert.ok(!upload.error, `writer upload ${bucket} failed (status ${upload.error?.statusCode ?? 'unknown'}; details withheld)`);
    }
    const observed = success(await writer.storage.from(bucket).download(path), `readback ${bucket}`);
    assert.equal(createHash('sha256').update(new Uint8Array(await observed.arrayBuffer())).digest('hex'),hash,'SHA256 readback mismatch');
    assert.equal(success(await service.rpc('complete_organization_storage',{reservation_id:reservation}),`complete ${bucket}`),true);
    assert.equal(success(await service.rpc('complete_organization_storage',{reservation_id:reservation}),`repeat completion ${bucket}`),true);
    assert.equal(success(await reserve(fixture,bucket,path),`retry reserve ${bucket}`),reservation);
    const repeatedUpload = await writer.storage.from(bucket).upload(path,body,{contentType,upsert:false});
    assert.ok(repeatedUpload.error, 'Completed object insert must remain immutable');
    assert.ok(['403','409'].includes(String(repeatedUpload.error.statusCode)), 'Unexpected immutable retry response');
    const retryContent = success(await writer.storage.from(bucket).download(path),`retry readback ${bucket}`);
    assert.equal(createHash('sha256').update(new Uint8Array(await retryContent.arrayBuffer())).digest('hex'),hash,'Retry SHA256 mismatch');
    assert.equal(success(await service.rpc('complete_organization_storage',{reservation_id:reservation}),`retry confirmed completion ${bucket}`),true);
    checks.push(`immutable HTTP retry reconciled ${fixture.label} ${bucket}`);
    denied(await reserve(fixture,bucket,path,60,'b'.repeat(64)),`reject hash conflict ${fixture.label} ${bucket}`);
    denied(await writer.storage.from(bucket).upload(`${fixture.organizationId}/storage-qa/${run}/unreserved-${bucket}`,body,{contentType}),`reject unreserved ${fixture.label} ${bucket}`);
    denied(await writer.storage.from(bucket).upload(path,body,{contentType,upsert:true}),`reject overwrite ${fixture.label} ${bucket}`);
    denied(await writer.storage.from(bucket).copy(path,`${fixture.organizationId}/storage-qa/${run}/copy-${bucket}`),`reject copy ${fixture.label} ${bucket}`);
    denied(await writer.storage.from(bucket).move(path,`${fixture.organizationId}/storage-qa/${run}/move-${bucket}`),`reject move ${fixture.label} ${bucket}`);
    uploads.push({ fixture, bucket, path });
  }
}
checks.push('six HTTP uploads, SHA256 readback, stable reservation and repeat completion');
for (const {fixture,bucket,path} of uploads.filter(upload=>upload.bucket!=='patient-photos')) {
  const other = fixtures.find(candidate=>candidate!==fixture);
  success(await fixture.identity.storage.from(bucket).download(path),`own clinic read ${fixture.label} ${bucket}`);
  denied(await other.identity.storage.from(bucket).download(path),`reject cross-clinic read ${fixture.label} ${bucket}`);
}
for (const fixture of fixtures) {
  const results = await Promise.all(Array.from({length:8},(_,index)=>reserve(fixture,'clinical-images',`${fixture.organizationId}/storage-qa/${run}/concurrent-${index}`,50)));
  assert.equal(results.filter(result=>!result.error).length,1,'concurrent reservations exceeded remaining capacity');
  assert.equal(results.filter(result=>result.error?.code==='23514').length,7,'unexpected concurrency rejection');
  denied(await fixture.identity.rpc('reserve_organization_storage',{target_organization:fixture.organizationId,target_bucket:'clinical-images',target_path:`${fixture.organizationId}/forbidden`,requested_bytes:1,requested_sha256:hash}),`reject user reservation RPC ${fixture.label}`);
}
checks.push('eight parallel HTTP reservations per clinic: one winner and seven quota rejections');
const report = { project, run, checks, fixtures:fixtures.map(({label,userId,organizationId})=>({label,userId,organizationId})), status:'precutover-passed', limitations:['Existing user/service direct-write permissions are not closed by this QA run.','Historical signed uploads and privileged S3 credentials require independent cutover verification.','Public patient photos remain public.'], createdAt:new Date().toISOString() };
mkdirSync('public',{recursive:true});
writeFileSync('public/index.html','<!doctype html><meta charset="utf-8"><title>Storage QA staging</title><h1>Storage QA staging</h1><p>Precutover checks passed. Cutover remains pending.</p>');
writeFileSync('public/storage-qa.json',JSON.stringify(report,null,2));
console.log('STORAGE_QA_RESULT',JSON.stringify(report));
