import dotenv from 'dotenv';
import { spawnSync } from 'node:child_process';
dotenv.config({ path: '.env.test', override: true, quiet: true });
if (!process.env.DATABASE_URL || !new URL(process.env.DATABASE_URL).pathname.endsWith('_test')) throw new Error('Provide an isolated DATABASE_URL ending in _test in .env.test.');
const result = spawnSync(process.execPath, ['node_modules/prisma/build/index.js', 'migrate', 'deploy'], { stdio: 'inherit', env: process.env });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
