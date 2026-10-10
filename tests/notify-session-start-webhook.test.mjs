// tests/notify-session-start-webhook.test.mjs -- the REAL notify.mjs entry point
// as a subprocess against a real local HTTP server. session_start is off on the
// webhook by default (like toast, ntfy and the bell); a user opts back in with
// events.session_start.webhookEnabled = true.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCRUB = ['ANTHROPIC_API_KEY', 'GEMINI_API_KEY', 'OPENAI_API_KEY', 'CURSOR_API_KEY', 'NTFY_TOKEN'];

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

  function run(hookEvent, events) {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'aan-ss-webhook-'));
    const cfgDir = path.join(home, '.anotifier');
    fs.mkdirSync(cfgDir, { recursive: true });
    const config = {
      toast: { enabled: false },
      ntfy: { enabled: false },
      terminalBell: { enabled: false },
      updateCheck: { enabled: false },
      webhook: { enabled: true, url: `${base}/hook`, format: 'generic' },
    };
    if (events) config.events = events;
    fs.writeFileSync(path.join(cfgDir, 'config.json'), JSON.stringify(config));
    const env = { ...process.env, HOME: home, USERPROFILE: home };
    for (const k of SCRUB) delete env[k];
    const input = JSON.stringify({ hook_event_name: hookEvent, cwd: '/work/app', session_id: `s-${Math.random()}` });
    return new Promise((resolve, reject) => {
      const child = spawn(process.execPath, ['src/notify.mjs', '--source', 'claude'], { cwd: repoRoot, env, timeout: 30000 });
      let stderr = '';
      child.stderr.setEncoding('utf8').on('data', (d) => { stderr += d; });
      child.on('error', reject);
      child.on('close', (status) => {
        fs.rmSync(home, { recursive: true, force: true });
        resolve({ status, stderr });
      });
      child.stdin.end(input);
    });
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
