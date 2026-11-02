import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdirSync,writeFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
assert.equal(url,'https://owmcrqvnfubyjxrlyhlc.supabase.co','Staging URL mismatch');
assert.equal(process.env.VERCEL_ENV,'preview','Preview required');
assert.equal(process.env.VERCEL_PROJECT_ID,'prj_q7UXLUU0wuo0D6KxdPjCw3AfyxrN','Project mismatch');
for(const name of ['NEXT_PUBLIC_SUPABASE_ANON_KEY','STORAGE_WRITER_EMAIL','STORAGE_WRITER_PASSWORD','STORAGE_WRITER_USER_ID']) assert.ok(process.env[name],'Missing '+name);
const client=createClient(url,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:(input,init)=>fetch(input,{...init,signal:AbortSignal.timeout(30000)})}});
const login=await client.auth.signInWithPassword({email:process.env.STORAGE_WRITER_EMAIL,password:process.env.STORAGE_WRITER_PASSWORD});
assert.ok(!login.error && login.data.session,'Technical identity login failed; provider details withheld');
assert.equal(login.data.user.id,process.env.STORAGE_WRITER_USER_ID,'Technical identity mismatch');
const claims=JSON.parse(Buffer.from(login.data.session.access_token.split('.')[1],'base64url').toString());
assert.equal(claims.role,'authenticated','Technical identity must not use a privileged role');
const fixture='00000000-0000-0000-0000-000000000099';
for(const [name,args] of [['reserve_organization_storage',{target_organization:fixture,target_bucket:'clinical-images',target_path:fixture+'/auth-probe',requested_bytes:2,requested_sha256:'a'.repeat(64)}],['complete_organization_storage',{reservation_id:fixture}]]){
  const result=await client.rpc(name,args);
  assert.equal(result.error?.code,'42501','Technical identity must not execute administrative reservation RPC');
}
const missing=await client.storage.from('clinical-images').download(fixture+'/storage-qa-nonexistent/'+randomUUID());
assert.ok(missing.error,'Non-reserved object must not be readable');
const result={status:'authentication-and-read-boundaries-passed',project:'owmcrqvnfubyjxrlyhlc',checks:['HTTP password login','pinned user ID','authenticated role without service privileges','reservation RPC denied','completion RPC denied','non-reserved path read denied'],limitations:['Upload, two-clinic isolation, concurrency HTTP and privileged bypass remain unverified.'],createdAt:new Date().toISOString()};
mkdirSync('public',{recursive:true});
writeFileSync('public/index.html','<!doctype html><meta charset="utf-8"><title>Storage authentication QA</title><h1>Storage staging authentication QA</h1><p>Login and read boundaries verified. Upload cutover remains pending.</p>');
writeFileSync('public/storage-auth-qa.json',JSON.stringify(result,null,2));
console.log('STORAGE_AUTH_QA_RESULT',JSON.stringify(result));
