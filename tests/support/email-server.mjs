// Test-only HTTP email provider. It is never imported by application/runtime code. It records the
// messages the app's email adapter posts so browser/API tests can read the emailed proposal link,
// and injects failures for recipients containing markers so delivery error paths can be exercised.
import http from 'node:http';
export function startTestEmailServer(port = 3198) {
  const inbox = [];
  const attempts = new Map();
  const server = http.createServer(async (req, res) => {
    if (req.method === 'POST' && req.url === '/emails') {
      const chunks = []; for await (const chunk of req) chunks.push(chunk);
      const body = JSON.parse(Buffer.concat(chunks).toString());
      const to = typeof body.to === 'string' ? body.to : '';
      if (to.includes('outage')) { res.writeHead(503).end('{}'); return; }
      if (to.includes('ratelimit')) { res.writeHead(429).end('{}'); return; }
      // "flaky" recipients fail the first delivery attempt then succeed, to exercise retry-after-failure.
      const count = (attempts.get(to) ?? 0) + 1; attempts.set(to, count);
      if (to.includes('flaky') && count === 1) { res.writeHead(503).end('{}'); return; }
      inbox.push({ ...body, receivedAt: Date.now() });
      res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ id: `test-msg-${inbox.length}` }));
      return;
    }
    if (req.method === 'GET' && req.url.startsWith('/inbox')) {
      const to = new URL(req.url, 'http://127.0.0.1').searchParams.get('to');
      res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(inbox.filter(message => !to || message.to === to)));
      return;
    }
    res.writeHead(404).end();
  });
  return new Promise(resolve => server.listen(port, '127.0.0.1', () => resolve(server)));
}
