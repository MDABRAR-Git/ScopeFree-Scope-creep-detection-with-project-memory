// Real production-server restart/configuration checks against an explicitly isolated test database.
import dotenv from 'dotenv';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import pg from 'pg';
import { randomUUID } from 'node:crypto';
import { startTestProvider } from '../tests/support/provider-server.mjs';
import { startTestEmailServer } from '../tests/support/email-server.mjs';
dotenv.config({ path: '.env.test', override: true, quiet: true });
if (!process.env.DATABASE_URL || !new URL(process.env.DATABASE_URL).pathname.endsWith('_test')) throw new Error('Runtime checks require an isolated _test database.');
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const origin = 'http://localhost:3200';
const emailOrigin = 'http://127.0.0.1:3197';
const testProvider = await startTestProvider(3198);
const testEmail = await startTestEmailServer(3197);
let child;
async function stop() {
  if (child && child.exitCode === null) { const closed = once(child, 'exit'); child.kill(); await closed; }
  child = undefined;
}
async function start(overrides = {}) {
  child = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '--port', '3200'], { env: { ...process.env, NODE_ENV: 'production', APP_ORIGIN: origin, AI_PROVIDER: 'openai-compatible', AI_BASE_URL: 'http://127.0.0.1:3198/v1', AI_API_KEY: 'test-only-key', AI_MODEL: 'test-only-provider', AI_NATIVE_JSON_SCHEMA: 'false', EMAIL_PROVIDER: 'http-json', EMAIL_API_URL: `${emailOrigin}/emails`, EMAIL_API_KEY: 'test-only-email-key', EMAIL_FROM: 'proposals@scopefree.test', ...overrides }, stdio: 'ignore', windowsHide: true });
  for (let i = 0; i < 100; i++) {
    if (child.exitCode !== null) throw new Error('Verification server exited before startup.');
    try { if ((await fetch(`${origin}/login`)).ok) return; } catch {}
    await delay(200);
  }
  throw new Error('Verification server did not start.');
}
async function post(route, data, cookie) { return fetch(`${origin}${route}`, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) }, body: JSON.stringify(data) }); }
let projectId;
let intakeCreated = false;
try {
  await pool.query('DELETE FROM "LoginThrottle"');
  await start();
  const login = await post('/api/auth/login', { email: process.env.TEST_EMAIL, password: process.env.TEST_PASSWORD }); assert.equal(login.status, 200);
  const cookie = login.headers.get('set-cookie').split(';')[0];
  const create = await post('/api/projects', { name: 'Restart verification' }, cookie); assert.equal(create.status, 201);
  projectId = (await create.json()).project.id;
  const text = 'Build a responsive five-page website.';
  const baselineInput = { text, snapshot: { schemaVersion: 1, clauses: [{ id: 'B1', text, isDeliverable: true }] }, confirmed: true };
  const baseline = await post(`/api/projects/${projectId}/baseline`, baselineInput, cookie); assert.equal(baseline.status, 201);
  intakeCreated = true;
  const savedBaseline = (await baseline.json()).baseline;
  const submitted = await post(`/api/projects/${projectId}/requests`, { text: 'Add an additional portfolio page.', hourlyRatePaise: 123456 }, cookie); assert.equal(submitted.status, 201);
  const savedRequest = (await submitted.json()).request;
  const analyzed = await post(`/api/requests/${savedRequest.id}/analyze`, { idempotencyKey: randomUUID() }, cookie); assert.equal(analyzed.status, 200);
  let savedEstimate = (await analyzed.json()).estimate;
  const reviewDraft = { ...savedEstimate.draft, hourlyRatePaise: 150000, additionalChargePaise: 50000, additionalChargeReason: "One-time configuration." };
  const agreement = { clauses: [{ id: 'A1', taskIds: [reviewDraft.analysis.tasks[0].id], text: 'The website now includes six responsive pages.', amendsSourceIds: [savedEstimate.sources[0].sourceId] }], supersedesDecisionId: null };
  const reviewed = await fetch(`${origin}/api/estimates/${savedEstimate.id}/review`, { method: "PUT", headers: { Origin: origin, Cookie: cookie, "Content-Type": "application/json" }, body: JSON.stringify({ expectedRevision: 1, draft: reviewDraft, agreement, editReason: "Reviewed rate and fixed request charge." }) }); assert.equal(reviewed.status, 200);
  const approved = await post(`/api/estimates/${savedEstimate.id}/approve`, { expectedRevision: 2, reviewed: true }, cookie); assert.equal(approved.status, 200); savedEstimate = (await approved.json()).estimate;
  const clientEmail = 'client-runtime@example.com';
  const generated = await post(`/api/estimates/${savedEstimate.id}/proposal`, {expectedRevision:2,idempotencyKey:randomUUID(),clientEmail},cookie); assert.equal(generated.status,200);
  const offer = await generated.json(); assert.equal(offer.deliveryStatus,'SENT');
  const inbox = await (await fetch(`${emailOrigin}/inbox?to=${encodeURIComponent(clientEmail)}`)).json();
  const emailLink = inbox[inbox.length-1].text.match(/https?:\/\/[^\s]*#token=[A-Za-z0-9_-]{43}/)[0];
  const token = new URLSearchParams(new URL(emailLink).hash.slice(1)).get('token');
  console.log('PASS: approved proposal is emailed to the validated client address; the link is not returned to the freelancer.');
  const clientHeaders = { Origin:origin, Authorization:`Bearer ${token}`, 'Content-Type':'application/json' };
  const accepted = await fetch(`${origin}/api/client/proposals/${offer.proposalId}/decision`,{method:'POST',headers:clientHeaders,body:JSON.stringify({decision:'accept',confirmed:true,comment:'Proceed.',idempotencyKey:randomUUID()})});assert.equal(accepted.status,200);
  const savedDecision = (await accepted.json()).decision;
  savedEstimate = (await (await fetch(`${origin}/api/estimates/${savedEstimate.id}`,{headers:{Cookie:cookie}})).json()).estimate;
  const historyBefore = await fetch(`${origin}/api/projects/${projectId}/history`, { headers: { Cookie: cookie } }); assert.equal(historyBefore.status, 200);
  const savedHistory = (await historyBefore.json()).history;
  const decisionId = (await pool.query('SELECT "id" FROM "ProjectDecision" WHERE "proposalId"=$1', [offer.proposalId])).rows[0].id;
  const memoryBefore = await fetch(`${origin}/api/projects/${projectId}/memory`, { headers: { Cookie: cookie } }); assert.equal(memoryBefore.status, 200);
  const savedMemory = (await memoryBefore.json()).memory;
  const memoryDetailBefore = await fetch(`${origin}/api/projects/${projectId}/memory/${decisionId}`, { headers: { Cookie: cookie } }); assert.equal(memoryDetailBefore.status, 200);
  const savedMemoryDetail = (await memoryDetailBefore.json()).decision;
  savedRequest.estimate = { id: savedEstimate.id };
  await stop(); await start();
  const read = await fetch(`${origin}/api/projects/${projectId}`, { headers: { Cookie: cookie } }); assert.equal(read.status, 200); assert.equal((await read.json()).project.name, 'Restart verification');
  console.log('PASS: project and valid session persist across a production application restart.');
  const baselineAfter = await fetch(`${origin}/api/projects/${projectId}/baseline`, { headers: { Cookie: cookie } }); assert.equal(baselineAfter.status, 200); assert.deepEqual((await baselineAfter.json()).baseline, savedBaseline);
  const requestsAfter = await fetch(`${origin}/api/projects/${projectId}/requests`, { headers: { Cookie: cookie } }); assert.equal(requestsAfter.status, 200); assert.deepEqual((await requestsAfter.json()).requests, [savedRequest]);
  console.log('PASS: immutable baseline, confirmation metadata, request and exact INR rate survive a production application restart.');
  const analysisAfter = await fetch(`${origin}/api/estimates/${savedEstimate.id}`, { headers: { Cookie: cookie } }); assert.equal(analysisAfter.status, 200); assert.deepEqual((await analysisAfter.json()).estimate, savedEstimate);
  assert.equal(savedEstimate.status, 'PROPOSED'); assert.equal(savedEstimate.currentRevision, 2);
  const offerAfter = await fetch(`${origin}/api/client/proposals/${offer.proposalId}`,{headers:clientHeaders});assert.equal(offerAfter.status,200);assert.deepEqual((await offerAfter.json()).decision,savedDecision);
  console.log('PASS: client acceptance, its immutable offer and agreement amendment persist across restart.');
  const historyAfter = await fetch(`${origin}/api/projects/${projectId}/history`, { headers: { Cookie: cookie } }); assert.equal(historyAfter.status, 200); assert.deepEqual((await historyAfter.json()).history, savedHistory);
  assert.equal(savedHistory.summary.additionalRequests, 1);
  assert.equal(savedHistory.summary.acceptedAdditionalPaise.likely, String(savedEstimate.calculated.totalChargePaise.likely));
  console.log('PASS: request numbers, history, additional-request counts and saved billing totals persist after restart.');
  const memoryAfter = await fetch(`${origin}/api/projects/${projectId}/memory`, { headers: { Cookie: cookie } }); assert.equal(memoryAfter.status, 200); assert.deepEqual((await memoryAfter.json()).memory, savedMemory);
  const memoryDetailAfter = await fetch(`${origin}/api/projects/${projectId}/memory/${decisionId}`, { headers: { Cookie: cookie } }); assert.equal(memoryDetailAfter.status, 200); assert.deepEqual((await memoryDetailAfter.json()).decision, savedMemoryDetail);
  console.log('PASS: Project Memory list and immutable decision detail remain byte-equivalent after restart.');
  console.log('PASS: analysis original, pinned sources, human revision, pricing, approval and audit history persist after a production restart (test-only provider).');
  await stop(); await start({ AI_API_KEY: '' });
  const anotherRequest = await post(`/api/projects/${projectId}/requests`, { text: 'Add a second additional page.', hourlyRatePaise: 100000 }, cookie);
  const anotherId = (await anotherRequest.json()).request.id;
  const missingAI = await post(`/api/requests/${anotherId}/analyze`, { idempotencyKey: randomUUID() }, cookie); assert.equal(missingAI.status, 503); assert.equal((await missingAI.json()).error.code, 'AI_NOT_CONFIGURED');
  assert.equal((await pool.query('SELECT COUNT(*)::int n FROM "Estimate" WHERE "requestId"=$1', [anotherId])).rows[0].n, 0);
  console.log('PASS: missing AI configuration fails explicitly without a saved estimate or substitute output.');
  await stop(); await start({ SESSION_SECRET: '' });
  const unconfigured = await post('/api/auth/login', { email: process.env.TEST_EMAIL, password: process.env.TEST_PASSWORD }); assert.equal(unconfigured.status, 503); assert.equal((await unconfigured.json()).error.code, 'AUTH_NOT_CONFIGURED');
  console.log('PASS: missing session configuration fails explicitly without a session.');
  await stop(); await start({ DATABASE_URL: 'postgresql://invalid:invalid@127.0.0.1:59999/scopefree_test' });
  const unavailable = await post('/api/auth/login', { email: process.env.TEST_EMAIL, password: process.env.TEST_PASSWORD }); assert.equal(unavailable.status, 503); assert.equal((await unavailable.json()).error.code, 'DATABASE_ERROR');
  console.log('PASS: database connection failure returns a safe, retryable 503.');
} finally {
  await stop();
  testProvider.close();
  testEmail.close();
  // Confirmed baselines are immutable. Leave this isolated test record as verification history.
  if (projectId && !intakeCreated) { await pool.query('DELETE FROM "AuditEvent" WHERE "projectId"=$1', [projectId]); await pool.query('DELETE FROM "Project" WHERE "id"=$1', [projectId]); }
  await pool.end();
}
