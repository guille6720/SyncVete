import assert from 'node:assert/strict';
import { mkdirSync,writeFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';

const url='https://owmcrqvnfubyjxrlyhlc.supabase.co';
const application=process.env.STORAGE_QA_APPLICATION_URL ?? 'https://sync-vete-staging-ptfqe9r5a-guillermo-c-bmw.vercel.app';
assert.ok(new Set([
  'https://sync-vete-staging-ptfqe9r5a-guillermo-c-bmw.vercel.app',
  'https://sync-vete-staging-git-feature-ui-v2-shel-78b6a4-guillermo-c-bmw.vercel.app',
  'https://sync-vete-staging-guillermo-c-bmw.vercel.app',
]).has(application),'Application target must be an explicitly verified staging deployment');
assert.equal(process.env.NEXT_PUBLIC_SUPABASE_URL,url,'Staging URL required');
assert.equal(process.env.VERCEL_PROJECT_ID,'prj_q7UXLUU0wuo0D6KxdPjCw3AfyxrN','Staging project required');
assert.equal(process.env.VERCEL_ENV,'preview','Preview required');
assert.ok(process.env.SUPABASE_SERVICE_ROLE_KEY && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,'Server configuration required');
const service=createClient(url,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const fixtures=[
  {userId:'cf69cb70-a2dd-43d2-a955-d275eb2d4e41',email:'storage-qa-a-fa7d0c44-fea3-49bc-932c-50b48d3bd367@example.invalid'},
  {userId:'14c6c1da-bad7-4862-8a76-65043d0dc124',email:'storage-qa-b-fa7d0c44-fea3-49bc-932c-50b48d3bd367@example.invalid'},
];
const checks=[];
for(const fixture of fixtures){
  const user=await service.auth.admin.getUserById(fixture.userId);
  assert.ok(!user.error && user.data.user.email===fixture.email,'Existing fixture identity mismatch');
  const link=await service.auth.admin.generateLink({type:'magiclink',email:fixture.email});
  assert.ok(!link.error && link.data.user.id===fixture.userId,'Fixture session generation failed');
  const cookies=new Map();
  const identity=createServerClient(url,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,{cookies:{getAll:()=>Array.from(cookies,([name,value])=>({name,value})),setAll:values=>{for(const {name,value} of values) cookies.set(name,value);}}});
  const login=await identity.auth.verifyOtp({token_hash:link.data.properties.hashed_token,type:'email'});
  assert.ok(!login.error && login.data.user?.id===fixture.userId,'Fixture login failed');
  const cookie=Array.from(cookies,([name,value])=>`${name}=${encodeURIComponent(value)}`).join('; ');
  assert.ok(cookie,'Session cookies missing');
  const response=await fetch(`${application}/configuracion/almacenamiento`,{headers:{cookie},redirect:'manual',signal:AbortSignal.timeout(30000)});
  assert.equal(response.status,200,'Authenticated storage page must render without redirect');
  const html=await response.text();
  assert.ok(html.includes('Almacenamiento y disponibilidad'),'Storage page missing');
  assert.ok(!html.includes('No se pudo consultar el uso.'),'Storage RPC failed in application');
  checks.push({fixtureUserId:fixture.userId,httpStatus:response.status,storagePageRendered:true,storageUsageLoaded:true});
}
const report={project:'owmcrqvnfubyjxrlyhlc',application,status:'authenticated-storage-page-passed',checks,limitations:['Does not submit clinical actions or change stable aliases.'],createdAt:new Date().toISOString()};
mkdirSync('public',{recursive:true});
writeFileSync('public/index.html','<!doctype html><meta charset="utf-8"><title>Storage app QA</title><h1>Authenticated storage page QA passed</h1>');
writeFileSync('public/storage-application-qa.json',JSON.stringify(report,null,2));
console.log('STORAGE_APPLICATION_QA_RESULT',JSON.stringify(report));
