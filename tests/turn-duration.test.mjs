// tests/turn-duration.test.mjs — the minimum-duration filter and the
// "took 4m 12s" suffix: the turn timer, the routing of both, the config
// validation, the hook wiring, and the real hook entry point.
import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { useFakeHome } from './fake-home.mjs';
import {
  recordTurnStart, finishTurn, minDurationSeconds, isBelowMinDuration, supportsTurnTiming,
} from '../src/turn-timer.mjs';
import { route, formatDuration } from '../src/router.mjs';
import { parseInput } from '../src/parse-input.mjs';
import { deriveRichViews } from '../src/transcript.mjs';
import { loadConfigResult } from '../src/config-loader.mjs';
import { patchClaude, patchCodex, patchGemini, patchCursor, patchAntigravity, unpatchAll, TOOL_EVENTS } from '../setup/patch-config.mjs';

useFakeHome();

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const NOTIFY = path.join(repoRoot, 'src', 'notify.mjs');
const SEC = 1000;

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'aan-turn-'));
}

describe('formatDuration', () => {
  it('formats seconds, minutes and hours', () => {
    assert.equal(formatDuration(0), '0s');
    assert.equal(formatDuration(45 * SEC), '45s');
    assert.equal(formatDuration(59.6 * SEC), '1m');
    assert.equal(formatDuration(60 * SEC), '1m');
    assert.equal(formatDuration((4 * 60 + 12) * SEC), '4m 12s');
    assert.equal(formatDuration(3600 * SEC), '1h');
    assert.equal(formatDuration((3600 + 5 * 60 + 30) * SEC), '1h 5m');
    assert.equal(formatDuration((26 * 3600) * SEC), '26h');
  });

  it('is null for anything that is not a usable duration', () => {
    for (const bad of [null, undefined, NaN, Infinity, -1, '5', {}]) assert.equal(formatDuration(bad), null);
  });
});

describe('turn timer', () => {
  let dir;
  let statePath;
  beforeEach(() => { dir = tmpDir(); statePath = path.join(dir, 'turns.json'); });

  it('measures start to finish', () => {
    assert.equal(recordTurnStart({ source: 'claude', sessionId: 's1' }, { statePath, now: 1_000_000 }), true);
    assert.equal(finishTurn({ source: 'claude', sessionId: 's1' }, { statePath, now: 1_000_000 + 252 * SEC }), 252 * SEC);
  });

  it('keeps sessions and agents apart', () => {
    recordTurnStart({ source: 'claude', sessionId: 'a' }, { statePath, now: 1_000_000 });
    recordTurnStart({ source: 'claude', sessionId: 'b' }, { statePath, now: 1_030_000 });
    recordTurnStart({ source: 'gemini', sessionId: 'a' }, { statePath, now: 1_040_000 });
    assert.equal(finishTurn({ source: 'claude', sessionId: 'a' }, { statePath, now: 1_100_000 }), 100 * SEC);
    assert.equal(finishTurn({ source: 'claude', sessionId: 'b' }, { statePath, now: 1_100_000 }), 70 * SEC);
    assert.equal(finishTurn({ source: 'gemini', sessionId: 'a' }, { statePath, now: 1_100_000 }), 60 * SEC);
  });

  it('is unknown when no start was recorded', () => {
    assert.equal(finishTurn({ source: 'claude', sessionId: 'never' }, { statePath, now: 5 }), null);
  });

  it('is unknown for agents with no start signal, even if a file says otherwise', () => {
    for (const source of ['cursor', 'antigravity', 'nobody']) {
      assert.equal(supportsTurnTiming(source), false);
      assert.equal(recordTurnStart({ source, sessionId: 's' }, { statePath, now: 1 }), false);
      assert.equal(finishTurn({ source, sessionId: 's' }, { statePath, now: 1_000_000 }), null);
    }
    fs.writeFileSync(statePath, JSON.stringify({ 'cursor:s': { startedAt: 1 } }));
    assert.equal(finishTurn({ source: 'cursor', sessionId: 's' }, { statePath, now: 1_000_000 }), null);
  });

  it('is unknown without a session id', () => {
    assert.equal(recordTurnStart({ source: 'claude', sessionId: '' }, { statePath }), false);
    assert.equal(finishTurn({ source: 'claude', sessionId: '' }, { statePath }), null);
  });

  it('refuses to pair a start and a finish from different codex turns', () => {
    recordTurnStart({ source: 'codex', sessionId: 's', turnId: 'turn-1' }, { statePath, now: 1_000_000 });
    assert.equal(finishTurn({ source: 'codex', sessionId: 's', turnId: 'turn-2' }, { statePath, now: 1_090_000 }), null);
    assert.equal(finishTurn({ source: 'codex', sessionId: 's', turnId: 'turn-1' }, { statePath, now: 1_090_000 }), 90 * SEC);
  });

  it('a double-fired finish gets the same answer, a much later one gets none', () => {
    recordTurnStart({ source: 'claude', sessionId: 's' }, { statePath, now: 1_000_000 });
    assert.equal(finishTurn({ source: 'claude', sessionId: 's' }, { statePath, now: 1_020_000 }), 20 * SEC);
    assert.equal(finishTurn({ source: 'claude', sessionId: 's' }, { statePath, now: 1_021_000 }), 20 * SEC);
    // A Stop that no new prompt preceded is not the same turn.
    assert.equal(finishTurn({ source: 'claude', sessionId: 's' }, { statePath, now: 1_200_000 }), null);
  });

  it('a new prompt starts a fresh clock', () => {
    recordTurnStart({ source: 'claude', sessionId: 's' }, { statePath, now: 1_000_000 });
    finishTurn({ source: 'claude', sessionId: 's' }, { statePath, now: 1_020_000 });
    recordTurnStart({ source: 'claude', sessionId: 's' }, { statePath, now: 2_000_000 });
    assert.equal(finishTurn({ source: 'claude', sessionId: 's' }, { statePath, now: 2_007_000 }), 7 * SEC);
  });

  it('does not believe a start in the future or one over a day old', () => {
    recordTurnStart({ source: 'claude', sessionId: 's' }, { statePath, now: 5_000_000 });
    assert.equal(finishTurn({ source: 'claude', sessionId: 's' }, { statePath, now: 4_000_000 }), null);
    recordTurnStart({ source: 'claude', sessionId: 't' }, { statePath, now: 1_000 });
    assert.equal(finishTurn({ source: 'claude', sessionId: 't' }, { statePath, now: 1_000 + 25 * 3600 * SEC }), null);
  });

  it('prunes entries older than a day when it writes', () => {
    recordTurnStart({ source: 'claude', sessionId: 'old' }, { statePath, now: 1_000 });
    recordTurnStart({ source: 'claude', sessionId: 'new' }, { statePath, now: 1_000 + 26 * 3600 * SEC });
    assert.deepEqual(Object.keys(JSON.parse(fs.readFileSync(statePath, 'utf8'))), ['claude:new']);
  });

  it('ignores a corrupt state file instead of throwing', () => {
    fs.writeFileSync(statePath, '{ not json');
    assert.equal(finishTurn({ source: 'claude', sessionId: 's' }, { statePath, now: 10 }), null);
    assert.equal(recordTurnStart({ source: 'claude', sessionId: 's' }, { statePath, now: 10 }), true);
  });

  it('never throws when the state path is unusable', () => {
    fs.mkdirSync(statePath); // a directory where the file should be
    assert.equal(recordTurnStart({ source: 'claude', sessionId: 's' }, { statePath, now: 10 }), false);
    assert.equal(finishTurn({ source: 'claude', sessionId: 's' }, { statePath, now: 20 }), null);
  });
});

describe('minimum duration threshold', () => {
  const cfg = (n) => ({ events: { task_complete: { minDurationSeconds: n } } });

  it('filters a turn below the threshold, sends one at or above it', () => {
    assert.equal(isBelowMinDuration(29_999, cfg(30)), true);
    assert.equal(isBelowMinDuration(30_000, cfg(30)), false);
    assert.equal(isBelowMinDuration(5 * 60 * SEC, cfg(30)), false);
  });

  it('never filters an unknown duration', () => {
    for (const unknown of [null, undefined, NaN]) assert.equal(isBelowMinDuration(unknown, cfg(30)), false);
  });

  it('is off by default and for unusable values', () => {
    assert.equal(isBelowMinDuration(1, {}), false);
    assert.equal(isBelowMinDuration(1, cfg(0)), false);
    assert.equal(isBelowMinDuration(1, cfg(-5)), false);
    assert.equal(isBelowMinDuration(1, cfg('30')), false);
    assert.equal(minDurationSeconds(cfg(12.5)), 12.5);
    assert.equal(minDurationSeconds(null), 0);
  });

  it('ships off in the default config', () => {
    const { config } = loadConfigResult(path.join(tmpDir(), 'none.json'));
    assert.equal(config.events.task_complete.minDurationSeconds, 0);
  });
});

describe('config validation of minDurationSeconds', () => {
  function load(user) {
    const file = path.join(tmpDir(), 'config.json');
    fs.writeFileSync(file, JSON.stringify(user));
    return loadConfigResult(file);
  }

  it('accepts a number of seconds on task_complete', () => {
    const { config, problem } = load({ events: { task_complete: { minDurationSeconds: 45 } } });
    assert.equal(problem, null);
    assert.equal(config.events.task_complete.minDurationSeconds, 45);
  });

  it('drops a wrong type, a negative number and NaN-ish values, keeping the default', () => {
    for (const bad of ['45', -1, null, true]) {
      const { config, problem } = load({ events: { task_complete: { minDurationSeconds: bad } } });
      assert.equal(problem?.type, 'validate', `${JSON.stringify(bad)} should be reported`);
      assert.equal(config.events.task_complete.minDurationSeconds, 0);
    }
  });

  it('refuses it on needs_input: urgent alerts can never be filtered', () => {
    const { config, problem } = load({ events: { needs_input: { minDurationSeconds: 600 } } });
    assert.match(problem.message, /needs_input\.minDurationSeconds.*only applies to "task_complete"/);
    assert.equal(config.events.needs_input.minDurationSeconds, undefined);
  });
});

describe('parseInput and routing', () => {
  it('maps the turn-start hook of the three timed agents, and nobody else', () => {
    assert.equal(parseInput({ hook_event_name: 'UserPromptSubmit' }, 'claude').event, 'turn_start');
    assert.equal(parseInput({}, 'codex', 'UserPromptSubmit').event, 'turn_start');
    assert.equal(parseInput({ hook_event_name: 'BeforeAgent' }, 'gemini').event, 'turn_start');
    assert.equal(parseInput({}, 'cursor', 'beforeSubmitPrompt').event, 'unknown');
    assert.equal(parseInput({}, 'antigravity', 'PreInvocation').event, 'unknown');
  });

  it('carries codex turn_id', () => {
    assert.equal(parseInput({ turn_id: 't-9' }, 'codex', 'Stop').turnId, 't-9');
    assert.equal(parseInput({ turn_id: 7 }, 'codex', 'Stop').turnId, '');
  });

  const config = loadConfigResult(path.join(tmpDir(), 'none.json')).config;
  const done = (extra = {}) => ({ source: 'claude', event: 'task_complete', projectName: 'app', ...extra });

  it('adds the duration to a completion body when known', () => {
    const n = route(done({ durationMs: (4 * 60 + 12) * SEC }), config);
    assert.equal(n.message, 'app: Task complete (took 4m 12s)');
    assert.equal(n.durationText, '4m 12s');
  });

  it('leaves the body and the title exactly as before when the duration is unknown', () => {
    for (const durationMs of [undefined, null, NaN]) {
      const n = route(done({ durationMs }), config);
      assert.equal(n.message, 'app: Task complete');
      assert.equal(n.title, 'app · Claude Code');
      assert.equal('durationText' in n, false);
    }
  });

  it('never puts a duration on a needs_input alert', () => {
    const n = route({ source: 'claude', event: 'needs_input', projectName: 'app', notificationType: 'permission_prompt', durationMs: 90 * SEC }, config);
    assert.equal(n.message, 'app: Needs your permission');
  });

  it('keeps the duration when rich content replaces the body', () => {
    const notification = route(done({ durationMs: 75 * SEC }), config);
    const views = deriveRichViews(done({ transcriptPath: 'x' }), config, config.events.task_complete, notification, () => 'Fixed the bug');
    assert.equal(views.toast.message, 'Fixed the bug (took 1m 15s)');
    const plain = route(done(), config);
    const plainViews = deriveRichViews(done({ transcriptPath: 'x' }), config, config.events.task_complete, plain, () => 'Fixed the bug');
    assert.equal(plainViews.toast.message, 'Fixed the bug');
  });
});

describe('hook wiring', () => {
  const read = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
  const notifyPath = '/opt/anotifier/src/notify.mjs';

  it('setup writes the turn-start hook for claude, codex and gemini; uninstall removes it', () => {
    const home = tmpDir();
    for (const dir of ['.claude', '.codex', '.cursor', '.gemini']) fs.mkdirSync(path.join(home, dir), { recursive: true });
    patchClaude(path.join(home, '.claude'), notifyPath);
    patchCodex(path.join(home, '.codex'), notifyPath);
    patchGemini(path.join(home, '.gemini'), notifyPath);
    patchCursor(path.join(home, '.cursor'), notifyPath);
    patchAntigravity(path.join(home, '.gemini'), notifyPath);

    const claude = read(path.join(home, '.claude', 'settings.json')).hooks;
    assert.equal(claude.UserPromptSubmit.length, 1);
    assert.equal(claude.UserPromptSubmit[0].hooks[0].timeout, 5);
    assert.equal(claude.Stop[0].hooks[0].timeout, 10, 'the notifying hooks keep their timeout');

    const codex = read(path.join(home, '.codex', 'hooks.json')).hooks;
    assert.match(codex.UserPromptSubmit[0].hooks[0].command, /--source codex --event UserPromptSubmit$/);
    const toml = fs.readFileSync(path.join(home, '.codex', 'config.toml'), 'utf8');
    assert.match(toml, /:user_prompt_submit:0:0'\]/, 'codex must trust the new hook');

    const gemini = read(path.join(home, '.gemini', 'settings.json')).hooks;
    assert.equal(gemini.BeforeAgent[0].hooks[0].timeout, 5000);
    assert.equal(gemini.AfterAgent[0].hooks[0].timeout, 30000);

    // Cursor and Antigravity have no reliable start signal: no extra hook.
    assert.deepEqual(Object.keys(read(path.join(home, '.cursor', 'hooks.json')).hooks), ['stop']);
    assert.deepEqual(TOOL_EVENTS.antigravity.events, ['Stop']);

    // Re-running setup does not stack duplicates.
    patchClaude(path.join(home, '.claude'), notifyPath);
    assert.equal(read(path.join(home, '.claude', 'settings.json')).hooks.UserPromptSubmit.length, 1);

    const results = unpatchAll(home);
    assert.ok(results.every((r) => r.ok), JSON.stringify(results));
    assert.equal(read(path.join(home, '.claude', 'settings.json')).hooks?.UserPromptSubmit, undefined);
    assert.equal(read(path.join(home, '.codex', 'hooks.json')).hooks?.UserPromptSubmit, undefined);
    assert.equal(read(path.join(home, '.gemini', 'settings.json')).hooks?.BeforeAgent, undefined);
    assert.doesNotMatch(fs.readFileSync(path.join(home, '.codex', 'config.toml'), 'utf8'), /user_prompt_submit/);
  });

  it('the plugin hooks.json carries the same turn-start hook', () => {
    const hooks = read(path.join(repoRoot, 'hooks', 'hooks.json')).hooks;
    assert.match(hooks.UserPromptSubmit[0].hooks[0].command, /notify\.mjs" --source claude$/);
    assert.equal(hooks.UserPromptSubmit[0].hooks[0].timeout, 5);
  });
});

describe('notify.mjs end to end (real subprocess, real local HTTP server)', () => {
  let server;
  let base;
  let received = [];

  before(async () => {
    await new Promise((resolve) => {
      server = http.createServer((req, res) => {
        let body = '';
        req.on('data', (chunk) => { body += chunk; });
        req.on('end', () => { received.push({ url: req.url, body }); res.statusCode = 200; res.end('ok'); });
      });
      server.listen(0, '127.0.0.1', resolve);
    });
    base = `http://127.0.0.1:${server.address().port}`;
  });
  after(() => new Promise((resolve) => server.close(resolve)));
  beforeEach(() => { received = []; });

  const SESSION = 'sess-1234';
  const baseConfig = (minDurationSeconds) => ({
    toast: { enabled: false },
    ntfy: { enabled: false },
    webhook: { enabled: true, url: `${base}/hook`, format: 'generic', richContent: false },
    terminalBell: { enabled: false },
    updateCheck: { enabled: false },
    ...(minDurationSeconds === undefined ? {} : { events: { task_complete: { minDurationSeconds } } }),
  });

  function setupHome(config) {
    const home = tmpDir();
    const cfgDir = path.join(home, '.anotifier');
    fs.mkdirSync(cfgDir, { recursive: true });
    fs.writeFileSync(path.join(cfgDir, 'config.json'), JSON.stringify(config));
    return { home, cfgDir, statePath: path.join(cfgDir, 'turns.json') };
  }

  function runHook(home, payload, { source = 'claude', event } = {}) {
    const env = { ...process.env, HOME: home, USERPROFILE: home };
    for (const k of ['ANTHROPIC_API_KEY', 'GEMINI_API_KEY', 'OPENAI_API_KEY', 'CURSOR_API_KEY', 'NTFY_TOKEN']) delete env[k];
    const args = [NOTIFY, '--source', source, ...(event ? ['--event', event] : [])];
    return new Promise((resolve, reject) => {
      const child = spawn(process.execPath, args, { cwd: repoRoot, env });
      let stdout = ''; let stderr = '';
      child.stdout.on('data', (d) => { stdout += d; });
      child.stderr.on('data', (d) => { stderr += d; });
      child.on('error', reject);
      child.on('close', (status) => resolve({ status, stdout, stderr }));
      child.stdin.end(JSON.stringify(payload));
    });
  }

  const stop = { hook_event_name: 'Stop', cwd: '/work/app', session_id: SESSION };
  const prompt = { hook_event_name: 'UserPromptSubmit', cwd: '/work/app', session_id: SESSION, prompt: 'do it' };
  const webhookMessages = () => received.map((r) => JSON.stringify(JSON.parse(r.body)));

  it('the turn-start hook records a start, sends nothing and answers {}', async () => {
    const { home, statePath } = setupHome(baseConfig(30));
    const res = await runHook(home, prompt);
    assert.equal(res.status, 0, res.stderr);
    assert.equal(res.stdout, '{}\n');
    assert.equal(received.length, 0);
    assert.ok(JSON.parse(fs.readFileSync(statePath, 'utf8'))[`claude:${SESSION}`].startedAt > 0);
  });

  it('a full prompt -> stop pair below the threshold sends nothing', async () => {
    const { home } = setupHome(baseConfig(600));
    await runHook(home, prompt);
    const res = await runHook(home, stop);
    assert.equal(res.status, 0, res.stderr);
    assert.equal(res.stdout, '{}\n');
    assert.equal(received.length, 0, `a short turn must not notify, got ${JSON.stringify(received)}`);
  });

  it('a turn above the threshold is sent, with how long it took', async () => {
    const { home, statePath } = setupHome(baseConfig(30));
    recordTurnStart({ source: 'claude', sessionId: SESSION }, { statePath, now: Date.now() - (4 * 60 + 12) * SEC });
    const res = await runHook(home, stop);
    assert.equal(res.status, 0, res.stderr);
    assert.equal(received.length, 1);
    const body = webhookMessages()[0];
    assert.match(body, /Task complete \(took 4m \d+s\)/);
    assert.match(body, /app · Claude Code/, 'the title is untouched');
  });

  it('the duration shows even with the filter off', async () => {
    const { home, statePath } = setupHome(baseConfig());
    recordTurnStart({ source: 'claude', sessionId: SESSION }, { statePath, now: Date.now() - 90 * SEC });
    await runHook(home, stop);
    assert.equal(received.length, 1);
    assert.match(webhookMessages()[0], /Task complete \(took 1m \d+s\)/);
  });

  it('an unknown duration is never filtered and has no suffix', async () => {
    const { home } = setupHome(baseConfig(600));
    const res = await runHook(home, stop);
    assert.equal(res.status, 0, res.stderr);
    assert.equal(received.length, 1);
    assert.match(webhookMessages()[0], /app: Task complete"/);
    assert.doesNotMatch(webhookMessages()[0], /took/);
  });

  it('permission prompts and questions are sent no matter how high the threshold or how short the turn', async () => {
    const { home } = setupHome(baseConfig(3600));
    await runHook(home, prompt);
    const res = await runHook(home, {
      hook_event_name: 'Notification', cwd: '/work/app', session_id: SESSION,
      notification_type: 'permission_prompt', message: 'Claude needs your permission to use Bash',
    });
    assert.equal(res.status, 0, res.stderr);
    assert.equal(received.length, 1, 'the permission prompt must go out');
    assert.doesNotMatch(webhookMessages()[0], /took/);
    // And the same for an idle/needs-input style notification.
    const res2 = await runHook(home, { hook_event_name: 'Notification', cwd: '/work/app', session_id: SESSION, message: 'Claude needs your input' });
    assert.equal(res2.status, 0, res2.stderr);
    assert.equal(received.length, 2);
  });

  it('a gemini turn is timed by BeforeAgent -> AfterAgent', async () => {
    const { home, statePath } = setupHome(baseConfig(600));
    const sid = 'g-1';
    const geminiStop = { hook_event_name: 'AfterAgent', cwd: '/work/app', session_id: sid };
    await runHook(home, { hook_event_name: 'BeforeAgent', cwd: '/work/app', session_id: sid, prompt: 'x' }, { source: 'gemini' });
    assert.ok(JSON.parse(fs.readFileSync(statePath, 'utf8'))[`gemini:${sid}`]);
    await runHook(home, geminiStop, { source: 'gemini' });
    assert.equal(received.length, 0, 'a short gemini turn is filtered');
  });

  it('cursor has no timing: it is never filtered', async () => {
    const { home } = setupHome(baseConfig(3600));
    const res = await runHook(home, { status: 'completed', conversation_id: 'c-1', cwd: '/work/app' }, { source: 'cursor', event: 'stop' });
    assert.equal(res.status, 0, res.stderr);
    assert.equal(received.length, 1);
    assert.doesNotMatch(webhookMessages()[0], /took/);
  });

  it('the turn-start hook fails open: an unwritable state still exits 0 with {}', async () => {
    const { home, statePath } = setupHome(baseConfig(30));
    fs.mkdirSync(statePath); // a directory where turns.json should be
    const res = await runHook(home, prompt);
    assert.equal(res.status, 0, res.stderr);
    assert.equal(res.stdout, '{}\n');
    // ...and the Stop that follows still notifies, with no duration.
    const res2 = await runHook(home, stop);
    assert.equal(res2.status, 0, res2.stderr);
    assert.equal(received.length, 1);
  });

  it('the turn-start hook survives garbage on stdin', async () => {
    const { home } = setupHome(baseConfig(30));
    const env = { ...process.env, HOME: home, USERPROFILE: home };
    const res = await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [NOTIFY, '--source', 'claude'], { cwd: repoRoot, env });
      let stdout = '';
      child.stdout.on('data', (d) => { stdout += d; });
      child.on('error', reject);
      child.on('close', (status) => resolve({ status, stdout }));
      child.stdin.end('{ nope');
    });
    assert.equal(res.status, 0);
    assert.equal(res.stdout, '{}\n');
  });
});
