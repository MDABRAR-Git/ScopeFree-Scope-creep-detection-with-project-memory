import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { authConfig, checkOrigin, loginInputSchema, registrationInputSchema } from "../src/server/auth";
beforeEach(() => { vi.stubEnv("SESSION_SECRET", "test-only-session-secret-with-over-32-characters"); vi.stubEnv("APP_ORIGIN", "https://workspace.example"); });
afterEach(() => vi.unstubAllEnvs());
it("normalizes account emails and validates registration passwords", () => {
  expect(loginInputSchema.parse({ email: " USER@Example.COM ", password: "password" }).email).toBe("user@example.com");
  expect(() => registrationInputSchema.parse({ email: "user@example.com", password: "short", confirmPassword: "short" })).toThrow();
  expect(() => registrationInputSchema.parse({ email: "user@example.com", password: "long-enough", confirmPassword: "different" })).toThrow();
});
it("requires a sufficiently long secret and exact HTTP(S) origin", () => {
  for (const [key, value] of [["SESSION_SECRET", "short"], ["APP_ORIGIN", "https://workspace.example/path"]]) {
    const original = process.env[key]; vi.stubEnv(key, value); expect(authConfig).toThrow(expect.objectContaining({ code: "AUTH_NOT_CONFIGURED" })); vi.stubEnv(key, original);
  }
});
it("uses HttpOnly SameSite cookies, Secure in production and an eight-hour TTL", () => { vi.stubEnv("NODE_ENV", "production"); expect(authConfig().options).toMatchObject({ ttl: 28800, cookieOptions: { httpOnly: true, secure: true, sameSite: "lax" } }); vi.stubEnv("NODE_ENV", "development"); expect(authConfig().options.cookieOptions?.secure).toBe(false); });
it("does not derive the trusted origin from hostile request headers", () => { expect(() => checkOrigin(new Request("https://evil.example", { headers: { origin: "https://evil.example", host: "workspace.example", "x-forwarded-host": "workspace.example" } }))).toThrow(expect.objectContaining({ code: "FORBIDDEN_ORIGIN" })); });
