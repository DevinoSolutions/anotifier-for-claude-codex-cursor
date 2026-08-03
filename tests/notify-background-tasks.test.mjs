// tests/notify-background-tasks.test.mjs — proves the background-work gate at
// the REAL hook entry point: a claude Stop that fires while its subagents /
// background shells are still running notifies on NO channel, while the same
// Stop with a drained ledger notifies normally.
//
// "Sends nothing" is proven, not assumed: ntfy and webhook both point at a real
// local HTTP server (same no-mocking approach as suppress-hook.test.mjs), and
// every held-back case is paired with a control run that differs only in the
// ledger — so a green zero-requests assertion can never just mean "the wiring
// was broken".
import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCRUB = ['ANTHROPIC_API_KEY', 'GEMINI_API_KEY', 'OPENAI_API_KEY', 'CURSOR_API_KEY', 'NTFY_TOKEN'];
const BELL_RESPONSE = { terminalSequence: '\x07' };

const RUNNING_SUBAGENT = {
  id: 'bg-1', type: 'subagent', status: 'running',
  description: 'sweep the platform backends', agent_type: 'Explore',
};

describe('notify.mjs background-work gate (real subprocess, real local HTTP server)', () => {
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

  // Toast is the one channel that cannot point at the local server, so it stays
  // off — a real backend would fire a desktop notification on the test machine.
  // ntfy + webhook + the claude bell are enough to prove the gate.
  // updateCheck is opted out so the control runs stay offline and their request
  // count is exactly the event's own two.
  const config = () => ({
    toast: { enabled: false },
    ntfy: { enabled: true, server: base, topic: 'bg-test' },
    webhook: { enabled: true, url: `${base}/hook`, format: 'generic' },
    terminalBell: { enabled: true },
    updateCheck: { enabled: false },
  });

  // A throwaway HOME the caller owns and removes — kept alive after the run so a
  // case can read back errors.log or check for a dedup lock file.
  function makeHome() {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'aan-bgwork-'));
    const cfgDir = path.join(home, '.anotifier');
    fs.mkdirSync(cfgDir, { recursive: true });
    fs.writeFileSync(path.join(cfgDir, 'config.json'), JSON.stringify(config()));
    return home;
  }

  // Async spawn, never spawnSync: the local server runs on THIS process's event
  // loop, so a blocking child would never get its ntfy/webhook connection
  // accepted and every control run would read as "sent nothing".
  function runHook(home, payload, source = 'claude') {
    const env = { ...process.env, HOME: home, USERPROFILE: home };
    for (const k of SCRUB) delete env[k];
    return new Promise((resolve, reject) => {
      const child = spawn(process.execPath, ['src/notify.mjs', '--source', source], { cwd: repoRoot, env });
      let stdout = '';
      let stderr = '';
      child.stdout.on('data', (d) => { stdout += d; });
      child.stderr.on('data', (d) => { stderr += d; });
      child.on('error', reject);
      child.on('close', (status) => resolve({ status, stdout, stderr }));
      child.stdin.end(JSON.stringify(payload));
    });
  }

  // Each case gets a fresh session id: the dedup lock keys on it, so reusing one
  // across cases would silence a later run for the wrong reason.
  const stop = (sessionId, extra = {}) =>
    ({ hook_event_name: 'Stop', cwd: '/work/app', session_id: sessionId, ...extra });

  it('CONTROL: a Stop with a drained ledger notifies on every wired channel', async () => {
    const home = makeHome();
    const res = await runHook(home, stop('drained', { background_tasks: [] }));
    fs.rmSync(home, { recursive: true, force: true });
    assert.equal(res.status, 0, res.stderr);
    assert.deepEqual(JSON.parse(res.stdout), BELL_RESPONSE, 'claude rings via terminalSequence');
    assert.equal(received.length, 2, `expected ntfy + webhook, got ${JSON.stringify(received)}`);
  });

  it('a Stop with a running subagent notifies on NO channel and emits no terminalSequence', async () => {
    const home = makeHome();
    const res = await runHook(home, stop('livesub', { background_tasks: [RUNNING_SUBAGENT] }));
    fs.rmSync(home, { recursive: true, force: true });
    assert.equal(res.status, 0, res.stderr);
    assert.equal(res.stdout, '{}\n', 'a premature Task complete must not ring');
    assert.equal(received.length, 0, `nothing may be sent while work is live, got ${JSON.stringify(received)}`);
  });

  it('a Stop with a running background shell is held back the same way', async () => {
    const home = makeHome();
    const res = await runHook(home, stop('liveshell', {
      background_tasks: [{ id: 'bg-2', type: 'shell', status: 'running', command: 'npm run build' }],
    }));
    fs.rmSync(home, { recursive: true, force: true });
    assert.equal(res.status, 0, res.stderr);
    assert.equal(res.stdout, '{}\n');
    assert.equal(received.length, 0, `nothing may be sent while work is live, got ${JSON.stringify(received)}`);
  });

  it('holding the ping back writes NOTHING to errors.log — it is expected, not a fault', async () => {
    // Unlike the unmapped-event exit (which logs a router entry by design), a
    // held-back Stop is normal operation and must leave `status` clean.
    const home = makeHome();
    const res = await runHook(home, stop('nolog', { background_tasks: [RUNNING_SUBAGENT] }));
    const logPath = path.join(home, '.anotifier', 'errors.log');
    const log = fs.existsSync(logPath) ? fs.readFileSync(logPath, 'utf8') : '';
    fs.rmSync(home, { recursive: true, force: true });
    assert.equal(res.status, 0, res.stderr);
    assert.equal(res.stdout, '{}\n');
    assert.equal(log, '', `a held-back Stop must not be logged as an error, got: ${log}`);
  });

  it('a held-back Stop burns no dedup lock, so the real completion still notifies', async () => {
    // The gate sits BEFORE acquireNotifyLock precisely so this holds: both runs
    // share a HOME and a session id, which means one dedup key — if the
    // held-back run had taken the lock, the real completion would be swallowed.
    const home = makeHome();
    const held = await runHook(home, stop('samekey', { background_tasks: [RUNNING_SUBAGENT] }));
    assert.equal(held.status, 0, held.stderr);
    assert.equal(held.stdout, '{}\n');
    assert.equal(received.length, 0);

    // Deterministic half: no lock file exists for this event at all.
    const lockFile = path.join(home, '.anotifier', '.lock-claude-task_complete-samekey');
    assert.equal(fs.existsSync(lockFile), false, 'the held-back run must not create a dedup lock');

    // Behavioral half: the drained Stop that follows really does get through.
    const real = await runHook(home, stop('samekey', { background_tasks: [] }));
    fs.rmSync(home, { recursive: true, force: true });
    assert.equal(real.status, 0, real.stderr);
    assert.deepEqual(JSON.parse(real.stdout), BELL_RESPONSE);
    assert.equal(received.length, 2, `the real completion must notify, got ${JSON.stringify(received)}`);
  });

  it('a Stop with no background_tasks field at all notifies (older Claude Code)', async () => {
    const home = makeHome();
    const res = await runHook(home, stop('absent'));
    fs.rmSync(home, { recursive: true, force: true });
    assert.equal(res.status, 0, res.stderr);
    assert.deepEqual(JSON.parse(res.stdout), BELL_RESPONSE);
    assert.equal(received.length, 2);
  });

  it('a ledger whose entries all report a settled status notifies', async () => {
    const home = makeHome();
    const res = await runHook(home, stop('settled', {
      background_tasks: [{ id: 'bg-3', type: 'subagent', status: 'completed' }],
    }));
    fs.rmSync(home, { recursive: true, force: true });
    assert.equal(res.status, 0, res.stderr);
    assert.deepEqual(JSON.parse(res.stdout), BELL_RESPONSE);
    assert.equal(received.length, 2);
  });

  it('the gate is claude-only: a codex Stop carrying the same ledger still notifies', async () => {
    // Codex never sends background_tasks, and cursor's per-subagent
    // subagentStop -> task_complete is deliberate — neither may be gated on it.
    const home = makeHome();
    const res = await runHook(home, { hook_event_name: 'Stop', cwd: '/work/app', session_id: 'cdx', background_tasks: [RUNNING_SUBAGENT] }, 'codex');
    fs.rmSync(home, { recursive: true, force: true });
    assert.equal(res.status, 0, res.stderr);
    assert.equal(res.stdout, '{}\n', 'codex rings via bell.mjs, never terminalSequence');
    assert.equal(received.length, 2, `codex must still notify, got ${JSON.stringify(received)}`);
  });
});
