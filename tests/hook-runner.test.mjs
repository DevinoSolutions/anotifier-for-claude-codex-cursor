// tests/hook-runner.test.mjs — the shared hook runner itself: what it hands the
// child (environment, arguments, stdin), the guards that keep a test off the real
// home, and one real run each way.
import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildInvocation, runHook, runHookSync, NOTIFY, SCRUB } from './hook-runner.mjs';
import { makeTmpHome } from './fake-home.mjs';

const homes = [];
const newHome = (opts) => { const h = makeTmpHome('aan-runner-', opts); homes.push(h); return h; };
afterEach(() => { for (const h of homes.splice(0)) fs.rmSync(h, { recursive: true, force: true }); });

const QUIET = { toast: { enabled: false }, ntfy: { enabled: false }, terminalBell: { enabled: false } };
const stop = { hook_event_name: 'Stop', cwd: '/work/app', session_id: 's' };

describe('buildInvocation', () => {
  it('points HOME and USERPROFILE at the given home and runs notify.mjs for the source', () => {
    const home = newHome();
    const inv = buildInvocation({ source: 'codex', args: ['--event', 'Stop'], payload: { a: 1 }, home });
    assert.equal(inv.env.HOME, home);
    assert.equal(inv.env.USERPROFILE, home);
    assert.deepEqual(inv.argv, [NOTIFY, '--source', 'codex', '--event', 'Stop']);
    assert.equal(inv.input, '{"a":1}');
  });

  it('defaults to the claude source, sends a string payload as is and no payload as empty stdin', () => {
    const home = newHome();
    assert.deepEqual(buildInvocation({ home }).argv.slice(1), ['--source', 'claude']);
    assert.equal(buildInvocation({ home, payload: 'not json {' }).input, 'not json {');
    assert.equal(buildInvocation({ home }).input, '');
  });

  it('scrubs the agent and ntfy credentials, and lets an explicit env win', () => {
    const home = newHome();
    const saved = Object.fromEntries(SCRUB.map((k) => [k, process.env[k]]));
    for (const k of SCRUB) process.env[k] = 'secret';
    try {
      const inv = buildInvocation({ home, env: { NTFY_TOKEN: 'on purpose', EXTRA: '1' } });
      for (const k of SCRUB.filter((x) => x !== 'NTFY_TOKEN')) assert.equal(inv.env[k], undefined, k);
      assert.equal(inv.env.NTFY_TOKEN, 'on purpose');
      assert.equal(inv.env.EXTRA, '1');
    } finally {
      for (const [k, v] of Object.entries(saved)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
    }
  });

  it('a key given as undefined is removed from the child environment', () => {
    const home = newHome();
    process.env.AAN_RUNNER_PROBE = 'set';
    try {
      assert.equal(buildInvocation({ home }).env.AAN_RUNNER_PROBE, 'set');
      assert.equal('AAN_RUNNER_PROBE' in buildInvocation({ home, env: { AAN_RUNNER_PROBE: undefined } }).env, false);
    } finally {
      delete process.env.AAN_RUNNER_PROBE;
    }
  });

  it('seeds a fresh "no update" cache so the child never queries npm, unless asked not to', () => {
    const home = newHome();
    buildInvocation({ home });
    const cache = JSON.parse(fs.readFileSync(path.join(home, '.anotifier', '.update-check.json'), 'utf8'));
    assert.equal(cache.latest, null);
    assert.ok(Date.now() - cache.checkedAt < 60_000);

    const other = newHome();
    buildInvocation({ home: other, offline: false });
    assert.equal(fs.existsSync(path.join(other, '.anotifier')), false);
  });

  it('keeps a cache the test seeded itself', () => {
    const home = newHome();
    const dir = path.join(home, '.anotifier');
    fs.mkdirSync(dir);
    const mine = JSON.stringify({ checkedAt: 1, latest: '9.9.9' });
    fs.writeFileSync(path.join(dir, '.update-check.json'), mine);
    buildInvocation({ home });
    assert.equal(fs.readFileSync(path.join(dir, '.update-check.json'), 'utf8'), mine);
  });

  it('refuses a missing home and the real one', () => {
    assert.throws(() => buildInvocation({ payload: stop }), /needs a home/);
    assert.throws(() => buildInvocation({ home: '' }), /needs a home/);
    assert.throws(() => buildInvocation({ home: os.homedir() }), /real home/);
  });
});

describe('makeTmpHome', () => {
  it('makes an empty directory, or one holding config.json when given a config', () => {
    const bare = newHome();
    assert.deepEqual(fs.readdirSync(bare), []);
    const withConfig = newHome({ config: QUIET });
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(withConfig, '.anotifier', 'config.json'), 'utf8')), QUIET);
    const raw = newHome({ config: '{ not json' });
    assert.equal(fs.readFileSync(path.join(raw, '.anotifier', 'config.json'), 'utf8'), '{ not json');
  });
});

describe('a real run', () => {
  it('runHookSync: exits 0 with {} and no signal', () => {
    const home = newHome({ config: QUIET });
    const res = runHookSync({ payload: stop, home });
    assert.equal(res.status, 0, res.stderr);
    assert.equal(res.stdout, '{}\n');
    assert.equal(res.signal, null);
  });

  it('runHook: the same run, asynchronously', async () => {
    const home = newHome({ config: QUIET });
    const res = await runHook({ payload: stop, home });
    assert.equal(res.status, 0, res.stderr);
    assert.equal(res.stdout, '{}\n');
  });

  it('runHook feeds a raw string to stdin: malformed input still gets the {} answer', async () => {
    const home = newHome({ config: QUIET });
    const res = await runHook({ payload: 'garbage {{', home });
    assert.equal(res.status, 0, res.stderr);
    assert.equal(res.stdout, '{}\n');
  });

  it('passes extra arguments through (a Codex run names its event on the command line)', () => {
    const home = newHome({ config: { ...QUIET, terminalBell: { enabled: true } } });
    const res = runHookSync({ source: 'codex', args: ['--event', 'Stop'], payload: { session_id: 's' }, home });
    assert.equal(res.status, 0, res.stderr);
    assert.equal(res.stdout, '{}\n');
  });
});
