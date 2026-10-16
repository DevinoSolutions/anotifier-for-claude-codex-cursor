// tests/focus-wiring.test.mjs -- the opt-in `suppressWhenFocused` key on the hook path.
// Detection itself is in focus-detect.test.mjs. Here the probe is always injected
// (or reduced to null by TMUX in the subprocess test), so no real window is ever
// probed and nothing touches the real ~/.anotifier.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { useFakeHome } from './fake-home.mjs';
import { startFocusProbe, loadEffectiveConfig } from '../src/notify.mjs';
import { loadConfigResult } from '../src/config-loader.mjs';
import { getErrorLogPath } from '../src/error-log.mjs';

useFakeHome(); // logHookError writes to os.homedir()/.anotifier/errors.log

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const EVENT = { source: 'claude', event: 'task_complete', cwd: '/work/acme/app' };

function spyProbe(result) {
  const calls = [];
  const probe = async (opts) => {
    calls.push(opts);
    if (typeof result === 'function') return result(opts);
    return result;
  };
  return { probe, calls };
}

describe('startFocusProbe: off by default', () => {
  it('does not call the probe when the key is false, absent or not exactly true', () => {
    for (const config of [{ suppressWhenFocused: false }, {}, undefined, { suppressWhenFocused: 'true' }, { suppressWhenFocused: 1 }]) {
      const { probe, calls } = spyProbe(true);
      assert.equal(startFocusProbe(config, EVENT, { probe }), null);
      assert.equal(calls.length, 0);
    }
  });

  it('the shipped default config has the key off', () => {
    const { config } = loadConfigResult(path.join(os.tmpdir(), 'aan-focus-no-such-config.json'));
    assert.equal(config.suppressWhenFocused, false);
    const { probe, calls } = spyProbe(true);
    assert.equal(startFocusProbe(config, EVENT, { probe }), null);
    assert.equal(calls.length, 0);
  });
});

describe('startFocusProbe: on', () => {
  const on = { suppressWhenFocused: true };

  it('asks about the event workspace and resolves true only for true', async () => {
    const { probe, calls } = spyProbe(true);
    assert.equal(await startFocusProbe(on, EVENT, { probe }), true);
    assert.deepEqual(calls, [{ source: 'claude', workspace: '/work/acme/app' }]);
  });

  it('false stays false; null, garbage and non-boolean answers become null', async () => {
    for (const [answer, want] of [[false, false], [null, null], [undefined, null], ['true', null], [1, null]]) {
      const { probe } = spyProbe(answer);
      assert.equal(await startFocusProbe(on, EVENT, { probe }), want, String(answer));
    }
  });

  it('a throwing probe resolves null and is logged to errors.log, not stdout', async () => {
    const { probe } = spyProbe(() => { throw new Error('probe exploded'); });
    assert.equal(await startFocusProbe(on, EVENT, { probe }), null);
    const log = fs.readFileSync(getErrorLogPath(), 'utf8');
    assert.match(log, /"context":"focus"/);
    assert.match(log, /probe exploded/);
  });

  it('a rejecting probe resolves null', async () => {
    const probe = () => Promise.reject(new Error('nope'));
    assert.equal(await startFocusProbe(on, EVENT, { probe }), null);
  });

  it('a probe that never settles resolves null by the cap', async () => {
    const probe = () => new Promise(() => {});
    const started = Date.now();
    assert.equal(await startFocusProbe(on, EVENT, { probe, capMs: 50 }), null);
    assert.ok(Date.now() - started < 1000);
  });

  it('starts at once: the probe has been called before the caller awaits anything', () => {
    const { probe, calls } = spyProbe(false);
    const pending = startFocusProbe(on, EVENT, { probe });
    assert.equal(calls.length, 1);
    assert.ok(pending instanceof Promise);
    return pending;
  });
});

describe('per-project override', () => {
  const stored = {
    suppressWhenFocused: false,
    projects: [{ match: '/work/acme/*', suppressWhenFocused: true }],
  };
  const load = () => JSON.parse(JSON.stringify(stored));

  it('turns it on for a matching project only', async () => {
    const inside = loadEffectiveConfig({ cwd: '/work/acme/app' }, load);
    const outside = loadEffectiveConfig({ cwd: '/work/elsewhere/tool' }, load);
    const nowhere = loadEffectiveConfig({}, load);
    assert.equal(inside.suppressWhenFocused, true);
    assert.equal(outside.suppressWhenFocused, false);
    assert.equal(nowhere.suppressWhenFocused, false);

    const a = spyProbe(true);
    const b = spyProbe(true);
    assert.equal(await startFocusProbe(inside, EVENT, { probe: a.probe }), true);
    assert.equal(startFocusProbe(outside, EVENT, { probe: b.probe }), null);
    assert.equal(a.calls.length, 1);
    assert.equal(b.calls.length, 0);
  });

  it('a rule can also turn a global true off for one project', () => {
    const cfg = loadEffectiveConfig({ cwd: '/work/quiet/app' }, () => ({
      suppressWhenFocused: true,
      projects: [{ match: '/work/quiet/*', suppressWhenFocused: false }],
    }));
    assert.equal(cfg.suppressWhenFocused, false);
  });
});

describe('validation', () => {
  let dir;
  before(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aan-focus-cfg-')); });
  after(() => { fs.rmSync(dir, { recursive: true, force: true }); });

  function load(user) {
    const p = path.join(dir, 'config.json');
    fs.writeFileSync(p, JSON.stringify(user), 'utf8');
    return loadConfigResult(p);
  }

  it('accepts true and false without a problem', () => {
    assert.equal(load({ suppressWhenFocused: true }).config.suppressWhenFocused, true);
    assert.equal(load({ suppressWhenFocused: true }).problem, null);
    assert.equal(load({ suppressWhenFocused: false }).problem, null);
  });

  it('a wrong type is reported and falls back to the default (off)', () => {
    for (const bad of ['true', 1, null, {}, []]) {
      const { config, problem } = load({ suppressWhenFocused: bad });
      assert.equal(problem.type, 'validate');
      assert.match(problem.message, /"suppressWhenFocused" must be a boolean, got /);
      assert.equal(config.suppressWhenFocused, false, JSON.stringify(bad));
    }
  });

  it('inside a project rule the problem is prefixed and the base value stays', () => {
    const { config, problem } = load({
      suppressWhenFocused: true,
      projects: [{ match: '/work/acme/*', suppressWhenFocused: 'yes' }],
    });
    assert.equal(problem.type, 'validate');
    assert.match(problem.message, /projects\[0\]: "suppressWhenFocused" must be a boolean, got string/);
    assert.equal(config.suppressWhenFocused, true);
    assert.equal(config.projects[0].suppressWhenFocused, undefined);
  });
});

// The real notify.mjs as a subprocess. TMUX in the environment makes the real
// probe answer null at once without touching any window, so this proves the
// "null still sends" path through the whole pipeline.
describe('hook run with the key on and an unknowable answer', () => {
  let server;
  let hits;
  before(async () => {
    hits = [];
    await new Promise((resolve) => {
      server = http.createServer((req, res) => {
        req.on('data', () => {});
        req.on('end', () => { hits.push(req.url); res.end('ok'); });
      });
      server.listen(0, '127.0.0.1', resolve);
    });
  });
  after(() => new Promise((resolve) => { server.closeAllConnections?.(); server.close(resolve); }));

  // `answer` null runs the real notify.mjs entry (the real probe, reduced to null by
  // TMUX). Otherwise a tiny runner calls main() with a fake probe answering it.
  function run(config, answer = null) {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'aan-focus-wire-'));
    fs.mkdirSync(path.join(home, '.anotifier'), { recursive: true });
    fs.writeFileSync(path.join(home, '.anotifier', 'config.json'), JSON.stringify(config));
    const env = { ...process.env, HOME: home, USERPROFILE: home, TMUX: '/tmp/tmux-0/default,1,0' };
    return new Promise((resolve, reject) => {
      let argv = ['src/notify.mjs', '--source', 'claude'];
      if (answer !== null) {
        const runner = path.join(home, 'runner.mjs');
        const mod = pathToFileURL(path.join(repoRoot, 'src', 'notify.mjs')).href;
        const probe = answer === 'throw' ? 'async () => { throw new Error("boom"); }' : `async () => ${answer}`;
        fs.writeFileSync(runner, `import { main } from ${JSON.stringify(mod)};
process.argv = [process.argv[0], 'x', '--source', 'claude'];
await main({ focus: { probe: ${probe} } });
`);
        argv = [runner];
      }
      const child = spawn(process.execPath, argv, { cwd: repoRoot, env, timeout: 30000 });
      let stdout = '';
      child.stdout.setEncoding('utf8').on('data', (d) => { stdout += d; });
      child.on('error', reject);
      child.on('close', (status) => {
        fs.rmSync(home, { recursive: true, force: true });
        resolve({ status, stdout });
      });
      child.stdin.end(JSON.stringify({ hook_event_name: 'Stop', cwd: '/work/acme/app', session_id: `s-${Math.random()}` }));
    });
  }

  const hookConfig = (on) => ({
    suppressWhenFocused: on,
    toast: { enabled: false },
    terminalBell: { enabled: false },
    updateCheck: { enabled: false },
    ntfy: { enabled: false },
    webhook: { enabled: true, url: `http://127.0.0.1:${server.address().port}/hook`, format: 'generic' },
  });

  async function delivered(config, answer) {
    const before = hits.length;
    const res = await run(config, answer);
    assert.equal(res.status, 0);
    assert.equal(res.stdout, '{}\n', 'only the hook response on stdout');
    return hits.length - before;
  }

  it('real probe unable to tell (null): still delivers', async () => {
    assert.equal(await delivered(hookConfig(true)), 1);
  });

  it('probe says true: nothing is sent on any channel', async () => {
    assert.equal(await delivered(hookConfig(true), 'true'), 0);
  });

  it('probe says false, null or throws: sends as usual', async () => {
    for (const answer of ['false', 'null', 'throw']) {
      assert.equal(await delivered(hookConfig(true), answer), 1, answer);
    }
  });

  it('key off: a probe that would say true is never consulted, so it sends', async () => {
    assert.equal(await delivered(hookConfig(false), 'true'), 1);
  });
});
