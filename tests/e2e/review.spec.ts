import { test, expect, type APIRequestContext } from "@playwright/test";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { baselineInput } from "../fixtures/intake-documents";
import type { ReviewDraft } from "../../src/lib/pricing";
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const origin = "http://localhost:3100", headers = { Origin: origin };
test.beforeEach(async () => { await pool.query('DELETE FROM "LoginThrottle"'); });
test.afterAll(async () => { await pool.end(); });
async function setup(request: APIRequestContext) {
  expect((await request.post('/api/auth/login', { headers, data: { password: process.env.TEST_PASSWORD } })).status()).toBe(200);
  const projectId = (await (await request.post('/api/projects', { headers, data: { name: `Review ${randomUUID().slice(0, 8)}` } })).json()).project.id;
  expect((await request.post(`/api/projects/${projectId}/baseline`, { headers, data: baselineInput() })).status()).toBe(201);
  const saved = (await (await request.post(`/api/projects/${projectId}/requests`, { headers, data: { text: 'Add another responsive website page.', hourlyRatePaise: 100000 } })).json()).request;
  const response = await request.post(`/api/requests/${saved.id}/analyze`, { headers, data: { idempotencyKey: randomUUID() } }); expect(response.status()).toBe(200);
  return { projectId, requestId: saved.id, estimate: (await response.json()).estimate };
}
async function save(request: APIRequestContext, id: string, revision: number, draft: ReviewDraft, editReason = '') {
  return request.put(`/api/estimates/${id}/review`, { headers, data: { expectedRevision: revision, draft, editReason } });
}
async function approve(request: APIRequestContext, id: string, revision: number) {
  return request.post(`/api/estimates/${id}/approve`, { headers, data: { expectedRevision: revision, reviewed: true } });
}
async function reopen(request: APIRequestContext, id: string, revision: number) {
  return request.post(`/api/estimates/${id}/reopen`, { headers, data: { expectedRevision: revision } });
}

test('review recalculates ranges and fixed charge, preserves originals and saves reasoned immutable revisions', async ({ request }) => {
  const { estimate } = await setup(request);
  const original = (await pool.query('SELECT "originalAiJson","originalInputJson","originalCalculatedJson" FROM "Estimate" WHERE "id"=$1', [estimate.id])).rows[0];
  const draft: ReviewDraft = structuredClone(estimate.draft);
  draft.hourlyRatePaise = 150000; draft.additionalChargePaise = 50000; draft.additionalChargeReason = 'Additional service configuration.';
  draft.analysis.tasks[0].estimatedHours = { minimum: 2, likely: 4, maximum: 6 };
  const result = await save(request, estimate.id, 1, draft); expect(result.status()).toBe(200);
  const saved = (await result.json()).estimate;
  expect(saved.calculated).toMatchObject({ totalChargePaise: { minimum: 350000, likely: 650000, maximum: 950000 } });
  expect(saved.currentRevision).toBe(2); expect(saved.revisions).toHaveLength(2);
  expect((await pool.query('SELECT "originalAiJson","originalInputJson","originalCalculatedJson" FROM "Estimate" WHERE "id"=$1', [estimate.id])).rows[0]).toEqual(original);
  draft.analysis.tasks[0].classification = 'NEW_FEATURE';
  expect((await save(request, estimate.id, 2, draft)).status()).toBe(422);
  const edited = await save(request, estimate.id, 2, draft, 'This is separate functionality.'); expect(edited.status()).toBe(200);
  expect((await edited.json()).estimate.revisions[2].editReason).toBe('This is separate functionality.');
  draft.analysis.tasks.push({ ...draft.analysis.tasks[0], id: 'T2' });
  expect((await save(request, estimate.id, 3, draft)).status()).toBe(200);
  draft.analysis.tasks.pop();
  expect((await save(request, estimate.id, 4, draft)).status()).toBe(422);
  expect((await save(request, estimate.id, 4, draft, 'Remove the duplicate work item.')).status()).toBe(200);
  await expect(pool.query('UPDATE "EstimateRevision" SET "snapshotJson"=\'{}\' WHERE "estimateId"=$1', [estimate.id])).rejects.toMatchObject({ code: '23514' });
  await expect(pool.query('UPDATE "Estimate" SET "originalCalculatedJson"=\'{}\' WHERE "id"=$1', [estimate.id])).rejects.toMatchObject({ code: '23514' });
});

test('review requires access/origin and rejects forged prices, invalid hours, unsupported classification and foreign evidence', async ({ request }) => {
  const id = randomUUID();
  expect((await request.put(`/api/estimates/${id}/review`, { headers, data: {} })).status()).toBe(401);
  expect((await request.get(`/api/projects/${id}/history`)).status()).toBe(401);
  const { estimate } = await setup(request), draft: ReviewDraft = estimate.draft;
  expect((await request.put(`/api/estimates/${estimate.id}/review`, { headers: { Origin: 'https://foreign.example' }, data: {} })).status()).toBe(403);
  for (const extra of [{ calculated: { totalChargePaise: 1 } }, { billableHours: 1 }, { approved: true }]) expect((await save(request, estimate.id, 1, { ...draft, ...extra })).status()).toBe(422);
  expect((await save(request, estimate.id, 1, { ...draft, additionalChargePaise: 1, additionalChargeReason: '  ' })).status()).toBe(422);
  for (const change of [{ classification: 'ADDITIONAL_REQUEST' }, { estimatedHours: { minimum: .1, likely: 2, maximum: 3 } }, { estimatedHours: { minimum: 3, likely: 2, maximum: 1 } }]) expect((await save(request, estimate.id, 1, { ...draft, analysis: { ...draft.analysis, tasks: [{ ...draft.analysis.tasks[0], ...change }] } } as ReviewDraft)).status()).toBe(422);
  const foreign = structuredClone(draft); foreign.analysis.tasks[0].sourceEvidence[0].sourceId = `${randomUUID()}:B1`;
  expect((await save(request, estimate.id, 1, foreign)).status()).toBe(422);
  foreign.analysis.tasks[0].sourceEvidence[0] = { ...draft.analysis.tasks[0].sourceEvidence[0], quote: 'Invented agreement text.' };
  expect((await save(request, estimate.id, 1, foreign)).status()).toBe(422);
  expect((await request.post(`/api/estimates/${estimate.id}/approve`, { headers, data: { expectedRevision: 1, reviewed: false } })).status()).toBe(422);
});

test('competing saves and approval cannot overwrite a newer revision', async ({ request }) => {
  const { estimate } = await setup(request);
  const results = await Promise.all([save(request, estimate.id, 1, estimate.draft), save(request, estimate.id, 1, { ...estimate.draft, hourlyRatePaise: 200000 })]);
  expect(results.map(r => r.status()).sort()).toEqual([200, 409]);
  const stale = await approve(request, estimate.id, 1); expect(stale.status()).toBe(409); expect((await stale.json()).error.code).toBe('STALE_REVISION');
  expect((await pool.query('SELECT count(*)::int AS n FROM "EstimateRevision" WHERE "estimateId"=$1', [estimate.id])).rows[0].n).toBe(2);
});

test('uncertainty blocks approval; resolving to IN_SCOPE allows zero-price approval', async ({ request }) => {
  const { estimate } = await setup(request); const draft: ReviewDraft = estimate.draft;
  draft.analysis.tasks[0].classification = 'UNCERTAIN'; draft.analysis.tasks[0].missingInformation = ['Which behavior should change?'];
  let saved = await save(request, estimate.id, 1, draft, 'The requested behavior needs clarification.'); expect(saved.status()).toBe(200);
  expect((await saved.json()).estimate.calculated.provisional).toBe(true);
  const blocked = await approve(request, estimate.id, 2); expect(blocked.status()).toBe(422); expect((await blocked.json()).error.code).toBe('UNCERTAIN_TASKS');
  draft.analysis.tasks[0].classification = 'IN_SCOPE'; draft.analysis.tasks[0].estimatedHours = { minimum: 0, likely: 0, maximum: 0 }; draft.analysis.tasks[0].matchedScopeClause!.relation = 'inclusion';
  saved = await save(request, estimate.id, 2, draft, 'Clarified that this restores agreed behavior.'); expect(saved.status()).toBe(200);
  const approved = await approve(request, estimate.id, 3); expect(approved.status()).toBe(200);
  expect((await approved.json()).estimate.calculated.totalChargePaise).toEqual({ minimum: 0, likely: 0, maximum: 0 });
});

test('approval is idempotent, reopening preserves audit, proposal and stale scope guard changes', async ({ request }) => {
  const { estimate, projectId } = await setup(request);
  const first = await approve(request, estimate.id, 1); expect(first.status()).toBe(200);
  const saved = (await first.json()).estimate;
  expect(saved.approvedRevisionId).toBe(saved.revisions[0].id);
  expect((await approve(request, estimate.id, 1)).status()).toBe(200);
  expect((await save(request, estimate.id, 1, saved.draft)).status()).toBe(409);
  expect((await pool.query('SELECT count(*)::int n FROM "AuditEvent" WHERE "entityId"=$1 AND "action"=\'approved\'', [estimate.id])).rows[0].n).toBe(1);
  expect((await reopen(request, estimate.id, 1)).status()).toBe(200);
  await pool.query('UPDATE "Project" SET "scopeRevision"="scopeRevision"+1 WHERE "id"=$1', [projectId]);
  const stale = await approve(request, estimate.id, 1); expect(stale.status()).toBe(409); expect((await stale.json()).error.code).toBe('BASELINE_CHANGED');
  const other = await setup(request);
  await expect(pool.query('UPDATE "Estimate" SET "status"=\'APPROVED\',"approvedRevisionId"=$1 WHERE "id"=$2', [other.estimate.revisions[0].id, estimate.id])).rejects.toMatchObject({ code: '23514' });
  await pool.query('INSERT INTO "Proposal" ("id","projectId","estimateId","approvedRevisionId","snapshotJson","basedOnScopeRevision","expiresAt") VALUES ($1,$2,$3,$4,$5,0,NOW()+INTERVAL \'1 day\')', [randomUUID(), projectId, estimate.id, estimate.revisions[0].id, JSON.stringify(estimate.revisions[0].snapshot)]);
  expect((await reopen(request, estimate.id, 1)).status()).toBe(409);
});

test('audit failures roll back saves and approvals atomically', async ({ request }) => {
  const { estimate, projectId } = await setup(request);
  await pool.query(`CREATE FUNCTION test_review_audit_failure() RETURNS trigger AS $$ BEGIN IF NEW."projectId"::text='${projectId}' AND NEW."action" IN ('review_saved','approved') THEN RAISE EXCEPTION 'test audit failure'; END IF; RETURN NEW; END; $$ LANGUAGE plpgsql; CREATE TRIGGER test_review_audit_failure BEFORE INSERT ON "AuditEvent" FOR EACH ROW EXECUTE FUNCTION test_review_audit_failure();`);
  try {
    expect((await save(request, estimate.id, 1, estimate.draft)).status()).toBe(503);
    expect((await approve(request, estimate.id, 1)).status()).toBe(503);
    const row = (await pool.query('SELECT "currentRevision","status","approvedRevisionId" FROM "Estimate" WHERE "id"=$1', [estimate.id])).rows[0];
    expect(row).toEqual({ currentRevision: 1, status: 'REVIEW_REQUIRED', approvedRevisionId: null });
    expect((await pool.query('SELECT count(*)::int n FROM "EstimateRevision" WHERE "estimateId"=$1', [estimate.id])).rows[0].n).toBe(1);
  } finally { await pool.query('DROP TRIGGER test_review_audit_failure ON "AuditEvent"; DROP FUNCTION test_review_audit_failure();'); }
  expect((await save(request, estimate.id, 1, estimate.draft)).status()).toBe(200);
});

test('legacy originals stay unchanged and gain a priced review only on explicit save', async ({ request }) => {
  const { projectId, estimate } = await setup(request);
  const r = (await (await request.post(`/api/projects/${projectId}/requests`, { headers, data: { text: 'An older saved request for another page.', hourlyRatePaise: 100000 } })).json()).request;
  const input = (await pool.query('SELECT "originalInputJson" FROM "Estimate" WHERE "id"=$1', [estimate.id])).rows[0].originalInputJson; input.requestId = r.id; input.requestText = r.text;
  const old = structuredClone(estimate.originalAnalysis); old.tasks[0].classification = 'modifies_existing';
  const e = randomUUID(); await pool.query('INSERT INTO "Estimate" ("id","requestId","originalAiJson","originalInputJson","provider","model","promptVersion","currentRevision") VALUES ($1,$2,$3,$4,\'legacy\',\'legacy\',\'scope-v4\',1)', [e, r.id, JSON.stringify(old), JSON.stringify(input)]);
  await pool.query('INSERT INTO "EstimateRevision" ("id","estimateId","revision","snapshotJson","createdBy") VALUES ($1,$2,1,$3,\'ai\')', [randomUUID(), e, JSON.stringify({ schemaVersion: 1, analysis: old, hourlyRatePaise: 100000 })]);
  const read = await request.get(`/api/estimates/${e}`); expect(read.status()).toBe(200); const loaded = (await read.json()).estimate;
  expect(loaded.legacyRevision).toBe(true); expect(loaded.analysis.tasks[0].classification).toBe('MODIFICATION');
  expect((await approve(request, e, 1)).status()).toBe(422);
  expect((await save(request, e, 1, loaded.draft)).status()).toBe(200); expect((await approve(request, e, 2)).status()).toBe(200);
  const row = (await pool.query('SELECT "originalAiJson","originalCalculatedJson" FROM "Estimate" WHERE "id"=$1', [e])).rows[0]; expect(row.originalAiJson).toEqual(old); expect(row.originalCalculatedJson).toBeNull();
});

test('history counts requests rather than tasks, allocates numbers concurrently and separates pending from accepted billing', async ({ request }) => {
  const { projectId, estimate } = await setup(request); const draft: ReviewDraft = estimate.draft;
  draft.analysis.tasks.push({ ...draft.analysis.tasks[0], id: 'T2' }); draft.additionalChargePaise = 50000; draft.additionalChargeReason = 'Request setup.';
  const saved = (await (await save(request, estimate.id, 1, draft)).json()).estimate;
  for (const response of await Promise.all(Array.from({ length: 4 }, (_, i) => request.post(`/api/projects/${projectId}/requests`, { headers, data: { text: `Another independent request number ${i}.`, hourlyRatePaise: 100000 } })))) expect(response.status()).toBe(201);
  let history = (await (await request.get(`/api/projects/${projectId}/history`)).json()).history;
  expect(history.summary).toMatchObject({ totalRequests: 5, additionalRequests: 1, acceptedAdditionalPaise: { minimum: '0', likely: '0', maximum: '0' }, pendingAdditionalPaise: { minimum: '250000', likely: '450000', maximum: '650000' } });
  expect(history.rows.map((r: { requestNumber: number }) => r.requestNumber)).toEqual([5, 4, 3, 2, 1]);
  expect(history.rows[4].clientAcceptance).toBe('NOT_ACCEPTED');
  await approve(request, estimate.id, 2);
  // A later internal revision is not the client's accepted agreement.
  expect((await reopen(request, estimate.id, 2)).status()).toBe(200);
  expect((await save(request, estimate.id, 2, { ...draft, hourlyRatePaise: 200000 })).status()).toBe(200);
  const p = randomUUID(), d = randomUUID(); const snapshot = structuredClone(saved.revisions[1].snapshot); delete snapshot.legacy;
  await pool.query('INSERT INTO "Proposal" ("id","projectId","estimateId","approvedRevisionId","snapshotJson","basedOnScopeRevision","expiresAt","status") VALUES ($1,$2,$3,$4,$5,0,NOW()+INTERVAL \'1 day\',\'ACCEPTED\')', [p, projectId, estimate.id, saved.revisions[1].id, JSON.stringify(snapshot)]);
  await pool.query('INSERT INTO "ProjectDecision" ("id","projectId","proposalId","outcome","title","tagsJson","finalDecisionText","sourceReferencesJson","approvedSnapshotJson","amendmentClausesJson","scopeRevisionAfter","decidedAt") VALUES ($1,$2,$3,\'ACCEPTED\',\'Fixture acceptance\',\'[]\',\'Fixture\',\'[]\',$4,\'{}\',0,NOW())', [d, projectId, p, JSON.stringify(snapshot)]);
  history = (await (await request.get(`/api/projects/${projectId}/history`)).json()).history;
  expect(history.summary.acceptedAdditionalPaise).toEqual({ minimum: '250000', likely: '450000', maximum: '650000' }); expect(history.summary.pendingAdditionalPaise.likely).toBe('0'); expect(history.rows[4].acceptedAt).toBeTruthy();
  expect((await request.post(`/api/projects/${projectId}/requests`, { headers, data: { text: 'Another request after independent acceptance.', hourlyRatePaise: 100000 } })).status()).toBe(201);
});

test('history excludes unresolved and declined billing and rejects foreign proposal ownership', async ({ request }) => {
  const { projectId, estimate } = await setup(request);
  const unclear = structuredClone(estimate.draft); unclear.analysis.tasks[0].classification = 'UNCERTAIN'; unclear.analysis.tasks[0].missingInformation = ['Which behavior is required?'];
  expect((await save(request, estimate.id, 1, unclear, 'Clarification required.')).status()).toBe(200);
  const r = (await (await request.post(`/api/projects/${projectId}/requests`, { headers, data: { text: 'One additional page for a declined request.', hourlyRatePaise: 100000 } })).json()).request;
  const analyzed = (await (await request.post(`/api/requests/${r.id}/analyze`, { headers, data: { idempotencyKey: randomUUID() } })).json()).estimate;
  const saved = (await (await save(request, analyzed.id, 1, analyzed.draft)).json()).estimate;
  expect((await approve(request, analyzed.id, 2)).status()).toBe(200);
  const p = randomUUID(), snapshot = structuredClone(saved.revisions[1].snapshot); delete snapshot.legacy;
  await pool.query('INSERT INTO "Proposal" ("id","projectId","estimateId","approvedRevisionId","snapshotJson","basedOnScopeRevision","expiresAt","status") VALUES ($1,$2,$3,$4,$5,0,NOW()+INTERVAL \'1 day\',\'DECLINED\')', [p, projectId, analyzed.id, saved.revisions[1].id, JSON.stringify(snapshot)]);
  await pool.query('INSERT INTO "ProjectDecision" ("id","projectId","proposalId","outcome","title","tagsJson","finalDecisionText","sourceReferencesJson","approvedSnapshotJson","amendmentClausesJson","scopeRevisionAfter","decidedAt") VALUES ($1,$2,$3,\'DECLINED\',\'Declined fixture\',\'[]\',\'Fixture\',\'[]\',$4,\'{}\',0,NOW())', [randomUUID(), projectId, p, JSON.stringify(snapshot)]);
  const history = (await (await request.get(`/api/projects/${projectId}/history`)).json()).history;
  expect(history.summary).toMatchObject({ totalRequests: 2, additionalRequests: 1, acceptedAdditionalPaise: { minimum: '0', likely: '0', maximum: '0' }, pendingAdditionalPaise: { minimum: '0', likely: '0', maximum: '0' } });
  expect(history.rows[0].clientAcceptance).toBe('DECLINED'); expect(history.rows[1].additional).toBe(false);
  const otherId = (await (await request.post('/api/projects', { headers, data: { name: 'Other scope' } })).json()).project.id;
  await pool.query('UPDATE "Proposal" SET "projectId"=$1 WHERE "id"=$2', [otherId, p]);
  expect((await request.get(`/api/projects/${projectId}/history`)).status()).toBe(422);
});

test('pending billing excludes unreviewed, expired, revoked and stale offers', async ({ request }) => {
  const { projectId, estimate } = await setup(request);
  const history = async () => (await (await request.get(`/api/projects/${projectId}/history`)).json()).history;
  expect((await history()).summary.pendingAdditionalPaise.likely).toBe('0');
  await save(request, estimate.id, 1, estimate.draft);
  await approve(request, estimate.id, 2);
  const reviewed = (await (await request.get(`/api/estimates/${estimate.id}`)).json()).estimate;
  const p = randomUUID(), snapshot = structuredClone(reviewed.revisions[1].snapshot); delete snapshot.legacy;
  await pool.query('INSERT INTO "Proposal" ("id","projectId","estimateId","approvedRevisionId","snapshotJson","basedOnScopeRevision","expiresAt") VALUES ($1,$2,$3,$4,$5,0,NOW()+INTERVAL \'1 day\')', [p, projectId, estimate.id, reviewed.revisions[1].id, JSON.stringify(snapshot)]);
  expect((await history()).summary.pendingAdditionalPaise.likely).toBe('200000');
  await pool.query('UPDATE "Proposal" SET "expiresAt"=NOW()-INTERVAL \'1 second\' WHERE "id"=$1', [p]);
  expect((await history()).summary.pendingAdditionalPaise.likely).toBe('0');
  await pool.query('UPDATE "Proposal" SET "expiresAt"=NOW()+INTERVAL \'1 day\',"status"=\'REVOKED\' WHERE "id"=$1', [p]);
  expect((await history()).summary.pendingAdditionalPaise.likely).toBe('0');
  await pool.query('UPDATE "Proposal" SET "status"=\'PENDING\' WHERE "id"=$1', [p]);
  await pool.query('UPDATE "Project" SET "scopeRevision"="scopeRevision"+1 WHERE "id"=$1', [projectId]);
  expect((await history()).summary.pendingAdditionalPaise.likely).toBe('0');
});

test('desktop/mobile review recalculates, validates, saves, approves, reopens and shows request history', async ({ request, page }) => {
  test.setTimeout(90000);
  for (const width of [1440, 390]) {
    const { projectId, estimate } = await setup(request);
    await page.setViewportSize({ width, height: width === 1440 ? 1000 : 844 });
    await page.goto('/login');
    if (await page.getByLabel('Workspace password').isVisible()) { await page.getByLabel('Workspace password').fill(process.env.TEST_PASSWORD!); await page.getByLabel('Workspace password').press('Enter'); await expect(page.getByRole('heading', { name: 'Your projects', exact: true })).toBeVisible(); }
    await page.goto(`/projects/${projectId}/estimates/${estimate.id}`);
    await page.getByRole('button', { name: 'Edit review', exact: true }).click();
    await expect(page.getByLabel('Task 1 title', { exact: true })).toBeFocused();
    await page.getByLabel('Task 1 minimum hours', { exact: true }).fill('2');
    await page.getByLabel('Task 1 likely hours', { exact: true }).fill('4');
    await page.getByLabel('Task 1 maximum hours', { exact: true }).fill('6');
    await page.getByLabel('Hourly rate (INR)', { exact: true }).fill('1500');
    await page.getByLabel('Fixed additional charge (INR)', { exact: true }).fill('500');
    await page.getByRole('button', { name: 'Save review', exact: true }).click();
    await expect(page.getByRole('alert').filter({hasText:'highlighted inputs'})).toBeVisible();
    await expect(page.getByRole('button', { name: 'Approve estimate', exact: true })).toBeDisabled();
    await page.getByLabel('Additional charge reason (client-facing)', { exact: true }).fill('Additional service configuration.');
    await expect(page.getByRole('complementary', { name: 'Analysis summary' })).toContainText('₹6,500.00');
    await page.route('**/api/estimates/*/review', route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: { code: 'DATABASE_ERROR', message: 'Unable to save this review. Please retry.', retryable: true } }) }), { times: 1 });
    await page.getByRole('button', { name: 'Save review', exact: true }).press('Enter');
    const saveError = page.getByRole('alert').filter({ hasText: 'Your draft has been kept' });
    await expect(saveError).toBeVisible();
    await expect(saveError).toBeFocused();
    await expect(page.getByLabel('Hourly rate (INR)', { exact: true })).toHaveValue('1500');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `test-results/review-edit-${width}.png`, fullPage: true });
    const saveResponse = page.waitForResponse(r => r.url().endsWith('/review') && r.request().method() === 'PUT');
    await page.getByRole('button', { name: 'Save review', exact: true }).click();
    const response = await saveResponse; expect(response.status()).toBe(200);
    expect((await response.json()).estimate.calculated.totalChargePaise).toEqual({ minimum: 350000, likely: 650000, maximum: 950000 });
    await expect(page.getByRole('status')).toContainText('revision 2');
    await page.getByLabel(/I have reviewed the scope, evidence, assumptions, hours and price/).press('Space');
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: 'Approve estimate', exact: true })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('heading', { name: 'Human-approved · Revision 2', exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Human-approved · Revision 2', exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `test-results/review-approved-${width}.png`, fullPage: true });
    await page.getByRole('button', { name: 'Reopen Review', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('Review reopened');
    await page.goto(`/projects/${projectId}/requests`);
    await expect(page.getByRole('heading', { name: 'Request History', exact: true })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Request tracking' })).toContainText('Total Additional Requests: 1');
    await expect(page.getByRole('region', { name: 'Request tracking' })).toContainText('NOT_ACCEPTED');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `test-results/request-history-${width}.png`, fullPage: true });
  }
});
