// tests/http.test.mjs — src/http.mjs, the shared one-deadline HTTP helper, against
// real local servers (no mocking, no network): what it sends, what it resolves
// for each way a request can end, and that the deadline is overall.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { httpRequest, MAX_COLLECTED_BODY_BYTES } from '../src/http.mjs';

// A loopback port that was just free: bind port 0, note it, close it.
function closedPort() {
  return new Promise((resolve) => {
    const s = net.createServer();
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address();
      s.close(() => resolve(port));
    });
  });
}

// A raw TCP server. `onConnection(sock)` decides what to send; every socket is
// tracked so the test can assert the client closed it and tear down cleanly.
function rawServer(onConnection) {
  const sockets = new Set();
  const server = net.createServer((sock) => {
    sockets.add(sock);
    sock.on('error', () => {});
    sock.on('close', () => sockets.delete(sock));
    sock.resume(); // read (and discard) the request so the client closing is noticed
    onConnection(sock);
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve({
      server,
      sockets,
      port: server.address().port,
      url: `http://127.0.0.1:${server.address().port}/`,
      close: () => new Promise((r) => { for (const s of sockets) s.destroy(); server.close(r); }),
    }));
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Wait (up to `ms`) for the server to see exactly `count` open sockets, so a
// slow runner delaying the close event cannot fail a test that is about the
// socket eventually being destroyed. A leaked socket still never reaches 0.
async function waitForSockets(srv, count, ms = 1500) {
  const until = Date.now() + ms;
  while (srv.sockets.size !== count && Date.now() < until) await sleep(20);
}
const OK_HEAD = 'HTTP/1.1 200 OK\r\n';

describe('httpRequest against a normal server', () => {
  let server;
  let base;
  let last;
  let reply = { status: 200, headers: {}, body: 'ok' };

  before(async () => {
    server = http.createServer((req, res) => {
      const chunks = [];
      req.on('data', (c) => chunks.push(c));
      req.on('end', () => {
        last = { method: req.method, url: req.url, headers: req.headers, body: Buffer.concat(chunks).toString('utf8') };
        res.writeHead(reply.status, reply.headers);
        res.end(reply.body);
      });
    });
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    base = `http://127.0.0.1:${server.address().port}`;
  });
  after(() => new Promise((r) => { server.closeAllConnections?.(); server.close(r); }));

  it('sends the method, path, headers and body it was given and resolves the status', async () => {
    reply = { status: 200, headers: {}, body: 'ok' };
    const res = await httpRequest(`${base}/some/path?x=1`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain; charset=utf-8', Authorization: 'Bearer s3', Title: 'T' },
      body: 'héllo',
      timeoutMs: 2000,
    });
    assert.deepEqual(res, { status: 200, timedOut: false, error: null, setupError: false });
    assert.equal(last.method, 'POST');
    assert.equal(last.url, '/some/path?x=1');
    assert.equal(last.headers['content-type'], 'text/plain; charset=utf-8');
    assert.equal(last.headers.authorization, 'Bearer s3');
    assert.equal(last.headers.title, 'T');
    assert.equal(last.body, 'héllo');
  });

  it('defaults to GET with no body, and accepts a URL object', async () => {
    const res = await httpRequest(new URL(`${base}/g`), { timeoutMs: 2000 });
    assert.equal(res.status, 200);
    assert.equal(last.method, 'GET');
    assert.equal(last.body, '');
  });

  it('asks for a one-shot connection (agent: false), never a keep-alive socket', async () => {
    await httpRequest(`${base}/`, { method: 'POST', body: 'x', timeoutMs: 2000 });
    assert.equal(last.headers.connection, 'close');
  });

  it('returns a non-2xx status as a status, not an error', async () => {
    for (const status of [400, 404, 429, 500, 503]) {
      reply = { status, headers: {}, body: 'no' };
      assert.deepEqual(await httpRequest(base, { method: 'POST', body: 'x', timeoutMs: 2000 }), { status, timedOut: false, error: null, setupError: false });
    }
  });

  it('does not follow a redirect: a 3xx is the answer', async () => {
    reply = { status: 302, headers: { Location: `${base}/elsewhere` }, body: '' };
    last = null;
    const res = await httpRequest(`${base}/start`, { method: 'POST', body: 'x', timeoutMs: 2000 });
    assert.equal(res.status, 302);
    assert.equal(last.url, '/start');
    reply = { status: 200, headers: {}, body: 'ok' };
  });

  it('waitForBody resolves the same status once the body is read', async () => {
    reply = { status: 201, headers: {}, body: 'y'.repeat(50000) };
    const res = await httpRequest(base, { method: 'POST', body: 'x', timeoutMs: 2000, waitForBody: true });
    assert.deepEqual(res, { status: 201, timedOut: false, error: null, setupError: false });
    reply = { status: 200, headers: {}, body: 'ok' };
  });
});

describe('httpRequest failures', () => {
  it('connection refused: status 0 and the network error, not a timeout', async () => {
    const res = await httpRequest(`http://127.0.0.1:${await closedPort()}/`, { method: 'POST', body: 'x', timeoutMs: 2000 });
    assert.equal(res.status, 0);
    assert.equal(res.timedOut, false);
    assert.equal(res.setupError, false);
    assert.equal(res.error.code, 'ECONNREFUSED');
  });

  it('never rejects: unparseable URLs, non-http(s) protocols and bad headers are setup errors', async () => {
    for (const [target, opts] of [
      ['not a url', {}],
      [undefined, {}],
      ['ftp://127.0.0.1/x', { method: 'POST', body: 'x' }],
      ['http://127.0.0.1:1/', { headers: { Authorization: 'Bearer bad\r\nvalue' }, method: 'POST', body: 'x' }],
    ]) {
      const res = await httpRequest(target, { timeoutMs: 1000, ...opts });
      assert.equal(res.status, 0, String(target));
      assert.equal(res.setupError, true, String(target));
      assert.equal(res.timedOut, false, String(target));
      assert.ok(res.error instanceof Error, String(target));
    }
  });

  it('a setup error on a bad header never reaches the network', async () => {
    let hits = 0;
    const srv = await rawServer(() => { hits += 1; });
    try {
      await httpRequest(srv.url, { method: 'POST', headers: { Authorization: 'a\r\nb' }, body: 'x', timeoutMs: 1000 });
      await sleep(50);
      assert.equal(hits, 0);
    } finally {
      await srv.close();
    }
  });

  it('deadline while waiting for headers: timedOut, no error, and the socket is destroyed', async () => {
    const srv = await rawServer(() => { /* accept, never answer */ });
    try {
      const started = Date.now();
      const res = await httpRequest(srv.url, { method: 'POST', body: 'x', timeoutMs: 150 });
      const elapsed = Date.now() - started;
      assert.deepEqual(res, { status: 0, timedOut: true, error: null, setupError: false });
      assert.ok(elapsed >= 140 && elapsed < 2500, `took ${elapsed} ms`);
      await waitForSockets(srv, 0);
      assert.equal(srv.sockets.size, 0, 'the client closed its end');
    } finally {
      await srv.close();
    }
  });

  it('deadline during connect/handshake: https to a server that never answers the TLS hello', async () => {
    let firstBytes = null;
    const srv = await rawServer((sock) => { sock.once('data', (d) => { firstBytes = d; }); });
    try {
      const started = Date.now();
      const res = await httpRequest(`https://127.0.0.1:${srv.port}/`, { method: 'POST', body: 'x', timeoutMs: 150 });
      assert.deepEqual(res, { status: 0, timedOut: true, error: null, setupError: false });
      assert.ok(Date.now() - started < 2500);
      // https was chosen from the scheme: a TLS ClientHello (0x16 0x03), not an HTTP request line.
      assert.ok(firstBytes, 'server saw bytes');
      assert.equal(firstBytes[0], 0x16);
      assert.equal(firstBytes[1], 0x03);
    } finally {
      await srv.close();
    }
  });

  it('http is chosen for an http:// URL: the server sees an HTTP request line', async () => {
    let firstLine = null;
    const srv = await rawServer((sock) => {
      sock.once('data', (d) => { firstLine = d.toString('latin1').split('\r\n')[0]; sock.end(`${OK_HEAD}Content-Length: 0\r\n\r\n`); });
    });
    try {
      const res = await httpRequest(srv.url, { method: 'POST', body: 'x', timeoutMs: 2000 });
      assert.equal(res.status, 200);
      assert.equal(firstLine, 'POST / HTTP/1.1');
    } finally {
      await srv.close();
    }
  });

  it('deadline against headers that drip faster than any idle timeout', async () => {
    const srv = await rawServer((sock) => {
      sock.write(OK_HEAD);
      const t = setInterval(() => sock.write('X-Drip: 1\r\n'), 30);
      sock.on('close', () => clearInterval(t));
    });
    try {
      const started = Date.now();
      const res = await httpRequest(srv.url, { method: 'POST', body: 'x', timeoutMs: 200 });
      const elapsed = Date.now() - started;
      assert.equal(res.timedOut, true);
      assert.equal(res.status, 0);
      assert.ok(elapsed >= 190 && elapsed < 2500, `took ${elapsed} ms`);
      await waitForSockets(srv, 0);
      assert.equal(srv.sockets.size, 0);
    } finally {
      await srv.close();
    }
  });

  it('deadline during the body (waitForBody): timedOut, status 0, socket destroyed', async () => {
    const srv = await rawServer((sock) => {
      sock.write(`${OK_HEAD}Transfer-Encoding: chunked\r\n\r\n`);
      const t = setInterval(() => sock.write('1\r\nx\r\n'), 30);
      sock.on('close', () => clearInterval(t));
    });
    try {
      const started = Date.now();
      const res = await httpRequest(srv.url, { method: 'POST', body: 'x', timeoutMs: 200, waitForBody: true });
      const elapsed = Date.now() - started;
      assert.deepEqual(res, { status: 0, timedOut: true, error: null, setupError: false });
      assert.ok(elapsed >= 190 && elapsed < 2500, `took ${elapsed} ms`);
      await waitForSockets(srv, 0);
      assert.equal(srv.sockets.size, 0);
    } finally {
      await srv.close();
    }
  });

  it('without waitForBody a body that never ends does not hold the result, and the deadline still closes the socket', async () => {
    const srv = await rawServer((sock) => {
      sock.write(`${OK_HEAD}Transfer-Encoding: chunked\r\n\r\n`);
      const t = setInterval(() => sock.write('1\r\nx\r\n'), 30);
      sock.on('close', () => clearInterval(t));
    });
    try {
      const started = Date.now();
      const res = await httpRequest(srv.url, { method: 'POST', body: 'x', timeoutMs: 1500 });
      const elapsed = Date.now() - started;
      assert.deepEqual(res, { status: 200, timedOut: false, error: null, setupError: false });
      // A helper that waited for the body would only return at the 1500 ms deadline.
      assert.ok(elapsed < 1000, `resolved at the headers, not at the deadline (took ${elapsed} ms)`);
      assert.equal(srv.sockets.size, 1, 'still draining right after the headers');
      await waitForSockets(srv, 0, 3000);
      assert.equal(srv.sockets.size, 0, 'the deadline destroyed the response');
    } finally {
      await srv.close();
    }
  });

  it('reset mid-body: the status already seen counts without waitForBody, status 0 with it', async () => {
    const srv = await rawServer((sock) => {
      sock.write(`${OK_HEAD}Content-Length: 30\r\n\r\nabc`);
      setTimeout(() => sock.destroy(), 40);
    });
    try {
      assert.equal((await httpRequest(srv.url, { method: 'POST', body: 'x', timeoutMs: 2000 })).status, 200);
      const waited = await httpRequest(srv.url, { method: 'POST', body: 'x', timeoutMs: 2000, waitForBody: true });
      assert.equal(waited.status, 0);
      assert.equal(waited.timedOut, false);
      assert.equal(waited.setupError, false);
      assert.ok(waited.error instanceof Error);
    } finally {
      await srv.close();
    }
  });

  it('reset before any response: status 0 with the network error', async () => {
    const srv = await rawServer((sock) => { sock.once('data', () => sock.destroy()); });
    try {
      const res = await httpRequest(srv.url, { method: 'POST', body: 'x', timeoutMs: 2000 });
      assert.equal(res.status, 0);
      assert.equal(res.timedOut, false);
      assert.ok(res.error instanceof Error);
      assert.equal(res.error.code, 'ECONNRESET');
    } finally {
      await srv.close();
    }
  });
});

// collectBody: the body comes back as a string, and only then. Every other mode's
// result keeps exactly its four keys (the deepEqual assertions above pin that).
describe('httpRequest collectBody', () => {
  let server;
  let base;
  let reply = { status: 200, body: 'ok' };

  before(async () => {
    server = http.createServer((req, res) => {
      req.resume();
      req.on('end', () => { res.writeHead(reply.status); res.end(reply.body); });
    });
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    base = `http://127.0.0.1:${server.address().port}`;
  });
  after(() => new Promise((r) => { server.closeAllConnections?.(); server.close(r); }));

  it('returns the body as a string next to the status', async () => {
    reply = { status: 200, body: JSON.stringify({ version: '1.9.0' }) };
    assert.deepEqual(await httpRequest(base, { timeoutMs: 2000, collectBody: true }), {
      status: 200, timedOut: false, error: null, setupError: false, body: '{"version":"1.9.0"}',
    });
  });

  it('returns the body of a non-2xx answer too, and an empty one as an empty string', async () => {
    reply = { status: 404, body: 'nope' };
    const missing = await httpRequest(base, { timeoutMs: 2000, collectBody: true });
    assert.equal(missing.status, 404);
    assert.equal(missing.body, 'nope');
    reply = { status: 204, body: '' };
    const empty = await httpRequest(base, { timeoutMs: 2000, collectBody: true });
    assert.equal(empty.status, 204);
    assert.equal(empty.body, '');
  });

  it('decodes a multi-byte character that arrives split across chunks', async () => {
    const bytes = Buffer.from('caf\u00e9 \u2014 ok', 'utf8');
    const srv = await rawServer((sock) => {
      sock.write(`${OK_HEAD}Content-Length: ${bytes.length}\r\n\r\n`);
      // Cut inside the two-byte e-acute and inside the three-byte dash.
      sock.write(bytes.subarray(0, 4));
      setTimeout(() => sock.write(bytes.subarray(4, 8)), 30);
      setTimeout(() => sock.end(bytes.subarray(8)), 60);
    });
    try {
      const res = await httpRequest(srv.url, { timeoutMs: 2000, collectBody: true });
      assert.equal(res.status, 200);
      assert.equal(res.body, 'caf\u00e9 \u2014 ok');
    } finally {
      await srv.close();
    }
  });

  it('is implied to wait for the body: a slow body is returned whole, not cut at the headers', async () => {
    const srv = await rawServer((sock) => {
      sock.write(`${OK_HEAD}Content-Length: 6\r\n\r\nabc`);
      setTimeout(() => sock.end('def'), 80);
    });
    try {
      const res = await httpRequest(srv.url, { timeoutMs: 2000, collectBody: true });
      assert.equal(res.body, 'abcdef');
    } finally {
      await srv.close();
    }
  });

  it('a body over the cap resolves status 0 with an error and destroys the socket', async () => {
    const chunk = Buffer.alloc(64 * 1024, 0x78);
    const srv = await rawServer((sock) => {
      sock.write(`${OK_HEAD}Transfer-Encoding: chunked\r\n\r\n`);
      const t = setInterval(() => {
        sock.write(`${chunk.length.toString(16)}\r\n`);
        sock.write(chunk);
        sock.write('\r\n');
      }, 5);
      sock.on('close', () => clearInterval(t));
    });
    try {
      const started = Date.now();
      const res = await httpRequest(srv.url, { timeoutMs: 10000, collectBody: true });
      assert.equal(res.status, 0);
      assert.equal(res.timedOut, false);
      assert.ok(res.error instanceof Error);
      assert.equal('body' in res, false, 'no partial body is handed out');
      assert.ok(Date.now() - started < 5000, 'refused as soon as the cap was crossed, not at the deadline');
      assert.ok(MAX_COLLECTED_BODY_BYTES >= 64 * 1024);
      await waitForSockets(srv, 0);
      assert.equal(srv.sockets.size, 0);
    } finally {
      await srv.close();
    }
  });

  it('a body exactly at the cap is still returned', async () => {
    reply = { status: 200, body: 'y'.repeat(MAX_COLLECTED_BODY_BYTES) };
    const res = await httpRequest(base, { timeoutMs: 5000, collectBody: true });
    assert.equal(res.status, 200);
    assert.equal(res.body.length, MAX_COLLECTED_BODY_BYTES);
  });

  it('deadline during a dripped body: timedOut, no body, socket destroyed', async () => {
    const srv = await rawServer((sock) => {
      sock.write(`${OK_HEAD}Transfer-Encoding: chunked\r\n\r\n`);
      const t = setInterval(() => sock.write('1\r\nx\r\n'), 20);
      sock.on('close', () => clearInterval(t));
    });
    try {
      const started = Date.now();
      const res = await httpRequest(srv.url, { timeoutMs: 200, collectBody: true });
      assert.deepEqual(res, { status: 0, timedOut: true, error: null, setupError: false });
      assert.ok(Date.now() - started < 2500);
      await waitForSockets(srv, 0);
      assert.equal(srv.sockets.size, 0);
    } finally {
      await srv.close();
    }
  });

  it('a reset mid-body is status 0 with an error and no body', async () => {
    const srv = await rawServer((sock) => {
      sock.write(`${OK_HEAD}Content-Length: 30\r\n\r\nabc`);
      setTimeout(() => sock.destroy(), 40);
    });
    try {
      const res = await httpRequest(srv.url, { timeoutMs: 2000, collectBody: true });
      assert.equal(res.status, 0);
      assert.equal(res.timedOut, false);
      assert.ok(res.error instanceof Error);
      assert.equal('body' in res, false);
    } finally {
      await srv.close();
    }
  });

  it('without collectBody the result has no body key, in either mode', async () => {
    reply = { status: 200, body: 'ok' };
    for (const waitForBody of [false, true]) {
      const res = await httpRequest(base, { timeoutMs: 2000, waitForBody });
      assert.deepEqual(Object.keys(res).sort(), ['error', 'setupError', 'status', 'timedOut']);
    }
  });
});

// The helper's timer must not keep a finished process alive: with a 30 s
// deadline a child that made one normal request must still exit right away.
describe('httpRequest and process lifetime', () => {
  for (const waitForBody of [false, true]) {
    it(`a finished request leaves nothing holding the event loop open (waitForBody: ${waitForBody})`, async () => {
      const server = http.createServer((req, res) => { req.resume(); res.end('ok'); });
      await new Promise((r) => server.listen(0, '127.0.0.1', r));
      try {
        const script = `
          import { httpRequest } from ${JSON.stringify(new URL('../src/http.mjs', import.meta.url).href)};
          const res = await httpRequest('http://127.0.0.1:${server.address().port}/', { method: 'POST', body: 'x', timeoutMs: 30000, waitForBody: ${waitForBody} });
          console.log(res.status);
        `;
        const started = Date.now();
        const child = spawn(process.execPath, ['--input-type=module', '-e', script], { stdio: ['ignore', 'pipe', 'inherit'] });
        let out = '';
        child.stdout.on('data', (d) => { out += d; });
        const code = await new Promise((resolve) => child.on('close', resolve));
        assert.equal(code, 0);
        assert.equal(out.trim(), '200');
        assert.ok(Date.now() - started < 10000, 'the child exited long before the 30 s deadline');
      } finally {
        await new Promise((r) => { server.closeAllConnections?.(); server.close(r); });
      }
    });
  }
});
