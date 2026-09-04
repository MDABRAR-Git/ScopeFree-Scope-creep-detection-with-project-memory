import argon2 from 'argon2';
import { stdin, stdout } from 'node:process';

// Interactive masked entry: never place the plaintext password in a command argument or shell history.
if (!stdin.isTTY) { throw new Error('Run this command in an interactive terminal.'); }
stdout.write('New workspace password (at least 12 characters): ');
stdin.setRawMode(true);
stdin.resume();
stdin.setEncoding('utf8');
let password = '';
stdin.on('data', async chunk => {
  for (const character of chunk) {
    if (character === '\u0003') { stdin.setRawMode(false); process.exit(130); }
    if (character === '\r' || character === '\n') {
      stdin.setRawMode(false); stdin.pause(); stdout.write('\n');
      if (password.length < 12 || password.length > 256) { process.stderr.write('Use 12–256 characters.\n'); process.exitCode = 1; return; }
      const hash = await argon2.hash(password, { type: argon2.argon2id, memoryCost: 65536, timeCost: 3, parallelism: 1 });
      password = '';
      stdout.write(`Paste this into the ignored .env file (base64-encoded Argon2id hash):\nFREELANCER_PASSWORD_HASH='${Buffer.from(hash).toString('base64')}'\n`);
      return;
    }
    if (character === '\u007f' || character === '\b') { if (password.length) { password = password.slice(0, -1); stdout.write('\b \b'); } }
    else if (character >= ' ' && password.length < 256) { password += character; stdout.write('*'); }
  }
});
