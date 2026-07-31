// tests/update-notify.test.mjs — the hook-path "a new version is out" notice.
// The registry fetch, the clock, and the state file are all dependency-injected
// so these run fully offline; the channel fan-out is exercised against a real
// local HTTP server (same no-mocking approach as ntfy-send.test.mjs).
import { describe, it, beforeEach, afterEach, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import { maybeNotifyUpdate, sendUpdateNotification, RELEASES_URL, UPGRADE_COMMAND, UPDATE_TTL_MS } from '../src/update-check.mjs';

const NOW = 1_700_000_000_000;
// Every maybeNotifyUpdate case injects this recorder as `notify`, so no test can
// reach a real channel (a default-on toast would spawn a real desktop notification).
const recorder = () => {
  const sent = [];
  return { sent, notify: async (config, info) => { sent.push(info); } };
};

describe('maybeNotifyUpdate', () => {
  let dir;
  let cachePath;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aan-update-notify-'));
    cachePath = path.join(dir, '.update-check.json');
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('notifies once when the registry reports a newer version, and records it', async () => {
    const { sent, notify } = recorder();
    const announced = await maybeNotifyUpdate({}, {
      cachePath, notify, now: NOW, currentVersion: '1.2.2',
      fetchImpl: async () => '1.3.0',
    });
    assert.equal(announced, '1.3.0');
    assert.deepEqual(sent, [{ latest: '1.3.0', currentVersion: '1.2.2' }]);
    const state = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
    assert.equal(state.lastNotifiedVersion, '1.3.0');
    assert.equal(state.checkedAt, NOW);
  });

  it('does not hit the network again within the 24h TTL', async () => {
    const { sent, notify } = recorder();
    let calls = 0;
    const fetchImpl = async () => { calls++; return '1.3.0'; };
    await maybeNotifyUpdate({}, { cachePath, notify, now: NOW, currentVersion: '1.2.2', fetchImpl });
    await maybeNotifyUpdate({}, { cachePath, notify, now: NOW + UPDATE_TTL_MS - 1, currentVersion: '1.2.2', fetchImpl });
    assert.equal(calls, 1, 'second run must be served from the cache');
    assert.equal(sent.length, 1, 'and must not re-notify');
  });

  it('never re-announces the same version, even after the TTL expires', async () => {
    const { sent, notify } = recorder();
    const fetchImpl = async () => '1.3.0';
    await maybeNotifyUpdate({}, { cachePath, notify, now: NOW, currentVersion: '1.2.2', fetchImpl });
    await maybeNotifyUpdate({}, { cachePath, notify, now: NOW + UPDATE_TTL_MS + 1, currentVersion: '1.2.2', fetchImpl });
    assert.equal(sent.length, 1, 'lastNotifiedVersion suppresses the repeat');
  });

  it('announces again once a NEWER version is published', async () => {
    const { sent, notify } = recorder();
    await maybeNotifyUpdate({}, { cachePath, notify, now: NOW, currentVersion: '1.2.2', fetchImpl: async () => '1.3.0' });
    await maybeNotifyUpdate({}, {
      cachePath, notify, now: NOW + UPDATE_TTL_MS + 1, currentVersion: '1.2.2',
      fetchImpl: async () => '1.4.0',
    });
    assert.deepEqual(sent.map((s) => s.latest), ['1.3.0', '1.4.0']);
  });

  it('stays quiet when the published version is not newer than the local one', async () => {
    const { sent, notify } = recorder();
    const announced = await maybeNotifyUpdate({}, {
      cachePath, notify, now: NOW, currentVersion: '1.2.2',
      fetchImpl: async () => '1.2.2',
    });
    assert.equal(announced, null);
    assert.equal(sent.length, 0);
  });

  it('re-asserts the semver gate against a cache written before an upgrade', async () => {
    // The user was on 1.2.2 when 1.3.0 was cached, then upgraded to 1.3.0. The
    // cached hit is still fresh, but there is nothing left to announce.
    fs.writeFileSync(cachePath, JSON.stringify({ checkedAt: NOW, latest: '1.3.0' }));
    const { sent, notify } = recorder();
    const announced = await maybeNotifyUpdate({}, {
      cachePath, notify, now: NOW + 1, currentVersion: '1.3.0',
      fetchImpl: async () => assert.fail('must not fetch — the cache is fresh'),
    });
    assert.equal(announced, null);
    assert.equal(sent.length, 0);
  });
});

describe('maybeNotifyUpdate — updateCheck.enabled: false is a total opt-out', () => {
  let dir;
  let cachePath;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aan-update-off-'));
    cachePath = path.join(dir, '.update-check.json');
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('makes no request, writes no state, and sends nothing', async () => {
    const { sent, notify } = recorder();
    const announced = await maybeNotifyUpdate({ updateCheck: { enabled: false } }, {
      cachePath, notify, now: NOW, currentVersion: '1.2.2',
      fetchImpl: async () => assert.fail('disabled must never reach the network'),
    });
    assert.equal(announced, null);
    assert.equal(sent.length, 0);
    assert.equal(fs.existsSync(cachePath), false, 'no state file may be created');
  });

  it('runs when the block is absent or enabled (default ON)', async () => {
    const { sent, notify } = recorder();
    await maybeNotifyUpdate({ updateCheck: { enabled: true } }, {
      cachePath, notify, now: NOW, currentVersion: '1.2.2', fetchImpl: async () => '1.3.0',
    });
    assert.equal(sent.length, 1);
  });
});

describe('maybeNotifyUpdate resilience (a hook must never crash)', () => {
  let dir;
  let cachePath;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aan-update-resil-'));
    cachePath = path.join(dir, '.update-check.json');
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('a throwing fetch (network error) resolves null and notifies nothing', async () => {
    const { sent, notify } = recorder();
    const announced = await maybeNotifyUpdate({}, {
      cachePath, notify, now: NOW, currentVersion: '1.2.2',
      fetchImpl: async () => { throw new Error('ECONNREFUSED'); },
    });
    assert.equal(announced, null);
    assert.equal(sent.length, 0);
    // The failed attempt is still stamped, so an offline machine waits a full
    // TTL instead of retrying on every single hook run.
    assert.equal(JSON.parse(fs.readFileSync(cachePath, 'utf8')).checkedAt, NOW);
  });

  it('a null fetch result (what fetchLatest returns on timeout or malformed JSON) notifies nothing', async () => {
    const { sent, notify } = recorder();
    const announced = await maybeNotifyUpdate({}, {
      cachePath, notify, now: NOW, currentVersion: '1.2.2', fetchImpl: async () => null,
    });
    assert.equal(announced, null);
    assert.equal(sent.length, 0);
  });

  it('a corrupt state file is treated as empty rather than throwing', async () => {
    fs.writeFileSync(cachePath, '{ not json ,,,');
    const { sent, notify } = recorder();
    const announced = await maybeNotifyUpdate({}, {
      cachePath, notify, now: NOW, currentVersion: '1.2.2', fetchImpl: async () => '1.3.0',
    });
    assert.equal(announced, '1.3.0', 'corrupt state falls through to a fresh check');
    assert.equal(sent.length, 1);
  });

  it('a state file holding a JSON scalar is treated as empty rather than throwing', async () => {
    fs.writeFileSync(cachePath, 'null');
    const { notify } = recorder();
    const announced = await maybeNotifyUpdate({}, {
      cachePath, notify, now: NOW, currentVersion: '1.2.2', fetchImpl: async () => '1.3.0',
    });
    assert.equal(announced, '1.3.0');
  });

  it('an unreadable/unwritable state path never throws (notification still fires)', async () => {
    // A DIRECTORY where the state file belongs: both the read and the write fail
    // with something other than ENOENT.
    const blocked = path.join(dir, 'blocked.json');
    fs.mkdirSync(blocked);
    const { sent, notify } = recorder();
    const announced = await maybeNotifyUpdate({}, {
      cachePath: blocked, notify, now: NOW, currentVersion: '1.2.2', fetchImpl: async () => '1.3.0',
    });
    assert.equal(announced, '1.3.0');
    assert.equal(sent.length, 1);
  });

  it('a throwing notifier is swallowed rather than failing the hook run', async () => {
    const announced = await maybeNotifyUpdate({}, {
      cachePath, now: NOW, currentVersion: '1.2.2',
      fetchImpl: async () => '1.3.0',
      notify: async () => { throw new Error('every channel exploded'); },
    });
    assert.equal(announced, null);
  });

  // The two hang cases below inject never-settling promises that — unlike the
  // real fetch, which always holds a live socket — carry no libuv handle. The
  // production budget timer is deliberately unref'd, so during the race NOTHING
  // keeps the event loop alive and on node <= 22 the test child process simply
  // drains and exits, cancelling the rest of the file (node 24's runner holds
  // its own handle, masking it). A ref'd keep-alive timer restores the handle
  // the real socket would provide.
  const whileHeldOpen = async (fn) => {
    const keepAlive = setInterval(() => {}, 1000);
    try { return await fn(); } finally { clearInterval(keepAlive); }
  };

  it('a hung check resolves null at the budget instead of holding the hook open', async () => {
    const { sent, notify } = recorder();
    const announced = await whileHeldOpen(() => maybeNotifyUpdate({}, {
      cachePath, notify, now: NOW, currentVersion: '1.2.2', budgetMs: 20,
      fetchImpl: () => new Promise(() => {}), // never settles
    }));
    assert.equal(announced, null);
    assert.equal(sent.length, 0);
  });

  it('a slow channel is still charged at most ONE attempt per version', async () => {
    // The marker is written before the send, so a channel that outlives the
    // budget cannot make every hook run for the next 24h re-pay its latency.
    let attempts = 0;
    const hang = { cachePath, now: NOW, currentVersion: '1.2.2', budgetMs: 20, fetchImpl: async () => '1.3.0' };
    const notify = () => { attempts++; return new Promise(() => {}); }; // never settles
    await whileHeldOpen(async () => {
      await maybeNotifyUpdate({}, { ...hang, notify });
      assert.equal(JSON.parse(fs.readFileSync(cachePath, 'utf8')).lastNotifiedVersion, '1.3.0');
      await maybeNotifyUpdate({}, { ...hang, notify, now: NOW + 1 });
    });
    assert.equal(attempts, 1, 'the second run must not re-dispatch');
  });
});

describe('sendUpdateNotification fan-out (real local HTTP server, no mocking)', () => {
  let server;
  let base;
  let received = [];

  before(async () => {
    await new Promise((resolve) => {
      server = http.createServer((req, res) => {
        let body = '';
        req.on('data', (c) => { body += c; });
        req.on('end', () => {
          received.push({ url: req.url, headers: req.headers, body });
          res.statusCode = 200;
          res.end('ok');
        });
      });
      server.listen(0, '127.0.0.1', resolve);
    });
    base = `http://127.0.0.1:${server.address().port}`;
  });
  after(() => new Promise((resolve) => server.close(resolve)));
  beforeEach(() => { received = []; });

  // Toast is default-ON, so every case must either disable it or inject a fake
  // backend — a real one would fire a desktop notification on the test machine.
  const toastSpy = () => {
    const seen = [];
    return { seen, resolveBackend: async () => async (n) => { seen.push(n); return true; } };
  };
  const info = { latest: '1.3.0', currentVersion: '1.2.2' };

  it('puts the version in the title and the upgrade command in the body', async () => {
    const { seen, resolveBackend } = toastSpy();
    await sendUpdateNotification({ ntfy: { enabled: false } }, info, { resolveBackend });
    assert.equal(seen.length, 1);
    assert.equal(seen[0].title, 'anotifier v1.3.0 available');
    assert.match(seen[0].message, /You have v1\.2\.2/);
    assert.ok(seen[0].message.includes(UPGRADE_COMMAND), seen[0].message);
  });

  it('toast carries the release URL in the body (no toast backend supports a link)', async () => {
    const { seen, resolveBackend } = toastSpy();
    await sendUpdateNotification({ ntfy: { enabled: false } }, info, { resolveBackend });
    assert.ok(seen[0].message.includes(RELEASES_URL), seen[0].message);
  });

  it('ntfy carries the release URL as a Click header instead, keeping the body clean', async () => {
    await sendUpdateNotification(
      { toast: { enabled: false }, ntfy: { enabled: true, server: base, topic: 'my-topic' } },
      info,
    );
    assert.equal(received.length, 1);
    assert.equal(received[0].url, '/my-topic');
    assert.equal(received[0].headers.title, 'anotifier v1.3.0 available');
    assert.equal(received[0].headers.click, RELEASES_URL);
    assert.equal(received[0].headers.priority, 'low', 'a nag must not outrank a real event');
    assert.ok(!received[0].body.includes(RELEASES_URL), 'URL is in the header, not the body');
    assert.ok(received[0].body.includes(UPGRADE_COMMAND), received[0].body);
  });

  it("does not clobber the user's own ntfy click URL for real events", async () => {
    const ntfyConfig = { enabled: true, server: base, topic: 't', click: 'https://example.com/mine' };
    await sendUpdateNotification({ toast: { enabled: false }, ntfy: ntfyConfig }, info);
    assert.equal(received[0].headers.click, RELEASES_URL);
    assert.equal(ntfyConfig.click, 'https://example.com/mine', 'config object must not be mutated');
  });

  it('honors the same enable gates as the event path (disabled channels stay silent)', async () => {
    const { seen, resolveBackend } = toastSpy();
    await sendUpdateNotification({
      toast: { enabled: false },
      ntfy: { enabled: true, server: base, topic: '' }, // enabled but unconfigured
      webhook: { enabled: true, url: '' },             // enabled but unconfigured
    }, info, { resolveBackend });
    assert.equal(seen.length, 0);
    assert.equal(received.length, 0);
  });

  it('posts to an enabled webhook with the release URL in the body', async () => {
    await sendUpdateNotification(
      { toast: { enabled: false }, ntfy: { enabled: false }, webhook: { enabled: true, url: `${base}/hook`, format: 'generic' } },
      info,
    );
    assert.equal(received.length, 1);
    assert.equal(received[0].url, '/hook');
    const payload = JSON.parse(received[0].body);
    assert.equal(payload.title, 'anotifier v1.3.0 available');
    assert.ok(payload.message.includes(RELEASES_URL), payload.message);
  });

  it('never rejects when a channel blows up (allSettled, not all)', async () => {
    await sendUpdateNotification({ ntfy: { enabled: false } }, info, {
      resolveBackend: async () => { throw new Error('broken install'); },
    });
  });
});
