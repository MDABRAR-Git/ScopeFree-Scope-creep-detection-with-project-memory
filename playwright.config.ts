import { defineConfig, devices } from "@playwright/test";
import dotenv from "dotenv";
dotenv.config({ path: ".env.test", override: true, quiet: true });
if (!process.env.DATABASE_URL || !new URL(process.env.DATABASE_URL).pathname.endsWith("_test")) throw new Error("Browser tests require an isolated database with a name ending in _test in .env.test.");
if (!process.env.TEST_PASSWORD) throw new Error("Set TEST_PASSWORD in .env.test (test credentials only).");
export default defineConfig({
  testDir: "./tests/e2e", fullyParallel: false, workers: 1, retries: 0,
  expect: { timeout: 15000 },
  use: { baseURL: "http://localhost:3100", trace: "off", screenshot: "only-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: { command: "node tests/support/start-e2e.mjs", url: "http://localhost:3100/login", reuseExistingServer: false, timeout: 120_000 },
});
