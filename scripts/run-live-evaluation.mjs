// Explicit opt-in only. Synthetic evaluation documents are sent to the configured live provider.
import dotenv from 'dotenv';
import { spawn } from 'node:child_process';
dotenv.config({ path: '.env', override: true, quiet: true });
if (!process.env.AI_API_KEY || !process.env.AI_MODEL) throw new Error('Configure a real provider key/model in ignored .env first.');
const child=spawn(process.execPath,['node_modules/vitest/vitest.mjs','run','tests/live-evaluation.test.ts','--reporter=verbose',...process.argv.slice(2)],{stdio:'inherit',windowsHide:true,env:{...process.env,SCOPEFREE_LIVE_EVAL:'true'}});
child.on('exit',code=>{process.exitCode=code??1;});
