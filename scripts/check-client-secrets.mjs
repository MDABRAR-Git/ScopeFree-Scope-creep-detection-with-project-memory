import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import dotenv from 'dotenv';
const values = ['.env', '.env.test'].flatMap(path => {
  try { return Object.entries(dotenv.parse(readFileSync(path))).filter(([key, value]) => /SECRET|PASSWORD|API_KEY|DATABASE_URL/.test(key) && value.length >= 8); } catch { return []; }
});
if (!values.length) throw new Error('Configure local test credentials before checking client assets.');
let count = 0;
function scan(path) {
  for (const entry of readdirSync(path, { withFileTypes: true })) {
    const file = join(path, entry.name);
    if (entry.isDirectory()) scan(file);
    else {
      count++;
      const contents = readFileSync(file, 'utf8');
      for (const [key, value] of values) if (contents.includes(value)) throw new Error(`Server-only value ${key} was found in client assets.`);
    }
  }
}
scan('.next/static');
console.log(`PASS: none of the configured secret values appear in ${count} production client assets.`);
