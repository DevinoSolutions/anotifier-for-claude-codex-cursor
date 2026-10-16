// tests/statusline-projects.test.mjs — per-project rules (`projects` in
// ~/.anotifier/config.json) applied to the statusline's usage and context alerts.
// Unit tests inject the tap's dependencies; the subprocess tests run the real
// statusline.mjs with a throwaway HOME and a local HTTP server standing in for
// ntfy, so the detached delivery child's channel choice is observed on the wire.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { tapUsage, statuslineWorkspace } from '../src/statusline.mjs';
import { projectConfigFor, spawnDelivery } from '../src/usage-alert.mjs';
import { useFakeHome } from './fake-home.mjs';
useFakeHome();

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPT = path.join(repoRoot, 'src', 'statusline.mjs');

const ctxPayload = (dir, extra = {}) => ({
  session_id: 'sess-0001',
  model: { id: 'claude-x', display_name: 'Opus' },
  workspace: { current_dir: dir, project_dir: dir },
  context_window: { total_input_tokens: 180000, context_window_size: 200000 }, // 90%
  ...extra,
});

describe('statuslineWorkspace', () => {
  it('prefers workspace.current_dir, then workspace.project_dir, then cwd', () => {
    assert.equal(statuslineWorkspace({ workspace: { current_dir: '/a', project_dir: '/b' }, cwd: '/c' }), '/a');
    assert.equal(statuslineWorkspace({ workspace: { project_dir: '/b' }, cwd: '/c' }), '/b');
    assert.equal(statuslineWorkspace({ cwd: '/c' }), '/c');
  });
  it('skips blank and non-string values, and is null when there is nothing', () => {
    assert.equal(statuslineWorkspace({ workspace: { current_dir: '  ', project_dir: 5 }, cwd: '/c' }), '/c');
    assert.equal(statuslineWorkspace({}), null);
    assert.equal(statuslineWorkspace(null), null);
  });
});

describe('tapUsage with project rules (injected dependencies)', () => {
  const RL = { five_hour: { used_percentage: 50, resets_at: 1 } };
  const base = () => ({
    usageAlerts: { enabled: true, thresholds: [70, 85, 95] },
    contextAlerts: { enabled: true, threshold: 85 },
    ntfy: { enabled: true, topic: 'base' },
    projects: [{ match: '/work/acme', contextAlerts: { threshold: 95 }, ntfy: { topic: 'acme' } }],
  });
  const harness = (over = {}) => {
    const seen = { usage: [], context: [], delivered: [], suppressed: [] };
    return {
      seen,
      deps: {
        load: base,
        suppressed: (c) => { seen.suppressed.push(c); return null; },
        check: (p, c) => { seen.usage.push(c); return []; },
        checkContext: (p, c) => { seen.context.push(c); return [{ title: 'ctx' }]; },
        deliver: (n, opts) => { seen.delivered.push({ n, opts }); },
        ...over,
      },
    };
  };
  const run = (payload, over) => { const h = harness(over); tapUsage(JSON.stringify(payload), h.deps); return h.seen; };

  it('a matching rule changes the context threshold and channels for that session', () => {
    const seen = run(ctxPayload('/work/acme/src'));
    assert.equal(seen.context[0].contextAlerts.threshold, 95);
    assert.equal(seen.context[0].ntfy.topic, 'acme');
    assert.equal(seen.context[0].projects, undefined, 'the rule list is resolved away');
  });
  it('another session in a different folder keeps the top-level settings', () => {
    const seen = run(ctxPayload('/work/other'));
    assert.equal(seen.context[0].contextAlerts.threshold, 85);
    assert.equal(seen.context[0].ntfy.topic, 'base');
  });
  it('a relative folder matches no rule', () => {
    for (const dir of ['work/acme', './work/acme', '~/work/acme', 'C:work']) {
      const seen = run(ctxPayload(dir));
      assert.equal(seen.context[0].contextAlerts.threshold, 85, dir);
    }
  });
  it('with no rules the loaded config object is passed through untouched', () => {
    const config = { usageAlerts: { enabled: true }, contextAlerts: { enabled: true } };
    const seen = run(ctxPayload('/work/acme'), { load: () => config });
    assert.equal(seen.context[0], config);
  });
  it('a payload with no folder passes the config through untouched', () => {
    const config = base();
    const payload = ctxPayload('/x');
    delete payload.workspace;
    const seen = run(payload, { load: () => config });
    assert.equal(seen.context[0], config);
  });
  it('loads the config once even with rules', () => {
    let loads = 0;
    run(ctxPayload('/work/acme'), { load: () => { loads++; return base(); } });
    assert.equal(loads, 1);
  });
  it('a rule can disable the context alert for its folder only', () => {
    const load = () => ({ ...base(), projects: [{ match: '/work/acme', contextAlerts: { enabled: false } }] });
    let ran = 0;
    const checkContext = () => { ran++; return []; };
    run(ctxPayload('/work/acme'), { load, checkContext });
    assert.equal(ran, 0);
    run(ctxPayload('/work/other'), { load, checkContext });
    assert.equal(ran, 1);
  });
  it('usageAlerts stays global: a rule cannot retune or disable it', () => {
    const load = () => ({
      ...base(),
      projects: [{ match: '/work/acme', usageAlerts: { enabled: false, thresholds: [1] } }],
    });
    const seen = run({ rate_limits: RL, workspace: { current_dir: '/work/acme' } }, { load });
    assert.equal(seen.usage.length, 1, 'the usage check still runs');
    assert.equal(seen.usage[0].usageAlerts.enabled, true);
    assert.deepEqual(seen.usage[0].usageAlerts.thresholds, [70, 85, 95]);
  });
  it('a rule changes the channels the usage alert is delivered through, not the check', () => {
    const seen = run({ rate_limits: RL, workspace: { current_dir: '/work/acme' } }, {
      check: () => [{ title: 'usage' }],
    });
    assert.equal(seen.delivered.length, 1);
    assert.equal(seen.delivered[0].opts.workspace, '/work/acme', 'the child resolves the same rule for its channels');
  });
  it('quiet hours are read from the resolved config', () => {
    const load = () => ({ ...base(), projects: [{ match: '/work/acme', quietHours: { enabled: true, from: '00:00', to: '23:59' } }] });
    const seen = run(ctxPayload('/work/acme'), { load });
    assert.equal(seen.suppressed[0].quietHours.enabled, true);
    assert.equal(run(ctxPayload('/work/other'), { load }).suppressed[0].quietHours, undefined);
  });
  it('delivers with the workspace so the detached child can resolve the same rule', () => {
    const seen = run(ctxPayload('/work/acme/src'));
    assert.deepEqual(seen.delivered, [{ n: [{ title: 'ctx' }], opts: { workspace: '/work/acme/src' } }]);
  });
});

describe('projectConfigFor', () => {
  const config = { ntfy: { topic: 'base' }, projects: [{ match: '/work/acme', ntfy: { topic: 'acme' } }] };
  it('applies the matching rule', () => {
    assert.equal(projectConfigFor(config, '/work/acme/app').ntfy.topic, 'acme');
    assert.equal(projectConfigFor(config, '/work/zzz').ntfy.topic, 'base');
    assert.equal(config.ntfy.topic, 'base', 'the input is never mutated');
  });
  it('a resolver failure falls back to the base config and is logged', () => {
    const log = path.join(os.homedir(), '.anotifier', 'errors.log');
    const out = projectConfigFor(config, '/work/acme', { resolve: () => { throw new Error('boom-resolver'); } });
    assert.equal(out, config);
    const text = fs.readFileSync(log, 'utf8');
    assert.match(text, /statusline:projects/);
    assert.match(text, /boom-resolver/);
  });
  it('spawnDelivery passes the workspace as a separate base64 argument, never the config', () => {
    let args;
    spawnDelivery([{ title: 't' }], { spawnImpl: (exe, a) => { args = a; return {}; }, scriptPath: 'x.mjs', workspace: '/work/acme' });
    const i = args.indexOf('--workspace');
    assert.equal(Buffer.from(args[i + 1], 'base64').toString('utf8'), '/work/acme');
    spawnDelivery([{ title: 't' }], { spawnImpl: (exe, a) => { args = a; return {}; }, scriptPath: 'x.mjs' });
    assert.equal(args.includes('--workspace'), false);
  });
});

describe('statusline.mjs end to end with project rules', () => {
  let server;
  let port;
  let root;
  const requests = [];

  before(async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'aan-statusline-proj-'));
    server = http.createServer((req, res) => {
      let body = '';
      req.on('data', (c) => { body += c; });
      req.on('end', () => { requests.push({ url: req.url, body }); res.end('{}'); });
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    port = server.address().port;
  });
  after(async () => {
    await new Promise((resolve) => server.close(resolve));
    try { fs.rmSync(root, { recursive: true, force: true }); } catch { /* a delivery child may still hold a handle */ }
  });

  const newHome = (projects, extra = {}) => {
    const home = fs.mkdtempSync(path.join(root, 'home-'));
    fs.mkdirSync(path.join(home, '.anotifier'), { recursive: true });
    fs.writeFileSync(path.join(home, '.anotifier', 'config.json'), JSON.stringify({
      toast: { enabled: false },
      terminalBell: { enabled: false },
      ntfy: { enabled: true, server: `http://127.0.0.1:${port}`, topic: 'base' },
      ...extra,
      projects,
    }));
    return home;
  };
  const statusline = (home, payload) => {
    const res = spawnSync(process.execPath, [SCRIPT], {
      cwd: repoRoot, input: JSON.stringify(payload), encoding: 'utf8', timeout: 30000,
      env: { ...process.env, HOME: home, USERPROFILE: home },
    });
    assert.equal(res.status, 0, res.stderr);
    return res;
  };
  const waitFor = async (pred, ms = 20000) => {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      const hit = requests.find(pred);
      if (hit) return hit;
      await new Promise((r) => setTimeout(r, 50));
    }
    return null;
  };
  const warned = (home) => {
    try { return Object.keys(JSON.parse(fs.readFileSync(path.join(home, '.anotifier', '.context-alerts.json'), 'utf8'))); } catch { return []; }
  };

  const acme = process.platform === 'win32' ? 'C:/work/acme' : '/work/acme';
  const other = process.platform === 'win32' ? 'C:/work/other' : '/work/other';
  const rule = { match: acme, ntfy: { topic: 'proj-chan' }, contextAlerts: { threshold: 95 } };

  it('a rule\'s ntfy topic carries the context alert; stdout is the same line as without rules', async () => {
    const payload = ctxPayload(`${acme}/src`, { session_id: 'sess-chan' });
    const withRule = statusline(newHome([{ ...rule, contextAlerts: { threshold: 80 } }]), payload);
    const hit = await waitFor((r) => r.url === '/proj-chan');
    assert.ok(hit, 'the alert reaches the rule\'s topic');
    const without = statusline(newHome([]), { ...payload, session_id: 'sess-chan-2' });
    assert.equal(withRule.stdout, without.stdout);
    assert.equal(withRule.stdout, 'Opus');
  });

  it('a threshold raised by a rule silences only that folder\'s session', async () => {
    const home = newHome([rule]);
    const a = statusline(home, ctxPayload(`${acme}/src`, { session_id: 'sess-a' }));
    assert.deepEqual(warned(home), [], 'the matching session (90% < 95%) records nothing');
    const b = statusline(home, ctxPayload(`${other}/src`, { session_id: 'sess-b' }));
    assert.deepEqual(warned(home), ['sess-b'], 'another folder still warns at 85%');
    assert.ok(await waitFor((r) => r.url === '/base' && /auto-compact/.test(r.body)));
    assert.equal(a.stdout, b.stdout);
  });

  it('a relative folder leaves the behavior of a config without rules', async () => {
    const home = newHome([rule]);
    statusline(home, ctxPayload('work/acme', { session_id: 'sess-rel', workspace: { current_dir: 'work/acme' } }));
    assert.deepEqual(warned(home), ['sess-rel']);
  });

  it('a usage warning is delivered through the rule\'s channel, and a rule cannot disable it', async () => {
    const resetsAt = Math.floor(Date.now() / 1000) + 3600;
    const payload = {
      session_id: 'sess-usage',
      workspace: { current_dir: `${acme}/src` },
      rate_limits: { five_hour: { used_percentage: 90, resets_at: resetsAt } },
    };
    // usageAlerts inside a rule is rejected by the loader; it must change nothing.
    const home = newHome([{ match: acme, ntfy: { topic: 'proj-usage' }, usageAlerts: { enabled: false } }]);
    const res = statusline(home, payload);
    assert.equal(res.stdout, '5h 90%');
    const hit = await waitFor((r) => r.url === '/proj-usage' && /usage limit/.test(r.body));
    assert.ok(hit, 'usage alert sent to the rule\'s topic');
    const state = JSON.parse(fs.readFileSync(path.join(home, '.anotifier', '.usage-alerts.json'), 'utf8'));
    assert.equal(state.five_hour.level, 85, 'the shared, global threshold ladder was used');
  });
});
