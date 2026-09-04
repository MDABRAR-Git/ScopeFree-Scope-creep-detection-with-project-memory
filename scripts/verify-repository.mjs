// Inspects fetched local/remote refs without checking out, merging or rewriting them.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import dotenv from 'dotenv';

function git(args, accepted = [0]) {
  const result = spawnSync('git', args, { encoding: 'utf8', windowsHide: true, maxBuffer: 20_000_000 });
  if (result.error || !accepted.includes(result.status)) throw new Error(`Git verification failed: ${args[0]} (exit ${result.status ?? 'unavailable'}).`);
  return { status: result.status, text: result.stdout };
}

const secrets = [];
for (const file of ['.env', '.env.test']) {
  if (!existsSync(file)) continue;
  const env = dotenv.parse(readFileSync(file));
  for (const key of ['AI_API_KEY', 'SESSION_SECRET', 'FREELANCER_PASSWORD_HASH', 'TEST_PASSWORD', 'DATABASE_URL']) if (env[key]) secrets.push(env[key]);
  if (env.DATABASE_URL) {
    try { secrets.push(decodeURIComponent(new URL(env.DATABASE_URL).password)); }
    catch { throw new Error('The local database URL is invalid; credential values were not printed.'); }
  }
  if (env.FREELANCER_PASSWORD_HASH && !env.FREELANCER_PASSWORD_HASH.startsWith('$')) secrets.push(Buffer.from(env.FREELANCER_PASSWORD_HASH, 'base64').toString('utf8'));
}
if (existsSync('.local/workspace-password.txt')) secrets.push(readFileSync('.local/workspace-password.txt', 'utf8').trim());
const secretValues = [...new Set(secrets)].filter(value => value.length >= 8);
const rows = git(['for-each-ref', '--format=%(refname)|%(objectname)|%(symref)', 'refs/heads', 'refs/remotes']).text.trim().split('\n');
const refs = rows.map(row => row.trim().split('|')).filter(([, , symref]) => !symref).map(([ref, commit]) => ({ ref, commit }));
const findings = [];
git(['fsck', '--full', '--no-dangling']);
if (git(['ls-files', '--unmerged']).text.trim()) findings.push('The index contains unresolved merge entries.');
const blobs = new Map();
for (const { ref } of refs) {
  const markers = git(['grep', '-l', '-I', '-E', '^(<<<<<<< |=======$|>>>>>>> |\\|\\|\\|\\|\\|\\|\\| )', ref, '--'], [0, 1]);
  if (markers.status === 0) findings.push(`Conflict markers in ${ref}: ${markers.text.trim()}`);
  for (const entry of git(['ls-tree', '-r', '-z', ref]).text.split('\0').filter(Boolean)) {
    const [metadata, path] = entry.split('\t');
    const [, type, oid] = metadata.split(' ');
    if (type !== 'blob') continue;
    if ((/(^|\/)\.env($|\.)/.test(path) && path !== '.env.example') || /^(node_modules|\.next|\.local|test-results|src\/generated)\//.test(path)) findings.push(`Private/generated path tracked on ${ref}: ${path}`);
    if (!blobs.has(oid)) {
      const content = git(['cat-file', 'blob', oid]).text;
      blobs.set(oid, secretValues.some(secret => content.includes(secret)));
    }
    if (blobs.get(oid)) findings.push(`Configured local credential found on ${ref}: ${path}`);
  }
}
const merges = [];
for (let a = 0; a < refs.length; a++) for (let b = a + 1; b < refs.length; b++) {
  // merge-tree may create unreachable tree objects, but never changes refs or the working tree.
  const result = git(['merge-tree', '--write-tree', refs[a].ref, refs[b].ref], [0, 1]);
  merges.push({ left: refs[a].ref, right: refs[b].ref, clean: result.status === 0 });
  if (result.status !== 0) findings.push(`Merge conflict: ${refs[a].ref} + ${refs[b].ref}`);
}
const report = { checkedAt: new Date().toISOString(), branch: git(['branch', '--show-current']).text.trim(), head: git(['rev-parse', 'HEAD']).text.trim(), refs, uniqueBlobsChecked: blobs.size, localCredentialScanAvailable: secretValues.length > 0, merges, findings };
mkdirSync('.local', { recursive: true });
writeFileSync('.local/repository-verification.json', JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ branch: report.branch, refs: refs.length, mergePairs: merges.length, uniqueBlobsChecked: blobs.size, localCredentialScanAvailable: report.localCredentialScanAvailable, findings }, null, 2));
if (findings.length) process.exitCode = 1;
