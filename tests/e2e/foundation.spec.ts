import { test, expect, type APIRequestContext } from "@playwright/test";
import pg from "pg";
import { randomUUID } from "node:crypto";
const origin = "http://localhost:3100";
const password = process.env.TEST_PASSWORD!;
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const headers = { Origin: origin };
async function resetThrottle() { await pool.query('DELETE FROM "LoginThrottle"'); }
async function login(request: APIRequestContext) {
  const response = await request.post("/api/auth/login", { headers, data: { password } });
  expect(response.status()).toBe(200);
  const cookie = response.headers()["set-cookie"].split(";")[0];
  return { cookie, response };
}
test.beforeEach(async () => { await resetThrottle(); });
test.afterAll(async () => { await pool.end(); });

test("initial migration enforces foreign keys and one baseline per project", async () => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const projectId = randomUUID();
    await client.query('INSERT INTO "Project" ("id", "name") VALUES ($1, $2)', [projectId, "Migration constraint check"]);
    const sql = 'INSERT INTO "Baseline" ("id", "projectId", "text", "clausesJson", "contentHash", "confirmedAt", "confirmedBy") VALUES ($1, $2, $3, $4, $5, NOW(), $6)';
    const values = [randomUUID(), projectId, "Test fixture", JSON.stringify({ schemaVersion: 1, clauses: [] }), "test-hash", "test"];
    await client.query(sql, values);
    await client.query("SAVEPOINT duplicate_check");
    await expect(client.query(sql, [randomUUID(), ...values.slice(1)])).rejects.toMatchObject({ code: "23505" });
    await client.query("ROLLBACK TO SAVEPOINT duplicate_check");
    await expect(client.query(sql, [randomUUID(), randomUUID(), ...values.slice(2)])).rejects.toMatchObject({ code: "23503" });
  } finally { await client.query("ROLLBACK"); client.release(); }
});

test("workspace pages and all project APIs require access", async ({ request, page }) => {
  for (const route of ["/api/projects", `/api/projects/${randomUUID()}`]) {
    const response = await request.get(route); expect(response.status()).toBe(401); expect((await response.json()).error.code).toBe("UNAUTHORIZED"); expect(response.headers()["cache-control"]).toBe("no-store");
  }
  expect((await request.post("/api/projects", { headers, data: { name: "Forbidden" } })).status()).toBe(401);
  expect((await request.post("/api/auth/logout", { headers })).status()).toBe(401);
  await page.goto("/projects"); await expect(page).toHaveURL(/\/login$/);
  await page.goto(`/projects/${randomUUID()}`); await expect(page).toHaveURL(/\/login$/);
});

test("login errors, safe cookies, tampering, expiry and logout revocation", async ({ request, playwright }) => {
  const bad = await request.post("/api/auth/login", { headers, data: { password: "wrong" } }); expect(bad.status()).toBe(401);
  expect((await bad.json()).error.code).toBe("INVALID_CREDENTIALS");
  const { cookie, response } = await login(request);
  const lifetime = await pool.query('SELECT EXTRACT(EPOCH FROM ("expiresAt" - NOW()))::float AS seconds FROM "WorkspaceSession" ORDER BY "createdAt" DESC LIMIT 1');
  expect(lifetime.rows[0].seconds).toBeGreaterThan(28700); expect(lifetime.rows[0].seconds).toBeLessThanOrEqual(28800);
  const setCookie = response.headers()["set-cookie"];
  for (const flag of ["HttpOnly", "Secure", "SameSite=lax", "Path=/"]) expect(setCookie).toContain(flag);
  const isolated = await playwright.request.newContext({ baseURL: origin });
  expect((await isolated.get("/api/projects", { headers: { Cookie: cookie } })).status()).toBe(200);
  expect((await isolated.get("/api/projects", { headers: { Cookie: "scopefree_session=tampered" } })).status()).toBe(401);
  expect((await request.post("/api/auth/logout", { headers: { ...headers, Cookie: cookie } })).status()).toBe(200);
  expect((await isolated.get("/api/projects", { headers: { Cookie: cookie } })).status()).toBe(401);
  const second = await login(request);
  await pool.query('UPDATE "WorkspaceSession" SET "expiresAt" = NOW() - INTERVAL \'1 minute\'');
  expect((await isolated.get("/api/projects", { headers: { Cookie: second.cookie } })).status()).toBe(401);
  await isolated.dispose();
});

test("mutations reject absent, foreign, and spoofed origins; GET never mutates", async ({ request }) => {
  const origins: Record<string, string>[] = [{}, { Origin: "https://evil.example" }, { Origin: origin, "Sec-Fetch-Site": "cross-site" }];
  for (const originHeader of origins) {
    expect((await request.post("/api/auth/login", { headers: originHeader, data: { password } })).status()).toBe(403);
  }
  const { cookie } = await login(request);
  for (const route of ["/api/projects", "/api/auth/logout"]) expect((await request.post(route, { headers: { Origin: "https://evil.example", Cookie: cookie }, data: { name: "Blocked" } })).status()).toBe(403);
  expect((await request.get("/api/auth/logout", { headers: { Cookie: cookie } })).status()).toBe(405);
  expect((await request.get("/api/auth/login")).status()).toBe(405);
  expect((await request.get("/api/projects", { headers: { Cookie: cookie } })).status()).toBe(200);
});

test("login throttling is atomic, shared, and expires", async ({ playwright }) => {
  const contexts = await Promise.all(Array.from({ length: 11 }, () => playwright.request.newContext({ baseURL: origin })));
  const results = await Promise.all(contexts.map(ctx => ctx.post("/api/auth/login", { headers: { ...headers, "X-Forwarded-For": randomUUID() }, data: { password: "wrong" } })));
  expect(results.filter(r => r.status() === 401)).toHaveLength(10); expect(results.filter(r => r.status() === 429)).toHaveLength(1);
  const blocked = await contexts[0].post("/api/auth/login", { headers, data: { password } });
  expect(blocked.status()).toBe(429); expect(Number(blocked.headers()["retry-after"])).toBeGreaterThan(0); expect(Number(blocked.headers()["retry-after"])).toBeLessThanOrEqual(900);
  await pool.query('UPDATE "LoginThrottle" SET "windowStart" = NOW() - INTERVAL \'16 minutes\'');
  expect((await contexts[0].post("/api/auth/login", { headers, data: { password } })).status()).toBe(200);
  await Promise.all(contexts.map(c => c.dispose()));
});

test("project validation, database persistence, audit, IDs and safe text", async ({ request }) => {
  const { cookie } = await login(request); const auth = { ...headers, Cookie: cookie };
  for (const data of [{ name: " " }, { name: "x".repeat(121) }, { name: "Valid", scopeRevision: 100 }]) expect((await request.post("/api/projects", { headers: auth, data })).status()).toBe(422);
  expect((await request.post("/api/projects", { headers: { ...auth, "Content-Type": "application/json" }, data: "{" })).status()).toBe(422);
  expect((await request.post("/api/projects", { headers: auth, data: { name: "x".repeat(6000) } })).status()).toBe(413);
  const response = await request.post("/api/projects", { headers: auth, data: { name: "  <script>alert('x')</script>  " } });
  expect(response.status()).toBe(201); const { project } = await response.json(); expect(project.name).toBe("<script>alert('x')</script>"); expect(project.scopeRevision).toBe(0);
  const read = await request.get(`/api/projects/${project.id}`, { headers: auth }); expect((await read.json()).project.id).toBe(project.id);
  const list = await request.get("/api/projects", { headers: auth }); expect((await list.json()).projects.some((p: { id: string }) => p.id === project.id)).toBe(true);
  const row = await pool.query('SELECT "name" FROM "Project" WHERE "id"=$1', [project.id]); expect(row.rows[0].name).toBe(project.name);
  const audit = await pool.query('SELECT "action" FROM "AuditEvent" WHERE "projectId"=$1', [project.id]); expect(audit.rows[0].action).toBe("created");
  for (const id of ["not-a-uuid", randomUUID()]) expect((await request.get(`/api/projects/${id}`, { headers: auth })).status()).toBe(404);
});

test("desktop and mobile login, project creation, refresh, keyboard, and logout", async ({ page }) => {
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport); await page.goto("/login");
    await expect(page.getByRole("heading", { name: "Welcome back." })).toBeVisible();
    await page.getByLabel("Workspace password").fill("wrong"); await page.getByRole("button", { name: "Open workspace" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "incorrect" })).toBeVisible();
    await page.getByLabel("Workspace password").fill(password); await page.getByLabel("Workspace password").press("Enter");
    await expect(page.getByRole("heading", { name: "Your projects" })).toBeVisible();
    const name = `Browser check ${viewport.width} ${randomUUID().slice(0, 8)}`;
    await page.getByLabel("Project name", { exact: true }).fill(name); await page.getByRole("button", { name: "Create project" }).click();
    await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
    await expect(page.getByText("Your project has a home.")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.reload(); await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
    await page.screenshot({ path: `test-results/workspace-${viewport.width}.png`, fullPage: true });
    await page.getByRole("link", { name: "All projects", exact: true }).click(); await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
    await page.screenshot({ path: `test-results/projects-${viewport.width}.png`, fullPage: true });
    await page.getByRole("button", { name: "Log out" }).click(); await expect(page).toHaveURL(/\/login$/);
    await page.screenshot({ path: `test-results/login-${viewport.width}.png`, fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
});
