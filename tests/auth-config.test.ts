import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { authConfig, checkOrigin } from "../src/server/auth";
// Test-only configuration fixture; password verification itself is exercised against Argon2 in browser tests.
const hash = "$argon2id$v=19$m=65536,t=3,p=1$test$fixture";
beforeEach(() => { vi.stubEnv("FREELANCER_PASSWORD_HASH", Buffer.from(hash).toString("base64")); vi.stubEnv("SESSION_SECRET", "test-only-session-secret-with-over-32-characters"); vi.stubEnv("APP_ORIGIN", "https://workspace.example"); });
afterEach(() => vi.unstubAllEnvs());
it("decodes the env-safe hash without changing credential identity", () => { expect(authConfig().passwordHash).toBe(hash); const version = authConfig().credentialVersion; vi.stubEnv("FREELANCER_PASSWORD_HASH", hash); expect(authConfig().credentialVersion).toBe(version); });
it("requires a configured hash, sufficiently long secret and exact HTTP(S) origin", () => {
  for (const [key, value] of [["FREELANCER_PASSWORD_HASH", ""], ["SESSION_SECRET", "short"], ["APP_ORIGIN", "https://workspace.example/path"]]) {
    const original = process.env[key]; vi.stubEnv(key, value); expect(authConfig).toThrow(expect.objectContaining({ code: "AUTH_NOT_CONFIGURED" })); vi.stubEnv(key, original);
  }
});
it("uses HttpOnly SameSite cookies, Secure in production and an eight-hour TTL", () => { vi.stubEnv("NODE_ENV", "production"); expect(authConfig().options).toMatchObject({ ttl: 28800, cookieOptions: { httpOnly: true, secure: true, sameSite: "lax" } }); vi.stubEnv("NODE_ENV", "development"); expect(authConfig().options.cookieOptions?.secure).toBe(false); });
it("does not derive the trusted origin from hostile request headers", () => { expect(() => checkOrigin(new Request("https://evil.example", { headers: { origin: "https://evil.example", host: "workspace.example", "x-forwarded-host": "workspace.example" } }))).toThrow(expect.objectContaining({ code: "FORBIDDEN_ORIGIN" })); });
