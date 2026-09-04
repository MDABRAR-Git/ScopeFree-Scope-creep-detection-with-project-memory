import { defineConfig, devices } from "@playwright/test";
import dotenv from "dotenv";
import { readFileSync } from "node:fs";
const live = dotenv.parse(readFileSync('.env'));
dotenv.config({ path: '.env.test', override: true, quiet: true });
if (!process.env.DATABASE_URL || !new URL(process.env.DATABASE_URL).pathname.endsWith('_test')) throw new Error('Live browser verification requires the isolated test database.');
if (!process.env.TEST_EMAIL || !process.env.TEST_PASSWORD) throw new Error('TEST_EMAIL and TEST_PASSWORD are required for live browser verification.');
if (!live.AI_API_KEY || !live.AI_MODEL) throw new Error('Live AI configuration is required.');
const env: Record<string,string> = { APP_ORIGIN: 'http://localhost:3300' };
for (const [key,value] of Object.entries(live)) if (key.startsWith('AI_')) env[key] = value;
export default defineConfig({
  testDir:'./tests/live-browser', workers:1, retries:0, timeout:180000,
  expect:{timeout:15000},
  outputDir:'.local/live-browser-results',
  use:{baseURL:'http://localhost:3300',trace:'off',screenshot:'only-on-failure'},
  projects:[{name:'chromium',use:{...devices['Desktop Chrome']}}],
  webServer:{command:'npm run start -- --port 3300',url:'http://localhost:3300/login',env,reuseExistingServer:false,timeout:120000},
});
