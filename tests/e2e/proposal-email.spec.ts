import { test, expect, type APIRequestContext } from "@playwright/test";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { baselineInput } from "../fixtures/intake-documents";
import { testAgreement } from "../fixtures/agreement";
import type { SavedEstimate } from "../../src/server/analysis";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const origin = "http://localhost:3100", headers = { Origin: origin }, inboxBase = "http://127.0.0.1:3198";
test.beforeEach(async () => { await pool.query('DELETE FROM "LoginThrottle"'); });
test.afterAll(async () => { await pool.end(); });

async function login(request: APIRequestContext) {
  expect((await request.post("/api/auth/login", { headers, data: { email: process.env.TEST_EMAIL, password: process.env.TEST_PASSWORD } })).status()).toBe(200);
}
async function approvedEstimate(request: APIRequestContext) {
  await login(request);
  const projectId = (await (await request.post("/api/projects", { headers, data: { name: `Email ${randomUUID().slice(0, 8)}` } })).json()).project.id as string;
  expect((await request.post(`/api/projects/${projectId}/baseline`, { headers, data: baselineInput() })).status()).toBe(201);
  const requestId = (await (await request.post(`/api/projects/${projectId}/requests`, { headers, data: { text: "Add another responsive website page.", hourlyRatePaise: 100000 } })).json()).request.id as string;
  let estimate = (await (await request.post(`/api/requests/${requestId}/analyze`, { headers, data: { idempotencyKey: randomUUID() } })).json()).estimate as SavedEstimate;
  const agreement = testAgreement(estimate.draft);
  estimate = (await (await request.put(`/api/estimates/${estimate.id}/review`, { headers, data: { expectedRevision: estimate.currentRevision, draft: estimate.draft, agreement, editReason: "Review client-facing scope." } })).json()).estimate;
  const approved = await request.post(`/api/estimates/${estimate.id}/approve`, { headers, data: { expectedRevision: estimate.currentRevision, reviewed: true } });
  expect(approved.status()).toBe(200);
  estimate = (await approved.json()).estimate;
  return { projectId, estimate };
}
const emailProposal = (request: APIRequestContext, estimate: SavedEstimate, clientEmail: string, key = randomUUID()) =>
  request.post(`/api/estimates/${estimate.id}/proposal`, { headers, data: { expectedRevision: estimate.currentRevision, idempotencyKey: key, clientEmail } });
const readEstimate = async (request: APIRequestContext, id: string) => (await (await request.get(`/api/estimates/${id}`)).json()).estimate as SavedEstimate;
const inbox = async (request: APIRequestContext, to: string) => (await (await request.get(`${inboxBase}/inbox?to=${encodeURIComponent(to)}`)).json()) as { text: string }[];
const tokenFrom = (text: string) => new URLSearchParams(new URL(text.match(/https?:\/\/[^\s]*#token=[A-Za-z0-9_-]{43}/)![0]).hash.slice(1)).get("token")!;

test("emails an approved proposal to a validated address and the client accepts from the emailed link", async ({ request }) => {
  const { projectId, estimate } = await approvedEstimate(request);
  const clientEmail = `client-${randomUUID().slice(0, 8)}@example.com`;
  const response = await emailProposal(request, estimate, clientEmail);
  expect(response.status()).toBe(200);
  const result = await response.json(); expect(result.deliveryStatus).toBe("SENT"); expect(result.clientEmail).toBe(clientEmail);
  expect(result.link).toBeUndefined(); // the raw link is emailed, never returned to the freelancer UI

  const saved = await readEstimate(request, estimate.id);
  const offer = saved.offers.find(o => o.id === saved.currentProposalId)!;
  expect(offer.delivery.status).toBe("SENT"); expect(offer.delivery.clientEmail).toBe(clientEmail); expect(offer.delivery.sentAt).not.toBeNull();

  const messages = await inbox(request, clientEmail); expect(messages).toHaveLength(1);
  const token = tokenFrom(messages[0].text);
  const auth = { ...headers, Authorization: `Bearer ${token}` };
  expect((await request.get(`/api/client/proposals/${offer.id}`, { headers: auth })).status()).toBe(200);
  const decided = await request.post(`/api/client/proposals/${offer.id}/decision`, { headers: auth, data: { decision: "accept", confirmed: true, idempotencyKey: randomUUID(), comment: "Proceed." } });
  expect(decided.status()).toBe(200);
  // No raw token is stored in the delivery record and history reflects the destination.
  const stored = (await pool.query('SELECT "tokenHash","clientEmail","deliveryStatus" FROM "Proposal" WHERE "id"=$1', [offer.id])).rows[0];
  expect(stored.tokenHash).not.toBe(token); expect(stored.clientEmail).toBe(clientEmail);
  const history = (await (await request.get(`/api/projects/${projectId}/history`)).json()).history;
  expect(history.rows[0].delivery.status).toBe("SENT");
});

test("rejects missing and malformed client emails before creating an offer", async ({ request }) => {
  const { estimate } = await approvedEstimate(request);
  for (const clientEmail of ["", "not-an-email", "a@", "@b.com"]) {
    const response = await request.post(`/api/estimates/${estimate.id}/proposal`, { headers, data: { expectedRevision: estimate.currentRevision, idempotencyKey: randomUUID(), clientEmail } });
    expect(response.status()).toBe(422);
  }
  const missing = await request.post(`/api/estimates/${estimate.id}/proposal`, { headers, data: { expectedRevision: estimate.currentRevision, idempotencyKey: randomUUID() } });
  expect(missing.status()).toBe(422);
  expect((await pool.query('SELECT count(*)::int n FROM "Proposal" WHERE "estimateId"=$1', [estimate.id])).rows[0].n).toBe(0);
});

test("normalizes the client email before storing it", async ({ request }) => {
  const { estimate } = await approvedEstimate(request);
  const response = await emailProposal(request, estimate, "  Mixed.Case@Example.COM ");
  expect(response.status()).toBe(200);
  expect((await response.json()).clientEmail).toBe("mixed.case@example.com");
});

test("a provider failure preserves the offer as FAILED and a safe retry rotates the token and succeeds", async ({ request }) => {
  const { estimate } = await approvedEstimate(request);
  const clientEmail = `flaky-${randomUUID().slice(0, 8)}@example.com`; // fails the first delivery, then succeeds
  const first = await emailProposal(request, estimate, clientEmail);
  expect(first.status()).toBe(502); expect((await first.json()).error.retryable).toBe(true);
  let saved = await readEstimate(request, estimate.id);
  const failed = saved.offers.find(o => o.id === saved.currentProposalId)!;
  expect(failed.delivery.status).toBe("FAILED"); expect(failed.status).toBe("PENDING"); // offer preserved
  expect((await inbox(request, clientEmail)).length).toBe(0);
  const firstHash = (await pool.query('SELECT "tokenHash" FROM "Proposal" WHERE "id"=$1', [failed.id])).rows[0].tokenHash;

  const resend = await request.post(`/api/proposals/${failed.id}/resend`, { headers, data: { expectedRevision: saved.currentRevision, idempotencyKey: randomUUID(), confirmed: true } });
  expect(resend.status()).toBe(200); expect((await resend.json()).deliveryStatus).toBe("SENT");
  saved = await readEstimate(request, estimate.id);
  const sent = saved.offers.find(o => o.id === saved.currentProposalId)!;
  expect(sent.delivery.status).toBe("SENT"); expect(sent.delivery.attempts).toBeGreaterThanOrEqual(2);
  const messages = await inbox(request, clientEmail); expect(messages.length).toBe(1);
  // The resent link uses a rotated token, so the previous token hash no longer applies.
  const rotatedHash = (await pool.query('SELECT "tokenHash" FROM "Proposal" WHERE "id"=$1', [failed.id])).rows[0].tokenHash;
  expect(rotatedHash).not.toBe(firstHash);
  const token = tokenFrom(messages[0].text);
  expect((await request.get(`/api/client/proposals/${sent.id}`, { headers: { ...headers, Authorization: `Bearer ${token}` } })).status()).toBe(200);
});

test("a repeated click with the same key does not create a second offer or a second email", async ({ request }) => {
  const { estimate } = await approvedEstimate(request);
  const clientEmail = `client-${randomUUID().slice(0, 8)}@example.com`, key = randomUUID();
  const responses = await Promise.all([emailProposal(request, estimate, clientEmail, key), emailProposal(request, estimate, clientEmail, key)]);
  expect(responses.map(r => r.status())).toEqual([200, 200]);
  expect((await pool.query('SELECT count(*)::int n FROM "Proposal" WHERE "estimateId"=$1', [estimate.id])).rows[0].n).toBe(1);
  expect((await inbox(request, clientEmail)).length).toBe(1);
});

test("another account cannot email or resend an offer it does not own", async ({ request, playwright }) => {
  const { estimate } = await approvedEstimate(request);
  const clientEmail = `client-${randomUUID().slice(0, 8)}@example.com`;
  const proposalId = (await (await emailProposal(request, estimate, clientEmail)).json()).proposalId as string;
  const other = await playwright.request.newContext({ baseURL: origin });
  try {
    const email = `owner-${randomUUID().slice(0, 8)}@example.com`;
    expect((await other.post("/api/auth/register", { headers, data: { email, password: "another-strong-password", confirmPassword: "another-strong-password" } })).status()).toBe(201);
    expect((await other.post(`/api/estimates/${estimate.id}/proposal`, { headers, data: { expectedRevision: estimate.currentRevision, idempotencyKey: randomUUID(), clientEmail: "x@example.com" } })).status()).toBe(404);
    expect((await other.post(`/api/proposals/${proposalId}/resend`, { headers, data: { expectedRevision: estimate.currentRevision, idempotencyKey: randomUUID(), confirmed: true } })).status()).toBe(404);
  } finally { await other.dispose(); }
});

test("a historical proposal without a client email remains readable with NONE delivery", async ({ request }) => {
  const { estimate } = await approvedEstimate(request);
  const legacyId = randomUUID();
  // Simulate a pre-amendment proposal: no client email, default NONE delivery, revoked so it is not the current pending offer.
  await pool.query('INSERT INTO "Proposal" ("id","projectId","estimateId","approvedRevisionId","snapshotJson","basedOnScopeRevision","status","expiresAt","createdAt") VALUES ($1,$2,$3,$4,\'{}\'::jsonb,0,\'REVOKED\',NOW()+INTERVAL \'1 day\',NOW())',
    [legacyId, estimate.projectId, estimate.id, estimate.approvedRevisionId]);
  const saved = await readEstimate(request, estimate.id);
  const legacy = saved.offers.find(o => o.id === legacyId)!;
  expect(legacy.delivery.status).toBe("NONE"); expect(legacy.delivery.clientEmail).toBeNull();
});
