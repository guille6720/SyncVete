import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync,writeFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';

const url='https://owmcrqvnfubyjxrlyhlc.supabase.co';
const run='fa7d0c44-fea3-49bc-932c-50b48d3bd367';
assert.equal(process.env.NEXT_PUBLIC_SUPABASE_URL,url,'Staging URL required');
assert.equal(process.env.VERCEL_PROJECT_ID,'prj_q7UXLUU0wuo0D6KxdPjCw3AfyxrN','Staging project required');
assert.equal(process.env.VERCEL_ENV,'preview','Preview required');
assert.equal(process.env.STORAGE_QA_ALLOW_PERSISTENT_FIXTURES,'true','Fixture opt-in required');
for(const key of ['SUPABASE_SERVICE_ROLE_KEY','NEXT_PUBLIC_SUPABASE_ANON_KEY','STORAGE_WRITER_EMAIL','STORAGE_WRITER_PASSWORD','STORAGE_WRITER_USER_ID']) assert.ok(process.env[key],`Missing ${key}`);
const options={auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:(input,init)=>fetch(input,{...init,signal:AbortSignal.timeout(30000)})}};
const service=createClient(url,process.env.SUPABASE_SERVICE_ROLE_KEY,options);
const writer=createClient(url,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,options);
const anonymous=createClient(url,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,options);
const fixtures=[
  {label:'A',userId:'cf69cb70-a2dd-43d2-a955-d275eb2d4e41',organizationId:'1ef77bb7-0a7a-4bda-8d38-23ce037ccd30'},
  {label:'B',userId:'14c6c1da-bad7-4862-8a76-65043d0dc124',organizationId:'dc186a95-11c9-4dcd-8a83-3bbb7df254ee'},
];
const applications=[
  'https://sync-vete-staging-git-feature-ui-v2-shel-78b6a4-guillermo-c-bmw.vercel.app',
  'https://sync-vete-staging-guillermo-c-bmw.vercel.app',
];
const checks=[];
function success(result,label){assert.ok(!result.error,`${label} failed; provider details withheld`);return result.data;}
function denied(result,label){assert.ok(result.error,`${label} unexpectedly succeeded`);checks.push(label);}
const login=success(await writer.auth.signInWithPassword({email:process.env.STORAGE_WRITER_EMAIL,password:process.env.STORAGE_WRITER_PASSWORD}),'writer login');
assert.equal(login.user.id,process.env.STORAGE_WRITER_USER_ID,'Writer ID mismatch');
assert.equal(success(await service.rpc('get_organization_storage_guard_status',{target_organization:'00000000-0000-0000-0000-000000000099'}),'global guard check'),true,'Global guard must cover namespaces outside fixture allowlist');
checks.push('global guard covers arbitrary namespaces');
const body=new Uint8Array(8).fill(21);
const hash=createHash('sha256').update(body).digest('hex');
for(const fixture of fixtures){
  const email=`storage-qa-${fixture.label.toLowerCase()}-${run}@example.invalid`;
  const existing=success(await service.auth.admin.getUserById(fixture.userId),'existing fictitious user').user;
  assert.equal(existing.email,email,'Fixture email mismatch');
  const organization=success(await service.from('organizations').select('slug').eq('id',fixture.organizationId).single(),'existing fictitious clinic');
  assert.equal(organization.slug,`storage-qa-${fixture.label.toLowerCase()}-${run}`,'Fixture organization mismatch');
  const link=success(await service.auth.admin.generateLink({type:'magiclink',email}),'fixture session');
  assert.equal(link.user.id,fixture.userId,'Fixture identity mismatch');
  const cookies=new Map();
  const identity=createServerClient(url,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,{cookies:{getAll:()=>Array.from(cookies,([name,value])=>({name,value})),setAll:values=>{for(const {name,value} of values)cookies.set(name,value);}}});
  const session=success(await identity.auth.verifyOtp({token_hash:link.properties.hashed_token,type:'email'}),'fixture login');
  assert.equal(session.user.id,fixture.userId,'Fixture session ID mismatch');
  for(const bucket of ['clinical-images','patient-photos','data-migration']){
    const contentType=bucket==='data-migration'?'text/csv':'image/png';
    const unreserved=`${fixture.organizationId}/storage-qa/${run}/global-unreserved-${bucket}`;
    denied(await identity.storage.from(bucket).upload(unreserved,body,{contentType}),`ordinary direct upload rejected ${fixture.label} ${bucket}`);
    denied(await service.storage.from(bucket).upload(unreserved,body,{contentType}),`service direct upload rejected ${fixture.label} ${bucket}`);
    denied(await anonymous.storage.from(bucket).upload(unreserved,body,{contentType}),`anonymous direct upload rejected ${fixture.label} ${bucket}`);
    denied(await service.storage.from(bucket).createSignedUploadUrl(unreserved),`new signed upload rejected ${fixture.label} ${bucket}`);
  }
  const path=`${fixture.organizationId}/storage-qa/${run}/global-positive`;
  const receipt=success(await service.rpc('reserve_organization_storage',{target_organization:fixture.organizationId,target_bucket:'clinical-images',target_path:path,requested_bytes:8,requested_sha256:hash}),`valid reserve ${fixture.label}`);
  denied(await identity.storage.from('clinical-images').upload(path,body,{contentType:'image/png',upsert:false}),`ordinary insert rejected even for reserved path ${fixture.label}`);
  const previous=await writer.storage.from('clinical-images').download(path);
  if(previous.error){
    const uploader=fixture.label==='A'?writer:service;
    success(await uploader.storage.from('clinical-images').upload(path,body,{contentType:'image/png',upsert:false}),`valid guarded upload ${fixture.label}`);
  }
  const readback=success(await writer.storage.from('clinical-images').download(path),`guarded readback ${fixture.label}`);
  assert.equal(createHash('sha256').update(new Uint8Array(await readback.arrayBuffer())).digest('hex'),hash,'Guarded SHA256 mismatch');
  assert.equal(success(await service.rpc('complete_organization_storage',{reservation_id:receipt}),`complete ${fixture.label}`),true);
  assert.equal(success(await service.rpc('complete_organization_storage',{reservation_id:receipt}),`repeat complete ${fixture.label}`),true);
  const quota=success(await service.from('organization_storage_quotas').select('quota_bytes').eq('organization_id',fixture.organizationId).single(),'fixture quota');
  assert.equal(quota.quota_bytes,256,'Fixture quota changed');
  success(await identity.storage.from('clinical-images').download(path),`own clinic read ${fixture.label}`);
  const other=fixtures.find(candidate=>candidate!==fixture);
  const foreignPath=`${other.organizationId}/storage-qa/${run}/clinical-images.png`;
  denied(await identity.storage.from('clinical-images').download(foreignPath),`cross-clinic read rejected ${fixture.label}`);
  checks.push(`valid guarded upload, hash and repeat completion ${fixture.label}`);
  const cookie=Array.from(cookies,([name,value])=>`${name}=${encodeURIComponent(value)}`).join('; ');
  assert.ok(cookie,'Fixture cookies missing');
  for(const application of applications){
    const response=await fetch(`${application}/configuracion/almacenamiento`,{headers:{cookie},redirect:'manual',signal:AbortSignal.timeout(30000)});
    assert.equal(response.status,200,'Stable authenticated storage page failed');
    const html=await response.text();
    assert.ok(html.includes('Almacenamiento y disponibilidad') && !html.includes('No se pudo consultar el uso.'),'Stable storage page did not load its data');
    checks.push(`authenticated storage page ${fixture.label} ${application}`);
  }
}
const report={project:'owmcrqvnfubyjxrlyhlc',run,status:'global-cutover-http-passed',checks,additionalObjects:{count:2,bytesEach:8},limitations:['Public patient photos remain public.','No independent privileged S3 client test was performed; user confirmed there are no external writers.','Historical scheduler configuration remains unchanged and lacks CRON_SECRET.'],createdAt:new Date().toISOString()};
mkdirSync('public',{recursive:true});
writeFileSync('public/index.html','<!doctype html><meta charset="utf-8"><title>Storage global cutover QA</title><h1>Storage staging global cutover checks passed</h1>');
writeFileSync('public/storage-global-qa.json',JSON.stringify(report,null,2));
console.log('STORAGE_GLOBAL_QA_RESULT',JSON.stringify(report));
