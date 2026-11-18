// tests/webhook-send.test.mjs — exercises the real sendWebhook() network path
// against a real local HTTP server (no mocking). Covers the no-url short-circuit,
// the exact wire payload for all four formats, the Authorization header, and the
// non-2xx / connection-error / timeout failure branches.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import net from 'node:net';
import { sendWebhook } from '../src/webhook.mjs';
import { runScoped } from '../src/channel-failure.mjs';
import { useFakeHome } from './fake-home.mjs';
useFakeHome();

const NOTIF = {
  title: 'Claude Code',
  message: 'demo: Task complete',
  source: 'claude',
  projectName: 'demo',
  event: 'task_complete',
};

describe('sendWebhook (real local HTTP server, no mocking)', () => {
  let server;
  let base;
  let last = null;
  let statusToReturn = 200;
  let neverRespond = false;
  const sockets = new Set();

  before(async () => {
    await new Promise((resolve) => {
      server = http.createServer((req, res) => {
        let body = '';
        req.on('data', (c) => { body += c; });
        req.on('end', () => {
          last = { method: req.method, url: req.url, headers: req.headers, body };
          if (neverRespond) return; // hold the socket open to trip the client timeout
          res.statusCode = statusToReturn;
          res.end('ok');
        });
      });
      server.on('connection', (s) => sockets.add(s));
      server.listen(0, '127.0.0.1', resolve);
    });
    base = `http://127.0.0.1:${server.address().port}`;
  });

  after(() => new Promise((resolve) => {
    for (const s of sockets) s.destroy();
    server.close(resolve);
  }));

  it('returns false immediately when url is missing (no request sent)', async () => {
    last = null;
    const ok = await sendWebhook({ url: '', format: 'generic' }, NOTIF);
    assert.equal(ok, false);
    assert.equal(last, null, 'no HTTP request should have been made');
  });

  it('generic format: POST + application/json + the canonical JSON body', async () => {
    statusToReturn = 200;
    const ok = await sendWebhook({ url: base, format: 'generic' }, NOTIF);
    assert.equal(ok, true);
    assert.equal(last.method, 'POST');
    assert.match(last.headers['content-type'], /application\/json/);
    const body = JSON.parse(last.body);
    assert.equal(body.title, 'Claude Code');
    assert.equal(body.message, 'demo: Task complete');
    assert.equal(body.source, 'claude');
    assert.equal(body.project, 'demo');
    assert.equal(body.event, 'task_complete');
    assert.equal(typeof body.timestamp, 'string');
    assert.ok(!Number.isNaN(Date.parse(body.timestamp)), 'timestamp is a valid ISO date');
  });

  it('defaults to the generic format when none is set', async () => {
    statusToReturn = 200;
    const ok = await sendWebhook({ url: base }, NOTIF);
    assert.equal(ok, true);
    const body = JSON.parse(last.body);
    assert.equal(body.title, 'Claude Code');
    assert.equal(body.event, 'task_complete');
  });

  it('slack format: { text: "*title*\\nmessage" }', async () => {
    statusToReturn = 200;
    const ok = await sendWebhook({ url: base, format: 'slack' }, NOTIF);
    assert.equal(ok, true);
    assert.deepEqual(JSON.parse(last.body), { text: '*Claude Code*\ndemo: Task complete' });
  });

  it('discord format: { content: "**title**\\nmessage" }', async () => {
    statusToReturn = 200;
    const ok = await sendWebhook({ url: base, format: 'discord' }, NOTIF);
    assert.equal(ok, true);
    assert.deepEqual(JSON.parse(last.body), { content: '**Claude Code**\ndemo: Task complete' });
  });

  it('telegram format: { chat_id, text: "title\\nmessage" }', async () => {
    statusToReturn = 200;
    const ok = await sendWebhook({ url: base, format: 'telegram', chatId: '123456789' }, NOTIF);
    assert.equal(ok, true);
    assert.deepEqual(JSON.parse(last.body), { chat_id: '123456789', text: 'Claude Code\ndemo: Task complete' });
  });

  it('sends the Authorization header when configured', async () => {
    statusToReturn = 200;
    const ok = await sendWebhook({ url: base, format: 'generic', authorization: 'Bearer s3cr3t' }, NOTIF);
    assert.equal(ok, true);
    assert.equal(last.headers.authorization, 'Bearer s3cr3t');
  });

  it('omits the Authorization header when not configured', async () => {
    statusToReturn = 200;
    await sendWebhook({ url: base, format: 'generic' }, NOTIF);
    assert.equal(last.headers.authorization, undefined);
  });

  it('returns false on a 4xx response', async () => {
    statusToReturn = 404;
    const ok = await sendWebhook({ url: base, format: 'generic' }, NOTIF);
    assert.equal(ok, false);
  });

  it('returns false on a 5xx response', async () => {
    statusToReturn = 500;
    const ok = await sendWebhook({ url: base, format: 'generic' }, NOTIF);
    assert.equal(ok, false);
  });

  it('returns false when the server is unreachable (connection refused)', async () => {
    const ok = await sendWebhook({ url: 'http://127.0.0.1:1', format: 'generic' }, NOTIF);
    assert.equal(ok, false);
  });

  it('returns false when the endpoint never responds (timeout)', async () => {
    neverRespond = true;
    const ok = await sendWebhook({ url: base, format: 'generic' }, NOTIF, { timeoutMs: 150 });
    assert.equal(ok, false);
    neverRespond = false;
  });

  // transport.request throws SYNCHRONOUSLY for these two shapes — without the
  // guard in sendWebhook they would REJECT instead of resolving false.
  it('resolves false (never rejects) on a config-valid non-http(s) URL', async () => {
    last = null;
    const ok = await sendWebhook({ url: 'ftp://example.com/hook', format: 'generic' }, NOTIF);
    assert.equal(ok, false);
    assert.equal(last, null, 'no HTTP request should have been made');
  });

  it('resolves false (never rejects) when authorization contains invalid header chars', async () => {
    last = null;
    const ok = await sendWebhook({ url: base, format: 'generic', authorization: 'Bearer bad\r\nvalue' }, NOTIF);
    assert.equal(ok, false);
    assert.equal(last, null, 'no HTTP request should have been made');
  });
});

// B4: the deadline is an overall one, not a socket idle timeout. A server that
// sends a byte every 40 ms never trips an idle timer, so with the old socket
// `timeout` option this request ran until the server gave up (1.2 s here) and
// then reported a success.
describe('sendWebhook overall deadline (slow-drip server)', () => {
  it('cuts a server that drips response headers faster than the idle timeout', async () => {
    const sockets = new Set();
    const drip = net.createServer((sock) => {
      sockets.add(sock);
      sock.on('error', () => {});
      sock.write('HTTP/1.1 200 OK\r\n');
      const dripper = setInterval(() => sock.write('X-Drip: 1\r\n'), 40);
      // It finally ends the headers with a valid 200, which is what the old code reported.
      const finish = setTimeout(() => { clearInterval(dripper); sock.end('\r\n'); }, 1200);
      sock.on('close', () => { sockets.delete(sock); clearInterval(dripper); clearTimeout(finish); });
    });
    await new Promise((r) => drip.listen(0, '127.0.0.1', r));
    try {
      const started = Date.now();
      const run = runScoped(() => sendWebhook({ url: `http://127.0.0.1:${drip.address().port}` }, NOTIF, { timeoutMs: 200 }));
      assert.equal(await run.promise, false);
      const elapsed = Date.now() - started;
      assert.equal(run.reason(), 'timeout');
      assert.ok(elapsed >= 190 && elapsed < 900, `took ${elapsed} ms, expected the 200 ms deadline`);
      // The deadline destroys the socket rather than leaving it dripping.
      await new Promise((r) => setTimeout(r, 100));
      assert.equal(sockets.size, 0, 'the server side of the connection was closed');
    } finally {
      for (const s of sockets) s.destroy();
      await new Promise((r) => drip.close(r));
    }
  });
});
