import { spawn } from 'node:child_process';
import { startTestProvider } from './provider-server.mjs';
const server=await startTestProvider();
const child=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port','3100'],{windowsHide:true,stdio:'inherit',env:{...process.env,AI_PROVIDER:'openai-compatible',AI_BASE_URL:'http://127.0.0.1:3199/v1',AI_API_KEY:'test-only-key',AI_MODEL:'test-only-provider',AI_NATIVE_JSON_SCHEMA:'false',AI_CONTEXT_TOKENS:'32768',AI_MAX_OUTPUT_TOKENS:'6000'}});
function stop(){child.kill();server.close();}
process.on('SIGTERM',stop);process.on('SIGINT',stop);child.on('exit',code=>{server.close();process.exit(code??0);});
