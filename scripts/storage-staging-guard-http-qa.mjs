import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const url = 'https://owmcrqvnfubyjxrlyhlc.supabase.co';
const run = 'fa7d0c44-fea3-49bc-932c-50b48d3bd367';
assert.equal(process.env.NEXT_PUBLIC_SUPABASE_URL,url,'Staging URL required');
assert.equal(process.env.VERCEL_PROJECT_ID,'prj_q7UXLUU0wuo0D6KxdPjCw3AfyxrN','Staging project required');
assert.equal(process.env.VERCEL_ENV,'preview','Preview required');
assert.equal(process.env.STORAGE_QA_ALLOW_PERSISTENT_FIXTURES,'true','Explicit fixture opt-in required');
for (const key of ['NEXT_PUBLIC_SUPABASE_ANON_KEY','SUPABASE_SERVICE_ROLE_KEY','STORAGE_WRITER_EMAIL','STORAGE_WRITER_PASSWORD','STORAGE_WRITER_USER_ID']) assert.ok(process.env[key],`Missing ${key}`);
const options = {auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:(input,init)=>fetch(input,{...init,signal:AbortSignal.timeout(20000)})}};
const service = createClient(url,process.env.SUPABASE_SERVICE_ROLE_KEY,options);
const writer = createClient(url,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,options);
const fixtures = [
  {label:'A',organizationId:'1ef77bb7-0a7a-4bda-8d38-23ce037ccd30'},
  {label:'B',organizationId:'dc186a95-11c9-4dcd-8a83-3bbb7df254ee'},
];
const buckets = ['clinical-images','patient-photos','data-migration'];
const checks = [];
const historicalTokens = [];
function success(result,label) {
  assert.ok(!result.error,`${label} failed; provider details withheld`);
  return result.data;
}
function denied(result,label) {
  assert.ok(result.error,`${label}: unexpectedly succeeded`);
  checks.push(label);
}
const login = success(await writer.auth.signInWithPassword({email:process.env.STORAGE_WRITER_EMAIL,password:process.env.STORAGE_WRITER_PASSWORD}),'writer login');
assert.equal(login.user.id,process.env.STORAGE_WRITER_USER_ID,'Writer identity mismatch');
for (const fixture of fixtures) {
  const organization = success(await service.from('organizations').select('slug').eq('id',fixture.organizationId).single(),'verify fictitious clinic');
  assert.equal(organization.slug,`storage-qa-${fixture.label.toLowerCase()}-${run}`,'Fixture namespace mismatch');
  const enabled = success(await service.rpc('get_organization_storage_guard_status',{target_organization:fixture.organizationId}),'initial guard status');
  assert.equal(enabled,false,'Historical tokens must be issued before fixture activation');
  for (const bucket of buckets) {
    const path = `${fixture.organizationId}/storage-qa/${run}/historical-${bucket}`;
    const signed = success(await service.storage.from(bucket).createSignedUploadUrl(path),'issue historical fixture token');
    assert.ok(signed.token,'Historical token missing');
    historicalTokens.push({fixture,bucket,path,token:signed.token});
  }
}
console.log('STORAGE_GUARD_QA_TOKENS_READY',JSON.stringify({run,organizations:fixtures.map(fixture=>fixture.organizationId),tokens:historicalTokens.length}));
const deadline = Date.now()+120000;
let active = false;
while (Date.now()<deadline) {
  const states = await Promise.all(fixtures.map(fixture=>service.rpc('get_organization_storage_guard_status',{target_organization:fixture.organizationId})));
  if (states.every(result=>!result.error && result.data===true)) {active=true;break;}
  await new Promise(resolve=>setTimeout(resolve,1000));
}
assert.ok(active,'Fixture guard was not activated within the coordination window');
checks.push('fixture guard active after historical tokens were issued');
const originalBody = new Uint8Array(60).fill(17);
const originalHash = createHash('sha256').update(originalBody).digest('hex');
for (const {fixture,bucket,path,token} of historicalTokens) {
  const contentType = bucket==='data-migration'?'text/csv':'image/png';
  denied(await service.storage.from(bucket).uploadToSignedUrl(path,token,originalBody,{contentType}),`historical signed upload rejected ${fixture.label} ${bucket}`);
  const unreservedPath = `${fixture.organizationId}/storage-qa/${run}/privileged-${bucket}`;
  denied(await service.storage.from(bucket).upload(unreservedPath,originalBody,{contentType}),`service upload without reservation rejected ${fixture.label} ${bucket}`);
  denied(await service.storage.from(bucket).createSignedUploadUrl(unreservedPath),`new signed upload rejected ${fixture.label} ${bucket}`);
  const originalPath = `${fixture.organizationId}/storage-qa/${run}/${bucket}.png`;
  denied(await service.storage.from(bucket).update(originalPath,originalBody,{contentType}),`service replacement rejected ${fixture.label} ${bucket}`);
  denied(await service.storage.from(bucket).copy(originalPath,`${unreservedPath}-copy`),`service copy rejected ${fixture.label} ${bucket}`);
  denied(await service.storage.from(bucket).move(originalPath,`${unreservedPath}-move`),`service move rejected ${fixture.label} ${bucket}`);
  const observed = success(await writer.storage.from(bucket).download(originalPath),'original fixture preserved');
  assert.equal(createHash('sha256').update(new Uint8Array(await observed.arrayBuffer())).digest('hex'),originalHash,'Original fixture content changed');
}
for (const fixture of fixtures) {
  denied(await service.from('organization_storage_quotas').update({quota_bytes:999999}).eq('organization_id',fixture.organizationId),`service quota forgery rejected ${fixture.label}`);
  denied(await service.from('organization_storage_reservations').insert({organization_id:fixture.organizationId,bucket_id:'clinical-images',object_path:`${fixture.organizationId}/storage-qa/${run}/forged`,bytes:1,content_sha256:'a'.repeat(64)}),`service receipt forgery rejected ${fixture.label}`);
  const body = new Uint8Array(16).fill(19);
  const hash = createHash('sha256').update(body).digest('hex');
  const path = `${fixture.organizationId}/storage-qa/${run}/guard-positive`;
  const receipt = success(await service.rpc('reserve_organization_storage',{target_organization:fixture.organizationId,target_bucket:'clinical-images',target_path:path,requested_bytes:16,requested_sha256:hash}),`guarded positive reserve ${fixture.label}`);
  const uploader = fixture.label==='A'?writer:service;
  success(await uploader.storage.from('clinical-images').upload(path,body,{contentType:'image/png',upsert:false}),`guarded positive upload ${fixture.label}`);
  const observed = success(await writer.storage.from('clinical-images').download(path),`guarded positive read ${fixture.label}`);
  assert.equal(createHash('sha256').update(new Uint8Array(await observed.arrayBuffer())).digest('hex'),hash,'Guarded upload SHA256 mismatch');
  assert.equal(success(await service.rpc('complete_organization_storage',{reservation_id:receipt}),`guarded positive complete ${fixture.label}`),true);
  const quota = success(await service.from('organization_storage_quotas').select('quota_bytes').eq('organization_id',fixture.organizationId).single(),'quota preserved');
  assert.equal(quota.quota_bytes,256,'Fixture quota changed');
  checks.push(`guarded valid ${fixture.label==='A'?'limited':'service'} upload and completion ${fixture.label}`);
}
const report = {project:'owmcrqvnfubyjxrlyhlc',run,status:'fixture-privileged-guard-passed',checks,additionalObjects:{count:2,bytesEach:16},limits:['Global enforcement remains disabled.','Privileged external S3 credentials were not available for an independent HTTP test.','Public patient photos remain public.'],createdAt:new Date().toISOString()};
mkdirSync('public',{recursive:true});
writeFileSync('public/index.html','<!doctype html><meta charset="utf-8"><title>Storage privileged guard QA</title><h1>Storage privileged guard QA</h1><p>Fixture checks passed. Global cutover remains pending.</p>');
writeFileSync('public/storage-guard-qa.json',JSON.stringify(report,null,2));
console.log('STORAGE_GUARD_QA_RESULT',JSON.stringify(report));
