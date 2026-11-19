// tests/update-check.test.mjs — the cached update check (CL-04/CL-11).
// The cache logic takes its network as an injected function; fetchLatest itself
// is exercised against real local servers. Nothing here reaches the internet.
import { describe, it, before, after, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import path from 'node:path';
import os from 'node:os';
import { resolveUpdate, fetchLatest, REGISTRY_URL, UPDATE_TTL_MS, isNewer } from '../src/update-check.mjs';
import { useFakeHome } from './fake-home.mjs';

// An unreadable cache is logged to errors.log under the home directory.
useFakeHome();

const tmpDir = path.join(os.tmpdir(), 'update-check-test-' + Date.now());
const cachePath = () => path.join(tmpDir, `.update-check-${Math.random().toString(36).slice(2)}.json`);

describe('resolveUpdate caching', () => {
  beforeEach(() => fs.mkdirSync(tmpDir, { recursive: true }));
  afterEach(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

  it('fetches and persists the result when no cache exists', async () => {
    const cp = cachePath();
    let calls = 0;
    const res = await resolveUpdate(cp, async () => { calls++; return '9.9.9'; }, 1_000_000);
    assert.equal(res, '9.9.9');
    assert.equal(calls, 1);
    const cached = JSON.parse(fs.readFileSync(cp, 'utf8'));
    assert.equal(cached.latest, '9.9.9');
    assert.equal(cached.checkedAt, 1_000_000);
  });

  it('serves a fresh cache without touching the network', async () => {
    const cp = cachePath();
    fs.writeFileSync(cp, JSON.stringify({ checkedAt: 1000, latest: '8.8.8' }));
    let calls = 0;
    const res = await resolveUpdate(cp, async () => { calls++; return '9.9.9'; }, 1000 + UPDATE_TTL_MS - 1);
    assert.equal(res, '8.8.8');
    assert.equal(calls, 0);
  });

  it('re-fetches once the TTL has expired', async () => {
    const cp = cachePath();
    fs.writeFileSync(cp, JSON.stringify({ checkedAt: 1000, latest: '8.8.8' }));
    let calls = 0;
    const res = await resolveUpdate(cp, async () => { calls++; return '9.9.9'; }, 1000 + UPDATE_TTL_MS + 1);
    assert.equal(res, '9.9.9');
    assert.equal(calls, 1);
  });

  it('caches the attempt time even when the check fails (offline stays quiet)', async () => {
    const cp = cachePath();
    const res = await resolveUpdate(cp, async () => { throw new Error('offline'); }, 5000);
    assert.equal(res, null);
    const cached = JSON.parse(fs.readFileSync(cp, 'utf8'));
    assert.equal(cached.checkedAt, 5000);
    assert.equal(cached.latest, null);
  });

  it('preserves lastNotifiedVersion, which the hook path owns in the same file', async () => {
    // A CLI-side check must not wipe the hook's "already told them" marker, or
    // the next hook run would re-announce a version the user has already seen.
    const cp = cachePath();
    fs.writeFileSync(cp, JSON.stringify({ checkedAt: 1000, latest: '9.9.9', lastNotifiedVersion: '9.9.9' }));
    await resolveUpdate(cp, async () => '9.9.9', 1000 + UPDATE_TTL_MS + 1);
    const cached = JSON.parse(fs.readFileSync(cp, 'utf8'));
    assert.equal(cached.lastNotifiedVersion, '9.9.9');
  });
});

describe('resolveUpdate cache file handling', () => {
  let dir;
  let cp;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aan-update-cache-'));
    cp = path.join(dir, '.update-check.json');
  });
  afterEach(() => { mock.restoreAll(); fs.rmSync(dir, { recursive: true, force: true }); });

  it('writes the cache atomically: a failed rename leaves the previous file intact', async () => {
    const stored = JSON.stringify({ checkedAt: 1000, latest: '8.8.8', lastNotifiedVersion: '8.8.8' });
    fs.writeFileSync(cp, stored);
    mock.method(fs, 'renameSync', () => { throw Object.assign(new Error('EPERM'), { code: 'EPERM' }); });
    const res = await resolveUpdate(cp, async () => '9.9.9', 1000 + UPDATE_TTL_MS + 1);
    mock.restoreAll();
    assert.equal(res, '9.9.9', 'the check itself still answers');
    assert.equal(fs.readFileSync(cp, 'utf8'), stored, 'never a half-written or truncated cache');
  });

  it('leaves no temp file behind after a normal write', async () => {
    await resolveUpdate(cp, async () => '9.9.9', 1000);
    assert.deepEqual(fs.readdirSync(dir), ['.update-check.json']);
  });

  it('keeps the hook-owned marker and any other key when it refreshes the result', async () => {
    fs.writeFileSync(cp, JSON.stringify({ checkedAt: 1, latest: '9.9.9', lastNotifiedVersion: '9.9.9', other: 7 }));
    await resolveUpdate(cp, async () => '9.9.9', 1 + UPDATE_TTL_MS + 1);
    assert.deepEqual(JSON.parse(fs.readFileSync(cp, 'utf8')), {
      checkedAt: 1 + UPDATE_TTL_MS + 1, latest: '9.9.9', lastNotifiedVersion: '9.9.9', other: 7,
    });
  });

  for (const code of ['EBUSY', 'EACCES', 'EPERM']) {
    it(`${code} on the read: the answer still comes back, but the file is not rewritten from nothing`, async () => {
      const stored = JSON.stringify({ checkedAt: 1000, latest: '9.9.9', lastNotifiedVersion: '9.9.9' });
      fs.writeFileSync(cp, stored);
      const real = fs.readFileSync;
      mock.method(fs, 'readFileSync', function (p, ...rest) {
        if (p === cp) throw Object.assign(new Error(code), { code });
        return real.call(fs, p, ...rest);
      });
      const res = await resolveUpdate(cp, async () => '9.9.9', 1000 + UPDATE_TTL_MS + 1);
      mock.restoreAll();
      assert.equal(res, '9.9.9');
      assert.equal(fs.readFileSync(cp, 'utf8'), stored, 'lastNotifiedVersion survives');
    });
  }
});

// fetchLatest against real local servers: what it asks for, what it makes of each
// answer, and that its timeout is one overall deadline (a server that trickles
// bytes must not hold the hook past it).
describe('fetchLatest', () => {
  let server;
  let base;
  let last;
  let reply;
  const sockets = new Set();
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  before(async () => {
    server = http.createServer((req, res) => {
      last = { method: req.method, url: req.url, headers: req.headers };
      res.writeHead(reply.status, reply.headers || {});
      res.end(reply.body);
    });
    server.on('connection', (s) => { sockets.add(s); s.on('close', () => sockets.delete(s)); });
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    base = `http://127.0.0.1:${server.address().port}/anotifier/latest`;
  });
  after(() => new Promise((r) => { server.closeAllConnections?.(); server.close(r); }));

  const manifest = (version) => JSON.stringify({ name: 'anotifier', version, dist: { tarball: 'x'.repeat(2000) } });
  const fetchFrom = (opts = {}) => fetchLatest({ url: base, currentVersion: '1.8.0', timeoutMs: 2000, ...opts });

  it('asks the npm registry for anotifier/latest, over https', () => {
    assert.equal(REGISTRY_URL, 'https://registry.npmjs.org/anotifier/latest');
  });

  it('GETs the URL with no body and one-shot connection, and returns a strictly newer version', async () => {
    reply = { status: 200, body: manifest('1.9.0') };
    assert.equal(await fetchFrom(), '1.9.0');
    assert.equal(last.method, 'GET');
    assert.equal(last.url, '/anotifier/latest');
    assert.equal(last.headers.connection, 'close', 'agent: false, never a keep-alive socket');
    assert.equal(last.headers['content-length'], undefined);
  });

  it('returns null for the same version and for an older one', async () => {
    reply = { status: 200, body: manifest('1.8.0') };
    assert.equal(await fetchFrom(), null);
    reply = { status: 200, body: manifest('1.7.1') };
    assert.equal(await fetchFrom(), null);
  });

  it('compares numerically, not as strings (1.10.0 is newer than 1.9.0)', async () => {
    reply = { status: 200, body: manifest('1.10.0') };
    assert.equal(await fetchFrom({ currentVersion: '1.9.0' }), '1.10.0');
  });

  it('returns null for a non-2xx answer, even one whose body names a newer version', async () => {
    for (const status of [301, 404, 429, 500, 503]) {
      reply = { status, body: manifest('9.9.9') };
      assert.equal(await fetchFrom(), null, String(status));
    }
  });

  it('returns null for a body that is not a manifest', async () => {
    for (const body of ['', 'not json', 'null', '7', '[]', '{}', '{"version":null}', '{"version":""}', '<html>captive portal</html>']) {
      reply = { status: 200, body };
      assert.equal(await fetchFrom(), null, JSON.stringify(body));
    }
  });

  it('returns null when the connection is refused, and never throws', async () => {
    const closed = await new Promise((resolve) => {
      const s = net.createServer();
      s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => resolve(port)); });
    });
    assert.equal(await fetchLatest({ url: `http://127.0.0.1:${closed}/`, timeoutMs: 2000 }), null);
    assert.equal(await fetchLatest({ url: 'not a url', timeoutMs: 2000 }), null);
    assert.equal(await fetchLatest({ url: 'ftp://127.0.0.1/x', timeoutMs: 2000 }), null);
  });

  it('gives up at the deadline on a server that never answers, and closes its socket', async () => {
    const sink = net.createServer((s) => { s.on('error', () => {}); s.resume(); });
    await new Promise((r) => sink.listen(0, '127.0.0.1', r));
    try {
      const started = Date.now();
      assert.equal(await fetchLatest({ url: `http://127.0.0.1:${sink.address().port}/`, timeoutMs: 150 }), null);
      const elapsed = Date.now() - started;
      assert.ok(elapsed >= 140 && elapsed < 2500, `took ${elapsed} ms`);
    } finally {
      await new Promise((r) => sink.close(r));
    }
  });

  // The old socket idle timeout never fired against these: every byte arrived well
  // inside the idle window, so the request ran until the server chose to stop.
  it('slow-drip body: cut at the overall deadline, not when the server finishes', async () => {
    const payload = manifest('9.9.9');
    const srv = net.createServer((s) => {
      s.on('error', () => {});
      s.resume();
      s.write(`HTTP/1.1 200 OK\r\nContent-Length: ${Buffer.byteLength(payload)}\r\n\r\n`);
      let i = 0;
      const t = setInterval(() => {
        if (i >= payload.length) { clearInterval(t); s.end(); return; }
        s.write(payload[i++]);
      }, 4);
      s.on('close', () => clearInterval(t));
    });
    await new Promise((r) => srv.listen(0, '127.0.0.1', r));
    try {
      // Dripping 1 byte / 4 ms the ~2 KB body would take about 8 s to finish.
      const started = Date.now();
      assert.equal(await fetchLatest({ url: `http://127.0.0.1:${srv.address().port}/`, currentVersion: '1.8.0', timeoutMs: 250 }), null);
      const elapsed = Date.now() - started;
      assert.ok(elapsed >= 240 && elapsed < 2500, `cut at the deadline, took ${elapsed} ms`);
    } finally {
      await new Promise((r) => srv.close(r));
    }
  });

  it('slow-drip headers: cut at the overall deadline too', async () => {
    const srv = net.createServer((s) => {
      s.on('error', () => {});
      s.resume();
      s.write('HTTP/1.1 200 OK\r\n');
      const t = setInterval(() => s.write('X-Drip: 1\r\n'), 20);
      s.on('close', () => clearInterval(t));
    });
    await new Promise((r) => srv.listen(0, '127.0.0.1', r));
    try {
      const started = Date.now();
      assert.equal(await fetchLatest({ url: `http://127.0.0.1:${srv.address().port}/`, timeoutMs: 250 }), null);
      const elapsed = Date.now() - started;
      assert.ok(elapsed >= 240 && elapsed < 2500, `cut at the deadline, took ${elapsed} ms`);
    } finally {
      await new Promise((r) => srv.close(r));
    }
  });

  it('a connection reset mid-body is null, not a hang', async () => {
    const srv = net.createServer((s) => {
      s.on('error', () => {});
      s.resume();
      s.write('HTTP/1.1 200 OK\r\nContent-Length: 500\r\n\r\n{"version":');
      setTimeout(() => s.destroy(), 30);
    });
    await new Promise((r) => srv.listen(0, '127.0.0.1', r));
    try {
      assert.equal(await fetchLatest({ url: `http://127.0.0.1:${srv.address().port}/`, timeoutMs: 2000 }), null);
    } finally {
      await new Promise((r) => srv.close(r));
    }
  });

  it('an enormous body is refused, not buffered', async () => {
    reply = { status: 200, body: JSON.stringify({ version: '9.9.9', pad: 'x'.repeat(2 * 1024 * 1024) }) };
    assert.equal(await fetchFrom({ timeoutMs: 5000 }), null);
  });

  it('keeps nothing alive afterwards: the server sees every connection closed', async () => {
    reply = { status: 200, body: manifest('1.9.0') };
    await fetchFrom();
    const until = Date.now() + 1500;
    while (sockets.size > 0 && Date.now() < until) await sleep(20);
    assert.equal(sockets.size, 0);
  });
});

describe('isNewer — semver "should we nag?" gate', () => {
  it('true only when strictly newer, field-by-field numeric (1.10.0 > 1.9.0)', () => {
    assert.equal(isNewer('1.10.0', '1.9.0'), true);
    assert.equal(isNewer('2.0.0', '1.9.9'), true);
    assert.equal(isNewer('1.2.2', '1.2.1'), true);
  });
  it('false when equal or OLDER — never nags a user to downgrade (repo 1.2.1 vs npm 1.0.6)', () => {
    assert.equal(isNewer('1.2.1', '1.2.1'), false);
    assert.equal(isNewer('1.0.6', '1.2.1'), false);
    assert.equal(isNewer('1.9.0', '1.10.0'), false);
  });
  it('unparseable input is treated as not-newer (stays quiet)', () => {
    assert.equal(isNewer('garbage', '1.2.1'), false);
    assert.equal(isNewer('', '1.2.1'), false);
    assert.equal(isNewer(undefined, '1.2.1'), false);
    assert.equal(isNewer('1.2.1', 'garbage'), true, 'garbage parses to 0.0.0, so anything real beats it');
  });

  it('compares the numeric core of a prerelease, ignoring the tag', () => {
    // Documented contract: pre-release/build metadata is stripped before the
    // compare. npm's `latest` dist-tag points at stable releases, so this only
    // matters for hand-published tags — 1.3.0-beta.1 and 1.3.0 rank EQUAL.
    assert.equal(isNewer('1.3.0-beta.1', '1.2.2'), true);
    assert.equal(isNewer('1.3.0', '1.3.0-beta.1'), false);
    assert.equal(isNewer('1.2.2+build.5', '1.2.2'), false);
  });
});
