import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAIProvider } from "../src/server/ai/provider";
const input = () => ({ messages: [{ role: "user" as const, content: "Test input" }], maxOutputTokens: 100, signal: new AbortController().signal });
beforeEach(() => { vi.stubEnv("AI_PROVIDER", "featherless"); vi.stubEnv("AI_BASE_URL", "https://provider.example/v1"); vi.stubEnv("AI_MODEL", "test-model"); vi.stubEnv("AI_API_KEY", "test-only-key"); vi.stubEnv("AI_NATIVE_JSON_SCHEMA", "false"); vi.stubEnv("AI_THINKING", "default"); vi.stubEnv("AI_REASONING_EFFORT", "default"); vi.stubEnv("AI_REQUEST_TIMEOUT_MS", "30000"); });
beforeEach(() => { vi.stubEnv("AI_TEMPERATURE", "default"); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
describe("server-only interchangeable provider boundary (injected test responses only)", () => {
  it.each([30000, 90000])("enforces a %i ms deadline even if the transport never settles on abort", async timeout => {
    vi.stubEnv("AI_REQUEST_TIMEOUT_MS", String(timeout));
    vi.useFakeTimers(); const fetchMock = vi.fn().mockImplementation(() => new Promise(() => {})); vi.stubGlobal("fetch", fetchMock);
    const pending = expect(createAIProvider().generate(input())).rejects.toMatchObject({ code: "AI_TIMEOUT" });
    await vi.advanceTimersByTimeAsync(timeout + 1); await pending;
    expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true);
  });
  it("fails explicitly when credentials are absent without making a request", () => {
    vi.stubEnv("AI_API_KEY", ""); const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
    expect(() => createAIProvider()).toThrow(expect.objectContaining({ code: "AI_NOT_CONFIGURED" })); expect(fetchMock).not.toHaveBeenCalled();
  });
  it("uses configured endpoint/model and does not assume native schema support", async () => {
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(new Response(JSON.stringify({ choices: [{ message: { content: "test response" }, finish_reason: "stop" }] }))));
    vi.stubGlobal("fetch", fetchMock);
    await expect(createAIProvider().generate({ ...input(), responseSchema: { type: "object" } })).resolves.toMatchObject({ text: "test response", model: "test-model", provider: "featherless" });
    expect(fetchMock.mock.calls[0][0]).toBe("https://provider.example/v1/chat/completions");
    const init = fetchMock.mock.calls[0][1]; expect(JSON.parse(init.body).response_format).toBeUndefined(); expect(init.redirect).toBe("error");
    expect(JSON.parse(init.body).chat_template_kwargs).toBeUndefined();
    expect(JSON.parse(init.body).temperature).toBeUndefined();
    vi.stubEnv("AI_TEMPERATURE", "0");
    vi.stubEnv("AI_THINKING", "false");
    vi.stubEnv("AI_REASONING_EFFORT", "low");
    vi.stubEnv("AI_PROVIDER", "openai-compatible"); vi.stubEnv("AI_MODEL", "another-model"); vi.stubEnv("AI_NATIVE_JSON_SCHEMA", "true");
    await createAIProvider().generate({ ...input(), responseSchema: { type: "object" } });
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toMatchObject({ model: "another-model", response_format: { type: "json_schema" } });
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).chat_template_kwargs).toEqual({ enable_thinking: false });
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).reasoning_effort).toBe("low");
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).temperature).toBe(0);
  });
  it.each([[401, "AI_UNAVAILABLE"], [429, "AI_RATE_LIMITED"], [500, "AI_UNAVAILABLE"]])("returns safe errors for HTTP %s", async (status, code) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("sensitive upstream body", { status: status as number })));
    await expect(createAIProvider().generate(input())).rejects.toMatchObject({ code });
  });
  it("rejects invalid, empty, truncated and oversized provider output", async () => {
    for (const body of ["bad json", JSON.stringify({ choices: [] }), JSON.stringify({ choices: [{ message: { content: "partial" }, finish_reason: "length" }] }), "x".repeat(1_048_577)]) {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(body)));
      await expect(createAIProvider().generate(input())).rejects.toMatchObject({ code: "AI_OUTPUT_INVALID" });
    }
  });
  it("handles cancelled and network-failed requests without fallback answers", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("private upstream failure")));
    await expect(createAIProvider().generate(input())).rejects.toMatchObject({ code: "AI_UNAVAILABLE" });
    const controller = new AbortController(); controller.abort();
    await expect(createAIProvider().generate({ ...input(), signal: controller.signal })).rejects.toMatchObject({ code: "AI_TIMEOUT" });
  });
  it("rejects unsafe transport configuration", () => {
    for (const url of ["http://provider.example/v1", "https://user:pass@provider.example/v1", "https://provider.example/v1?key=secret"]) {
      vi.stubEnv("AI_BASE_URL", url); expect(() => createAIProvider()).toThrow(expect.objectContaining({ code: "AI_NOT_CONFIGURED" }));
    }
  });
});
