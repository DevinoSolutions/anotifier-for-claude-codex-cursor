// tests/usage-alert.test.mjs — Claude Code usage-limit early warning.
import { describe, it, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  evaluateUsage, effectiveThresholds, formatReset, chatLabel,
  buildUsageNotification, checkUsage, sendUsageNotifications, DEFAULT_THRESHOLDS, withLock,
} from '../src/usage-alert.mjs';
import { useFakeHome } from './fake-home.mjs';
import { readRecentHookErrors } from '../src/error-log.mjs';
useFakeHome();

const NOW = Date.UTC(2026, 9, 9, 12, 0, 0); // fixed clock
const nowSec = NOW / 1000;
const payload = (five, seven) => ({
  rate_limits: {
    ...(five !== undefined && { five_hour: five }),
    ...(seven !== undefined && { seven_day: seven }),
  },
});
const win = (used, resetsAt = nowSec + 3600) => ({ used_percentage: used, resets_at: resetsAt });

describe('evaluateUsage', () => {
  it('stays quiet below the first threshold', () => {
    const { alerts, state } = evaluateUsage(payload(win(69.9)), {}, { now: NOW });
    assert.deepEqual(alerts, []);
    assert.equal(state.five_hour.level, 0);
  });

  it('alerts when 70 is crossed', () => {
    const { alerts, state } = evaluateUsage(payload(win(70)), {}, { now: NOW });
    assert.equal(alerts.length, 1);
    assert.deepEqual([alerts[0].window, alerts[0].threshold, alerts[0].used], ['five_hour', 70, 70]);
    assert.equal(state.five_hour.level, 70);
  });

  it('a jump straight to 96 sends only the 95 alert', () => {
    const { alerts } = evaluateUsage(payload(win(96)), {}, { now: NOW });
    assert.deepEqual(alerts.map((a) => a.threshold), [95]);
  });

  it('never re-alerts at the same level, but does at the next one', () => {
    let r = evaluateUsage(payload(win(72)), {}, { now: NOW });
    r = evaluateUsage(payload(win(75)), r.state, { now: NOW });
    assert.deepEqual(r.alerts, []);
    r = evaluateUsage(payload(win(86)), r.state, { now: NOW });
    assert.deepEqual(r.alerts.map((a) => a.threshold), [85]);
    r = evaluateUsage(payload(win(86)), r.state, { now: NOW });
    assert.deepEqual(r.alerts, []);
  });

  it('a usage dip does not lower the recorded level', () => {
    let r = evaluateUsage(payload(win(90)), {}, { now: NOW });
    r = evaluateUsage(payload(win(72)), r.state, { now: NOW });
    assert.deepEqual(r.alerts, []);
    assert.equal(r.state.five_hour.level, 85);
  });

  it('alerts again in a new window once resets_at has passed', () => {
    const first = evaluateUsage(payload(win(80, nowSec + 60)), {}, { now: NOW });
    assert.equal(first.alerts.length, 1);
    const later = NOW + 120 * 1000;
    const next = evaluateUsage(payload(win(75, nowSec + 5 * 3600)), first.state, { now: later });
    assert.deepEqual(next.alerts.map((a) => a.threshold), [70]);
  });

  it('a stale payload for a window that already reset never re-alerts', () => {
    // A chat with no API response since the reset keeps sending the old numbers.
    const first = evaluateUsage(payload(win(88, nowSec + 60)), {}, { now: NOW });
    assert.deepEqual(first.alerts.map((a) => a.threshold), [85]);
    let state = first.state;
    for (let i = 1; i <= 5; i++) {
      const r = evaluateUsage(payload(win(88, nowSec + 60)), state, { now: NOW + (60 + i * 10) * 1000 });
      assert.deepEqual(r.alerts, [], `refresh ${i} after the reset`);
      assert.deepEqual(r.state, state, 'a dead window leaves the state alone');
      state = r.state;
    }
  });

  it('our clock running ahead of the reset time sends nothing for the old payload', () => {
    const first = evaluateUsage(payload(win(90, nowSec + 30)), {}, { now: NOW });
    const ahead = evaluateUsage(payload(win(90, nowSec + 30)), first.state, { now: NOW + 120 * 1000 });
    assert.deepEqual(ahead.alerts, []);
  });

  it('two chats across a reset: the lagging chat cannot re-announce the old window', () => {
    const r0 = nowSec + 60;
    const r1 = nowSec + 5 * 3600;
    let { state } = evaluateUsage(payload(win(90, r0)), {}, { now: NOW });
    const after = NOW + 120 * 1000;
    for (let round = 0; round < 3; round++) {
      const b = evaluateUsage(payload(win(20, r1)), state, { now: after + round * 1000 }); // caught-up chat
      assert.deepEqual(b.alerts, []);
      const a = evaluateUsage(payload(win(90, r0)), b.state, { now: after + round * 1000 + 500 }); // idle chat
      assert.deepEqual(a.alerts, [], `round ${round}`);
      state = a.state;
    }
    assert.equal(state.five_hour.resetsAt, r1);
    assert.equal(state.five_hour.level, 0);
  });

  it('a far-future resets_at (milliseconds, garbage) never poisons the stored window', () => {
    const bad = evaluateUsage(payload(win(10, (nowSec + 3600) * 1000)), {}, { now: NOW });
    assert.equal(bad.state.five_hour.resetsAt, null);
    const good = evaluateUsage(payload(win(72, nowSec + 3600)), bad.state, { now: NOW + 1000 });
    assert.deepEqual(good.alerts.map((a) => a.threshold), [70]);
    // A poisoned value already on disk is dropped too.
    const healed = evaluateUsage(payload(win(72, nowSec + 3600)), { five_hour: { resetsAt: (nowSec + 3600) * 1000, level: 0 } }, { now: NOW });
    assert.deepEqual(healed.alerts.map((a) => a.threshold), [70]);
  });

  it('a resets_at that moves later by more than 10 minutes is a new window', () => {
    const first = evaluateUsage(payload(win(80, nowSec + 3600)), {}, { now: NOW });
    const next = evaluateUsage(payload(win(75, nowSec + 3600 + 11 * 60)), first.state, { now: NOW });
    assert.equal(next.alerts.length, 1);
  });

  it('a resets_at that moves later by under 10 minutes is the same window', () => {
    const first = evaluateUsage(payload(win(80, nowSec + 3600)), {}, { now: NOW });
    const next = evaluateUsage(payload(win(80, nowSec + 3600 + 9 * 60)), first.state, { now: NOW });
    assert.deepEqual(next.alerts, []);
  });

  it('without resets_at, usage draining well below the first threshold starts a new window', () => {
    let r = evaluateUsage(payload({ used_percentage: 80 }), {}, { now: NOW });
    assert.equal(r.alerts.length, 1);
    assert.equal(r.state.five_hour.resetsAt, null);
    r = evaluateUsage(payload({ used_percentage: 80 }), r.state, { now: NOW });
    assert.deepEqual(r.alerts, [], 'same window, no repeat');
    r = evaluateUsage(payload({ used_percentage: 5 }), r.state, { now: NOW });
    assert.equal(r.state.five_hour.level, 0);
    r = evaluateUsage(payload({ used_percentage: 71 }), r.state, { now: NOW });
    assert.deepEqual(r.alerts.map((a) => a.threshold), [70]);
  });

  it('adopts a resets_at that shows up after the window was first seen without one', () => {
    let r = evaluateUsage(payload({ used_percentage: 80 }), {}, { now: NOW });
    r = evaluateUsage(payload(win(80, nowSec + 3600)), r.state, { now: NOW });
    assert.equal(r.state.five_hour.resetsAt, nowSec + 3600);
    assert.deepEqual(r.alerts, []);
  });

  it('skips a missing, NaN or non-numeric window and a missing rate_limits', () => {
    assert.deepEqual(evaluateUsage({}, {}, { now: NOW }), { alerts: [], state: {} });
    assert.deepEqual(evaluateUsage(null, null, { now: NOW }), { alerts: [], state: {} });
    for (const bad of [undefined, { used_percentage: NaN }, { used_percentage: '90' }, { resets_at: 1 }, null]) {
      const r = evaluateUsage(payload(bad), {}, { now: NOW });
      assert.deepEqual(r.alerts, []);
      assert.equal(r.state.five_hour, undefined);
    }
  });

  it('handles both windows in one call, one alert each', () => {
    const r = evaluateUsage(payload(win(96), win(71)), {}, { now: NOW });
    assert.deepEqual(r.alerts.map((a) => [a.window, a.threshold]), [['five_hour', 95], ['seven_day', 70]]);
  });

  it('does not mutate the stored state it was given', () => {
    const state = { five_hour: { resetsAt: nowSec + 100, level: 70 } };
    evaluateUsage(payload(win(90, nowSec + 100)), state, { now: NOW });
    assert.equal(state.five_hour.level, 70);
  });

  it('honours custom thresholds', () => {
    const r = evaluateUsage(payload(win(51)), {}, { thresholds: [50, 80], now: NOW });
    assert.deepEqual(r.alerts.map((a) => a.threshold), [50]);
  });
});

describe('effectiveThresholds', () => {
  it('uses a valid configured list, sorted and deduped', () => {
    assert.deepEqual(effectiveThresholds({ usageAlerts: { thresholds: [90, 50, 90, 100] } }), [50, 90, 100]);
  });
  it('falls back to the defaults on bad input', () => {
    for (const cfg of [undefined, {}, { usageAlerts: {} }, { usageAlerts: { thresholds: 'x' } },
      { usageAlerts: { thresholds: [] } }, { usageAlerts: { thresholds: [0, -5, 101, '70', NaN] } }]) {
      assert.deepEqual(effectiveThresholds(cfg), DEFAULT_THRESHOLDS);
    }
  });
  it('drops bad entries but keeps good ones', () => {
    assert.deepEqual(effectiveThresholds({ usageAlerts: { thresholds: [60, 'x', 200] } }), [60]);
  });
});

describe('formatReset', () => {
  // Built from local-time components so the assertions hold in any TZ.
  const base = new Date(2026, 9, 9, 9, 0, 0).getTime();

  it('returns null without a numeric timestamp', () => {
    assert.equal(formatReset(undefined, NOW), null);
    assert.equal(formatReset('123', NOW), null);
  });
  it('a reset later today has no weekday and a relative time', () => {
    const at = new Date(2026, 9, 9, 11, 10, 0).getTime();
    assert.equal(formatReset(at / 1000, base), '11:10 (in 2h 10m)');
  });
  it('a reset on another day carries a weekday and days/hours', () => {
    const at = new Date(2026, 9, 12, 13, 30, 0).getTime();
    assert.match(formatReset(at / 1000, base), /^[A-Z][a-z]{2} 13:30 \(in 3d 4h\)$/);
  });
  it('minutes only when under an hour, and never negative', () => {
    assert.equal(formatReset((base + 25 * 60000) / 1000, base), '09:25 (in 25m)');
    assert.match(formatReset((base - 60000) / 1000, base), /\(in 0m\)$/);
  });
});

describe('chatLabel', () => {
  it('prefers the session name with the project and a short id', () => {
    assert.equal(
      chatLabel({ session_name: 'refactor', workspace: { project_dir: '/home/me/app' }, session_id: 'abcdef123456' }),
      'refactor (app) [abcdef12]');
  });
  it('uses just the name when it equals the project', () => {
    assert.equal(chatLabel({ session_name: 'app', cwd: '/x/app' }), 'app');
  });
  it('falls back through project_dir, current_dir, cwd', () => {
    assert.equal(chatLabel({ workspace: { project_dir: '/a/proj/', current_dir: '/b/other' } }), 'proj');
    assert.equal(chatLabel({ workspace: { current_dir: '/b/thing' } }), 'thing');
    assert.equal(chatLabel({ cwd: '/c/cwd-dir' }), 'cwd-dir');
  });
  it('is "Claude Code" with nothing to go on, and tolerates junk', () => {
    assert.equal(chatLabel({}), 'Claude Code');
    assert.equal(chatLabel(null), 'Claude Code');
    assert.equal(chatLabel({ session_name: 5, session_id: 7 }), 'Claude Code');
  });
  it('appends just the id when there is no name or folder', () => {
    assert.equal(chatLabel({ session_id: '1234567890' }), 'Claude Code [12345678]');
  });
});

describe('buildUsageNotification', () => {
  const p = { workspace: { project_dir: '/x/app' } };
  const at = (threshold, window = 'five_hour', used = threshold + 1) =>
    buildUsageNotification({ window, threshold, used, resetsAt: nowSec + 3600 }, p, NOW);

  it('maps thresholds to priority', () => {
    assert.equal(at(70).priority, 'default');
    assert.equal(at(84).priority, 'default');
    assert.equal(at(85).priority, 'high');
    assert.equal(at(94).priority, 'high');
    assert.equal(at(95).priority, 'urgent');
    assert.equal(at(100).priority, 'urgent');
  });
  it('builds title, message and routing fields', () => {
    const n = at(85, 'seven_day', 86.4);
    assert.equal(n.title, 'Claude Code · weekly limit at 86%');
    assert.match(n.message, /^app crossed 85% of the weekly usage limit\. Resets /);
    assert.equal(n.event, 'usage_limit');
    assert.equal(n.source, 'claude');
    assert.equal(n.projectName, 'app');
    assert.equal(n.clickToFocus, false);
    assert.equal(at(70).title, 'Claude Code · 5-hour limit at 71%');
  });
  it('omits the reset sentence when resets_at is unknown', () => {
    const n = buildUsageNotification({ window: 'five_hour', threshold: 70, used: 71, resetsAt: null }, p, NOW);
    assert.ok(!/Resets/.test(n.message));
  });
});

describe('checkUsage', () => {
  let dir, statePath;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aan-usage-'));
    statePath = path.join(dir, '.usage-alerts.json');
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));
  const cfg = { usageAlerts: { enabled: true, thresholds: [70, 85, 95] } };

  it('dedups across calls through the shared state file', () => {
    const p = payload(win(80));
    const first = checkUsage(p, cfg, { statePath, now: NOW });
    assert.equal(first.length, 1);
    assert.equal(first[0].event, 'usage_limit');
    assert.equal(JSON.parse(fs.readFileSync(statePath, 'utf8')).five_hour.level, 70);
    assert.deepEqual(checkUsage(p, cfg, { statePath, now: NOW }), []);
    // A different chat sees the same account numbers: still silent.
    assert.deepEqual(checkUsage({ ...p, session_id: 'other' }, cfg, { statePath, now: NOW }), []);
    // The next level does alert.
    assert.equal(checkUsage(payload(win(90)), cfg, { statePath, now: NOW }).length, 1);
  });

  it('records state before returning, and releases the lock', () => {
    checkUsage(payload(win(99)), cfg, { statePath, now: NOW });
    assert.ok(fs.existsSync(statePath));
    assert.ok(!fs.existsSync(`${statePath}.lock`));
  });

  it('enabled:false sends and records nothing', () => {
    const off = { usageAlerts: { enabled: false } };
    assert.deepEqual(checkUsage(payload(win(99)), off, { statePath, now: NOW }), []);
    assert.ok(!fs.existsSync(statePath));
  });

  it('no rate_limits sends and records nothing', () => {
    assert.deepEqual(checkUsage({}, cfg, { statePath, now: NOW }), []);
    assert.ok(!fs.existsSync(statePath));
  });

  it('a held (fresh) lock means skip', () => {
    fs.writeFileSync(`${statePath}.lock`, '');
    assert.deepEqual(checkUsage(payload(win(99)), cfg, { statePath, now: NOW }), []);
    assert.ok(!fs.existsSync(statePath));
    assert.ok(fs.existsSync(`${statePath}.lock`), 'does not steal a live lock');
  });

  it('a stale lock is cleared and the check proceeds', () => {
    const lock = `${statePath}.lock`;
    fs.writeFileSync(lock, '');
    const old = new Date(Date.now() - 60000);
    fs.utimesSync(lock, old, old);
    assert.equal(checkUsage(payload(win(99)), cfg, { statePath, now: NOW }).length, 1);
  });

  it('a corrupt state file is treated as empty', () => {
    fs.writeFileSync(statePath, '{not json');
    assert.equal(checkUsage(payload(win(75)), cfg, { statePath, now: NOW }).length, 1);
  });
});

describe('sendUsageNotifications', () => {
  const n = { title: 't', message: 'm', event: 'usage_limit' };
  function rig() {
    const calls = { toast: [], ntfy: [], webhook: [] };
    return {
      calls,
      deps: {
        resolveBackend: async () => async (x) => { calls.toast.push(x); },
        ntfy: async (c, x) => { calls.ntfy.push([c, x]); },
        webhook: async (c, x) => { calls.webhook.push([c, x]); },
      },
    };
  }

  it('sends to every enabled channel', async () => {
    const { calls, deps } = rig();
    const config = {
      toast: { enabled: true },
      ntfy: { enabled: true, topic: 'tp' },
      webhook: { enabled: true, url: 'https://example.invalid/h' },
    };
    await sendUsageNotifications(config, [n], deps);
    assert.deepEqual([calls.toast.length, calls.ntfy.length, calls.webhook.length], [1, 1, 1]);
    assert.equal(calls.ntfy[0][0], config.ntfy);
  });

  it('skips channels that are off or incomplete', async () => {
    const { calls, deps } = rig();
    await sendUsageNotifications({
      toast: { enabled: false },
      ntfy: { enabled: true, topic: '' },
      webhook: { enabled: true, url: '' },
    }, [n], deps);
    assert.deepEqual([calls.toast.length, calls.ntfy.length, calls.webhook.length], [0, 0, 0]);
  });

  it('toast defaults on when the block is absent, and ntfy/webhook default off', async () => {
    const { calls, deps } = rig();
    await sendUsageNotifications({}, [n, n], deps);
    assert.deepEqual([calls.toast.length, calls.ntfy.length, calls.webhook.length], [2, 0, 0]);
  });

  it('one failing channel does not stop the others or throw', async () => {
    const { calls, deps } = rig();
    deps.ntfy = async () => { throw new Error('boom'); };
    const res = await sendUsageNotifications({
      toast: { enabled: true }, ntfy: { enabled: true, topic: 't' },
      webhook: { enabled: true, url: 'https://x.invalid' },
    }, [n], deps);
    assert.equal(calls.toast.length, 1);
    assert.equal(calls.webhook.length, 1);
    assert.equal(res.filter((r) => r.status === 'rejected').length, 1);
  });
});

describe('withLock on a lock being released (Windows EPERM)', () => {
  let dir;
  beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'an-lock-')); });
  afterEach(() => { mock.restoreAll(); fs.rmSync(dir, { recursive: true, force: true }); });

  const eperm = () => Object.assign(new Error('EPERM: operation not permitted'), { code: 'EPERM' });
  const lockErrors = (label) => readRecentHookErrors(200).filter((e) => e.context === label).length;
  // Fail only for the lock path: on Node 18, appendFileSync (the error log)
  // goes through fs.openSync too, and must keep working.
  const failFor = (method, target) => {
    const real = fs[method];
    mock.method(fs, method, function (p, ...rest) {
      if (p === target) throw eperm();
      return real.call(fs, p, ...rest);
    });
  };

  it('EPERM while a fresh lock file exists is contention: skip quietly', () => {
    const lock = path.join(dir, 's.json.lock');
    fs.writeFileSync(lock, '');
    const before = lockErrors('test:lock-busy');
    failFor('openSync', lock);
    let ran = false;
    assert.equal(withLock(lock, () => { ran = true; return 1; }, 'test:lock-busy'), null);
    assert.equal(ran, false);
    assert.equal(lockErrors('test:lock-busy'), before, 'not logged');
  });

  it('EPERM with no lock file, still failing on the retry, is a real problem: logged once', () => {
    const lock = path.join(dir, 'missing.json.lock');
    const before = lockErrors('test:lock-perm');
    failFor('openSync', lock);
    let ran = false;
    assert.equal(withLock(lock, () => { ran = true; return 1; }, 'test:lock-perm'), null);
    assert.equal(ran, false);
    assert.equal(lockErrors('test:lock-perm'), before + 1);
  });

  it('EPERM whose lock vanished before the stat is retried once and then runs', () => {
    const lock = path.join(dir, 'raced.json.lock');
    const before = lockErrors('test:lock-raced');
    const real = fs.openSync;
    let lockOpens = 0;
    mock.method(fs, 'openSync', function (p, ...rest) {
      if (p === lock && ++lockOpens === 1) throw eperm();
      return real.call(fs, p, ...rest);
    });
    assert.equal(withLock(lock, () => 'ran', 'test:lock-raced'), 'ran');
    assert.equal(lockOpens, 2, 'retried exactly once');
    assert.equal(lockErrors('test:lock-raced'), before, 'not logged');
    assert.equal(fs.existsSync(lock), false, 'lock released');
  });

  it('EPERM then EEXIST on the retry is contention: skip quietly', () => {
    const lock = path.join(dir, 'taken.json.lock');
    const before = lockErrors('test:lock-taken');
    const real = fs.openSync;
    let lockOpens = 0;
    mock.method(fs, 'openSync', function (p, ...rest) {
      if (p === lock) {
        lockOpens++;
        throw lockOpens === 1 ? eperm() : Object.assign(new Error('EEXIST: file already exists'), { code: 'EEXIST' });
      }
      return real.call(fs, p, ...rest);
    });
    let ran = false;
    assert.equal(withLock(lock, () => { ran = true; return 1; }, 'test:lock-taken'), null);
    assert.equal(ran, false);
    assert.equal(lockOpens, 2);
    assert.equal(lockErrors('test:lock-taken'), before, 'not logged');
  });

  it('a non-release error code is logged at once, with no retry', () => {
    const lock = path.join(dir, 'notdir.json.lock');
    const before = lockErrors('test:lock-notdir');
    const real = fs.openSync;
    let lockOpens = 0;
    mock.method(fs, 'openSync', function (p, ...rest) {
      if (p === lock) {
        lockOpens++;
        throw Object.assign(new Error('ENOTDIR: not a directory'), { code: 'ENOTDIR' });
      }
      return real.call(fs, p, ...rest);
    });
    let ran = false;
    assert.equal(withLock(lock, () => { ran = true; return 1; }, 'test:lock-notdir'), null);
    assert.equal(ran, false);
    assert.equal(lockOpens, 1, 'no retry');
    assert.equal(lockErrors('test:lock-notdir'), before + 1);
  });

  it('a stale lock that cannot be deleted is logged, not skipped forever', () => {
    const lock = path.join(dir, 'stuck.json.lock');
    fs.writeFileSync(lock, '');
    const old = new Date(Date.now() - 60000);
    fs.utimesSync(lock, old, old);
    const before = lockErrors('test:lock-stuck');
    failFor('unlinkSync', lock);
    failFor('openSync', lock);
    assert.equal(withLock(lock, () => 1, 'test:lock-stuck'), null);
    assert.equal(lockErrors('test:lock-stuck'), before + 1);
  });
});
