// Real production-server restart/configuration checks against an explicitly isolated test database.
import dotenv from 'dotenv';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import pg from 'pg';
dotenv.config({ path: '.env.test', override: true, quiet: true });
if (!process.env.DATABASE_URL || !new URL(process.env.DATABASE_URL).pathname.endsWith('_test')) throw new Error('Runtime checks require an isolated _test database.');
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const origin = 'http://localhost:3200';
let child;
async function stop() {
  if (child && child.exitCode === null) { const closed = once(child, 'exit'); child.kill(); await closed; }
  child = undefined;
}
async function start(overrides = {}) {
  child = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '--port', '3200'], { env: { ...process.env, NODE_ENV: 'production', APP_ORIGIN: origin, ...overrides }, stdio: 'ignore', windowsHide: true });
  for (let i = 0; i < 100; i++) {
    if (child.exitCode !== null) throw new Error('Verification server exited before startup.');
    try { if ((await fetch(`${origin}/login`)).ok) return; } catch {}
    await delay(200);
  }
  throw new Error('Verification server did not start.');
}
async function post(route, data, cookie) { return fetch(`${origin}${route}`, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) }, body: JSON.stringify(data) }); }
let projectId;
try {
  await pool.query('DELETE FROM "LoginThrottle"');
  await start();
  const login = await post('/api/auth/login', { password: process.env.TEST_PASSWORD }); assert.equal(login.status, 200);
  const cookie = login.headers.get('set-cookie').split(';')[0];
  const create = await post('/api/projects', { name: 'Restart verification' }, cookie); assert.equal(create.status, 201);
  projectId = (await create.json()).project.id;
  await stop(); await start();
  const read = await fetch(`${origin}/api/projects/${projectId}`, { headers: { Cookie: cookie } }); assert.equal(read.status, 200); assert.equal((await read.json()).project.name, 'Restart verification');
  console.log('PASS: project and valid session persist across a production application restart.');
  await stop(); await start({ FREELANCER_PASSWORD_HASH: '' });
  const unconfigured = await post('/api/auth/login', { password: process.env.TEST_PASSWORD }); assert.equal(unconfigured.status, 503); assert.equal((await unconfigured.json()).error.code, 'AUTH_NOT_CONFIGURED');
  console.log('PASS: missing password configuration fails explicitly without a session.');
  await stop(); await start({ DATABASE_URL: 'postgresql://invalid:invalid@127.0.0.1:59999/scopefree_test' });
  const unavailable = await post('/api/auth/login', { password: process.env.TEST_PASSWORD }); assert.equal(unavailable.status, 503); assert.equal((await unavailable.json()).error.code, 'DATABASE_ERROR');
  console.log('PASS: database connection failure returns a safe, retryable 503.');
} finally {
  await stop();
  if (projectId) { await pool.query('DELETE FROM "AuditEvent" WHERE "projectId"=$1', [projectId]); await pool.query('DELETE FROM "Project" WHERE "id"=$1', [projectId]); }
  await pool.end();
}
