// tests/antigravity-hardening.test.mjs — review fixes for Antigravity CLI support:
// user-owned "anotifier" groups, malformed files, Windows paths, fullyIdle,
// and Gemini CLI vs Antigravity detection. Shapes per https://antigravity.google/docs/hooks.
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseInput } from '../src/parse-input.mjs';
import { route } from '../src/router.mjs';
import { loadConfig } from '../src/config-loader.mjs';
import { patchAntigravity, unpatchAll, detectAntigravityEvents } from '../setup/patch-config.mjs';
import { detectTools } from '../cli/setup.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const NOTIFY = '/home/user/.npm/anotifier/src/notify.mjs';
const stopPayload = {
  conversationId: '0b7c1f3e-1111-2222-3333-444455556666',
  workspacePaths: ['/work/frontend'],
  executionNum: 1,
  terminationReason: 'model_stop',
  fullyIdle: true,
};

function runHook(source, extraArgs, input, config) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'aan-agy-run-'));
  fs.mkdirSync(path.join(home, '.anotifier'), { recursive: true });
  fs.writeFileSync(path.join(home, '.anotifier', 'config.json'), JSON.stringify(config));
  const res = spawnSync(process.execPath, ['src/notify.mjs', '--source', source, ...extraArgs], {
    cwd: repoRoot, input: JSON.stringify(input), env: { ...process.env, HOME: home, USERPROFILE: home }, encoding: 'utf8', timeout: 30000,
  });
  const files = fs.readdirSync(path.join(home, '.anotifier'));
  fs.rmSync(home, { recursive: true, force: true });
  return { res, files };
}

describe('antigravity hooks.json hardening', () => {
  let home;
  let geminiDir;
  let hooksPath;
  beforeEach(() => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), 'aan-agy-hard-'));
    geminiDir = path.join(home, '.gemini');
    hooksPath = path.join(geminiDir, 'config', 'hooks.json');
    fs.mkdirSync(path.dirname(hooksPath), { recursive: true });
  });
  afterEach(() => fs.rmSync(home, { recursive: true, force: true }));

  const read = () => JSON.parse(fs.readFileSync(hooksPath, 'utf8'));
  const write = (v) => fs.writeFileSync(hooksPath, JSON.stringify(v));
  const mine = { type: 'command', command: './my-stop.sh' };

  it('a user group named "anotifier" keeps its own handler and muted flag on setup and uninstall', () => {
    write({ anotifier: { enabled: false, Stop: [mine] } });
    patchAntigravity(geminiDir, NOTIFY);
    let g = read().anotifier;
    assert.equal(g.enabled, false, 'a muted group stays muted');
    assert.equal(g.Stop.length, 2);
    assert.deepEqual(g.Stop[0], mine);
    unpatchAll(home);
    g = read().anotifier;
    assert.deepEqual(g, { enabled: false, Stop: [mine] });
  });

  it('a muted, tuned group of ours stays muted and tuned across re-runs; uninstall removes it', () => {
    patchAntigravity(geminiDir, NOTIFY);
    const d = read();
    d.anotifier.enabled = false;
    d.anotifier.Stop[0].timeout = 5;
    write(d);
    patchAntigravity(geminiDir, NOTIFY);
    const g = read().anotifier;
    assert.equal(g.enabled, false);
    assert.equal(g.Stop.length, 1);
    assert.equal(g.Stop[0].timeout, 5);
    unpatchAll(home);
    assert.deepEqual(read(), {});
  });

  it('refuses an "anotifier" entry that is not an object, leaving the file alone', () => {
    fs.writeFileSync(hooksPath, '{"anotifier":[1]}');
    assert.throws(() => patchAntigravity(geminiDir, NOTIFY), /not an object/);
    assert.equal(fs.readFileSync(hooksPath, 'utf8'), '{"anotifier":[1]}');
  });

  it('malformed but parseable files never throw, and uninstall does not report a failure', () => {
    const junk = { a: 5, b: null, c: 'x', d: [1], e: { Stop: [null, 5, 'x', { hooks: [null, 3, {}] }, { hooks: 'no' }] }, f: { Stop: 'nope' } };
    write(junk);
    assert.deepEqual(detectAntigravityEvents(junk), []);
    const agy = unpatchAll(home).find((r) => r.tool === 'Antigravity CLI');
    assert.equal(agy.ok, true);
    assert.equal(agy.reason, 'nothing to remove');
    assert.deepEqual(read(), junk);
    patchAntigravity(geminiDir, NOTIFY);
    const d = read();
    assert.equal(d.anotifier.Stop.length, 1);
    delete d.anotifier;
    assert.deepEqual(d, junk);
  });

  for (const top of ['[]', '5', '"x"', 'null']) {
    it(`uninstall tolerates a top-level ${top}`, () => {
      fs.writeFileSync(hooksPath, top);
      const agy = unpatchAll(home).find((r) => r.tool === 'Antigravity CLI');
      assert.equal(agy.ok, true);
    });
  }

  it('writes forward slashes for a Windows notify path', () => {
    patchAntigravity(geminiDir, 'C:\\Users\\me\\AppData\\anotifier\\src\\notify.mjs');
    assert.equal(read().anotifier.Stop[0].command, 'node "C:/Users/me/AppData/anotifier/src/notify.mjs" --source antigravity --event Stop');
  });
});

describe('antigravity Stop payload semantics', () => {
  const quiet = { toast: { enabled: false }, ntfy: { enabled: false }, terminalBell: { enabled: false } };

  it('a Stop with fullyIdle:false is still dispatched, not held back', () => {
    const payload = { ...stopPayload, fullyIdle: false };
    const ev = parseInput(payload, 'antigravity', 'Stop');
    assert.equal(ev.event, 'task_complete');
    assert.notEqual(route(ev, loadConfig()), null);
    // The dedup lock is taken only after the held-back gates, so its presence proves dispatch.
    const { res, files } = runHook('antigravity', ['--event', 'Stop'], payload, quiet);
    assert.equal(res.status, 0, res.stderr);
    assert.ok(files.some((n) => n.startsWith('.lock-antigravity-task_complete')), files.join(','));
  });

  it('claude still gets its terminalSequence bell response', () => {
    const { res } = runHook('claude', [], { hook_event_name: 'Stop', cwd: '/work/app', session_id: 'agyclaude' }, { ...quiet, terminalBell: { enabled: true } });
    assert.equal(res.status, 0, res.stderr);
    assert.deepEqual(JSON.parse(res.stdout), { terminalSequence: '\x07' });
  });
});

describe('Gemini CLI vs Antigravity detection', () => {
  let home;
  beforeEach(() => { home = fs.mkdtempSync(path.join(os.tmpdir(), 'aan-agy-detect-')); });
  afterEach(() => fs.rmSync(home, { recursive: true, force: true }));
  const names = () => detectTools(home).map((t) => t.name);
  const mk = (...p) => fs.mkdirSync(path.join(home, '.gemini', ...p), { recursive: true });

  it('an Antigravity-only ~/.gemini is not Gemini CLI', () => {
    for (const d of ['antigravity-cli', 'antigravity', 'antigravity-ide', 'config']) mk(d);
    assert.deepEqual(names(), ['antigravity']);
  });

  it('settings.json means Gemini CLI, with or without Antigravity', () => {
    mk('antigravity-cli');
    fs.writeFileSync(path.join(home, '.gemini', 'settings.json'), '{}');
    assert.deepEqual(names(), ['gemini', 'antigravity']);
  });

  it('any other content, or an empty dir, still counts as Gemini CLI', () => {
    mk();
    assert.deepEqual(names(), ['gemini']);
    mk('tmp');
    assert.deepEqual(names(), ['gemini']);
    mk('antigravity-cli');
    assert.deepEqual(names(), ['gemini', 'antigravity']);
  });

  it('no ~/.gemini means neither', () => {
    assert.deepEqual(names(), []);
  });
});
