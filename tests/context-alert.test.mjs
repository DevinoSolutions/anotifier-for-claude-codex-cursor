// tests/context-alert.test.mjs — Claude Code context-window early warning.
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  resolveAutoCompactWindow, autoCompactDisabled, contextUsage, evaluateContext, buildContextNotification,
  checkContext, effectiveContextThreshold, STATE_TTL_MS, DEFAULT_CONTEXT_THRESHOLD,
} from '../src/context-alert.mjs';
import { useFakeHome } from './fake-home.mjs';
useFakeHome();

const NOW = Date.UTC(2026, 9, 9, 12, 0, 0); // fixed clock
const DAY = 24 * 3600 * 1000;
const payload = (tokens, { size = 1000000, id = 'sess-1', ...rest } = {}) => ({
  session_id: id,
  context_window: { total_input_tokens: tokens, context_window_size: size },
  ...rest,
});

describe('resolveAutoCompactWindow', () => {
  let home, proj;
  beforeEach(() => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), 'aan-ctx-home-'));
    proj = path.join(home, 'project');
  });
  afterEach(() => fs.rmSync(home, { recursive: true, force: true }));
  const put = (file, obj) => {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, typeof obj === 'string' ? obj : JSON.stringify(obj));
  };
  const user = (obj) => put(path.join(home, '.claude', 'settings.json'), obj);
  const projShared = (obj) => put(path.join(proj, '.claude', 'settings.json'), obj);
  const projLocal = (obj) => put(path.join(proj, '.claude', 'settings.local.json'), obj);
  const withProj = (p) => ({ ...p, workspace: { project_dir: proj } });
  const resolve = (p, env = {}) => resolveAutoCompactWindow(p, { env, home });

  it('prefers the (undocumented) payload.auto_compact_window over everything', () => {
    user({ autoCompactWindow: 300000 });
    assert.equal(resolve(payload(1, { auto_compact_window: 400000 }), { CLAUDE_CODE_AUTO_COMPACT_WINDOW: '200000' }), 400000);
  });

  it('ignores a non-positive or non-numeric payload.auto_compact_window', () => {
    for (const bad of [0, -5, NaN, Infinity, '400000', null]) {
      assert.equal(resolve(payload(1, { auto_compact_window: bad })), 1000000, String(bad));
    }
  });

  it('uses the env var next, clamped to [100000, 1000000]', () => {
    user({ autoCompactWindow: 300000 });
    const env = (v) => ({ CLAUDE_CODE_AUTO_COMPACT_WINDOW: v });
    assert.equal(resolve(payload(1), env('250000')), 250000, 'env beats the setting');
    assert.equal(resolve(payload(1), env('50000')), 100000, 'clamped up');
    assert.equal(resolve(payload(1, { size: 2000000 }), env('5000000')), 1000000, 'clamped down');
  });

  it('parses the env var with parseInt semantics: 500k reads as 500 and clamps to the minimum', () => {
    user({ autoCompactWindow: 300000 });
    const env = (v) => ({ CLAUDE_CODE_AUTO_COMPACT_WINDOW: v });
    assert.equal(resolve(payload(1), env('500k')), 100000);
    assert.equal(resolve(payload(1), env(' 250000 ')), 250000);
    assert.equal(resolve(payload(1), env('250000tokens')), 250000);
    assert.equal(resolve(payload(1), env('250.5')), 100000, 'reads as 250, clamps up');
  });

  it('skips an env var with no leading positive integer', () => {
    user({ autoCompactWindow: 300000 });
    for (const bad of ['0', '-1', 'abc', '', '  ', 'k500']) {
      assert.equal(resolve(payload(1), { CLAUDE_CODE_AUTO_COMPACT_WINDOW: bad }), 300000, JSON.stringify(bad));
    }
  });

  it('reads the top-level autoCompactWindow from the user settings (pre-2.1.288 shape)', () => {
    user({ autoCompactWindow: 450000 });
    assert.equal(resolve(payload(1)), 450000);
  });

  it('a per-model setting beats the top-level one in the same file', () => {
    user({ autoCompactWindow: 450000, modelSettings: { 'claude-opus-4': { autoCompactWindow: 300000 } } });
    assert.equal(resolve(payload(1, { model: { id: 'claude-opus-4' } })), 300000);
    assert.equal(resolve(payload(1, { model: { id: 'claude-other' } })), 450000, 'another model falls back to top-level');
    assert.equal(resolve(payload(1)), 450000, 'no model id falls back to top-level');
  });

  it('a per-model "auto" means the model window and beats a top-level number', () => {
    user({ autoCompactWindow: 450000, modelSettings: { 'claude-opus-4': { autoCompactWindow: 'auto' } } });
    const p = payload(1, { model: { id: 'claude-opus-4' } });
    assert.equal(resolve(p), p.context_window.context_window_size);
    assert.equal(resolve(payload(1, { model: { id: 'claude-other' } })), 450000, 'another model keeps the top-level value');
  });

  it('a per-model "auto" in a higher file beats a number in a lower one', () => {
    user({ autoCompactWindow: 300000 });
    projLocal({ modelSettings: { mine: { autoCompactWindow: 'auto' } } });
    const p = withProj(payload(1, { model: { id: 'mine' } }));
    assert.equal(resolve(p), p.context_window.context_window_size);
  });

  it('a model id like __proto__ is not looked up on the prototype', () => {
    user({ autoCompactWindow: 450000, modelSettings: {} });
    assert.equal(resolve(payload(1, { model: { id: '__proto__' } })), 450000);
  });

  it('project local beats project shared beats user settings', () => {
    user({ autoCompactWindow: 400000 });
    assert.equal(resolve(withProj(payload(1))), 400000);
    projShared({ autoCompactWindow: 300000 });
    assert.equal(resolve(withProj(payload(1))), 300000);
    projLocal({ autoCompactWindow: 200000 });
    assert.equal(resolve(withProj(payload(1))), 200000);
    assert.equal(resolve(payload(1)), 400000, 'without a project_dir only the user file counts');
  });

  it('a file without a usable value falls through to the next one', () => {
    user({ autoCompactWindow: 400000 });
    projShared({ autoCompactWindow: 300000 });
    projLocal({ autoCompactWindow: 'big' });
    assert.equal(resolve(withProj(payload(1))), 300000);
    projLocal('{not json');
    assert.equal(resolve(withProj(payload(1))), 300000);
    projLocal({ modelSettings: { other: { autoCompactWindow: 150000 } } });
    assert.equal(resolve(withProj(payload(1, { model: { id: 'mine' } }))), 300000);
  });

  it('ignores ~/.claude/settings.local.json (not a Claude Code user scope)', () => {
    put(path.join(home, '.claude', 'settings.local.json'), { autoCompactWindow: 250000 });
    assert.equal(resolve(payload(1)), 1000000);
    user({ autoCompactWindow: 300000 });
    assert.equal(resolve(payload(1)), 300000);
  });

  it('honours CLAUDE_CONFIG_DIR for the user settings', () => {
    const cfg = path.join(home, 'elsewhere');
    put(path.join(cfg, 'settings.json'), { autoCompactWindow: 350000 });
    user({ autoCompactWindow: 300000 });
    assert.equal(resolve(payload(1), { CLAUDE_CONFIG_DIR: cfg }), 350000);
    assert.equal(resolve(payload(1), { CLAUDE_CONFIG_DIR: '  ' }), 300000, 'blank means the default dir');
    assert.equal(resolve(payload(1)), 300000);
  });

  it('clamps the setting to [100000, 1000000] like the env var', () => {
    user({ autoCompactWindow: 20000 });
    assert.equal(resolve(payload(1)), 100000);
    user({ autoCompactWindow: 5000000 });
    assert.equal(resolve(payload(1, { size: 2000000 })), 1000000);
    user({ modelSettings: { m: { autoCompactWindow: 1000 } } });
    assert.equal(resolve(payload(1, { model: { id: 'm' } })), 100000);
  });

  it('skips unreadable, invalid or wrong-typed settings files silently', () => {
    user({ autoCompactWindow: -4 });
    assert.equal(resolve(payload(1)), 1000000);
    user({ autoCompactWindow: 'big' });
    assert.equal(resolve(payload(1)), 1000000);
    user('[]');
    assert.equal(resolve(payload(1)), 1000000);
    user('{bad');
    assert.equal(resolve(payload(1)), 1000000);
  });

  it('with no settings at all falls back to the model window', () => {
    assert.equal(resolve(payload(1, { size: 200000 })), 200000);
  });

  it('never exceeds the model window', () => {
    user({ autoCompactWindow: 900000 });
    assert.equal(resolve(payload(1, { size: 200000 })), 200000);
    assert.equal(resolve(payload(1, { size: 200000, auto_compact_window: 500000 })), 200000);
    assert.equal(resolve(payload(1, { size: 200000 }), { CLAUDE_CODE_AUTO_COMPACT_WINDOW: '1000000' }), 200000);
  });

  it('has no over-cap fallback: usage past the resolved window keeps that window', () => {
    user({ autoCompactWindow: 450000 });
    assert.equal(resolve(payload(300000)), 450000);
    assert.equal(resolve(payload(460000)), 450000);
    assert.equal(resolve(payload(900000)), 450000);
  });

  it('without a model window, uses the configured value, else null', () => {
    const noModel = { session_id: 's', context_window: { total_input_tokens: 5 } };
    assert.equal(resolve(noModel), null);
    user({ autoCompactWindow: 300000 });
    assert.equal(resolve(noModel), 300000);
    assert.equal(resolve({ session_id: 's' }), 300000);
  });

  it('uses the real filesystem and home by default without throwing', () => {
    assert.doesNotThrow(() => resolveAutoCompactWindow(payload(1), { env: {} }));
  });
});

describe('autoCompactDisabled', () => {
  let home, proj;
  beforeEach(() => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), 'aan-ctx-home-'));
    proj = path.join(home, 'project');
  });
  afterEach(() => fs.rmSync(home, { recursive: true, force: true }));
  const put = (file, obj) => {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(obj));
  };
  const p = () => payload(1, { workspace: { project_dir: proj } });
  const off = (env = {}) => autoCompactDisabled(p(), { env, home });

  it('is false by default', () => {
    assert.equal(off(), false);
  });
  it('is true for DISABLE_AUTO_COMPACT or DISABLE_COMPACT set truthy, false for falsy values', () => {
    for (const name of ['DISABLE_AUTO_COMPACT', 'DISABLE_COMPACT']) {
      for (const v of ['1', 'true', 'TRUE', 'yes', 'on']) assert.equal(off({ [name]: v }), true, name + '=' + v);
      for (const v of ['', '0', 'false', 'no', 'off']) assert.equal(off({ [name]: v }), false, name + '=' + v);
    }
  });
  it('is true when autoCompactEnabled is false in the user settings', () => {
    put(path.join(home, '.claude', 'settings.json'), { autoCompactEnabled: false });
    assert.equal(off(), true);
    put(path.join(home, '.claude', 'settings.json'), { autoCompactEnabled: true });
    assert.equal(off(), false);
  });
  it('the first settings file that defines autoCompactEnabled decides', () => {
    put(path.join(home, '.claude', 'settings.json'), { autoCompactEnabled: false });
    put(path.join(proj, '.claude', 'settings.json'), { autoCompactEnabled: true });
    assert.equal(off(), false, 'project shared re-enables over the user setting');
    put(path.join(proj, '.claude', 'settings.local.json'), { autoCompactEnabled: false });
    assert.equal(off(), true, 'project local wins');
    put(path.join(proj, '.claude', 'settings.local.json'), { other: 1 });
    assert.equal(off(), false, 'a file that does not define it is skipped');
  });
  it('ignores a non-boolean autoCompactEnabled', () => {
    put(path.join(home, '.claude', 'settings.json'), { autoCompactEnabled: 'false' });
    assert.equal(off(), false);
  });
});

describe('contextUsage', () => {
  const dep = { env: {}, home: path.join(os.tmpdir(), 'aan-ctx-no-such-home') };
  it('reports tokens, window and the percentage', () => {
    const u = contextUsage(payload(170000, { size: 200000 }), dep);
    assert.deepEqual([u.sessionId, u.tokens, u.window, u.percent], ['sess-1', 170000, 200000, 85]);
  });
  it('is null without a session id, tokens or any window', () => {
    assert.equal(contextUsage(payload(170000, { size: 200000, id: null }), dep), null);
    assert.equal(contextUsage(payload(170000, { size: 200000, id: '  ' }), dep), null);
    assert.equal(contextUsage(payload(0, { size: 200000 }), dep), null);
    assert.equal(contextUsage({ session_id: 's', context_window: {} }, dep), null);
    assert.equal(contextUsage({ session_id: 's', context_window: { total_input_tokens: 5 } }, dep), null);
    assert.equal(contextUsage(null, dep), null);
  });
  it('is null when auto-compact is disabled', () => {
    assert.equal(contextUsage(payload(170000, { size: 200000 }), { ...dep, env: { DISABLE_AUTO_COMPACT: '1' } }), null);
    assert.equal(contextUsage(payload(170000, { size: 200000 }), { ...dep, env: { DISABLE_COMPACT: 'true' } }), null);
  });
  it('a jump from 300K to 460K against a 450K window still alerts (no over-cap fallback)', () => {
    const d = { ...dep, env: { CLAUDE_CODE_AUTO_COMPACT_WINDOW: '450000' } };
    assert.equal(contextUsage(payload(300000), d).percent < 85, true);
    const u = contextUsage(payload(460000), d);
    assert.deepEqual([u.window, u.percent], [450000, 100]);
    assert.ok(evaluateContext(payload(460000), {}, { ...d, now: NOW }).alert);
  });
  it('caps the percentage at 100', () => {
    assert.equal(contextUsage(payload(250000, { size: 200000 }), dep).percent, 100);
  });
});

describe('evaluateContext', () => {
  const dep = { env: {}, home: path.join(os.tmpdir(), 'aan-ctx-no-such-home'), now: NOW };
  const at = (tokens, over = {}) => payload(tokens, { size: 200000, ...over });

  it('stays quiet below the threshold', () => {
    const r = evaluateContext(at(169999), {}, dep);
    assert.equal(r.alert, null);
    assert.deepEqual({ ...r.state }, {});
  });
  it('alerts exactly at the threshold and records the session', () => {
    const r = evaluateContext(at(170000), {}, dep);
    assert.equal(r.alert.percent, 85);
    assert.equal(r.state['sess-1'], NOW);
  });
  it('alerts above the threshold', () => {
    assert.equal(evaluateContext(at(190000), {}, dep).alert.percent, 95);
  });
  it('honours a custom threshold', () => {
    assert.equal(evaluateContext(at(120000), {}, { ...dep, threshold: 60 }).alert.percent, 60);
    assert.equal(evaluateContext(at(120000), {}, { ...dep, threshold: 61 }).alert, null);
  });
  it('warns once per session, even after usage drops (/compact) and climbs again', () => {
    let r = evaluateContext(at(180000), {}, dep);
    assert.ok(r.alert);
    r = evaluateContext(at(185000), r.state, dep);
    assert.equal(r.alert, null);
    r = evaluateContext(at(20000), r.state, dep);
    assert.equal(r.alert, null);
    r = evaluateContext(at(190000), r.state, dep);
    assert.equal(r.alert, null);
    assert.equal(Object.keys(r.state).length, 1);
  });
  it('warns each session separately', () => {
    let r = evaluateContext(at(180000, { id: 'a' }), {}, dep);
    assert.ok(r.alert);
    r = evaluateContext(at(180000, { id: 'b' }), r.state, dep);
    assert.equal(r.alert.sessionId, 'b');
    assert.deepEqual(Object.keys(r.state).sort(), ['a', 'b']);
    assert.equal(evaluateContext(at(180000, { id: 'a' }), r.state, dep).alert, null);
  });
  it('skips with no session id (cannot dedupe) or zero/missing tokens', () => {
    assert.equal(evaluateContext(at(180000, { id: null }), {}, dep).alert, null);
    assert.equal(evaluateContext(at(0), {}, dep).alert, null);
    assert.equal(evaluateContext({ session_id: 's', context_window: { context_window_size: 200000 } }, {}, dep).alert, null);
  });
  it('prunes entries older than 14 days when it writes, keeping the fresh ones', () => {
    const old = { stale: NOW - STATE_TTL_MS - 1, edge: NOW - STATE_TTL_MS, fresh: NOW - DAY, junk: 'x', bad: null };
    const r = evaluateContext(at(180000), old, dep);
    assert.deepEqual(Object.keys(r.state).sort(), ['edge', 'fresh', 'sess-1']);
  });
  it('does not touch the state when it does not alert', () => {
    const old = { stale: NOW - 30 * DAY };
    assert.equal(evaluateContext(at(1000), old, dep).state, old);
  });
  it('a session id like __proto__ is an ordinary key, not a prototype write', () => {
    const r = evaluateContext(at(180000, { id: '__proto__' }), {}, dep);
    assert.ok(r.alert);
    assert.equal(Object.getPrototypeOf(r.state), null);
    assert.equal(JSON.parse(JSON.stringify(r.state)).__proto__, NOW);
    assert.equal({}.polluted, undefined);
  });
});

describe('buildContextNotification', () => {
  const alert = { sessionId: 'abcdef123456', tokens: 174400, window: 200000, percent: 87.2 };
  const p = { session_id: 'abcdef123456', workspace: { project_dir: '/home/me/my-app' } };

  it('has the documented title and message', () => {
    const n = buildContextNotification(alert, p);
    assert.equal(n.title, 'Claude Code · context at 87%');
    assert.equal(n.message,
      'my-app [abcdef12] is at 87% of its auto-compact window (174K of 200K tokens). ' +
      'It will compact soon — wrap up or /compact now.');
  });
  it('uses the session name when there is one', () => {
    const n = buildContextNotification(alert, { ...p, session_name: 'refactor' });
    assert.match(n.message, /^refactor \(my-app\) \[abcdef12\] is at 87%/);
  });
  it('rounds the token counts to thousands', () => {
    const n = buildContextNotification({ ...alert, tokens: 169500, window: 199600, percent: 84.9 }, p);
    assert.match(n.message, /\(170K of 200K tokens\)/);
  });
  it('carries the delivery fields: high priority, brain, Reminder, no click-to-focus', () => {
    const n = buildContextNotification(alert, p);
    assert.equal(n.priority, 'high');
    assert.equal(n.ntfyTags, 'brain');
    assert.equal(n.toastSound, 'Reminder');
    assert.equal(n.event, 'context_limit');
    assert.equal(n.clickToFocus, false);
    assert.equal(n.icon, '');
    assert.equal(n.source, 'claude');
    assert.equal(n.projectName, 'my-app [abcdef12]');
  });
});

describe('effectiveContextThreshold', () => {
  it('uses a valid configured threshold, else 85', () => {
    assert.equal(effectiveContextThreshold({ contextAlerts: { threshold: 60 } }), 60);
    assert.equal(effectiveContextThreshold({ contextAlerts: { threshold: 100 } }), 100);
    for (const bad of [0, -1, 101, '90', null, NaN]) {
      assert.equal(effectiveContextThreshold({ contextAlerts: { threshold: bad } }), DEFAULT_CONTEXT_THRESHOLD, String(bad));
    }
    assert.equal(effectiveContextThreshold({}), 85);
    assert.equal(effectiveContextThreshold(undefined), 85);
  });
});

describe('checkContext', () => {
  let dir, statePath;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aan-ctx-'));
    statePath = path.join(dir, '.context-alerts.json');
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));
  const cfg = { contextAlerts: { enabled: true, threshold: 85 } };
  const opts = (over = {}) => ({ statePath, now: NOW, env: {}, home: path.join(dir, 'home'), ...over });
  const at = (tokens, over = {}) => payload(tokens, { size: 200000, ...over });
  const stored = () => JSON.parse(fs.readFileSync(statePath, 'utf8'));

  it('alerts once, records the session, and releases the lock', () => {
    const first = checkContext(at(180000), cfg, opts());
    assert.equal(first.length, 1);
    assert.equal(first[0].event, 'context_limit');
    assert.deepEqual(stored(), { 'sess-1': NOW });
    assert.ok(!fs.existsSync(`${statePath}.lock`));
    assert.deepEqual(checkContext(at(190000), cfg, opts()), []);
    assert.equal(checkContext(at(180000, { id: 'sess-2' }), cfg, opts()).length, 1);
    assert.deepEqual(Object.keys(stored()).sort(), ['sess-1', 'sess-2']);
  });

  it('stays quiet and writes nothing below the threshold', () => {
    assert.deepEqual(checkContext(at(100000), cfg, opts()), []);
    assert.ok(!fs.existsSync(statePath));
  });

  it('uses the configured threshold', () => {
    const low = { contextAlerts: { enabled: true, threshold: 40 } };
    assert.equal(checkContext(at(100000), low, opts()).length, 1);
  });

  it('enabled:false sends and records nothing', () => {
    assert.deepEqual(checkContext(at(190000), { contextAlerts: { enabled: false } }, opts()), []);
    assert.ok(!fs.existsSync(statePath));
  });

  it('no session id or zero tokens sends and records nothing', () => {
    assert.deepEqual(checkContext(at(190000, { id: null }), cfg, opts()), []);
    assert.deepEqual(checkContext(at(0), cfg, opts()), []);
    assert.ok(!fs.existsSync(statePath));
  });

  it('a held (fresh) lock means skip, and nothing is recorded', () => {
    fs.writeFileSync(`${statePath}.lock`, '');
    assert.deepEqual(checkContext(at(190000), cfg, opts()), []);
    assert.ok(!fs.existsSync(statePath));
    assert.ok(fs.existsSync(`${statePath}.lock`), 'does not steal a live lock');
  });

  it('a stale lock is cleared and the check proceeds', () => {
    const lock = `${statePath}.lock`;
    fs.writeFileSync(lock, '');
    const old = new Date(Date.now() - 60000);
    fs.utimesSync(lock, old, old);
    assert.equal(checkContext(at(190000), cfg, opts()).length, 1);
  });

  it('prunes stale sessions from the file on write', () => {
    fs.writeFileSync(statePath, JSON.stringify({ old: NOW - 15 * DAY, recent: NOW - DAY }));
    checkContext(at(190000), cfg, opts());
    assert.deepEqual(Object.keys(stored()).sort(), ['recent', 'sess-1']);
  });

  it('treats a corrupt state file as empty', () => {
    fs.writeFileSync(statePath, '{broken');
    assert.equal(checkContext(at(190000), cfg, opts()).length, 1);
    assert.deepEqual(stored(), { 'sess-1': NOW });
  });

  it('measures against the configured auto-compact window', () => {
    // 150K of the 1M model window is 15%, but of a 170K auto-compact window it is 88%.
    const env = { CLAUDE_CODE_AUTO_COMPACT_WINDOW: '170000' };
    assert.deepEqual(checkContext(payload(150000), cfg, opts()), []);
    const [n] = checkContext(payload(150000), cfg, opts({ env }));
    assert.match(n.message, /88% of its auto-compact window \(150K of 170K tokens\)/);
  });

  it('sends and records nothing when auto-compact is disabled', () => {
    assert.deepEqual(checkContext(at(190000), cfg, opts({ env: { DISABLE_AUTO_COMPACT: '1' } })), []);
    assert.ok(!fs.existsSync(statePath));
  });

  it('a state file that cannot be read (not ENOENT) skips the run and is left alone', () => {
    // A directory where the file should be: readFileSync throws EISDIR, the
    // same class of failure as EBUSY or EACCES.
    fs.mkdirSync(statePath);
    assert.deepEqual(checkContext(at(190000), cfg, opts()), []);
    assert.ok(fs.statSync(statePath).isDirectory(), 'nothing was written over it');
    assert.ok(!fs.existsSync(`${statePath}.lock`));
  });

  it('a read error is not treated as an empty state, so other sessions are not wiped', () => {
    const seen = { 'other-session': NOW - DAY };
    fs.writeFileSync(statePath, JSON.stringify(seen));
    const realRead = fs.readFileSync;
    fs.readFileSync = (p, ...rest) => {
      if (p === statePath) throw Object.assign(new Error('busy'), { code: 'EBUSY' });
      return realRead.call(fs, p, ...rest);
    };
    try {
      assert.deepEqual(checkContext(at(190000), cfg, opts()), []);
    } finally {
      fs.readFileSync = realRead;
    }
    assert.deepEqual(stored(), seen);
  });

  it('a missing state file and unparseable content both count as empty', () => {
    assert.equal(checkContext(at(190000), cfg, opts()).length, 1);
    fs.writeFileSync(statePath, '[1,2');
    assert.equal(checkContext(at(190000, { id: 'again' }), cfg, opts()).length, 1);
  });

  it('never throws, even when the state path is unusable', () => {
    fs.writeFileSync(path.join(dir, 'file'), 'x');
    assert.deepEqual(checkContext(at(190000), cfg, opts({ statePath: path.join(dir, 'file', 'nested', 's.json') })), []);
  });
});
