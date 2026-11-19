// tests/notify-quiet-exit.test.mjs -- every way notify.mjs can leave main(), run as
// a REAL subprocess with stdout piped: the exact bytes written, the exit code and
// the opt-in telemetry outcome that was counted.
//
// This pins the "quiet exits" (suppressed, held back, skipped, duplicate, unmapped,
// focus-skipped) plus the turn_start hot path and the normal tail, so that how main()
// leaves can be refactored without a hook response, an exit code or a telemetry
// outcome changing. What each agent reads from stdout differs by source (`{}` for
// most, a "stop" decision for Antigravity, a bell sequence for a claude success), so
// the bytes are asserted per case, not just "valid JSON".
//
// No network and no real home: HOME is a throwaway dir, toast is off, the update
// check is off, telemetry is on only so that its local counters can be read back
// (nothing is ever sent: the daily summary is not due on a fresh state).
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { makeTmpHome } from './fake-home.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const NOTIFY = path.join(repoRoot, 'src', 'notify.mjs');
const SCRUB = ['ANTHROPIC_API_KEY', 'GEMINI_API_KEY', 'OPENAI_API_KEY', 'CURSOR_API_KEY', 'NTFY_TOKEN', 'DO_NOT_TRACK', 'CI', 'TMUX'];

const EMPTY = '{}\n';
const STOP_RESPONSE = '{"decision":"stop"}\n';
const BELL = JSON.stringify({ terminalSequence: '\x07' }) + '\n';

// Wall-clock window one hour either side of now, so quiet hours are "on" at any
// time of day (same approach as suppress-hook.test.mjs).
function windowAroundNow() {
  const now = new Date();
  const minute = String(now.getMinutes()).padStart(2, '0');
  const pad = (h) => String((h + 24) % 24).padStart(2, '0');
  return { from: `${pad(now.getHours() - 1)}:${minute}`, to: `${pad(now.getHours() + 1)}:${minute}` };
}

const baseConfig = (extra = {}) => ({
  toast: { enabled: false },
  updateCheck: { enabled: false },
  terminalBell: { enabled: false },
  telemetry: { enabled: true },
  ...extra,
});

const claudeStop = (session, extra = {}) =>
  JSON.stringify({ hook_event_name: 'Stop', cwd: '/work/app', session_id: session, ...extra });

describe('notify.mjs: how main() leaves (real subprocess, stdout piped)', () => {
  let home;
  let cfgDir;
  beforeEach(() => {
    home = makeTmpHome('aan-quiet-exit-');
    cfgDir = path.join(home, '.anotifier');
    fs.mkdirSync(cfgDir, { recursive: true });
  });
  afterEach(() => { fs.rmSync(home, { recursive: true, force: true }); });

  const writeConfig = (config) => fs.writeFileSync(path.join(cfgDir, 'config.json'), JSON.stringify(config));

  // Runs notify.mjs (or a one-line driver around main() for the focus case) and
  // resolves with the raw stdout bytes as a string, the exit code and stderr.
  function run({ source = 'claude', extraArgs = [], input = '{}', script = NOTIFY } = {}) {
    const env = { ...process.env, HOME: home, USERPROFILE: home, ANOTIFIER_TELEMETRY: '1', ANOTIFIER_TELEMETRY_URL: 'http://127.0.0.1:9/' };
    for (const k of SCRUB) delete env[k];
    return new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [script, '--source', source, ...extraArgs], { cwd: repoRoot, env });
      const out = [];
      let stderr = '';
      child.stdout.on('data', (d) => out.push(d));
      child.stderr.on('data', (d) => { stderr += d; });
      child.on('error', reject);
      child.on('close', (status) => resolve({ status, stdout: Buffer.concat(out).toString('utf8'), stderr }));
      child.stdin.end(input);
    });
  }

  const outcomes = () => {
    try { return JSON.parse(fs.readFileSync(path.join(cfgDir, '.telemetry.json'), 'utf8')).counters?.outcomes ?? {}; } catch { return {}; }
  };

  const expectExit = (res, stdout) => {
    assert.equal(res.status, 0, res.stderr);
    assert.equal(res.stdout, stdout);
  };

  it('snooze: {} , exit 0, counted suppressed_snooze', async () => {
    writeConfig(baseConfig({ terminalBell: { enabled: true } }));
    fs.writeFileSync(path.join(cfgDir, '.snooze.json'), JSON.stringify({ until: Date.now() + 3600_000 }));
    expectExit(await run({ input: claudeStop('s1') }), EMPTY);
    assert.deepEqual(outcomes(), { suppressed_snooze: 1 });
  });

  it('quiet hours: {} , exit 0, counted suppressed_quiet', async () => {
    writeConfig(baseConfig({ terminalBell: { enabled: true }, quietHours: { enabled: true, ...windowAroundNow() } }));
    expectExit(await run({ input: claudeStop('s1') }), EMPTY);
    assert.deepEqual(outcomes(), { suppressed_quiet: 1 });
  });

  it('antigravity suppressed: the "stop" decision, never {}, exit 0', async () => {
    writeConfig(baseConfig());
    fs.writeFileSync(path.join(cfgDir, '.snooze.json'), JSON.stringify({ until: Date.now() + 3600_000 }));
    expectExit(await run({ source: 'antigravity', extraArgs: ['--event', 'Stop'] }), STOP_RESPONSE);
    assert.deepEqual(outcomes(), { suppressed_snooze: 1 });
  });

  it('claude Stop with background work still running: {} (no bell), counted held_back', async () => {
    writeConfig(baseConfig({ terminalBell: { enabled: true } }));
    const input = claudeStop('s1', { background_tasks: [{ id: 'b1', type: 'subagent', status: 'running' }] });
    expectExit(await run({ input }), EMPTY);
    assert.deepEqual(outcomes(), { held_back: 1 });
  });

  it('cursor run the user aborted: {} , exit 0, counted skipped', async () => {
    writeConfig(baseConfig());
    const input = JSON.stringify({ conversation_id: 'conv-1', status: 'aborted', workspace_roots: ['/work/app'] });
    expectExit(await run({ source: 'cursor', extraArgs: ['--event', 'stop'], input }), EMPTY);
    assert.deepEqual(outcomes(), { skipped: 1 });
  });

  it('turn shorter than minDurationSeconds: {} (no bell), counted skipped', async () => {
    writeConfig(baseConfig({ terminalBell: { enabled: true }, events: { task_complete: { minDurationSeconds: 3600 } } }));
    const start = await run({ input: JSON.stringify({ hook_event_name: 'UserPromptSubmit', cwd: '/work/app', session_id: 'turn1' }) });
    expectExit(start, EMPTY); // the turn_start hot path: nothing counted
    expectExit(await run({ input: claudeStop('turn1') }), EMPTY);
    assert.deepEqual(outcomes(), { skipped: 1 });
  });

  it('claude Notification that is not an alert (auth_success): {} , counted skipped', async () => {
    writeConfig(baseConfig({ terminalBell: { enabled: true } }));
    const input = JSON.stringify({ hook_event_name: 'Notification', notification_type: 'auth_success', cwd: '/work/app', session_id: 's1' });
    expectExit(await run({ input }), EMPTY);
    assert.deepEqual(outcomes(), { skipped: 1 });
  });

  it('a double-fire: the first run answers normally, the second is {} counted duplicate', async () => {
    writeConfig(baseConfig({ terminalBell: { enabled: true } }));
    expectExit(await run({ input: claudeStop('dup') }), BELL);
    expectExit(await run({ input: claudeStop('dup') }), EMPTY);
    assert.deepEqual(outcomes(), { dispatched: 1, duplicate: 1 });
  });

  it('two sessions are not duplicates of each other', async () => {
    writeConfig(baseConfig({ terminalBell: { enabled: true } }));
    expectExit(await run({ input: claudeStop('aaaaaaaa-1') }), BELL);
    expectExit(await run({ input: claudeStop('bbbbbbbb-2') }), BELL);
    assert.deepEqual(outcomes(), { dispatched: 2 });
  });

  it('a hook event with no notification mapping: {} , counted unmapped, logged', async () => {
    writeConfig(baseConfig({ terminalBell: { enabled: true } }));
    const input = JSON.stringify({ hook_event_name: 'PreToolUse', cwd: '/work/app', session_id: 's1' });
    expectExit(await run({ input }), EMPTY);
    assert.deepEqual(outcomes(), { unmapped: 1 });
    assert.match(fs.readFileSync(path.join(cfgDir, 'errors.log'), 'utf8'), /not mapped to a notification/);
  });

  it('the agent window is in front (focus probe true): {} , counted skipped', async () => {
    writeConfig(baseConfig({ terminalBell: { enabled: true }, suppressWhenFocused: true }));
    // main() takes a fake probe only in-process, so a one-line driver injects it.
    const driver = path.join(home, 'driver.mjs');
    fs.writeFileSync(driver, `import { main } from ${JSON.stringify(pathToFileURL(NOTIFY).href)};\nawait main({ focus: { probe: async () => true } });\n`);
    expectExit(await run({ script: driver, input: claudeStop('focus') }), EMPTY);
    assert.deepEqual(outcomes(), { skipped: 1 });
  });

  it('the turn_start hot path: {} , nothing counted', async () => {
    writeConfig(baseConfig({ terminalBell: { enabled: true } }));
    const input = JSON.stringify({ hook_event_name: 'UserPromptSubmit', cwd: '/work/app', session_id: 'p1' });
    expectExit(await run({ input }), EMPTY);
    writeConfig(baseConfig()); // bell off: a non-claude bell spawns a helper and slows the run
    expectExit(await run({ source: 'antigravity', extraArgs: ['--event', 'Stop'], input: '{}' }), STOP_RESPONSE);
    assert.deepEqual(outcomes(), { dispatched: 1 }); // only the antigravity Stop; the turn start counted nothing
  });

  it('a normal claude success carries the bell sequence; with the bell off it is {}', async () => {
    writeConfig(baseConfig({ terminalBell: { enabled: true } }));
    expectExit(await run({ input: claudeStop('ok1') }), BELL);
    writeConfig(baseConfig());
    expectExit(await run({ input: claudeStop('ok2') }), EMPTY);
    assert.deepEqual(outcomes(), { dispatched: 2 });
  });

  it('a crash inside main() still answers {} and exits 0 (counted error)', async () => {
    writeConfig(baseConfig({ terminalBell: { enabled: true } }));
    // The reliable crash from outside: a driver whose focus options throw as main()
    // reads them, after routing, inside its try block.
    const driver = path.join(home, 'driver.mjs');
    fs.writeFileSync(driver, `import { main } from ${JSON.stringify(pathToFileURL(NOTIFY).href)};\nawait main({ focus: { get probe() { throw new Error('boom'); } } });\n`);
    expectExit(await run({ script: driver, input: claudeStop('crash') }), EMPTY);
    assert.deepEqual(outcomes(), { error: 1 });
  });
});
