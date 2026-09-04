import { test, expect, type APIRequestContext } from "@playwright/test";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { baselineInput } from "../fixtures/intake-documents";
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const origin = "http://localhost:3100";
const headers = { Origin: origin };
async function setup(request: APIRequestContext, text = "Add another page to the website.") {
  const login = await request.post("/api/auth/login", { headers, data: { password: process.env.TEST_PASSWORD } }); expect(login.status()).toBe(200);
  const auth = { ...headers, Cookie: login.headers()["set-cookie"].split(";")[0] };
  const p = await request.post("/api/projects", { headers: auth, data: { name: `Analysis ${randomUUID().slice(0, 8)}` } });
  const projectId = (await p.json()).project.id;
  expect((await request.post(`/api/projects/${projectId}/baseline`, { headers: auth, data: baselineInput() })).status()).toBe(201);
  const r = await request.post(`/api/projects/${projectId}/requests`, { headers: auth, data: { text, hourlyRatePaise: 100000 } });
  return { auth, projectId, requestId: (await r.json()).request.id };
}
async function analyze(request: APIRequestContext, id: string, auth: Record<string, string>, key = randomUUID()) {
  return request.post(`/api/requests/${id}/analyze`, { headers: auth, data: { idempotencyKey: key } });
}
test.beforeEach(async () => { await pool.query('DELETE FROM "LoginThrottle"'); });
test.afterAll(async () => { await pool.end(); });

async function decisionFixture(projectId: string, clauses: unknown[], outcome: 'ACCEPTED' | 'DECLINED' = 'ACCEPTED', supersedes?: string) {
  const [r,e,v,p,d] = Array.from({length:5}, () => randomUUID());
  await pool.query('INSERT INTO "ChangeRequest" ("id","projectId","text","basedOnScopeRevision","hourlyRatePaise") VALUES ($1,$2,\'Historical test request\',0,100000)',[r,projectId]);
  await pool.query('INSERT INTO "Estimate" ("id","requestId","originalAiJson","originalInputJson","provider","model","promptVersion","currentRevision") VALUES ($1,$2,\'{}\',\'{}\',\'test\',\'test\',\'fixture\',1)',[e,r]);
  await pool.query('INSERT INTO "EstimateRevision" ("id","estimateId","revision","snapshotJson","createdBy") VALUES ($1,$2,1,\'{}\',\'test\')',[v,e]);
  await pool.query('INSERT INTO "Proposal" ("id","projectId","estimateId","approvedRevisionId","snapshotJson","basedOnScopeRevision","expiresAt","status") VALUES ($1,$2,$3,$4,\'{}\',0,NOW()+INTERVAL \'1 day\',$5::"ProposalStatus")',[p,projectId,e,v,outcome]);
  await pool.query('INSERT INTO "ProjectDecision" ("id","projectId","proposalId","outcome","title","tagsJson","finalDecisionText","sourceReferencesJson","approvedSnapshotJson","amendmentClausesJson","supersedesDecisionId","scopeRevisionAfter","decidedAt") VALUES ($1,$2,$3,$4::"DecisionOutcome",\'Fixture decision\',\'[]\',\'Fixture terms\',\'[]\',\'{}\',$5::jsonb,$6,1,NOW())',[d,projectId,p,outcome,JSON.stringify({schemaVersion:1,clauses}),supersedes??null]);
  return d;
}

test("database retrieval includes applicable amendments, excludes declined and superseded decisions, and rejects oversized scope", async ({request}) => {
  const {auth,projectId}=await setup(request);
  const baseline=(await pool.query('SELECT "id" FROM "Baseline" WHERE "projectId"=$1',[projectId])).rows[0].id;
  const original=await decisionFixture(projectId,[{id:'A1',text:'The page count is now eight.',amendsSourceIds:[`${baseline}:B1`]}]);
  const replacement=await decisionFixture(projectId,[{id:'A2',text:'The applicable page count is six, replacing the earlier amendment in full.',amendsSourceIds:[`${baseline}:B1`]}],'ACCEPTED',original);
  await decisionFixture(projectId,[{id:'D1',text:'A declined request for twenty pages.',amendsSourceIds:[]}],'DECLINED');
  await pool.query('UPDATE "Project" SET "scopeRevision"=1 WHERE "id"=$1',[projectId]);
  const makeRequest=async()=> (await (await request.post(`/api/projects/${projectId}/requests`,{headers:auth,data:{text:'Add one additional website page.',hourlyRatePaise:100000}})).json()).request.id;
  const response=await analyze(request,await makeRequest(),auth);expect(response.status()).toBe(200);
  const sources=(await response.json()).estimate.sources;
  expect(sources.map((s:{sourceId:string})=>s.sourceId)).toEqual([`${baseline}:B1`,`${baseline}:B2`,`${replacement}:A2`]);
  await decisionFixture(projectId,Array.from({length:4},(_,i)=>({id:`X${i}`,text:'Detailed agreed requirement. '.repeat(400),amendsSourceIds:[]})));
  const oversized=await analyze(request,await makeRequest(),auth);expect(oversized.status()).toBe(422);expect((await oversized.json()).error.code).toBe('CONTEXT_TOO_LARGE');
});

test("analysis requires access and trusted origins; bodies cannot supply authoritative scope or money", async ({ request }) => {
  const id = randomUUID(); expect((await analyze(request, id, headers)).status()).toBe(401);
  expect((await request.get(`/api/estimates/${id}`)).status()).toBe(401);
  const { auth, requestId } = await setup(request);
  expect((await analyze(request, requestId, { ...auth, Origin: "https://foreign.example" })).status()).toBe(403);
  for (const data of [{}, { idempotencyKey: "bad" }, { idempotencyKey: randomUUID(), calculatedCostsPaise: 1 }, { idempotencyKey: randomUUID(), sources: [] }]) expect((await request.post(`/api/requests/${requestId}/analyze`, { headers: auth, data })).status()).toBe(422);
  expect((await analyze(request, "invalid-id", auth)).status()).toBe(404);
});
test("valid analysis saves originals, first revision and provenance once, with immutable database snapshots", async ({ request }) => {
  const { auth, requestId, projectId } = await setup(request); const key = randomUUID();
  const first = await analyze(request, requestId, auth, key); expect(first.status()).toBe(200); const saved = (await first.json()).estimate;
  expect(saved).toMatchObject({ projectId, requestId, currentRevision: 1, status: "REVIEW_REQUIRED", overallClassification: "MODIFICATION", provenance: { provider: "openai-compatible", model: "test-only-provider", promptVersion: "scope-v5" } });
  expect(saved.revisions).toHaveLength(1); expect(saved.analysis.tasks[0].sourceEvidence[0].quote).toBe(saved.sources[0].text);
  const again = await analyze(request, requestId, auth, key); expect((await again.json()).estimate).toEqual(saved);
  const freshKey = await analyze(request, requestId, auth); expect((await freshKey.json()).estimate.id).toBe(saved.id);
  const row = (await pool.query('SELECT "originalCalculatedJson" FROM "Estimate" WHERE "id"=$1', [saved.id])).rows[0]; expect(row.originalCalculatedJson).toEqual(saved.calculated);
  for (const sql of ['UPDATE "Estimate" SET "originalAiJson"=\'{}\' WHERE "id"=$1', 'DELETE FROM "Estimate" WHERE "id"=$1']) await expect(pool.query(sql, [saved.id])).rejects.toMatchObject({ code: "23514" });
  await expect(pool.query('UPDATE "EstimateRevision" SET "snapshotJson"=\'{}\' WHERE "estimateId"=$1', [saved.id])).rejects.toMatchObject({ code: "23514" });
  expect((await pool.query('SELECT COUNT(*)::int n FROM "AuditEvent" WHERE "entityId"=$1 AND "action"=\'analyzed\'', [saved.id])).rows[0].n).toBe(1);
});
test("concurrent clicks and an abandoned lease cannot create duplicate successful analyses", async ({ request }) => {
  const { auth, requestId } = await setup(request, "[SLOW] Add another website page.");
  await pool.query('INSERT INTO "AnalysisJob" ("requestId","leaseId","idempotencyKey","expiresAt") VALUES ($1,$2,$3,NOW()-INTERVAL \'1 minute\')', [requestId, randomUUID(), randomUUID()]);
  const results = await Promise.all([analyze(request, requestId, auth), analyze(request, requestId, auth), analyze(request, requestId, auth)]);
  expect(results.filter(r => r.status() === 200)).toHaveLength(1); expect(results.filter(r => r.status() === 409)).toHaveLength(2);
  expect((await pool.query('SELECT COUNT(*)::int n FROM "Estimate" WHERE "requestId"=$1', [requestId])).rows[0].n).toBe(1);
});
test("provider outages and invalid outputs fail honestly, release leases and allow one repaired response", async ({ request }) => {
  for (const [marker, status, code] of [["[OUTAGE]", 502, "AI_UNAVAILABLE"], ["[RATE]", 429, "AI_RATE_LIMITED"], ["[INVALID]", 502, "AI_OUTPUT_INVALID"]] as const) {
    const { auth, requestId } = await setup(request, `${marker} Add another website page.`);
    const response = await analyze(request, requestId, auth); expect(response.status()).toBe(status); expect((await response.json()).error.code).toBe(code);
    expect((await pool.query('SELECT COUNT(*)::int n FROM "Estimate" WHERE "requestId"=$1', [requestId])).rows[0].n).toBe(0);
    expect((await pool.query('SELECT COUNT(*)::int n FROM "AnalysisJob" WHERE "requestId"=$1', [requestId])).rows[0].n).toBe(0);
  }
  const { auth, requestId } = await setup(request, "[REPAIR] Add another website page.");
  const response = await analyze(request, requestId, auth); expect(response.status()).toBe(200);
  const id = (await response.json()).estimate.id;
  expect((await pool.query('SELECT "metadataJson" FROM "AuditEvent" WHERE "entityId"=$1', [id])).rows[0].metadataJson.repaired).toBe(true);
});
test("scope changes while the provider is working prevent saving a stale estimate", async ({ request }) => {
  const { auth, requestId, projectId } = await setup(request, "[SLOW] Add another website page.");
  const pending = analyze(request, requestId, auth);
  await expect.poll(async () => (await pool.query('SELECT COUNT(*)::int n FROM "AnalysisJob" WHERE "requestId"=$1', [requestId])).rows[0].n).toBe(1);
  await pool.query('UPDATE "Project" SET "scopeRevision"="scopeRevision"+1 WHERE "id"=$1', [projectId]);
  const response = await pending; expect(response.status()).toBe(409); expect((await response.json()).error.code).toBe("BASELINE_CHANGED");
  expect((await pool.query('SELECT COUNT(*)::int n FROM "Estimate" WHERE "requestId"=$1', [requestId])).rows[0].n).toBe(0);
});
test("audit failure rolls back estimate and revision together", async ({ request }) => {
  const { auth, requestId, projectId } = await setup(request);
  await pool.query(`CREATE FUNCTION test_analysis_audit_failure() RETURNS trigger AS $$ BEGIN IF NEW."projectId"::text='${projectId}' AND NEW."action"='analyzed' THEN RAISE EXCEPTION 'test audit failure'; END IF; RETURN NEW; END; $$ LANGUAGE plpgsql; CREATE TRIGGER test_analysis_audit_failure BEFORE INSERT ON "AuditEvent" FOR EACH ROW EXECUTE FUNCTION test_analysis_audit_failure();`);
  try { expect((await analyze(request, requestId, auth)).status()).toBe(503); expect((await pool.query('SELECT COUNT(*)::int n FROM "Estimate" WHERE "requestId"=$1', [requestId])).rows[0].n).toBe(0); }
  finally { await pool.query('DROP TRIGGER test_analysis_audit_failure ON "AuditEvent"; DROP FUNCTION test_analysis_audit_failure();'); }
  expect((await analyze(request, requestId, auth)).status()).toBe(200);
});
test("per-session limit stops repeated failed attempts and resets after its window", async ({ request }) => {
  const { auth, requestId } = await setup(request, "[OUTAGE] Add another website page.");
  for (let i = 0; i < 6; i++) expect((await analyze(request, requestId, auth)).status()).toBe(502);
  const blocked = await analyze(request, requestId, auth); expect(blocked.status()).toBe(429); expect((await blocked.json()).error.code).toBe("ANALYSIS_RATE_LIMITED"); expect(Number(blocked.headers()["retry-after"])).toBeGreaterThan(0);
  await pool.query('UPDATE "AnalysisThrottle" SET "windowStart"=NOW()-INTERVAL \'11 minutes\'');
  expect((await analyze(request, requestId, auth)).status()).toBe(502);
});
test("desktop/mobile analysis, evidence navigation, refresh and cross-project page boundary", async ({ request, page }) => {
  test.setTimeout(60000);
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
    const { auth, requestId, projectId } = await setup(request);
    await page.setViewportSize(viewport); await page.goto('/login'); await page.getByLabel('Workspace password').fill(process.env.TEST_PASSWORD!); await page.getByLabel('Workspace password').press('Enter');
    await expect(page.getByRole('heading', { name: 'Your projects', exact: true })).toBeVisible();
    await page.goto(`/projects/${projectId}/requests`); await page.getByRole('button', { name: 'Analyze Request', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Scope analysis', exact: true })).toBeVisible();
    await expect(page.getByText('AI-generated · Review required', { exact: true })).toBeVisible();
    const result = (await (await request.get(`/api/projects/${projectId}/requests`, { headers: auth })).json()).requests.find((r: { id: string }) => r.id === requestId);
    const url = page.url(); await page.reload(); await expect(page.getByRole('heading', { name: 'Scope analysis', exact: true })).toBeVisible();
    await page.getByRole('link', { name: 'Original baseline · B1', exact: true }).click(); await expect(page).toHaveURL(/#source-0$/); await expect(page.locator('#source-0')).toBeInViewport();
    await page.goto(url); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `test-results/analysis-${viewport.width}.png`, fullPage: true });
    await page.goto(`/projects/${projectId}/requests`); await expect(page.getByRole('link', { name: 'View analysis', exact: true })).toBeVisible();
    const other = await setup(request); await page.goto(`/projects/${other.projectId}/estimates/${result.estimate.id}`); await expect(page.getByRole('heading', { name: 'Project not found.', exact: true })).toBeVisible();
    await page.goto(`/projects/${projectId}/requests`); await page.getByRole('button', { name: 'Log out' }).click();
  }
});
test("browser errors preserve saved requests and offer retry", async ({ request, page }) => {
  const { projectId } = await setup(request, '[OUTAGE] Add another website page.');
  await page.goto('/login'); await page.getByLabel('Workspace password').fill(process.env.TEST_PASSWORD!); await page.getByRole('button', { name: 'Open workspace' }).click();
  await expect(page.getByRole('heading', { name: 'Your projects', exact: true })).toBeVisible();
  await page.goto(`/projects/${projectId}/requests`); await page.getByRole('button', { name: 'Analyze Request', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'AI provider' })).toBeVisible(); await expect(page.getByText('[OUTAGE] Add another website page.', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Retry analysis', exact: true })).toBeVisible(); await page.screenshot({ path: 'test-results/analysis-error.png', fullPage: true });
});
