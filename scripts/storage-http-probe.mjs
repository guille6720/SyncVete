import assert from 'node:assert/strict';

const baseUrl = 'https://owmcrqvnfubyjxrlyhlc.supabase.co';
const apiKey = process.env.STORAGE_TEST_ANON_KEY;
if (!apiKey) throw new Error('Set STORAGE_TEST_ANON_KEY to the staging publishable key');
const headers = { apikey: apiKey, 'Content-Type': 'application/json' };
const settingsResponse = await fetch(`${baseUrl}/auth/v1/settings`, { headers, signal: AbortSignal.timeout(15000) });
assert.equal(settingsResponse.status, 200);
const settings = await settingsResponse.json();
const results = [];
for (const [name, body] of [
  ['reserve_organization_storage', { target_organization: '00000000-0000-0000-0000-000000000099', target_bucket: 'clinical-images', target_path: '00000000-0000-0000-0000-000000000099/probe', requested_bytes: 2, requested_sha256: 'a'.repeat(64) }],
  ['complete_organization_storage', { reservation_id: '00000000-0000-0000-0000-000000000099' }],
]) {
  const response = await fetch(`${baseUrl}/rest/v1/rpc/${name}`, { method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(15000) });
  const result = await response.json();
  assert.ok([401, 403].includes(response.status), `${name}: expected permission denial, received ${response.status}`);
  assert.equal(result.code, '42501');
  results.push({ name, status: response.status, code: result.code });
}
console.log(JSON.stringify({ project: 'owmcrqvnfubyjxrlyhlc', anonymousSignInsEnabled: settings.external?.anonymous_users ?? settings.anonymous_users_enabled ?? null, results }, null, 2));
