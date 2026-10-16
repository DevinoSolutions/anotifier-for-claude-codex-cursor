// tests/cursor-hook-input.test.mjs — Cursor's hook input (cursor.com/docs/hooks)
// carries workspace_roots and conversation_id on every hook and a status
// (completed | aborted | error) on stop. Each is used only when present and
// well-typed, so an older payload behaves exactly as before.
import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseInput } from '../src/parse-input.mjs';
import { route } from '../src/router.mjs';
import { dedupKey } from '../src/notify.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const defaultConfig = JSON.parse(fs.readFileSync(path.join(repoRoot, 'config', 'default-config.json'), 'utf8'));

describe('parseInput: Cursor hook input fields', () => {
  const cursor = (raw, event = 'stop') => parseInput(raw, 'cursor', event);

  describe('workspace_roots', () => {
    it('names the project from the first root when there is no cwd', () => {
      const r = cursor({ workspace_roots: ['/code/my-app', '/code/other'] });
      assert.equal(r.cwd, '/code/my-app');
      assert.equal(r.projectName, 'my-app');
    });

    it('reads a Windows root', () => {
      const r = cursor({ workspace_roots: ['c:\\Users\\dev\\my-app'] });
      assert.equal(r.cwd, 'c:\\Users\\dev\\my-app');
      assert.equal(r.projectName, 'my-app');
    });

    it('yields to cwd, then to workspacePaths', () => {
      assert.equal(cursor({ cwd: '/from/cwd', workspace_roots: ['/code/a'] }).cwd, '/from/cwd');
      assert.equal(cursor({ workspacePaths: ['/ag/p'], workspace_roots: ['/code/a'] }).cwd, '/ag/p');
    });

    it('is absent: no project, as before', () => {
      const r = cursor({ status: 'completed', loop_count: 0 });
      assert.equal(r.cwd, '');
      assert.equal(r.projectName, '');
    });

    it('ignores a wrong type', () => {
      for (const workspace_roots of ['/code/app', 42, null, {}, [], [42], [null], [['/code/app']]]) {
        const r = cursor({ workspace_roots });
        assert.equal(r.cwd, '', JSON.stringify(workspace_roots));
        assert.equal(r.projectName, '', JSON.stringify(workspace_roots));
      }
    });

    it('a non-string cwd no longer crashes and falls through to the roots', () => {
      assert.equal(cursor({ cwd: 42, workspace_roots: ['/code/app'] }).cwd, '/code/app');
      assert.equal(cursor({ cwd: { a: 1 } }).cwd, '');
    });
  });

  describe('conversation_id', () => {
    it('becomes the session id', () => {
      assert.equal(cursor({ conversation_id: 'conv-123' }).sessionId, 'conv-123');
    });

    it('yields to the session id fields already read', () => {
      assert.equal(cursor({ session_id: 's', conversation_id: 'c' }).sessionId, 's');
      assert.equal(cursor({ conversationId: 'camel', conversation_id: 'c' }).sessionId, 'camel');
    });

    it('is absent: empty session id, as before', () => {
      assert.equal(cursor({ status: 'completed' }).sessionId, '');
    });

    it('ignores a wrong type', () => {
      for (const conversation_id of [42, null, true, {}, ['c']]) {
        assert.equal(cursor({ conversation_id }).sessionId, '', JSON.stringify(conversation_id));
      }
    });

    it('makes the dedup key per conversation instead of global', () => {
      const a = dedupKey(cursor({ conversation_id: 'aaaaaaaa-1' }));
      const b = dedupKey(cursor({ conversation_id: 'bbbbbbbb-2' }));
      assert.notEqual(a, b);
      assert.equal(dedupKey(cursor({})), 'cursor-task_complete', 'no id keeps the old global key');
    });
  });

  describe('status on stop', () => {
    it('completed is a normal completion', () => {
      const r = cursor({ status: 'completed', loop_count: 0 });
      assert.equal(r.event, 'task_complete');
      assert.equal(r.runStatus, '');
    });

    it('missing status is a normal completion', () => {
      assert.equal(cursor({ loop_count: 0 }).runStatus, '');
    });

    it('aborted and error are carried, the event stays task_complete', () => {
      const aborted = cursor({ status: 'aborted' });
      assert.equal(aborted.event, 'task_complete');
      assert.equal(aborted.runStatus, 'aborted');
      const errored = cursor({ status: 'error' });
      assert.equal(errored.event, 'task_complete');
      assert.equal(errored.runStatus, 'error');
    });

    it('an unknown or wrong-typed status is a normal completion', () => {
      for (const status of ['ABORTED', 'failed', '', 42, null, true, ['error'], { s: 'error' }]) {
        assert.equal(cursor({ status }).runStatus, '', JSON.stringify(status));
      }
    });

    it('reads the reason on sessionEnd, never the status', () => {
      assert.equal(cursor({ reason: 'aborted' }, 'sessionEnd').runStatus, 'aborted');
      assert.equal(cursor({ reason: 'error' }, 'sessionEnd').runStatus, 'error');
      for (const reason of ['completed', 'window_close', 'user_close', undefined, 7]) {
        assert.equal(cursor({ reason }, 'sessionEnd').runStatus, '', String(reason));
      }
      assert.equal(cursor({ status: 'error', reason: 'completed' }, 'sessionEnd').runStatus, '');
      assert.equal(cursor({ reason: 'error' }, 'stop').runStatus, '', 'a stop reads status only');
    });

    it('is ignored for every other agent', () => {
      for (const source of ['claude', 'codex', 'gemini', 'antigravity']) {
        assert.equal(parseInput({ status: 'error', reason: 'error' }, source, 'Stop').runStatus, '', source);
      }
    });
  });
});

describe('route: Cursor run that ended in an error', () => {
  const stop = (extra = {}) => ({ source: 'cursor', event: 'task_complete', projectName: 'app', ...extra });

  it('says "Task failed" with the warning tag instead of "Task complete"', () => {
    const notif = route(stop({ runStatus: 'error' }), defaultConfig);
    assert.equal(notif.message, 'app: Task failed');
    assert.equal(notif.ntfyTags, 'warning');
    assert.equal(notif.event, 'task_complete');
  });

  it("keeps the user's priority and sound for task_complete", () => {
    const config = {
      ...defaultConfig,
      events: {
        ...defaultConfig.events,
        task_complete: { ...defaultConfig.events.task_complete, priority: 'high', toastSound: 'Ping' },
      },
    };
    const notif = route(stop({ runStatus: 'error' }), config);
    assert.equal(notif.priority, 'high');
    assert.equal(notif.toastSound, 'Ping');
  });

  it('a normal completion is unchanged', () => {
    for (const extra of [{}, { runStatus: '' }]) {
      const notif = route(stop(extra), defaultConfig);
      assert.equal(notif.message, 'app: Task complete');
      assert.equal(notif.ntfyTags, defaultConfig.events.task_complete.ntfyTags);
    }
  });

  it('only a task_complete is reworded', () => {
    const notif = route({ source: 'cursor', event: 'needs_input', projectName: 'app', runStatus: 'error' }, defaultConfig);
    assert.equal(notif.message, 'app: Needs your input');
  });
});

describe('notify.mjs with a Cursor stop (real subprocess, real local HTTP server)', () => {
  let server;
  let base;
  let received = [];

  before(async () => {
    await new Promise((resolve) => {
      server = http.createServer((req, res) => {
        let body = '';
        req.on('data', (chunk) => { body += chunk; });
        req.on('end', () => {
          received.push({ url: req.url, body });
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

  // Toast stays off (a real backend would fire a desktop notification on the
  // test machine); the webhook points at the local server and carries the text.
  function makeHome() {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'aan-cursor-'));
    const cfgDir = path.join(home, '.anotifier');
    fs.mkdirSync(cfgDir, { recursive: true });
    fs.writeFileSync(path.join(cfgDir, 'config.json'), JSON.stringify({
      toast: { enabled: false },
      ntfy: { enabled: false },
      webhook: { enabled: true, url: `${base}/hook`, format: 'generic' },
      terminalBell: { enabled: false },
      updateCheck: { enabled: false },
    }));
    return home;
  }

  // Async spawn: the server lives on this process's event loop.
  function runHook(home, payload) {
    const env = { ...process.env, HOME: home, USERPROFILE: home };
    return new Promise((resolve, reject) => {
      const child = spawn(process.execPath, ['src/notify.mjs', '--source', 'cursor', '--event', 'stop'], { cwd: repoRoot, env });
      let stdout = '';
      let stderr = '';
      child.stdout.on('data', (d) => { stdout += d; });
      child.stderr.on('data', (d) => { stderr += d; });
      child.on('error', reject);
      child.on('close', (status) => resolve({ status, stdout, stderr }));
      child.stdin.end(JSON.stringify(payload));
    });
  }

  const stop = (conversationId, extra = {}) => ({
    conversation_id: conversationId,
    workspace_roots: ['/work/my-app'],
    loop_count: 0,
    ...extra,
  });

  it('completed: "my-app: Task complete" with the project in the title', async () => {
    const home = makeHome();
    const res = await runHook(home, stop('conv-completed', { status: 'completed' }));
    fs.rmSync(home, { recursive: true, force: true });
    assert.equal(res.status, 0, res.stderr);
    assert.equal(res.stdout, '{}\n');
    assert.equal(received.length, 1, JSON.stringify(received));
    const body = JSON.parse(received[0].body);
    assert.equal(body.message, 'my-app: Task complete');
    assert.equal(body.title, 'my-app · Cursor');
  });

  it('a payload with no status or roots still says "Task complete"', async () => {
    const home = makeHome();
    const res = await runHook(home, { loop_count: 0 });
    fs.rmSync(home, { recursive: true, force: true });
    assert.equal(res.status, 0, res.stderr);
    assert.equal(received.length, 1, JSON.stringify(received));
    assert.equal(JSON.parse(received[0].body).message, 'Task complete');
  });

  it('error: sends "Task failed", never "Task complete"', async () => {
    const home = makeHome();
    const res = await runHook(home, stop('conv-error', { status: 'error' }));
    fs.rmSync(home, { recursive: true, force: true });
    assert.equal(res.status, 0, res.stderr);
    assert.equal(received.length, 1, JSON.stringify(received));
    assert.equal(JSON.parse(received[0].body).message, 'my-app: Task failed');
  });

  it('aborted: sends nothing, exits cleanly, logs nothing, burns no lock', async () => {
    const home = makeHome();
    const res = await runHook(home, stop('conv-aborted', { status: 'aborted' }));
    const logPath = path.join(home, '.anotifier', 'errors.log');
    const log = fs.existsSync(logPath) ? fs.readFileSync(logPath, 'utf8') : '';
    const locks = fs.readdirSync(path.join(home, '.anotifier')).filter((f) => f.startsWith('.lock-'));
    fs.rmSync(home, { recursive: true, force: true });
    assert.equal(res.status, 0, res.stderr);
    assert.equal(res.stdout, '{}\n');
    assert.equal(received.length, 0, `an abort must not alert, got ${JSON.stringify(received)}`);
    assert.equal(log, '');
    assert.deepEqual(locks, []);
  });

  it('dedup is per conversation: two chats finishing together both alert, one chat firing twice alerts once', async () => {
    const home = makeHome();
    await Promise.all([
      runHook(home, stop('conv-one-aaaa')),
      runHook(home, stop('conv-two-bbbb')),
    ]);
    assert.equal(received.length, 2, `two conversations, got ${JSON.stringify(received)}`);
    received = [];
    await Promise.all([
      runHook(home, stop('conv-same-cccc')),
      runHook(home, stop('conv-same-cccc')),
    ]);
    fs.rmSync(home, { recursive: true, force: true });
    assert.equal(received.length, 1, `one conversation double-fired, got ${JSON.stringify(received)}`);
  });
});
