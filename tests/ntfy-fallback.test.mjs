// tests/ntfy-fallback.test.mjs — ntfy.fallbackServer: when the main server
// fails, the same message goes once to the fallback, with the same topic. Real
// local HTTP servers, no mocking.
import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { sendNtfy } from '../src/ntfy.mjs';
import { readRecentHookErrors } from '../src/error-log.mjs';
import { useFakeHome } from './fake-home.mjs';
useFakeHome();

function startServer() {
  const s = { hits: [], status: 200 };
  return new Promise((resolve) => {
    s.server = http.createServer((req, res) => {
      let body = '';
      req.on('data', (c) => { body += c; });
      req.on('end', () => {
        s.hits.push({ url: req.url, title: req.headers.title, body });
        res.statusCode = s.status;
        res.end('ok');
      });
    });
    s.server.listen(0, '127.0.0.1', () => {
      s.base = `http://127.0.0.1:${s.server.address().port}`;
      resolve(s);
    });
  });
}

describe('sendNtfy with ntfy.fallbackServer', () => {
  let main;
  let backup;
  const msg = { title: 'Claude Code', message: 'app: needs input', priority: 'urgent' };

  before(async () => { main = await startServer(); backup = await startServer(); });
  after(() => Promise.all([main, backup].map((s) => new Promise((r) => s.server.close(r)))));
  beforeEach(() => { main.hits = []; backup.hits = []; main.status = 200; backup.status = 200; });

  it('a healthy main server is used alone; the fallback is never called', async () => {
    const ok = await sendNtfy({ server: main.base, fallbackServer: backup.base, topic: 'fleet' }, msg);
    assert.equal(ok, true);
    assert.equal(main.hits.length, 1);
    assert.equal(backup.hits.length, 0);
  });

  it('a main server answering 429 sends the same message to the fallback, same topic', async () => {
    main.status = 429;
    const ok = await sendNtfy({ server: main.base, fallbackServer: backup.base, topic: 'fleet' }, msg);
    assert.equal(ok, true);
    assert.equal(main.hits.length, 1);
    assert.equal(backup.hits.length, 1);
    assert.equal(backup.hits[0].url, '/fleet');
    assert.equal(backup.hits[0].body, msg.message);
    assert.equal(backup.hits[0].title, msg.title);
  });

  it('an unreachable main server falls back too', async () => {
    const ok = await sendNtfy({ server: 'http://127.0.0.1:9', fallbackServer: backup.base, topic: 'fleet' }, msg);
    assert.equal(ok, true);
    assert.equal(backup.hits.length, 1);
  });

  it('both failing resolves false and logs the fallback failure under its own context', async () => {
    main.status = 500;
    backup.status = 503;
    const before = readRecentHookErrors(200).filter((e) => e.context === 'ntfy:fallback').length;
    const ok = await sendNtfy({ server: main.base, fallbackServer: backup.base, topic: 'fleet' }, msg);
    assert.equal(ok, false);
    assert.equal(backup.hits.length, 1, 'the fallback is tried exactly once');
    assert.equal(readRecentHookErrors(200).filter((e) => e.context === 'ntfy:fallback').length, before + 1);
  });

  it('a fallback equal to the main server (trailing slash aside) is not tried twice', async () => {
    main.status = 500;
    const ok = await sendNtfy({ server: main.base, fallbackServer: `${main.base}/`, topic: 'fleet' }, msg);
    assert.equal(ok, false);
    assert.equal(main.hits.length, 1);
  });

  it('no fallback configured keeps the old single-send behaviour', async () => {
    main.status = 429;
    const ok = await sendNtfy({ server: main.base, topic: 'fleet' }, msg);
    assert.equal(ok, false);
    assert.equal(main.hits.length, 1);
    assert.equal(backup.hits.length, 0);
  });

  it('no topic sends nothing to either server', async () => {
    const ok = await sendNtfy({ server: main.base, fallbackServer: backup.base, topic: '' }, msg);
    assert.equal(ok, false);
    assert.equal(main.hits.length + backup.hits.length, 0);
  });
});
