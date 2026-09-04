import { expect, test, type APIRequestContext } from "@playwright/test";
import { randomUUID, createHash } from "node:crypto";
import pg from "pg";
import { agreement, baselineInput, docxFixture, pdfFixture } from "../fixtures/intake-documents";
const origin = "http://localhost:3100";
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const headers = { Origin: origin };
const requestData = { text: "Add a searchable portfolio page for completed projects.", hourlyRatePaise: 123456 };
async function authenticated(request: APIRequestContext) {
  const response = await request.post("/api/auth/login", { headers, data: { email: process.env.TEST_EMAIL, password: process.env.TEST_PASSWORD } });
  expect(response.status()).toBe(200);
  return { ...headers, Cookie: response.headers()["set-cookie"].split(";")[0] };
}
async function project(request: APIRequestContext, auth: Record<string, string>, name = `Intake ${randomUUID().slice(0, 8)}`) {
  const response = await request.post("/api/projects", { headers: auth, data: { name } });
  expect(response.status()).toBe(201); return (await response.json()).project.id as string;
}
test.beforeEach(async () => { await pool.query('DELETE FROM "LoginThrottle"'); });
test.afterAll(async () => { await pool.end(); });

test("baseline and request APIs/pages require a session, and mutations reject foreign origins", async ({ request, page }) => {
  const id = randomUUID();
  for (const route of [`/api/projects/${id}/baseline`, `/api/projects/${id}/requests`]) {
    expect((await request.get(route)).status()).toBe(401);
    expect((await request.post(route, { headers, data: {} })).status()).toBe(401);
  }
  expect((await request.post(`/api/projects/${id}/baseline/extract`, { headers, multipart: { file: { name: "agreement.txt", mimeType: "text/plain", buffer: Buffer.from(agreement) } } })).status()).toBe(401);
  for (const section of ["baseline", "requests"]) { await page.goto(`/projects/${id}/${section}`); await expect(page).toHaveURL(/\/login$/); }
  const auth = await authenticated(request);
  for (const section of ["baseline", "requests", "baseline/extract"]) expect((await request.post(`/api/projects/${id}/${section}`, { headers: { ...auth, Origin: "https://evil.example" }, data: {} })).status()).toBe(403);
});

test("all three real document formats produce a complete preview without saving", async ({ request }) => {
  const auth = await authenticated(request); const id = await project(request, auth);
  for (const file of [{ name: "agreement.txt", mimeType: "text/plain", buffer: Buffer.from(agreement) }, { name: "agreement.docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", buffer: await docxFixture() }, { name: "agreement.pdf", mimeType: "application/pdf", buffer: await pdfFixture() }]) {
    const response = await request.post(`/api/projects/${id}/baseline/extract`, { headers: auth, multipart: { file } });
    const body = await response.json(); expect(response.status(), `${file.name}: ${JSON.stringify(body)}`).toBe(200);
    expect(body.text).toContain("Build a responsive five-page website."); expect(body.text).toContain("Include a contact form with email notifications.");
    expect(body.clauses.length).toBeGreaterThan(0);
    expect((await (await request.get(`/api/projects/${id}/baseline`, { headers: auth })).json()).baseline).toBeNull();
  }
  const count = await pool.query('SELECT COUNT(*)::int AS n FROM "AuditEvent" WHERE "projectId"=$1 AND "entityType"=\'baseline\'', [id]); expect(count.rows[0].n).toBe(0);
});

test("invalid uploads fail safely and never create a baseline", async ({ request }) => {
  const auth = await authenticated(request); const id = await project(request, auth);
  const files = [
    { name: "wrong.pdf", mimeType: "application/pdf", buffer: Buffer.from(agreement), code: "UNSUPPORTED_FILE" },
    { name: "bad.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-broken"), code: "EXTRACTION_FAILED" },
    { name: "scan.pdf", mimeType: "application/pdf", buffer: await pdfFixture({ blank: true }), code: "EXTRACTION_FAILED" },
    { name: "mixed.pdf", mimeType: "application/pdf", buffer: await pdfFixture({ mixed: true }), code: "EXTRACTION_FAILED" },
    { name: "empty.txt", mimeType: "text/plain", buffer: Buffer.alloc(0), code: "EXTRACTION_FAILED" },
    { name: "large.txt", mimeType: "text/plain", buffer: Buffer.alloc(5 * 1024 * 1024 + 1, 65), code: "INPUT_TOO_LARGE" },
    { name: "long.txt", mimeType: "text/plain", buffer: Buffer.from("x".repeat(12001)), code: "INPUT_TOO_LARGE" },
  ];
  for (const { code, ...file } of files) {
    const response = await request.post(`/api/projects/${id}/baseline/extract`, { headers: auth, multipart: { file } });
    expect(response.status()).toBe(422); const body = await response.json(); expect(body.error.code).toBe(code); expect(body.error.message.toLowerCase()).toContain("paste");
  }
  expect((await (await request.get(`/api/projects/${id}/baseline`, { headers: auth })).json()).baseline).toBeNull();
});

test("confirmation validates scope, saves trusted metadata and blocks concurrent overwrites", async ({ request }) => {
  const auth = await authenticated(request); const id = await project(request, auth);
  for (const data of [{ ...baselineInput(), confirmed: false }, baselineInput("test test test"), { ...baselineInput(), text: "Mismatched text" }, { ...baselineInput(), confirmedBy: "client" }, { ...baselineInput(), snapshot: { schemaVersion: 1, clauses: [{ id: "B1", text: agreement, isDeliverable: false }] } }]) {
    const response = await request.post(`/api/projects/${id}/baseline`, { headers: auth, data }); expect(response.status()).toBe(422); expect((await response.json()).error.code).toBe("BASELINE_INVALID");
  }
  const outcomes = await Promise.all(Array.from({ length: 3 }, () => request.post(`/api/projects/${id}/baseline`, { headers: auth, data: baselineInput() })));
  expect(outcomes.filter(r => r.status() === 201)).toHaveLength(1); expect(outcomes.filter(r => r.status() === 409)).toHaveLength(2);
  const saved = (await (await request.get(`/api/projects/${id}/baseline`, { headers: auth })).json()).baseline;
  expect(saved.text).toBe(agreement); expect(saved.snapshot).toEqual(baselineInput().snapshot); expect(saved.confirmedBy).toBe("freelancer");
  expect(Math.abs(Date.now() - Date.parse(saved.confirmedAt))).toBeLessThan(60000);
  expect(saved.contentHash).toBe(createHash("sha256").update(JSON.stringify({ text: agreement, snapshot: baselineInput().snapshot })).digest("hex"));
  await expect(pool.query('UPDATE "Baseline" SET "text"=\'Changed\' WHERE "projectId"=$1', [id])).rejects.toMatchObject({ code: "23514" });
  await expect(pool.query('DELETE FROM "Baseline" WHERE "projectId"=$1', [id])).rejects.toMatchObject({ code: "23514" });
  const audit = await pool.query('SELECT COUNT(*)::int AS n FROM "AuditEvent" WHERE "projectId"=$1 AND "action"=\'confirmed\'', [id]); expect(audit.rows[0].n).toBe(1);
  expect((await request.post(`/api/projects/${id}/baseline/extract`, { headers: auth, multipart: { file: { name: "agreement.txt", mimeType: "text/plain", buffer: Buffer.from(agreement) } } })).status()).toBe(409);
});

test("request intake requires a baseline and enforces project isolation and exact saved rate", async ({ request }) => {
  const auth = await authenticated(request); const a = await project(request, auth); const b = await project(request, auth);
  const missing = await request.post(`/api/projects/${a}/requests`, { headers: auth, data: requestData }); expect(missing.status()).toBe(422); expect((await missing.json()).error.code).toBe("BASELINE_REQUIRED");
  expect((await request.post(`/api/projects/${a}/baseline`, { headers: auth, data: baselineInput() })).status()).toBe(201);
  for (const data of [{ ...requestData, text: "short" }, { ...requestData, text: "x".repeat(4001) }, { ...requestData, hourlyRatePaise: 0 }, { ...requestData, hourlyRatePaise: 1.5 }, { ...requestData, hourlyRatePaise: 10000001 }, { ...requestData, projectId: b }, { ...requestData, basedOnScopeRevision: 99 }, { ...requestData, calculatedCostsPaise: 1 }, { ...requestData, supersedesDecisionId: randomUUID() }]) expect((await request.post(`/api/projects/${a}/requests`, { headers: auth, data })).status()).toBe(422);
  const created = await request.post(`/api/projects/${a}/requests`, { headers: auth, data: requestData }); expect(created.status()).toBe(201);
  const saved = (await created.json()).request; expect(saved).toMatchObject({ ...requestData, projectId: a, basedOnScopeRevision: 0 });
  const aList = (await (await request.get(`/api/projects/${a}/requests`, { headers: auth })).json()).requests; expect(aList).toHaveLength(1); expect(aList[0].id).toBe(saved.id);
  expect((await (await request.get(`/api/projects/${b}/requests`, { headers: auth })).json()).requests).toEqual([]);
  expect((await (await request.get(`/api/projects/${b}/baseline`, { headers: auth })).json()).baseline).toBeNull();
  const row = await pool.query('SELECT "hourlyRatePaise" FROM "ChangeRequest" WHERE "id"=$1', [saved.id]); expect(row.rows[0].hourlyRatePaise).toBe(123456);
  expect((await pool.query('SELECT COUNT(*)::int AS n FROM "Estimate" WHERE "requestId"=$1', [saved.id])).rows[0].n).toBe(0);
  for (const id of ["not-a-uuid", randomUUID()]) for (const section of ["baseline", "requests"]) expect((await request.get(`/api/projects/${id}/${section}`, { headers: auth })).status()).toBe(404);
});

test("baseline and request audit failures roll back their entire writes", async ({ request }) => {
  const auth = await authenticated(request); const id = await project(request, auth);
  // Restrict the temporary test trigger to this random test project; remove it in finally.
  await pool.query(`CREATE FUNCTION test_intake_audit_failure() RETURNS trigger AS $$ BEGIN IF NEW."projectId"::text = '${id}' THEN RAISE EXCEPTION 'Test-only audit failure'; END IF; RETURN NEW; END; $$ LANGUAGE plpgsql; CREATE TRIGGER test_intake_audit_failure BEFORE INSERT ON "AuditEvent" FOR EACH ROW EXECUTE FUNCTION test_intake_audit_failure();`);
  try {
    const response = await request.post(`/api/projects/${id}/baseline`, { headers: auth, data: baselineInput() }); expect(response.status()).toBe(503);
    expect((await (await request.get(`/api/projects/${id}/baseline`, { headers: auth })).json()).baseline).toBeNull();
  } finally { await pool.query('DROP TRIGGER test_intake_audit_failure ON "AuditEvent"; DROP FUNCTION test_intake_audit_failure();'); }
  expect((await request.post(`/api/projects/${id}/baseline`, { headers: auth, data: baselineInput() })).status()).toBe(201);
  await pool.query(`CREATE FUNCTION test_intake_audit_failure() RETURNS trigger AS $$ BEGIN IF NEW."projectId"::text = '${id}' THEN RAISE EXCEPTION 'Test-only audit failure'; END IF; RETURN NEW; END; $$ LANGUAGE plpgsql; CREATE TRIGGER test_intake_audit_failure BEFORE INSERT ON "AuditEvent" FOR EACH ROW EXECUTE FUNCTION test_intake_audit_failure();`);
  try {
    expect((await request.post(`/api/projects/${id}/requests`, { headers: auth, data: requestData })).status()).toBe(503);
    expect((await (await request.get(`/api/projects/${id}/requests`, { headers: auth })).json()).requests).toEqual([]);
  } finally { await pool.query('DROP TRIGGER test_intake_audit_failure ON "AuditEvent"; DROP FUNCTION test_intake_audit_failure();'); }
});

test("desktop and mobile paste, clause review, confirmation, request save and refresh", async ({ page }) => {
  test.setTimeout(60_000);
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport); await page.goto("/login");
    await page.getByLabel("Email address").fill(process.env.TEST_EMAIL!); await page.getByLabel("Password").fill(process.env.TEST_PASSWORD!); await page.getByLabel("Password").press("Enter");
    await expect(page.getByRole("heading", { name: "Your projects" })).toBeVisible();
    await page.getByLabel("Project name", { exact: true }).fill(`Milestone 2 flow ${viewport.width} ${randomUUID().slice(0, 6)}`); await page.getByRole("button", { name: "Create project" }).click();
    await page.getByRole("link", { name: "Requests", exact: true }).click(); await expect(page.getByRole("heading", { name: "Start with the original agreement" })).toBeVisible();
    await page.getByRole("link", { name: "Add baseline", exact: true }).click();
    const skipLink = page.getByRole("link", { name: "Skip to content" });
    await expect(skipLink).toHaveCSS("clip-path", "inset(50%)");
    await skipLink.focus(); await expect(skipLink).toBeInViewport();
    await expect(skipLink).toHaveCSS("clip-path", "none");
    await skipLink.press("Enter"); await expect(page).toHaveURL(/#main$/);
    await page.getByLabel("Agreement text", { exact: true }).fill("x".repeat(12001)); await expect(page.getByRole("alert").filter({ hasText: "exceeds" })).toBeVisible(); expect((await page.getByLabel("Agreement text", { exact: true }).inputValue()).length).toBe(12001);
    await page.getByLabel("Agreement text", { exact: true }).fill(agreement); await page.screenshot({ path: `test-results/intake-source-${viewport.width}.png`, fullPage: true });
    await page.getByRole("button", { name: "Review clauses" }).click();
    await page.getByRole("button", { name: "Confirm baseline" }).click(); await expect(page.getByRole("alert").filter({ hasText: "deliverable" })).toBeVisible();
    await page.getByLabel("This clause describes a concrete deliverable.", { exact: true }).first().check();
    await page.getByRole("button", { name: "Add clause", exact: true }).click(); await page.getByLabel("Clause text", { exact: true }).last().fill("Provide one round of revisions after the first review.");
    await page.getByLabel("Clause ID", { exact: true }).last().fill("B1");
    await page.getByLabel(/I have reviewed all text and clauses/).check(); await page.getByRole("button", { name: "Confirm baseline" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "unique" })).toBeVisible();
    await page.getByLabel("Clause ID", { exact: true }).last().fill("B3"); await page.getByLabel(/I have reviewed all text and clauses/).check();
    await page.screenshot({ path: `test-results/intake-review-${viewport.width}.png`, fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.getByRole("button", { name: "Confirm baseline" }).click(); await expect(page.getByRole("heading", { name: "Confirmed baseline" })).toBeVisible();
    await page.reload(); await expect(page.getByText("Provide one round of revisions after the first review.", { exact: true }).first()).toBeVisible(); await expect(page.getByRole("button", { name: "Confirm baseline" })).toHaveCount(0);
    await page.screenshot({ path: `test-results/intake-confirmed-${viewport.width}.png`, fullPage: true });
    await page.getByRole("link", { name: "Add a request" }).click();
    await page.getByLabel("What has the client requested?").fill(requestData.text); await page.getByLabel("Hourly rate (INR)").fill("1.001"); await page.getByRole("button", { name: "Save request" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "two decimal" })).toBeVisible(); await expect(page.getByLabel("What has the client requested?")).toHaveValue(requestData.text);
    await page.getByLabel("Hourly rate (INR)").fill("1234.56"); await page.getByRole("button", { name: "Save request" }).click(); await expect(page.getByRole("status").filter({ hasText: "Request saved" })).toBeVisible();
    await page.reload(); await expect(page.getByText(requestData.text, { exact: true })).toBeVisible(); await expect(page.getByText("₹1,234.56 / hour", { exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `test-results/intake-requests-${viewport.width}.png`, fullPage: true });
    await page.getByRole("button", { name: "Log out" }).click(); await expect(page).toHaveURL(/\/login$/);
  }
});

test("browser upload failure preserves pasted text and valid DOCX opens editable preview", async ({ page }) => {
  await page.goto("/login"); await page.getByLabel("Email address").fill(process.env.TEST_EMAIL!); await page.getByLabel("Password").fill(process.env.TEST_PASSWORD!); await page.getByRole("button", { name: "Sign in" }).click();
  await page.getByLabel("Project name", { exact: true }).fill(`Upload browser ${randomUUID().slice(0, 6)}`); await page.getByRole("button", { name: "Create project" }).click();
  await page.getByRole("link", { name: "Baseline", exact: true }).click(); await page.getByLabel("Agreement text", { exact: true }).fill("Existing input must survive an extraction failure.");
  await page.getByLabel("Choose agreement file").setInputFiles({ name: "broken.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-broken") });
  await expect(page.getByRole("alert").filter({ hasText: "Paste" })).toBeVisible(); await expect(page.getByLabel("Agreement text", { exact: true })).toHaveValue("Existing input must survive an extraction failure.");
  await page.getByLabel("Choose agreement file").setInputFiles({ name: "agreement.docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", buffer: await docxFixture() });
  await expect(page.getByLabel("Agreement text", { exact: true })).toHaveValue(agreement); await page.getByRole("button", { name: "Review clauses" }).click();
  await expect(page.getByLabel("Clause text", { exact: true }).first()).toHaveValue("Build a responsive five-page website.");
  await page.getByRole("button", { name: "Merge clause 2 with previous" }).click(); await expect(page.getByLabel("Clause text", { exact: true })).toHaveCount(1); await expect(page.getByLabel("Clause text", { exact: true })).toHaveValue(agreement);
});
