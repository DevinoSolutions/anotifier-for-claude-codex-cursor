// tests/sentry.test.mjs — envelope client unit tests. DSN parsing and event
// building are pure and tested directly. The network path is exercised for
// real ONLY when AAN_SENTRY_TEST_DSN is set (same live-gating pattern as
// AAN_TOAST_LIVE in platforms.test.mjs) — there is no mocked transport here.
import { describe, it } from 'node:test';
import http from 'node:http';
import net from 'node:net';
import assert from 'node:assert/strict';
import { parseSentryDsn, buildErrorEvent, sendSentryErrorEvent, sendSentryEnvelope } from '../src/sentry.mjs';

describe('parseSentryDsn', () => {
  it('extracts envelope URL and public key from a valid DSN', () => {
    const dsn = parseSentryDsn('https://abc123@sentry.example.com/42');
    assert.equal(dsn.envelopeUrl, 'https://sentry.example.com/api/42/envelope/');
    assert.equal(dsn.publicKey, 'abc123');
  });

  it('returns null for malformed DSNs', () => {
    assert.equal(parseSentryDsn(''), null);
    assert.equal(parseSentryDsn('not a url'), null);
    assert.equal(parseSentryDsn('https://sentry.example.com/42'), null); // no key
    assert.equal(parseSentryDsn('https://key@sentry.example.com/'), null); // no project
    assert.equal(parseSentryDsn('https://key@sentry.example.com/abc'), null); // non-numeric project
  });
});

describe('buildErrorEvent', () => {
  it('builds a minimal valid Sentry event', () => {
    const err = new Error('kaboom');
    err.name = 'TestError';
    const event = buildErrorEvent({ context: 'toast:windows', error: err, extra: { a: 1 } });
    assert.match(event.event_id, /^[0-9a-f]{32}$/);
    assert.equal(event.platform, 'node');
    assert.equal(event.level, 'error');
    assert.equal(event.logger, 'toast:windows');
    assert.match(event.release, /^anotifier@\d+\.\d+\.\d+$/);
    assert.deepEqual(event.tags, { context: 'toast:windows' });
    assert.equal(event.exception.values[0].type, 'TestError');
    assert.equal(event.exception.values[0].value, 'kaboom');
    assert.equal(event.extra.a, 1);
    assert.ok(event.extra.stack.includes('kaboom'));
  });

  it('copes with non-Error inputs', () => {
    const event = buildErrorEvent({ context: 'hook', error: 'string failure' });
    assert.equal(event.exception.values[0].type, 'Error');
    assert.equal(event.exception.values[0].value, 'string failure');
  });
});

describe('sendSentryErrorEvent', () => {
  it('resolves false without touching the network when the DSN is invalid', async () => {
    const ok = await sendSentryErrorEvent({ enabled: true, dsn: 'garbage' }, { context: 'x', error: new Error('y') });
    assert.equal(ok, false);
    const r = await sendSentryEnvelope({ enabled: true, dsn: 'garbage' }, { context: 'x', error: new Error('y') });
    assert.deepEqual(r, { ok: false, status: 0 }, 'status 0 = no server response was obtained');
  });

  it('reports status 0 (not a throw) when the host is unreachable', async () => {
    // Port 1 on loopback: connection refused immediately, no HTTP response.
    const r = await sendSentryEnvelope({ enabled: true, dsn: 'http://k@127.0.0.1:1/7' }, { context: 'x', error: new Error('y') });
    assert.deepEqual(r, { ok: false, status: 0 });
  });

  it('resolves timedOut: true when the server never answers', async () => {
    const sockets = new Set();
    const server = http.createServer(() => { /* never respond */ });
    server.on('connection', (s) => { sockets.add(s); s.on('close', () => sockets.delete(s)); });
    await new Promise((res) => server.listen(0, '127.0.0.1', res));
    try {
      const { port } = server.address();
      const t0 = Date.now();
      const r = await sendSentryEnvelope(
        { enabled: true, dsn: `http://k@127.0.0.1:${port}/7` },
        { context: 'x', error: new Error('y') },
        { timeoutMs: 100 },
      );
      assert.deepEqual(r, { ok: false, status: 0, timedOut: true });
      assert.ok(Date.now() - t0 < 3000, 'resolved promptly after the timeout');
    } finally {
      for (const s of sockets) s.destroy();
      await new Promise((res) => server.close(res));
    }
  });

  // B4: timeoutMs is an overall deadline, not a socket idle timeout. Each server
  // below sends a byte every 40 ms, so an idle timer never fires: with the old
  // socket `timeout` option these resolved { ok: true, status: 200 } after the
  // server finished (1.2 s), long past the 200 ms the caller allowed.
  for (const [name, serve] of [
    ['response headers', (sock) => {
      sock.write('HTTP/1.1 200 OK\r\n');
      return { drip: () => sock.write('X-Drip: 1\r\n'), end: () => sock.end('\r\n') };
    }],
    ['the response body', (sock) => {
      sock.write('HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\n\r\n');
      return { drip: () => sock.write('1\r\nx\r\n'), end: () => sock.end('0\r\n\r\n') };
    }],
  ]) {
    it(`cuts a server that drips ${name} faster than the idle timeout`, async () => {
      const sockets = new Set();
      const drip = net.createServer((sock) => {
        sockets.add(sock);
        sock.on('error', () => {});
        const { drip: step, end } = serve(sock);
        const dripper = setInterval(step, 40);
        const finish = setTimeout(() => { clearInterval(dripper); end(); }, 1200);
        sock.on('close', () => { sockets.delete(sock); clearInterval(dripper); clearTimeout(finish); });
      });
      await new Promise((res) => drip.listen(0, '127.0.0.1', res));
      try {
        const started = Date.now();
        const r = await sendSentryEnvelope(
          { enabled: true, dsn: `http://k@127.0.0.1:${drip.address().port}/7` },
          { context: 'x', error: new Error('y') },
          { timeoutMs: 200 },
        );
        const elapsed = Date.now() - started;
        assert.deepEqual(r, { ok: false, status: 0, timedOut: true });
        // The server would only finish at 1200 ms, which is what the old code reported.
        assert.ok(elapsed >= 190 && elapsed < 1100, `took ${elapsed} ms, expected the 200 ms deadline`);
        for (let i = 0; i < 50 && sockets.size > 0; i++) await new Promise((res) => setTimeout(res, 20));
        assert.equal(sockets.size, 0, 'the server side of the connection was closed');
      } finally {
        for (const s of sockets) s.destroy();
        await new Promise((res) => drip.close(res));
      }
    });
  }

  it('resolves status 0 (not a hang) when the connection is reset mid-body', async () => {
    const sockets = new Set();
    const server = net.createServer((sock) => {
      sockets.add(sock);
      sock.on('error', () => {});
      sock.write('HTTP/1.1 200 OK\r\nContent-Length: 30\r\n\r\nabc');
      setTimeout(() => sock.destroy(), 30);
    });
    await new Promise((res) => server.listen(0, '127.0.0.1', res));
    try {
      const r = await sendSentryEnvelope(
        { enabled: true, dsn: `http://k@127.0.0.1:${server.address().port}/7` },
        { context: 'x', error: new Error('y') },
        { timeoutMs: 5000 },
      );
      assert.deepEqual(r, { ok: false, status: 0 });
    } finally {
      for (const s of sockets) s.destroy();
      await new Promise((res) => server.close(res));
    }
  });

  it('resolves status 0 (not a rejection) for a DSN whose protocol is not http(s)', async () => {
    const r = await sendSentryEnvelope({ enabled: true, dsn: 'ftp://k@127.0.0.1/7' }, { context: 'x', error: new Error('y') });
    assert.deepEqual(r, { ok: false, status: 0 });
  });

  // Live delivery proof. Four honest outcomes, never a fake pass:
  //   2xx → PASS: our envelope was accepted end to end.
  //   5xx → SKIP, loudly: the server answered but is refusing ingestion (e.g.
  //         Relay "envelope buffer does not have capacity" during an outage).
  //         The client did its job and there is nothing here to prove or
  //         disprove — failing would pin a package release to infra health.
  //   timeout (no answer within 10 s) → SKIP, loudly: runner network latency,
  //         not a client bug; delivery is unverifiable right now.
  //   anything else (4xx, status 0 without a timeout) → FAIL: bad DSN/auth,
  //         malformed envelope, or our transport could not connect to a server
  //         that a browser can reach — a real bug.
  const liveDsn = process.env.AAN_SENTRY_TEST_DSN;
  it('delivers a real event to a real Sentry project (live — set AAN_SENTRY_TEST_DSN)', { skip: !liveDsn }, async (t) => {
    const r = await sendSentryEnvelope(
      { enabled: true, dsn: liveDsn },
      { context: 'ci-live-test', error: new Error('sentry.test.mjs live delivery check (safe to resolve)') },
      { timeoutMs: 10000 },
    );
    if (r.timedOut) {
      t.skip('Sentry did not answer within 10 s — network latency, delivery unverifiable right now');
      return;
    }
    if (r.status >= 500) {
      t.skip(`Sentry server answered ${r.status} — server-side outage, delivery unverifiable right now`);
      return;
    }
    assert.equal(r.ok, true, `expected 2xx from Sentry, got status ${r.status}`);
  });
});
