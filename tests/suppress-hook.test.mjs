// tests/suppress-hook.test.mjs — proves suppression at the REAL hook entry
// point: a snoozed (or quiet-hours) run sends nothing on any channel and emits
// no claude terminalSequence, while still exiting 0 with a valid hook response.
//
// "Sends nothing" is proven, not assumed: ntfy and webhook both point at a real
// local HTTP server (same no-mocking approach as ntfy-send.test.mjs), and every
// case runs the identical event twice — once suppressed, once not — so a green
// zero-requests assertion can never just mean "the wiring was broken".
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
const STOP_EVENT = JSON.stringify({ hook_event_name: 'Stop', cwd: '/work/app', session_id: 's' });

// Two decimal-padded local wall-clock times, one hour either side of right now.
// Deriving the window from the real clock (rather than hard-coding 22:00-08:00)
// is what keeps this test from passing only at certain hours of the day; the
// midnight-spanning arithmetic itself is covered exhaustively in suppress.test.mjs.
function windowAroundNow() {
  const now = new Date(); // ONE reading — two would risk straddling an hour boundary
  const minute = String(now.getMinutes()).padStart(2, '0');
  const pad = (h) => String((h + 24) % 24).padStart(2, '0');
  return { from: `${pad(now.getHours() - 1)}:${minute}`, to: `${pad(now.getHours() + 1)}:${minute}` };
}

describe('notify.mjs suppression (real subprocess, real local HTTP server)', () => {
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
  const configWith = (extra) => ({
    toast: { enabled: false },
    ntfy: { enabled: true, server: base, topic: 'snooze-test' },
    webhook: { enabled: true, url: `${base}/hook`, format: 'generic' },
    terminalBell: { enabled: true },
    // Opted out so the un-suppressed control runs stay offline and their request
    // count is exactly the event's own two — a real registry hit could otherwise
    // add an update notice to the same local server the moment a newer anotifier
    // is published.
    updateCheck: { enabled: false },
    ...extra,
  });

  // Runs the real hook against a throwaway HOME. `seed` gets the .anotifier dir
  // so a case can drop a .snooze.json in next to the config.
  function runHook(config, seed = () => {}) {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'aan-suppress-hook-'));
    const cfgDir = path.join(home, '.anotifier');
    fs.mkdirSync(cfgDir, { recursive: true });
    fs.writeFileSync(path.join(cfgDir, 'config.json'), JSON.stringify(config));
    seed(cfgDir);
    const env = { ...process.env, HOME: home, USERPROFILE: home };
    for (const k of SCRUB) delete env[k];

    return new Promise((resolve, reject) => {
      const child = spawn(process.execPath, ['src/notify.mjs', '--source', 'claude'], { cwd: repoRoot, env });
      let stdout = '';
      let stderr = '';
      child.stdout.on('data', (d) => { stdout += d; });
      child.stderr.on('data', (d) => { stderr += d; });
      child.on('error', reject);
      child.on('close', (status) => {
        fs.rmSync(home, { recursive: true, force: true });
        resolve({ status, stdout, stderr });
      });
      child.stdin.end(STOP_EVENT);
    });
  }

  const snoozeFor = (ms) => (cfgDir) =>
    fs.writeFileSync(path.join(cfgDir, '.snooze.json'), JSON.stringify({ until: Date.now() + ms }));

  it('CONTROL: an un-suppressed run really does send on every wired channel', async () => {
    const res = await runHook(configWith());
    assert.equal(res.status, 0, res.stderr);
    assert.deepEqual(JSON.parse(res.stdout), BELL_RESPONSE, 'claude rings via terminalSequence');
    assert.equal(received.length, 2, `expected ntfy + webhook, got ${JSON.stringify(received)}`);
  });

  it('a snoozed run sends on NO channel and emits no terminalSequence', async () => {
    const res = await runHook(configWith(), snoozeFor(60 * 60 * 1000));
    assert.equal(res.status, 0, res.stderr);
    assert.equal(res.stdout, '{}\n', 'a snoozed claude run must not ring');
    assert.equal(received.length, 0, `nothing may be sent while snoozed, got ${JSON.stringify(received)}`);
  });

  it('an EXPIRED snooze behaves exactly like no snooze', async () => {
    const res = await runHook(configWith(), snoozeFor(-1000));
    assert.equal(res.status, 0, res.stderr);
    assert.deepEqual(JSON.parse(res.stdout), BELL_RESPONSE);
    assert.equal(received.length, 2);
  });

  it('a corrupt snooze state file cannot silence the hook', async () => {
    const res = await runHook(configWith(), (cfgDir) =>
      fs.writeFileSync(path.join(cfgDir, '.snooze.json'), '{ not json ,,,'));
    assert.equal(res.status, 0, res.stderr);
    assert.deepEqual(JSON.parse(res.stdout), BELL_RESPONSE);
    assert.equal(received.length, 2);
  });

  it('a run inside the quiet-hours window sends on NO channel and emits no terminalSequence', async () => {
    const res = await runHook(configWith({ quietHours: { enabled: true, ...windowAroundNow() } }));
    assert.equal(res.status, 0, res.stderr);
    assert.equal(res.stdout, '{}\n');
    assert.equal(received.length, 0, `nothing may be sent during quiet hours, got ${JSON.stringify(received)}`);
  });

  it('the same window with enabled: false (the default) suppresses nothing', async () => {
    const res = await runHook(configWith({ quietHours: { enabled: false, ...windowAroundNow() } }));
    assert.equal(res.status, 0, res.stderr);
    assert.deepEqual(JSON.parse(res.stdout), BELL_RESPONSE);
    assert.equal(received.length, 2);
  });

  it('a malformed quiet-hours time degrades to disabled instead of silencing the user', async () => {
    // The validator drops `enabled` along with the bad time, so the run notifies
    // normally — and the config problem is still recorded to errors.log.
    const res = await runHook(configWith({ quietHours: { enabled: true, from: 'banana', to: '08:00' } }));
    assert.equal(res.status, 0, res.stderr);
    assert.deepEqual(JSON.parse(res.stdout), BELL_RESPONSE);
    assert.equal(received.length, 2);
  });
});
