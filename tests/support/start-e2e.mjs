import { spawn } from 'node:child_process';
import { startTestProvider } from './provider-server.mjs';
import { startTestEmailServer } from './email-server.mjs';
const server=await startTestProvider();
const emailServer=await startTestEmailServer();
const child=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port','3100'],{windowsHide:true,stdio:'inherit',env:{...process.env,AI_PROVIDER:'openai-compatible',AI_BASE_URL:'http://127.0.0.1:3199/v1',AI_API_KEY:'test-only-key',AI_MODEL:'test-only-provider',AI_NATIVE_JSON_SCHEMA:'false',AI_CONTEXT_TOKENS:'32768',AI_MAX_OUTPUT_TOKENS:'6000',EMAIL_PROVIDER:'http-json',EMAIL_API_URL:'http://127.0.0.1:3198/emails',EMAIL_API_KEY:'test-only-email-key',EMAIL_FROM:'proposals@scopefree.test'}});
function stop(){child.kill();server.close();emailServer.close();}
process.on('SIGTERM',stop);process.on('SIGINT',stop);child.on('exit',code=>{server.close();emailServer.close();process.exit(code??0);});
