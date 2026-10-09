// tests/statusline.test.mjs — the statusline tap that feeds usage-limit warnings.
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { encodeWrapped, decodeWrapped, defaultLine, tapUsage, wrapShell, WRAP_FLAG } from '../src/statusline.mjs';
import { useFakeHome } from './fake-home.mjs';
useFakeHome();

const SCRIPT = fileURLToPath(new URL('../src/statusline.mjs', import.meta.url));
const RL = { five_hour: { used_percentage: 42.4, resets_at: 1 }, seven_day: { used_percentage: 12.6 } };

describe('encodeWrapped / decodeWrapped', () => {
  it('round-trips awkward commands exactly', () => {
    for (const cmd of ['echo hi', `node -e "console.log('a b')" | cat`, 'echo "ünï ✓" && x\\y', 'a\nb']) {
      assert.equal(decodeWrapped(['node', 's.mjs', WRAP_FLAG, encodeWrapped(cmd)]), cmd);
    }
  });
  it('returns null when the flag or value is missing or the command is blank', () => {
    assert.equal(decodeWrapped(['node', 's.mjs']), null);
    assert.equal(decodeWrapped(['node', 's.mjs', WRAP_FLAG]), null);
    assert.equal(decodeWrapped(['node', 's.mjs', WRAP_FLAG, encodeWrapped('   ')]), null);
  });
});

describe('defaultLine', () => {
  it('shows model and both windows, rounded', () => {
    assert.equal(defaultLine({ model: { display_name: 'Opus' }, rate_limits: RL }), 'Opus · 5h 42% · 7d 13%');
  });
  it('omits what is missing and never throws', () => {
    assert.equal(defaultLine({ rate_limits: { five_hour: { used_percentage: 3 } } }), '5h 3%');
    assert.equal(defaultLine({ model: { display_name: 'Sonnet' } }), 'Sonnet');
    assert.equal(defaultLine({}), '');
    assert.equal(defaultLine(null), '');
  });
});

describe('tapUsage', () => {
  const live = JSON.stringify({ rate_limits: RL });
  const deps = (over = {}) => {
    const seen = { check: 0, deliver: [] };
    return {
      seen,
      deps: {
        load: () => ({ usageAlerts: { enabled: true } }),
        suppressed: () => null,
        check: () => { seen.check++; return []; },
        deliver: (n) => { seen.deliver.push(n); },
        ...over,
      },
    };
  };

  it('does nothing without rate_limits', () => {
    const { seen, deps: d } = deps();
    assert.deepEqual(tapUsage(JSON.stringify({ model: {} }), d), []);
    assert.equal(seen.check, 0);
  });
  it('does nothing while suppressed (snooze / quiet hours)', () => {
    const { seen, deps: d } = deps({ suppressed: () => ({ reason: 'snooze' }) });
    assert.deepEqual(tapUsage(live, d), []);
    assert.equal(seen.check, 0, 'nothing is recorded either');
  });
  it('does nothing when usage alerts are disabled', () => {
    const { seen, deps: d } = deps({ load: () => ({ usageAlerts: { enabled: false } }) });
    assert.deepEqual(tapUsage(live, d), []);
    assert.equal(seen.check, 0);
  });
  it('delivers when there are notifications', () => {
    const notes = [{ title: 'x' }];
    const { seen, deps: d } = deps({ check: () => notes });
    assert.deepEqual(tapUsage(live, d), notes);
    assert.deepEqual(seen.deliver, [notes]);
  });
  it('does not deliver an empty result', () => {
    const { seen, deps: d } = deps();
    tapUsage(live, d);
    assert.deepEqual(seen.deliver, []);
  });
  it('never throws on malformed JSON, empty input, or a throwing dependency', () => {
    const { deps: d } = deps();
    assert.deepEqual(tapUsage('{nope', d), []);
    assert.deepEqual(tapUsage('', d), []);
    assert.deepEqual(tapUsage(undefined, d), []);
    assert.deepEqual(tapUsage(live, deps({ check: () => { throw new Error('x'); } }).deps), []);
    assert.deepEqual(tapUsage(live, deps({ load: () => { throw new Error('x'); } }).deps), []);
  });
});

describe('wrapShell', () => {
  it('uses the default shell (true) off Windows', () => {
    assert.equal(wrapShell('linux', {}, () => true), true);
    assert.equal(wrapShell('darwin', {}, () => true), true);
  });
  it('on win32 prefers CLAUDE_CODE_GIT_BASH_PATH, then Program Files Git bash', () => {
    const env = { CLAUDE_CODE_GIT_BASH_PATH: 'D:\\git\\bash.exe', ProgramFiles: 'E:\\PF' };
    assert.equal(wrapShell('win32', env, () => true), 'D:\\git\\bash.exe');
    const pf = wrapShell('win32', { ProgramFiles: 'E:\\PF' }, (p) => p.includes('PF'));
    assert.match(pf, /PF.*Git.*bash\.exe$/);
  });
  it('on win32 falls back to the C: default, then to the default shell', () => {
    assert.equal(wrapShell('win32', {}, (p) => p === 'C:\\Program Files\\Git\\bin\\bash.exe'), 'C:\\Program Files\\Git\\bin\\bash.exe');
    assert.equal(wrapShell('win32', {}, () => false), true);
  });
});

describe('statusline.mjs as a subprocess', () => {
  let home;
  beforeEach(() => { home = fs.mkdtempSync(path.join(os.tmpdir(), 'aan-statusline-')); });
  afterEach(() => fs.rmSync(home, { recursive: true, force: true }));

  const run = (args, input) => spawnSync(process.execPath, [SCRIPT, ...args], {
    input,
    encoding: 'utf8',
    timeout: 20000,
    env: { ...process.env, HOME: home, USERPROFILE: home, AAN_NO_UPDATE_CHECK: '1' },
  });

  it('passes the wrapped command output through, with the payload on its stdin', () => {
    const payload = JSON.stringify({ model: { display_name: 'X' } });
    const cmd = `node -e "let n=0;process.stdin.on('data',c=>n+=c.length).on('end',()=>process.stdout.write('len='+n))"`;
    const r = run([WRAP_FLAG, encodeWrapped(cmd)], payload);
    assert.equal(r.stdout, `len=${Buffer.byteLength(payload)}`);
    assert.equal(r.status, 0);
  });

  it('propagates the wrapped command exit code', () => {
    const r = run([WRAP_FLAG, encodeWrapped('node -e "process.exit(3)"')], '{}');
    assert.equal(r.status, 3);
  });

  it('prints the default line when nothing is wrapped', () => {
    const r = run([], JSON.stringify({ model: { display_name: 'Opus' }, rate_limits: {} }));
    assert.equal(r.stdout, 'Opus');
  });

  it('survives garbage on stdin', () => {
    const r = run([], 'not json');
    assert.equal(r.status, 0);
    assert.equal(r.stdout, '');
  });

  it('with usage alerts disabled in config it records nothing', () => {
    const dir = path.join(home, '.anotifier');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify({ usageAlerts: { enabled: false } }));
    const r = run([], JSON.stringify({ rate_limits: { five_hour: { used_percentage: 99, resets_at: Date.now() / 1000 + 3600 } } }));
    assert.equal(r.stdout, '5h 99%');
    assert.ok(!fs.existsSync(path.join(dir, '.usage-alerts.json')));
  });
});
