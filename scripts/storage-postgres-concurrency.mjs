import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';

const executable = process.env.STORAGE_TEST_PSQL;
if (!executable) throw new Error('Set STORAGE_TEST_PSQL to the local psql executable');
const database = process.env.STORAGE_TEST_DATABASE ?? 'postgres';
if (database !== 'postgres' && !/^storage_[a-z0-9_]+$/.test(database)) throw new Error('Local storage test database required');
const organization = '00000000-0000-0000-0000-000000000001';
const hash = 'a'.repeat(64);
function query(sql) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, ['-h', '127.0.0.1', '-p', '55439', '-U', 'storage_test', '-d', database, '-X', '-At', '-v', 'ON_ERROR_STOP=1', '-c', sql], { windowsHide: true });
    let output = '';
    child.stdout.on('data', chunk => { output += chunk; });
    child.stderr.on('data', chunk => { output += chunk; });
    child.on('error', reject);
    child.on('close', code => resolve({ code, output: output.trim() }));
  });
}
const reserve = path => `SELECT public.reserve_organization_storage('${organization}','clinical-images','${organization}/${path}',60,'${hash}');`;
const results = await Promise.all(Array.from({ length: 8 }, (_, index) => query(`SET ROLE service_role; ${reserve(`concurrent-${index}`)}`)));
assert.equal(results.filter(result => result.code === 0).length, 1);
assert.equal(results.filter(result => result.output.includes('storage quota exceeded')).length, 7);
const winner = results.findIndex(result => result.code === 0);
const retry = await query(`SET ROLE service_role; ${reserve(`concurrent-${winner}`)}`);
assert.equal(retry.code, 0);
assert.equal(retry.output, results[winner].output);
const invalid = await query(`SET ROLE service_role; SELECT public.reserve_organization_storage('${organization}','clinical-images','${organization}/invalid',1,NULL);`);
assert.notEqual(invalid.code, 0);
assert.match(invalid.output, /invalid storage reservation/);
const forbidden = await query(`SET ROLE authenticated; ${reserve('forbidden')}`);
assert.notEqual(forbidden.code, 0);
assert.match(forbidden.output, /permission denied/);
console.log('PostgreSQL: eight concurrent connections, one winner, seven quota rejections, stable retry, null hash and authenticated role rejected.');
