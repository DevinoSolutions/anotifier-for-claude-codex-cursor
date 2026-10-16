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
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { useFakeHome } from './fake-home.mjs';
import { startFocusProbe, loadEffectiveConfig } from '../src/notify.mjs';
import { focusValue } from '../cli/status.mjs';
import { configFocus } from '../cli/config.mjs';
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

  it('never consults the probe for the idle reminder (typed, or by its text on older Claude Code)', () => {
    const idle = [
      { source: 'claude', event: 'needs_input', notificationType: 'idle_prompt', message: 'Claude is waiting for your input', cwd: '/w/a' },
      { source: 'claude', event: 'needs_input', notificationType: '', message: 'Claude is waiting for your input', cwd: '/w/a' },
    ];
    for (const ev of idle) {
      const { probe, calls } = spyProbe(true);
      assert.equal(startFocusProbe(on, ev, { probe }), null);
      assert.equal(calls.length, 0);
    }
  });

  it('a permission prompt and a question are still probed', async () => {
    for (const notificationType of ['permission_prompt', 'elicitation_dialog', '']) {
      const { probe, calls } = spyProbe(true);
      const ev = { source: 'claude', event: 'needs_input', notificationType, message: 'Claude needs your permission', cwd: '/w/a' };
      assert.equal(await startFocusProbe(on, ev, { probe }), true, notificationType);
      assert.equal(calls.length, 1);
    }
  });

  it('never consults the probe while `anotifier away` is active', () => {
    const { probe, calls } = spyProbe(true);
    assert.equal(startFocusProbe(on, EVENT, { probe, isAway: () => true }), null);
    assert.equal(calls.length, 0);
  });

  it('an away check that throws counts as not away', async () => {
    const { probe, calls } = spyProbe(true);
    assert.equal(await startFocusProbe(on, EVENT, { probe, isAway: () => { throw new Error('x'); } }), true);
    assert.equal(calls.length, 1);
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
// probe answer null at once without touching any window; a fake probe is given
// through a tiny runner that calls main().
describe('hook run', () => {
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

  const STOP = { hook_event_name: 'Stop', cwd: '/work/acme/app' };
  const AGY_STOP = { conversationId: 'c-1', workspacePaths: ['/work/frontend'], terminationReason: 'model_stop' };

  // answer: null = real notify.mjs entry (real probe, reduced to null by TMUX);
  // 'true' | 'false' | 'null' | 'throw' | 'hang' = fake probe through the runner.
  function run(config, answer = null, { payload = STOP, source = 'claude', args = [], setup } = {}) {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'aan-focus-wire-'));
    fs.mkdirSync(path.join(home, '.anotifier'), { recursive: true });
    fs.writeFileSync(path.join(home, '.anotifier', 'config.json'), JSON.stringify(config));
    if (setup) setup(home);
    const env = { ...process.env, HOME: home, USERPROFILE: home, TMUX: '/tmp/tmux-0/default,1,0' };
    return new Promise((resolve, reject) => {
      let argv = ['src/notify.mjs', '--source', source, ...args];
      if (answer !== null) {
        const runner = path.join(home, 'runner.mjs');
        const mod = pathToFileURL(path.join(repoRoot, 'src', 'notify.mjs')).href;
        const probe = answer === 'throw' ? 'async () => { throw new Error("boom"); }'
          : answer === 'hang' ? '() => new Promise(() => {})'
            : `async () => ${answer}`;
        const capMs = answer === 'hang' ? 200 : 2500;
        fs.writeFileSync(runner, [
          `import { main } from ${JSON.stringify(mod)};`,
          `process.argv = ${JSON.stringify([process.argv[0], 'x', '--source', source, ...args])};`,
          `await main({ focus: { probe: ${probe}, capMs: ${capMs} } });`,
          '',
        ].join('\n'));
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
      child.stdin.end(JSON.stringify({ session_id: `s-${Math.random()}`, ...payload }));
    });
  }

  const hookConfig = (on, extra = {}) => ({
    suppressWhenFocused: on,
    toast: { enabled: false },
    terminalBell: { enabled: false },
    updateCheck: { enabled: false },
    ntfy: { enabled: false },
    webhook: { enabled: true, url: `http://127.0.0.1:${server.address().port}/hook`, format: 'generic' },
    ...extra,
  });

  async function delivered(config, answer, opts, want = '{}\n') {
    const before = hits.length;
    const res = await run(config, answer, opts);
    assert.equal(res.status, 0);
    assert.equal(res.stdout, want, 'only the hook response on stdout');
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

  it('a probe that never settles: the backstop fires, exit 0, `{}`, and the alert is sent', async () => {
    const started = Date.now();
    assert.equal(await delivered(hookConfig(true), 'hang'), 1);
    assert.ok(Date.now() - started >= 200, 'waited for the backstop');
  });

  it('a skipped run with bell, ntfy and webhook on prints no terminalSequence and sends nothing', async () => {
    const on = hookConfig(true, {
      terminalBell: { enabled: true },
      ntfy: { enabled: true, server: `http://127.0.0.1:${server.address().port}`, topic: 'focus-test' },
    });
    assert.equal(await delivered(on, 'true'), 0);
    // Control: the same config with the probe saying false rings the bell and reaches both channels.
    const before = hits.length;
    const res = await run(on, 'false');
    assert.equal(res.status, 0);
    assert.deepEqual(JSON.parse(res.stdout), { terminalSequence: '\x07' });
    assert.equal(hits.length - before, 2);
  });

  it('an Antigravity skip still answers {"decision":"stop"}', async () => {
    const opts = { payload: AGY_STOP, source: 'antigravity', args: ['--event', 'Stop'] };
    assert.equal(await delivered(hookConfig(true), 'true', opts, '{"decision":"stop"}\n'), 0);
    assert.equal(await delivered(hookConfig(true), 'false', opts, '{"decision":"stop"}\n'), 1);
  });

  it('the idle reminder is sent even when the probe would say true', async () => {
    const typed = { hook_event_name: 'Notification', notification_type: 'idle_prompt', message: 'Claude is waiting for your input', cwd: '/work/acme/app' };
    const untyped = { hook_event_name: 'Notification', message: 'Claude is waiting for your input', cwd: '/work/acme/app' };
    const permission = { hook_event_name: 'Notification', notification_type: 'permission_prompt', message: 'Claude needs your permission to use Bash', cwd: '/work/acme/app' };
    assert.equal(await delivered(hookConfig(true), 'true', { payload: typed }), 1);
    assert.equal(await delivered(hookConfig(true), 'true', { payload: untyped }), 1);
    // Control: a permission prompt in the same window IS skipped.
    assert.equal(await delivered(hookConfig(true), 'true', { payload: permission }), 0);
  });

  it('while `anotifier away` is active the alert is sent even when the probe would say true', async () => {
    const away = (home) => {
      const dir = path.join(home, '.anotifier', 'approvals');
      fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
      fs.writeFileSync(path.join(dir, 'away.json'), JSON.stringify({ until: Date.now() + 60 * 60 * 1000 }) + '\n', { mode: 0o600 });
    };
    assert.equal(await delivered(hookConfig(true), 'true', { setup: away }), 1);
    // Control: no away file, same probe answer, skipped.
    assert.equal(await delivered(hookConfig(true), 'true'), 0);
  });
});

describe('CLI surface', () => {
  const strip = (s) => s.replace(/\u001b\[[0-9;]*m/g, '');

  it('focusValue: off by default, a plain sentence when on', () => {
    assert.match(strip(focusValue({})), /off/);
    assert.match(strip(focusValue({ suppressWhenFocused: false })), /off/);
    assert.match(strip(focusValue({ suppressWhenFocused: 'true' })), /off/);
    assert.match(strip(focusValue({ suppressWhenFocused: true })), /skip alerts while the agent window is in front/);
  });

  // configFocus talks to a readline-like object: question(prompt, cb) answers cb(answer).
  const ask = (answer) => ({ question: (_q, cb) => cb(answer), on() {}, removeListener() {} });
  async function answered(answer, current) {
    const config = current === undefined ? {} : { suppressWhenFocused: current };
    const out = [];
    const orig = console.log;
    console.log = (...a) => out.push(a.join(' '));
    try { await configFocus(ask(answer), config); } finally { console.log = orig; }
    return { config, text: strip(out.join('\n')) };
  }

  it('configFocus: yes turns it on, no turns it off, blank keeps the current value', async () => {
    assert.equal((await answered('y')).config.suppressWhenFocused, true);
    assert.equal((await answered('n', true)).config.suppressWhenFocused, false);
    assert.equal((await answered('', true)).config.suppressWhenFocused, true);
    assert.equal((await answered('', undefined)).config.suppressWhenFocused, false);
  });

  it('configFocus explains the delay and that away and idle are never suppressed', async () => {
    const { text } = await answered('n');
    assert.match(text, /adds about 1 s to each alert on Windows/);
    assert.match(text, /idle reminder is never suppressed/);
  });

  it('`anotifier config focus` and the help text know the section', () => {
    const index = fs.readFileSync(path.join(repoRoot, 'cli', 'index.mjs'), 'utf8');
    assert.match(index, /KNOWN_ARGS = new Set\(\[[^\]]*'focus'/);
    assert.match(index, /\(ntfy \| webhook \| sounds \| events \| sentry \| focus\)/);
    assert.match(fs.readFileSync(path.join(repoRoot, 'commands', 'config.md'), 'utf8'), /`focus`/);
  });

  it('the real CLI routes `config focus` to the config command (non-TTY: it says it is interactive)', () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'aan-focus-cli-'));
    try {
      fs.mkdirSync(path.join(home, '.anotifier'), { recursive: true });
      fs.writeFileSync(path.join(home, '.anotifier', '.update-check.json'), JSON.stringify({ checkedAt: Date.now(), latest: null }));
      const res = spawnSync(process.execPath, ['cli/index.mjs', 'config', 'focus'], {
        cwd: repoRoot, env: { ...process.env, HOME: home, USERPROFILE: home }, encoding: 'utf8', timeout: 30000, input: '',
      });
      assert.match(strip(res.stdout), /this command is interactive/);
    } finally {
      fs.rmSync(home, { recursive: true, force: true });
    }
  });
});
