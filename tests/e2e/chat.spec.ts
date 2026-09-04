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
async function acceptedDecision(request: APIRequestContext, requestText = "Add another responsive website page for the launch.") {
  const projectId = (await (await request.post("/api/projects", { headers, data: { name: `Chat ${randomUUID().slice(0, 8)}` } })).json()).project.id as string;
  expect((await request.post(`/api/projects/${projectId}/baseline`, { headers, data: baselineInput() })).status()).toBe(201);
  const requestId = (await (await request.post(`/api/projects/${projectId}/requests`, { headers, data: { text: requestText, hourlyRatePaise: 100000 } })).json()).request.id as string;
  let estimate = (await (await request.post(`/api/requests/${requestId}/analyze`, { headers, data: { idempotencyKey: randomUUID() } })).json()).estimate as SavedEstimate;
  const agreement = testAgreement(estimate.draft);
  estimate = (await (await request.put(`/api/estimates/${estimate.id}/review`, { headers, data: { expectedRevision: estimate.currentRevision, draft: estimate.draft, agreement, editReason: "Adjust launch page scope and rate." } })).json()).estimate;
  expect((await request.post(`/api/estimates/${estimate.id}/approve`, { headers, data: { expectedRevision: estimate.currentRevision, reviewed: true } })).status()).toBe(200);
  const clientEmail = `chat-${randomUUID().slice(0, 8)}@example.com`;
  const proposalId = (await (await request.post(`/api/estimates/${estimate.id}/proposal`, { headers, data: { expectedRevision: estimate.currentRevision, idempotencyKey: randomUUID(), clientEmail } })).json()).proposalId as string;
  const messages = await (await request.get(`${inboxBase}/inbox?to=${encodeURIComponent(clientEmail)}`)).json() as { text: string }[];
  const token = new URLSearchParams(new URL(messages[messages.length - 1].text.match(/https?:\/\/[^\s]*#token=[A-Za-z0-9_-]{43}/)![0]).hash.slice(1)).get("token")!;
  expect((await request.post(`/api/client/proposals/${proposalId}/decision`, { headers: { ...headers, Authorization: `Bearer ${token}` }, data: { decision: "accept", confirmed: true, idempotencyKey: randomUUID(), comment: "Approved for the launch." } })).status()).toBe(200);
  const decisionId = (await pool.query('SELECT "id" FROM "ProjectDecision" WHERE "proposalId"=$1', [proposalId])).rows[0].id as string;
  return { projectId, decisionId, estimateId: estimate.id };
}
const ask = (request: APIRequestContext, projectId: string, question: string) => request.post(`/api/projects/${projectId}/chat`, { headers, data: { question, context: [] } });

test("chat requires a session, a trusted origin and a valid question", async ({ request, playwright }) => {
  await login(request);
  const { projectId } = await acceptedDecision(request);
  const anon = await playwright.request.newContext({ baseURL: origin });
  try { expect((await anon.post(`/api/projects/${projectId}/chat`, { headers, data: { question: "What was decided?" } })).status()).toBe(401); } finally { await anon.dispose(); }
  expect((await request.post(`/api/projects/${projectId}/chat`, { headers: { Origin: "https://foreign.example" }, data: { question: "What was decided?" } })).status()).toBe(403);
  expect((await ask(request, projectId, "hi")).status()).toBe(422);
  expect((await request.post(`/api/projects/${projectId}/chat`, { headers, data: { question: "ok question", context: [{ role: "bad", content: "x" }] } })).status()).toBe(422);
});

test("answers are grounded in validated citations and never mutate the project", async ({ request }) => {
  await login(request);
  const { projectId, decisionId } = await acceptedDecision(request);
  const before = await counts(projectId);
  const response = await ask(request, projectId, "What was the final decision about the launch page?");
  expect(response.status()).toBe(200);
  const body = await response.json();
  expect(body.insufficientEvidence).toBe(false);
  expect(body.citations.length).toBeGreaterThan(0);
  for (const citation of body.citations) {
    expect(citation.href.startsWith(`/projects/${projectId}/`)).toBe(true); // server-generated, project-scoped
    expect(typeof citation.quote).toBe("string");
  }
  expect(body.citations.some((c: { href: string }) => c.href.includes(`/memory/${decisionId}`))).toBe(true);
  expect(await counts(projectId)).toEqual(before); // read-only: no new rows
});

test("insufficient evidence, provider errors and unrepairable citations are honest", async ({ request }) => {
  await login(request);
  const { projectId } = await acceptedDecision(request);
  const insufficient = await ask(request, projectId, "[INSUFFICIENT] What is the client's home address?");
  expect(insufficient.status()).toBe(200); const insufficientBody = await insufficient.json();
  expect(insufficientBody.insufficientEvidence).toBe(true); expect(insufficientBody.citations).toEqual([]);
  expect((await ask(request, projectId, "[OUTAGE] anything")).status()).toBe(502);
  expect((await ask(request, projectId, "[RATE] anything")).status()).toBe(429);
  const repaired = await ask(request, projectId, "[BADCITE] What was decided?"); // fabricated first, corrected on repair
  expect(repaired.status()).toBe(200); expect((await repaired.json()).citations.length).toBeGreaterThan(0);
  const rejected = await ask(request, projectId, "[BADCITE_ALWAYS] What was decided?");
  expect(rejected.status()).toBe(502); expect((await rejected.json()).error.code).toBe("AI_OUTPUT_INVALID");
});

test("chat and decisions are isolated to the owning account", async ({ request, playwright }) => {
  await login(request);
  const { projectId } = await acceptedDecision(request);
  const other = await playwright.request.newContext({ baseURL: origin });
  try {
    const email = `owner-${randomUUID().slice(0, 8)}@example.com`;
    expect((await other.post("/api/auth/register", { headers, data: { email, password: "another-strong-password", confirmPassword: "another-strong-password" } })).status()).toBe(201);
    expect((await other.post(`/api/projects/${projectId}/chat`, { headers, data: { question: "What was decided?" } })).status()).toBe(404);
    expect((await other.get(`/api/projects/${projectId}/chat`)).status()).toBe(404);
  } finally { await other.dispose(); }
});

test("Show All Decisions returns the complete deterministic list", async ({ request }) => {
  await login(request);
  const { projectId, decisionId } = await acceptedDecision(request);
  const listed = await request.get(`/api/projects/${projectId}/chat`); expect(listed.status()).toBe(200);
  const decisions = (await listed.json()).decisions as { id: string; outcome: string; status: string }[];
  expect(decisions.length).toBe(1); expect(decisions[0].id).toBe(decisionId); expect(decisions[0].outcome).toBe("ACCEPTED");
});

test("desktop and mobile chat: keyboard submission, citation navigation and no overflow", async ({ page, playwright }) => {
  test.setTimeout(90_000);
  const setup = await playwright.request.newContext({ baseURL: origin });
  let projectId: string;
  try { await login(setup); ({ projectId } = await acceptedDecision(setup)); } finally { await setup.dispose(); }
  // Log in through the UI once; the page context has no session until now.
  await page.setViewportSize({ width: 1440, height: 1000 }); await page.goto("/login");
  await page.getByLabel("Email address").fill(process.env.TEST_EMAIL!); await page.getByLabel("Password", { exact: true }).fill(process.env.TEST_PASSWORD!); await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Your projects" })).toBeVisible();
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    await page.goto(`/projects/${projectId}`);
    if (viewport.width < 761) await page.getByRole("button", { name: "Open project navigation" }).click();
    await page.getByRole("link", { name: "Project AI Chatbot", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Ask about this project" })).toBeVisible();
    const field = page.getByLabel("Ask a question about this project");
    await field.fill("What was the final decision about the launch page?"); await field.press("Enter");
    await expect(page.locator(".chat-answer-text").last()).toBeVisible();
    await expect(page.locator(".chat-citations a").first()).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.getByRole("button", { name: "Show All Decisions" }).click();
    await expect(page.getByRole("heading", { name: /All decisions/ })).toBeVisible();
    await page.screenshot({ path: `test-results/chat-${viewport.width}.png`, fullPage: true });
    await page.locator(".chat-citations a").first().click();
    await expect(page).toHaveURL(new RegExp(`/projects/${projectId}/`));
  }
});

async function counts(projectId: string) {
  const audit = (await pool.query('SELECT count(*)::int n FROM "AuditEvent" WHERE "projectId"=$1', [projectId])).rows[0].n;
  const decisions = (await pool.query('SELECT count(*)::int n FROM "ProjectDecision" WHERE "projectId"=$1', [projectId])).rows[0].n;
  const proposals = (await pool.query('SELECT count(*)::int n FROM "Proposal" WHERE "projectId"=$1', [projectId])).rows[0].n;
  return { audit, decisions, proposals };
}
