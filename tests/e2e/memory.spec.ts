import { expect, test, type APIRequestContext } from "@playwright/test";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { baselineInput } from "../fixtures/intake-documents";
import { testAgreement } from "../fixtures/agreement";
import type { SavedEstimate } from "../../src/server/analysis";

const origin = "http://localhost:3100", headers = { Origin: origin };
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
test.beforeEach(async () => { await pool.query('DELETE FROM "LoginThrottle"'); });
test.afterAll(async () => { await pool.end(); });

async function login(request: APIRequestContext) {
  expect((await request.post("/api/auth/login", { headers, data: { email: process.env.TEST_EMAIL, password: process.env.TEST_PASSWORD } })).status()).toBe(200);
}
async function project(request: APIRequestContext) {
  await login(request);
  const response = await request.post("/api/projects", { headers, data: { name: `Memory ${randomUUID().slice(0, 8)}` } });
  const projectId = (await response.json()).project.id as string;
  expect((await request.post(`/api/projects/${projectId}/baseline`, { headers, data: baselineInput() })).status()).toBe(201);
  return projectId;
}
async function pending(request: APIRequestContext, projectId: string, supersedesDecisionId: string | null = null, requestText = "Add another responsive website page for the launch.") {
  const savedRequest = await request.post(`/api/projects/${projectId}/requests`, { headers, data: { text: requestText, hourlyRatePaise: 100000 } });
  const requestId = (await savedRequest.json()).request.id as string;
  const analysis = await request.post(`/api/requests/${requestId}/analyze`, { headers, data: { idempotencyKey: randomUUID() } });
  let estimate = (await analysis.json()).estimate as SavedEstimate;
  const agreement = testAgreement(estimate.draft); agreement.supersedesDecisionId = supersedesDecisionId;
  const revision = await request.put(`/api/estimates/${estimate.id}/review`, { headers, data: { expectedRevision: 1, draft: estimate.draft, agreement, editReason: "Confirm launch page scope." } });
  estimate = (await revision.json()).estimate;
  expect((await request.post(`/api/estimates/${estimate.id}/approve`, { headers, data: { expectedRevision: estimate.currentRevision, reviewed: true } })).status()).toBe(200);
  const proposal = await request.post(`/api/estimates/${estimate.id}/proposal`, { headers, data: { expectedRevision: estimate.currentRevision, idempotencyKey: randomUUID() } });
  const body = await proposal.json(), token = new URLSearchParams(new URL(body.link).hash.slice(1)).get("token")!;
  return { estimate, proposalId: body.proposalId as string, token, requestId };
}

async function decide(request: APIRequestContext, item: { proposalId: string; token: string }, outcome: "accept" | "decline", comment: string) {
  const response = await request.post(`/api/client/proposals/${item.proposalId}/decision`, { headers: { ...headers, Authorization: `Bearer ${item.token}` }, data: { decision: outcome, confirmed: true, idempotencyKey: randomUUID(), comment } });
  expect(response.status()).toBe(200);
  return (await pool.query('SELECT "id" FROM "ProjectDecision" WHERE "proposalId"=$1', [item.proposalId])).rows[0].id as string;
}

test("memory API distinguishes pending and final decisions, searches complete saved text, and never mutates", async ({ request, playwright }) => {
  const projectId = await project(request), item = await pending(request, projectId);
  const before = (await pool.query('SELECT count(*)::int AS n FROM "AuditEvent" WHERE "projectId"=$1', [projectId])).rows[0].n;
  let response = await request.get(`/api/projects/${projectId}/memory`); expect(response.status()).toBe(200);
  let memory = (await response.json()).memory;
  expect(memory.summary).toEqual({ accepted: 0, superseded: 0, declined: 0, pending: 1 });
  expect(memory.rows).toHaveLength(1); expect(memory.rows[0]).toMatchObject({ id: item.proposalId, kind: "PENDING_OFFER", status: "PENDING", availability: "ACTIVE", requestText: "Add another responsive website page for the launch." });
  expect(memory.rows[0].totalChargePaise).toEqual({ minimum: 100000, likely: 200000, maximum: 300000 });
  expect((await request.get(`/api/projects/${projectId}/memory?q=content+supplied`)).status()).toBe(200);
  expect(((await (await request.get(`/api/projects/${projectId}/memory?q=client+supplies`)).json()).memory.rows)).toHaveLength(1);
  expect(((await (await request.get(`/api/projects/${projectId}/memory?q=foreign+sentinel`)).json()).memory.rows)).toHaveLength(0);
  expect((await request.get(`/api/projects/${projectId}/memory?status=REVOKED`)).status()).toBe(422);
  expect((await request.get(`/api/projects/${projectId}/memory?status=PENDING&status=ACCEPTED`)).status()).toBe(422);
  expect((await request.get(`/api/projects/${projectId}/memory?extra=true`)).status()).toBe(422);
  expect((await pool.query('SELECT count(*)::int AS n FROM "AuditEvent" WHERE "projectId"=$1', [projectId])).rows[0].n).toBe(before);

  const decided = await request.post(`/api/client/proposals/${item.proposalId}/decision`, { headers: { ...headers, Authorization: `Bearer ${item.token}` }, data: { decision: "accept", confirmed: true, idempotencyKey: randomUUID(), comment: "Launch memory keyword approved." } });
  expect(decided.status()).toBe(200);
  response = await request.get(`/api/projects/${projectId}/memory?status=ACCEPTED`); memory = (await response.json()).memory;
  expect(memory.summary).toEqual({ accepted: 1, superseded: 0, declined: 0, pending: 0 }); expect(memory.rows).toHaveLength(1);
  expect(memory.rows[0]).toMatchObject({ kind: "DECISION", status: "ACCEPTED", changesScope: true, clientCommentPresent: true });
  expect(((await (await request.get(`/api/projects/${projectId}/memory?q=memory+keyword`)).json()).memory.rows)).toHaveLength(1);
  const detail = await request.get(`/api/projects/${projectId}/memory/${memory.rows[0].id}`); expect(detail.status()).toBe(200);
  const value = (await detail.json()).decision;
  expect(value.clientComment).toBe("Launch memory keyword approved."); expect(value.offer.calculated.totalChargePaise.likely).toBe(200000);
  expect(value.evidence[0].href).toMatch(new RegExp(`/projects/${projectId}/baseline#clause-`));
  expect(value.revisions.map((revision: { revision: number }) => revision.revision)).toEqual([1, 2]);
  expect(JSON.stringify(value)).not.toContain("tokenHash"); expect(JSON.stringify(value)).not.toContain(item.token);
  expect((await request.get(`/api/projects/${projectId}/memory/${item.proposalId}`)).status()).toBe(404);

  const anonymous = await playwright.request.newContext({ baseURL: origin });
  try { expect((await anonymous.get(`/api/projects/${projectId}/memory`)).status()).toBe(401); } finally { await anonymous.dispose(); }
  const other = await project(request);
  expect((await request.get(`/api/projects/${other}/memory/${memory.rows[0].id}`)).status()).toBe(404);
});

test("desktop and mobile memory navigation, filters, details, source anchors, and refresh remain usable", async ({ request, page }) => {
  test.setTimeout(90000);
  const projectId = await project(request), item = await pending(request, projectId);
  await request.post(`/api/client/proposals/${item.proposalId}/decision`, { headers: { ...headers, Authorization: `Bearer ${item.token}` }, data: { decision: "accept", confirmed: true, idempotencyKey: randomUUID(), comment: "Browser memory comment." } });
  const decisionId = (await pool.query('SELECT "id" FROM "ProjectDecision" WHERE "proposalId"=$1', [item.proposalId])).rows[0].id;
  await page.goto("/login"); await expect(page.getByLabel("Email address")).toBeVisible();
  await page.getByLabel("Email address").fill(process.env.TEST_EMAIL!); await page.getByLabel("Password").fill(process.env.TEST_PASSWORD!); await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Your projects", exact: true })).toBeVisible();
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: width === 1440 ? 1000 : 844 });
    await page.goto(`/projects/${projectId}/memory`); await expect(page.getByRole("heading", { name: "Decisions and current offers" })).toBeVisible();
    await page.getByLabel("Search Project Memory").fill("browser memory comment"); await page.getByRole("button", { name: "Search" }).press("Enter");
    await expect(page).toHaveURL(/q=browser(\+|%20)memory(\+|%20)comment/); await expect(page.getByText("Client comment recorded")).toBeVisible();
    await page.getByRole("link", { name: "Accepted", exact: true }).click(); await expect(page).toHaveURL(/status=ACCEPTED/); await page.reload();
    await page.getByRole("link", { name: "Open decision" }).click(); await expect(page).toHaveURL(new RegExp(`/memory/${decisionId}$`));
    await expect(page.getByRole("heading", { name: "Final decision" })).toBeVisible(); await expect(page.getByText("Browser memory comment.")).toBeVisible();
    const source = page.getByRole("link", { name: /Original baseline/ }).first(); expect(await source.getAttribute("href")).toContain("/baseline#clause-");
    await expect(page.getByText("Revision 2", { exact: false }).first()).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: `test-results/project-memory-${width}.png`, fullPage: true });
  }
});

test("supersession, declined replacements, stale, expired, revoked and replaced offers keep distinct authority", async ({ request }) => {
  const projectId = await project(request), first = await pending(request, projectId), firstDecision = await decide(request, first, "accept", "Initial change accepted.");
  const replacement = await pending(request, projectId, firstDecision), replacementDecision = await decide(request, replacement, "accept", "Replacement accepted.");
  let memory = (await (await request.get(`/api/projects/${projectId}/memory`)).json()).memory;
  expect(memory.summary).toEqual({ accepted: 1, superseded: 1, declined: 0, pending: 0 });
  expect(memory.rows.find((row: { id: string }) => row.id === firstDecision).status).toBe("SUPERSEDED");
  expect(memory.rows.find((row: { id: string }) => row.id === replacementDecision).status).toBe("ACCEPTED");

  const declinedProject = await project(request), accepted = await pending(request, declinedProject), acceptedId = await decide(request, accepted, "accept", "Keep this amendment.");
  const declined = await pending(request, declinedProject, acceptedId); await decide(request, declined, "decline", "Replacement declined.");
  memory = (await (await request.get(`/api/projects/${declinedProject}/memory`)).json()).memory;
  expect(memory.summary).toEqual({ accepted: 1, superseded: 0, declined: 1, pending: 0 });
  expect(memory.rows.find((row: { id: string }) => row.id === acceptedId).status).toBe("ACCEPTED");

  const pendingProject = await project(request), pendingItem = await pending(request, pendingProject);
  await pool.query('UPDATE "Proposal" SET "expiresAt"=NOW()-INTERVAL \'1 second\' WHERE "id"=$1', [pendingItem.proposalId]);
  memory = (await (await request.get(`/api/projects/${pendingProject}/memory`)).json()).memory; expect(memory.rows[0].availability).toBe("EXPIRED");
  await pool.query('UPDATE "Proposal" SET "expiresAt"=NOW()+INTERVAL \'1 day\' WHERE "id"=$1', [pendingItem.proposalId]);
  await pool.query('UPDATE "Project" SET "scopeRevision"="scopeRevision"+1 WHERE "id"=$1', [pendingProject]);
  memory = (await (await request.get(`/api/projects/${pendingProject}/memory`)).json()).memory; expect(memory.rows[0].availability).toBe("STALE");

  const historyProject = await project(request), old = await pending(request, historyProject);
  const revoke = await request.post(`/api/proposals/${old.proposalId}/revise`, { headers, data: { expectedRevision: old.estimate.currentRevision, idempotencyKey: randomUUID(), confirmed: true } }); expect(revoke.status()).toBe(200);
  memory = (await (await request.get(`/api/projects/${historyProject}/memory`)).json()).memory; expect(memory.rows).toHaveLength(0);
  const saved = await request.put(`/api/estimates/${old.estimate.id}/review`, { headers, data: { expectedRevision: old.estimate.currentRevision, draft: old.estimate.draft, agreement: old.estimate.agreement, editReason: "Replace the revoked client offer." } });
  const revised = (await saved.json()).estimate as SavedEstimate;
  expect((await request.post(`/api/estimates/${revised.id}/approve`, { headers, data: { expectedRevision: revised.currentRevision, reviewed: true } })).status()).toBe(200);
  const generated = await request.post(`/api/estimates/${revised.id}/proposal`, { headers, data: { expectedRevision: revised.currentRevision, idempotencyKey: randomUUID() } });
  const generatedBody = await generated.json(), newToken = new URLSearchParams(new URL(generatedBody.link).hash.slice(1)).get("token")!;
  const finalDecision = await decide(request, { proposalId: generatedBody.proposalId, token: newToken }, "accept", "Revised offer accepted.");
  const detail = (await (await request.get(`/api/projects/${historyProject}/memory/${finalDecision}`)).json()).decision;
  expect(detail.offerHistory.map((offer: { state: string }) => offer.state)).toEqual(["REPLACED", "FINAL_ACCEPTED"]);
});

test("a malformed historical decision fails the complete memory response", async ({ request }) => {
  const projectId = await project(request), item = await pending(request, projectId), decisionId = randomUUID();
  await pool.query('UPDATE "Proposal" SET "status"=\'ACCEPTED\',"decidedAt"=NOW() WHERE "id"=$1', [item.proposalId]);
  await pool.query('INSERT INTO "ProjectDecision" ("id","projectId","proposalId","outcome","title","tagsJson","finalDecisionText","sourceReferencesJson","approvedSnapshotJson","amendmentClausesJson","scopeRevisionAfter","decidedAt") SELECT $1,$2,$3,\'ACCEPTED\',\'Malformed fixture\',\'[]\',\'Invalid saved decision\',\'[]\',\'{}\',\'{"schemaVersion":1,"clauses":[]}\',"basedOnScopeRevision", "decidedAt" FROM "Proposal" WHERE "id"=$3', [decisionId, projectId, item.proposalId]);
  const response = await request.get(`/api/projects/${projectId}/memory?q=does-not-match`);
  expect(response.status()).toBe(422); expect((await response.json()).error.code).toBe("INVALID_ESTIMATE");
});

test("memory returns every matching record without a hidden result cap", async ({ request }) => {
  test.setTimeout(90000);
  const projectId = await project(request);
  for (let index = 1; index <= 12; index++) {
    if (index === 6 || index === 11) await pool.query('DELETE FROM "AnalysisThrottle"');
    await pending(request, projectId, null, `Add responsive launch page number ${index}.`);
  }
  const response = await request.get(`/api/projects/${projectId}/memory?status=PENDING`); expect(response.status()).toBe(200);
  const memory = (await response.json()).memory;
  expect(memory.total).toBe(12); expect(memory.rows).toHaveLength(12); expect(memory.summary.pending).toBe(12);
  const search = await request.get(`/api/projects/${projectId}/memory?q=number+12`); expect(search.status()).toBe(200);
  expect((await search.json()).memory.rows).toHaveLength(1);
});
