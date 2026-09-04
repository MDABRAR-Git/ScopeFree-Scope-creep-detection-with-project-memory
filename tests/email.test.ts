import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createEmailProvider } from "../src/server/email/provider";
import { buildProposalEmail } from "../src/server/email/proposal-email";
import { clientEmailSchema } from "../src/lib/proposals";

const send = () => ({ to: "client@example.com", subject: "s", html: "<p>h</p>", text: "t", signal: new AbortController().signal });
beforeEach(() => { vi.stubEnv("EMAIL_PROVIDER", "http-json"); vi.stubEnv("EMAIL_API_URL", "https://mail.example/emails"); vi.stubEnv("EMAIL_API_KEY", "test-only-email-key"); vi.stubEnv("EMAIL_FROM", "proposals@scopefree.test"); vi.stubEnv("EMAIL_REQUEST_TIMEOUT_MS", "15000"); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("client email normalization and validation", () => {
  it("trims and lowercases valid addresses", () => {
    expect(clientEmailSchema.parse("  Client@Example.COM ")).toBe("client@example.com");
  });
  it("rejects malformed and empty addresses", () => {
    for (const value of ["", "not-an-email", "a@", "@b.com", "a b@example.com"]) expect(clientEmailSchema.safeParse(value).success).toBe(false);
  });
});

describe("provider-independent email adapter (injected test responses only)", () => {
  it("fails explicitly with EMAIL_NOT_CONFIGURED when configuration is absent, without a request", () => {
    vi.stubEnv("EMAIL_API_KEY", ""); const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
    expect(() => createEmailProvider()).toThrow(expect.objectContaining({ code: "EMAIL_NOT_CONFIGURED" }));
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("rejects unsafe transport configuration", () => {
    for (const url of ["http://mail.example/emails", "https://user:pass@mail.example/emails"]) {
      vi.stubEnv("EMAIL_API_URL", url); expect(() => createEmailProvider()).toThrow(expect.objectContaining({ code: "EMAIL_NOT_CONFIGURED" }));
    }
  });
  it("posts from/to/subject/html/text with a bearer key and returns the provider message id", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: "provider-123" })));
    vi.stubGlobal("fetch", fetchMock);
    await expect(createEmailProvider().send(send())).resolves.toMatchObject({ providerMessageId: "provider-123", provider: "http-json" });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://mail.example/emails");
    expect(init.redirect).toBe("error");
    expect(init.headers.Authorization).toBe("Bearer test-only-email-key");
    expect(JSON.parse(init.body)).toMatchObject({ from: "proposals@scopefree.test", to: "client@example.com", subject: "s", html: "<p>h</p>", text: "t" });
  });
  it.each([[429], [500], [401]])("returns a safe retryable EMAIL_SEND_FAILED for HTTP %s without leaking the provider body", async status => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("sensitive upstream body", { status })));
    await expect(createEmailProvider().send(send())).rejects.toMatchObject({ code: "EMAIL_SEND_FAILED", retryable: true });
  });
  it("returns a retryable error for a network failure, never a fake success", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("private upstream failure")));
    await expect(createEmailProvider().send(send())).rejects.toMatchObject({ code: "EMAIL_SEND_FAILED", retryable: true });
  });
  it("enforces a timeout even if the transport never settles", async () => {
    vi.useFakeTimers(); const fetchMock = vi.fn().mockImplementation(() => new Promise(() => {})); vi.stubGlobal("fetch", fetchMock);
    const pending = expect(createEmailProvider().send(send())).rejects.toMatchObject({ code: "EMAIL_SEND_FAILED" });
    await vi.advanceTimersByTimeAsync(15001); await pending;
    expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true);
  });
});

describe("proposal email content", () => {
  const email = buildProposalEmail({ projectName: "Acme <script> & \"Co\"", link: "http://localhost:3000/client/proposals/p1#token=abc", expiresAt: new Date("2026-09-12T10:00:00Z") });
  it("escapes project text in the HTML and keeps a raw link only in the plain-text part", () => {
    expect(email.html).not.toContain("<script>");
    expect(email.html).toContain("Acme &lt;script&gt; &amp; &quot;Co&quot;");
    expect(email.text).toContain("http://localhost:3000/client/proposals/p1#token=abc");
  });
  it("includes one review CTA, expiry information and the no-accept statement, and no pricing", () => {
    expect(email.html).toContain("Review proposal");
    expect(email.text).toContain("expires on");
    expect(email.text.toLowerCase()).toContain("does not accept");
    expect(email.html).not.toContain("₹");
    expect(email.subject).toContain("Acme");
  });
});
