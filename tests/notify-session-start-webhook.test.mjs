// tests/notify-session-start-webhook.test.mjs -- the REAL notify.mjs entry point
// as a subprocess against a real local HTTP server. session_start is off on the
// webhook by default (like toast, ntfy and the bell); a user opts back in with
// events.session_start.webhookEnabled = true.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import { makeTmpHome } from './fake-home.mjs';
import { runHook } from './hook-runner.mjs';

describe('session_start webhook default', () => {
  let server;
  let base;
  let posts = [];

  before(async () => {
    await new Promise((resolve) => {
      server = http.createServer((req, res) => {
        let body = '';
        req.on('data', (c) => { body += c; });
        req.on('end', () => { posts.push(body); res.end('ok'); });
      });
      server.listen(0, '127.0.0.1', resolve);
    });
    base = `http://127.0.0.1:${server.address().port}`;
  });

  after(() => new Promise((resolve) => { server.closeAllConnections?.(); server.close(resolve); }));

  async function run(hookEvent, events) {
    const config = {
      toast: { enabled: false },
      ntfy: { enabled: false },
      terminalBell: { enabled: false },
      updateCheck: { enabled: false },
      webhook: { enabled: true, url: `${base}/hook`, format: 'generic' },
    };
    if (events) config.events = events;
    const home = makeTmpHome('aan-ss-webhook-', { config });
    try {
      const payload = { hook_event_name: hookEvent, cwd: '/work/app', session_id: `s-${Math.random()}` };
      return await runHook({ payload, home });
    } finally {
      fs.rmSync(home, { recursive: true, force: true });
    }
  }

  it('sends NO webhook for session_start by default', async () => {
    posts = [];
    const res = await run('SessionStart');
    assert.equal(res.status, 0, res.stderr);
    assert.equal(posts.length, 0, `unexpected webhook post: ${posts.join('|')}`);
  });

  it('control: task_complete still posts to the webhook by default', async () => {
    posts = [];
    const res = await run('Stop');
    assert.equal(res.status, 0, res.stderr);
    assert.equal(posts.length, 1);
  });

  it('sends the webhook for session_start when the user sets webhookEnabled: true', async () => {
    posts = [];
    const res = await run('SessionStart', { session_start: { webhookEnabled: true } });
    assert.equal(res.status, 0, res.stderr);
    assert.equal(posts.length, 1);
    assert.match(posts[0], /Session started/);
  });
});
