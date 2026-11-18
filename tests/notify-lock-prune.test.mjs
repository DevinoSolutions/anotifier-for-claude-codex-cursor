// tests/notify-lock-prune.test.mjs -- the sweep that removes old dedup locks
// (`.lock-<source>-<event>-<session8>[-<type>]` in ~/.anotifier) when a run wins a
// new one. Dedup itself (the 1.5 s window, per-key and per-session independence)
// is pinned in notify-dedup.test.mjs and notify-unit.test.mjs; here we prove the
// sweep removes only stale locks of THIS mechanism, is bounded, never throws, and
// leaves dedup behaving exactly as before.
//
// No network, and nothing touches the real home: every directory is a throwaway
// under os.tmpdir(). The names other modules use are taken from their own
// exports (only the file NAME is read from them, nothing at those paths is
// opened), so a rename over there would fail this file instead of silently
// colliding.
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  pruneStaleLocks, acquireNotifyLock, dedupKey,
  LOCK_PRUNE_AGE_MS, LOCK_PRUNE_MAX_ENTRIES, LOCK_PRUNE_MAX_REMOVALS,
} from '../src/notify.mjs';
import { STATE_PATH as USAGE_STATE } from '../src/usage-alert.mjs';
import { STATE_PATH as TELEMETRY_STATE } from '../src/telemetry.mjs';
import { contextStatePath } from '../src/context-alert.mjs';
import { turnStatePath } from '../src/turn-timer.mjs';
import { approvalsDir } from '../src/approval.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const NOW = Date.now();
const MIN = 60 * 1000;
const STALE = new Date(NOW - 11 * MIN); // older than LOCK_PRUNE_AGE_MS (10 min)
const FRESH = new Date(NOW - 1 * MIN);

describe('pruneStaleLocks', () => {
  let dir;
  beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aan-prune-')); });
  afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

  const put = (name, mtime) => {
    const file = path.join(dir, name);
    fs.writeFileSync(file, '1234');
    if (mtime) fs.utimesSync(file, mtime, mtime);
    return file;
  };
  const names = () => fs.readdirSync(dir).sort();

  it('the chosen age is minutes and far above the dedup window', () => {
    assert.ok(LOCK_PRUNE_AGE_MS >= 5 * MIN, 'minutes, not the 1.5 s window');
    assert.ok(LOCK_PRUNE_MAX_ENTRIES > 0 && LOCK_PRUNE_MAX_REMOVALS > 0);
  });

  it('removes stale locks and keeps fresh ones', () => {
    put('.lock-claude-task_complete-aaaaaaaa', STALE);
    put('.lock-cursor-task_complete-bbbbbbbb', STALE);
    put('.lock-claude-needs_input-permission_prompt-cccccccc', STALE);
    put('.lock-claude-task_complete-dddddddd', FRESH);
    put('.lock-codex-needs_input', new Date(NOW - 30 * 1000));
    pruneStaleLocks(dir, { now: NOW });
    assert.deepEqual(names(), ['.lock-claude-task_complete-dddddddd', '.lock-codex-needs_input']);
  });

  it('the age boundary: exactly the prune age is kept, one second more goes', () => {
    put('.lock-a-x-1', new Date(NOW - LOCK_PRUNE_AGE_MS));
    put('.lock-a-x-2', new Date(NOW - LOCK_PRUNE_AGE_MS - 1000));
    pruneStaleLocks(dir, { now: NOW });
    assert.deepEqual(names(), ['.lock-a-x-1']);
  });

  it('a lock from the future (clock stepped back) is kept', () => {
    put('.lock-a-x-future', new Date(NOW + 60 * MIN));
    pruneStaleLocks(dir, { now: NOW });
    assert.deepEqual(names(), ['.lock-a-x-future']);
  });

  it('never removes the lock the caller just created, however old it looks', () => {
    put('.lock-mine', STALE);
    put('.lock-other', STALE);
    pruneStaleLocks(dir, { now: NOW, keep: '.lock-mine' });
    assert.deepEqual(names(), ['.lock-mine']);
  });

  it('a directory named like a lock is not touched', () => {
    fs.mkdirSync(path.join(dir, '.lock-dir'));
    fs.utimesSync(path.join(dir, '.lock-dir'), STALE, STALE);
    pruneStaleLocks(dir, { now: NOW });
    assert.deepEqual(names(), ['.lock-dir']);
  });

  it('leaves every other module\'s files alone, however old they are', () => {
    // The real names from the modules that write into the same directory, plus
    // lookalikes. All a day old: if the pattern were loose, they would go.
    const ancient = new Date(NOW - 24 * 60 * MIN);
    const theirs = [
      `${path.basename(USAGE_STATE)}.lock`,         // .usage-alerts.json.lock
      `${path.basename(contextStatePath())}.lock`,   // .context-alerts.json.lock
      `${path.basename(turnStatePath())}.lock`,      // turns.json.lock
      `${path.basename(TELEMETRY_STATE)}.lock`,      // .telemetry.json.lock
      path.basename(USAGE_STATE), path.basename(TELEMETRY_STATE), path.basename(turnStatePath()),
      `${path.basename(turnStatePath())}.123.tmp`,
      'config.json', 'approval.json', 'errors.log', '.snooze.json', '.update-check.json', 'icon.png',
      'slot-1', 'slot-2',
      // lookalikes that are not this mechanism's names
      // exactly one character in front of "lock-": the dot in the pattern must be literal
      'clock-skew.json', '_lock-claude', 'block-list', 'xlock-a', 'Xlock-claude-task_complete-aaaaaaaa',
      '.lock', 'lock-claude', '.lockfile', 'x.lock-claude', '.lock-', '.lock-has space', '.lock-ünï', '.LOCK-claude',
    ];
    for (const n of theirs) put(n, ancient);
    fs.mkdirSync(path.join(dir, 'approvals'));
    fs.writeFileSync(path.join(dir, 'approvals', 'slot-1'), '1 2');
    fs.utimesSync(path.join(dir, 'approvals', 'slot-1'), ancient, ancient);
    const before = names();
    pruneStaleLocks(dir, { now: NOW });
    assert.deepEqual(names(), before);
    assert.ok(fs.existsSync(path.join(dir, 'approvals', 'slot-1')));
    // and the real names really are outside the pattern, and in the same place
    assert.equal(path.basename(approvalsDir()), 'approvals');
    for (const real of [USAGE_STATE, TELEMETRY_STATE, contextStatePath(), turnStatePath()]) {
      assert.ok(!path.basename(real).startsWith('.lock-') && !`${path.basename(real)}.lock`.startsWith('.lock-'));
    }
  });

  it('every name dedupKey can produce is matched', () => {
    const keys = [
      dedupKey({ source: 'claude', event: 'task_complete', sessionId: '' }),
      dedupKey({ source: 'cursor', event: 'needs_input', sessionId: 'abcdef1234567890' }),
      dedupKey({ source: 'claude', event: 'needs_input', sessionId: 's1', notificationType: 'permission_prompt' }),
      dedupKey({ source: 'weird/tool', event: 'task:done', sessionId: '../../etc ü' }),
      dedupKey({ source: '', event: '', sessionId: '' }),
    ];
    for (const k of keys) put(`.lock-${k}`, STALE);
    pruneStaleLocks(dir, { now: NOW });
    assert.deepEqual(names(), []);
  });

  it('removes at most maxRemovals per run and finishes the backlog over several runs', () => {
    for (let i = 0; i < 50; i++) put(`.lock-claude-task_complete-${String(i).padStart(8, '0')}`, STALE);
    pruneStaleLocks(dir, { now: NOW, maxRemovals: 20 });
    assert.equal(names().length, 30);
    pruneStaleLocks(dir, { now: NOW, maxRemovals: 20 });
    assert.equal(names().length, 10);
    pruneStaleLocks(dir, { now: NOW, maxRemovals: 20 });
    assert.equal(names().length, 0);
  });

  it('the shipped caps hold: a backlog of 500 loses at most LOCK_PRUNE_MAX_REMOVALS in one run', () => {
    for (let i = 0; i < 500; i++) put(`.lock-s-e-${String(i).padStart(8, '0')}`, STALE);
    pruneStaleLocks(dir, { now: NOW });
    assert.equal(names().length, 500 - LOCK_PRUNE_MAX_REMOVALS);
  });

  it('looks at no more than maxEntries directory entries', () => {
    for (let i = 0; i < 40; i++) put(`.lock-s-e-${String(i).padStart(8, '0')}`, STALE);
    let stats = 0;
    const counting = { ...fs, lstatSync: (...a) => { stats++; return fs.lstatSync(...a); } };
    pruneStaleLocks(dir, { now: NOW, maxEntries: 8, fsApi: counting });
    assert.ok(stats <= 16, `lstat count ${stats}`); // at most two per examined lock (age check + re-check)
    assert.ok(names().length >= 32, 'at most 8 of 40 examined');
  });

  it('entries that are not locks use up the same budget (a crowded directory stays cheap)', () => {
    for (let i = 0; i < 300; i++) put(`other-${i}.json`, STALE);
    let reads = 0;
    const counting = {
      ...fs,
      opendirSync: (d) => {
        const h = fs.opendirSync(d);
        return { readSync: () => { reads++; return h.readSync(); }, closeSync: () => h.closeSync() };
      },
    };
    pruneStaleLocks(dir, { now: NOW, fsApi: counting });
    assert.equal(reads, LOCK_PRUNE_MAX_ENTRIES);
    assert.equal(names().length, 300, 'none of them is a lock, none removed');
  });

  it('never throws: missing directory, a file instead of a directory, no access', () => {
    assert.doesNotThrow(() => pruneStaleLocks(path.join(dir, 'does-not-exist'), { now: NOW }));
    const file = put('plain-file');
    assert.doesNotThrow(() => pruneStaleLocks(file, { now: NOW }));
    assert.doesNotThrow(() => pruneStaleLocks(undefined, { now: NOW }));
    assert.doesNotThrow(() => pruneStaleLocks(dir, { now: NOW, fsApi: {} }));
  });

  it('swallows EPERM / EBUSY / ENOENT on unlink and keeps going with the rest', () => {
    const codes = ['EPERM', 'EBUSY', 'ENOENT', 'EACCES'];
    codes.forEach((_, i) => put(`.lock-a-b-bad${i}`, STALE));
    put('.lock-a-b-good', STALE);
    const failing = {
      ...fs,
      unlinkSync: (file) => {
        const m = /bad(\d)$/.exec(file);
        if (m) throw Object.assign(new Error('nope'), { code: codes[Number(m[1])] });
        return fs.unlinkSync(file);
      },
    };
    assert.doesNotThrow(() => pruneStaleLocks(dir, { now: NOW, fsApi: failing }));
    assert.ok(!names().includes('.lock-a-b-good'), 'the file after the failing ones was still removed');
    assert.equal(names().length, 4, 'files whose unlink failed stay for a later run');
  });

  it('swallows a failing lstat or readSync', () => {
    put('.lock-a-b-1', STALE);
    const noStat = { ...fs, lstatSync: () => { throw Object.assign(new Error('x'), { code: 'EIO' }); } };
    assert.doesNotThrow(() => pruneStaleLocks(dir, { now: NOW, fsApi: noStat }));
    const noRead = { ...fs, opendirSync: (d) => { const h = fs.opendirSync(d); return { readSync() { throw new Error('boom'); }, closeSync: () => h.closeSync() }; } };
    assert.doesNotThrow(() => pruneStaleLocks(dir, { now: NOW, fsApi: noRead }));
    assert.deepEqual(names(), ['.lock-a-b-1']);
  });

  it('does not delete a lock that was replaced by a fresh one between the age check and the unlink', () => {
    const file = put('.lock-a-b-race', STALE);
    let calls = 0;
    const racing = {
      ...fs,
      lstatSync: (f) => {
        const st = fs.lstatSync(f);
        calls++;
        // the second look sees a different mtime: another hook re-created the lock
        return calls === 2 ? { isFile: () => true, mtimeMs: st.mtimeMs + 5000 } : st;
      },
    };
    pruneStaleLocks(dir, { now: NOW, fsApi: racing });
    assert.ok(fs.existsSync(file));
  });

  it('two sweeps racing on the same files both finish without error', async () => {
    for (let i = 0; i < 60; i++) put(`.lock-race-e-${String(i).padStart(8, '0')}`, STALE);
    put('.lock-race-keep', FRESH);
    const url = pathToFileURL(path.join(repoRoot, 'src', 'notify.mjs')).href;
    const code = `import { pruneStaleLocks } from ${JSON.stringify(url)}; pruneStaleLocks(process.argv[1], { maxRemovals: 1000, maxEntries: 1000 });`;
    const results = await Promise.all([1, 2, 3, 4].map(() => new Promise((resolve) => {
      const child = spawn(process.execPath, ['--input-type=module', '-e', code, dir], { cwd: repoRoot });
      let stderr = '';
      child.stderr.on('data', (d) => { stderr += d; });
      child.on('close', (status) => resolve({ status, stderr }));
    })));
    for (const r of results) assert.equal(r.status, 0, r.stderr);
    assert.deepEqual(names(), ['.lock-race-keep']);
  });
});

describe('acquireNotifyLock sweeps on a won lock', () => {
  let base;
  let cfg;
  beforeEach(() => {
    base = fs.mkdtempSync(path.join(os.tmpdir(), 'aan-prune-acq-'));
    cfg = path.join(base, '.anotifier');
    fs.mkdirSync(cfg, { recursive: true });
  });
  afterEach(() => { fs.rmSync(base, { recursive: true, force: true }); });

  const put = (name, mtime) => {
    const file = path.join(cfg, name);
    fs.writeFileSync(file, '1');
    fs.utimesSync(file, mtime, mtime);
    return file;
  };
  const names = () => fs.readdirSync(cfg).sort();

  it('a won lock removes old locks of other sessions, keeps fresh ones and its own', () => {
    put('.lock-claude-task_complete-oldoldol', STALE);
    put('.lock-cursor-task_complete-recent01', FRESH);
    put('.usage-alerts.json.lock', STALE);
    put('config.json', STALE);
    assert.equal(acquireNotifyLock('claude-task_complete-newnewne', base), true);
    assert.deepEqual(names(), [
      '.lock-claude-task_complete-newnewne',
      '.lock-cursor-task_complete-recent01',
      '.usage-alerts.json.lock',
      'config.json',
    ]);
  });

  it('dedup is unchanged: a second run of the same key inside the window loses, other keys win', () => {
    put('.lock-old-key-aaaaaaaa', STALE);
    assert.equal(acquireNotifyLock('claude-task_complete-sess0001', base), true);
    assert.equal(acquireNotifyLock('claude-task_complete-sess0001', base), false);
    assert.equal(acquireNotifyLock('claude-task_complete-sess0002', base), true);
    assert.equal(acquireNotifyLock('claude-needs_input-sess0001', base), true);
    assert.equal(acquireNotifyLock('claude-task_complete-sess0001', base), false);
    assert.ok(!names().includes('.lock-old-key-aaaaaaaa'));
  });

  it('a stale lock of the same key is still replaced by the old same-key rule', () => {
    put('.lock-claude-task_complete-again001', new Date(Date.now() - 5000));
    assert.equal(acquireNotifyLock('claude-task_complete-again001', base), true);
    assert.equal(acquireNotifyLock('claude-task_complete-again001', base), false);
  });

  it('a lost lock does not sweep (the winner already did)', () => {
    assert.equal(acquireNotifyLock('claude-task_complete-s1', base), true);
    put('.lock-late-old-aaaaaaaa', STALE);
    assert.equal(acquireNotifyLock('claude-task_complete-s1', base), false);
    assert.ok(names().includes('.lock-late-old-aaaaaaaa'));
  });

  it('an unusable directory still fails open and never throws from the sweep', () => {
    const blocker = path.join(base, 'file-not-dir');
    fs.writeFileSync(blocker, 'x');
    assert.equal(acquireNotifyLock('claude-task_complete', blocker), true);
  });

  it('end to end: a real hook run clears a backlog of stale locks and leaves everything else', () => {
    for (let i = 0; i < 5; i++) put(`.lock-claude-task_complete-old0000${i}`, STALE);
    put('.usage-alerts.json.lock', STALE);
    fs.writeFileSync(path.join(cfg, 'config.json'), JSON.stringify({ toast: { enabled: false }, updateCheck: { enabled: false }, terminalBell: { enabled: false } }));
    const env = { ...process.env, HOME: base, USERPROFILE: base };
    for (const k of ['DO_NOT_TRACK', 'TMUX']) delete env[k];
    const res = spawnSync(process.execPath, ['src/notify.mjs', '--source', 'claude'], {
      cwd: repoRoot, env, encoding: 'utf8',
      input: JSON.stringify({ hook_event_name: 'Stop', cwd: '/work/app', session_id: 'endtoend1' }),
    });
    assert.equal(res.status, 0, res.stderr);
    assert.equal(res.stdout, '{}\n');
    const left = names();
    assert.ok(left.includes('.lock-claude-task_complete-endtoend'), 'its own lock');
    assert.ok(left.includes('.usage-alerts.json.lock') && left.includes('config.json'), 'other modules\' files');
    assert.equal(left.filter((n) => n.includes('old0000')).length, 0, 'the stale locks are gone');
  });
});
