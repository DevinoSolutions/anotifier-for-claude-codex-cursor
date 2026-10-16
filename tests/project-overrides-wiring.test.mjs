// tests/project-overrides-wiring.test.mjs -- per-project override rules applied
// on the hook path. The REAL notify.mjs runs as a subprocess against local HTTP
// servers (webhook and ntfy), with a throwaway HOME holding a config.json whose
// `projects` list is the thing under test. The loader and the matching rules are
// covered in project-overrides.test.mjs; this file proves they reach the channels.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { loadEffectiveConfig } from '../src/notify.mjs';
import { loadConfigResult } from '../src/config-loader.mjs';
import { parseInput } from '../src/parse-input.mjs';
import { route } from '../src/router.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCRUB = ['ANTHROPIC_API_KEY', 'GEMINI_API_KEY', 'OPENAI_API_KEY', 'CURSOR_API_KEY', 'NTFY_TOKEN'];

// Paths are only ever compared as strings, so they need not exist.
const PROJECT = '/work/acme/app';
const OTHER = '/work/elsewhere/tool';

describe('per-project overrides on the hook path', () => {
  let server;
  let base;
  let requests = [];

  before(async () => {
    await new Promise((resolve) => {
      server = http.createServer((req, res) => {
        let body = '';
        req.on('data', (c) => { body += c; });
        req.on('end', () => {
          requests.push({ url: req.url, headers: req.headers, body });
          res.end('ok');
        });
      });
      server.listen(0, '127.0.0.1', resolve);
    });
    base = `http://127.0.0.1:${server.address().port}`;
  });

  after(() => new Promise((resolve) => { server.closeAllConnections?.(); server.close(resolve); }));

  // Every channel off except what `extra` turns on. `projects` is added by the test.
  function baseConfig(extra = {}) {
    return {
      toast: { enabled: false },
      ntfy: { enabled: false },
      terminalBell: { enabled: false },
      updateCheck: { enabled: false },
      webhook: { enabled: true, url: `${base}/base`, format: 'generic' },
      ...extra,
    };
  }

  function newHome(config) {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'aan-proj-wire-'));
    fs.mkdirSync(path.join(home, '.anotifier'), { recursive: true });
    fs.writeFileSync(path.join(home, '.anotifier', 'config.json'), JSON.stringify(config));
    return home;
  }

  function runIn(home, payload, { source = 'claude', args = [] } = {}) {
    const env = { ...process.env, HOME: home, USERPROFILE: home };
    for (const k of SCRUB) delete env[k];
    return new Promise((resolve, reject) => {
      const child = spawn(process.execPath, ['src/notify.mjs', '--source', source, ...args], { cwd: repoRoot, env, timeout: 30000 });
      let stdout = '';
      let stderr = '';
      child.stdout.setEncoding('utf8').on('data', (d) => { stdout += d; });
      child.stderr.setEncoding('utf8').on('data', (d) => { stderr += d; });
      child.on('error', reject);
      child.on('close', (status) => resolve({ status, stdout, stderr }));
      child.stdin.end(JSON.stringify(payload));
    });
  }

  // One run against a fresh HOME. Returns the requests this run caused.
  async function run(config, payload, opts) {
    requests = [];
    const home = newHome(config);
    try {
      const res = await runIn(home, payload, opts);
      assert.equal(res.status, 0, res.stderr);
      let errors = '';
      try { errors = fs.readFileSync(path.join(home, '.anotifier', 'errors.log'), 'utf8'); } catch { /* none written */ }
      return { requests: [...requests], errors, stdout: res.stdout };
    } finally {
      fs.rmSync(home, { recursive: true, force: true });
    }
  }

  const stop = (cwd) => ({ hook_event_name: 'Stop', ...(cwd === undefined ? {} : { cwd }), session_id: `s-${Math.random()}` });
  const urls = (r) => r.requests.map((q) => q.url);

  // base is only known once the server is listening, so rules are built per test.
  const rule = (extra = {}) => ({ match: PROJECT, webhook: { url: `${base}/project` }, ...extra });

  it('a matching rule redirects the webhook for that workspace only', async () => {
    const config = baseConfig({ projects: [rule()] });
    const inside = await run(config, stop(PROJECT));
    assert.deepEqual(urls(inside), ['/project']);
    const outside = await run(config, stop(OTHER));
    assert.deepEqual(urls(outside), ['/base']);
  });

  it('a workspace no rule matches behaves exactly as without any rules', async () => {
    const withRules = await run(baseConfig({ projects: [rule()] }), stop(OTHER));
    const without = await run(baseConfig(), stop(OTHER));
    assert.deepEqual(urls(withRules), ['/base']);
    assert.deepEqual(urls(without), ['/base']);
    assert.deepEqual(JSON.parse(withRules.requests[0].body).project, JSON.parse(without.requests[0].body).project);
    assert.equal(withRules.stdout, without.stdout);
  });

  it('a prefix of the rule path, or a sibling with the same prefix, does not match', async () => {
    const config = baseConfig({ projects: [rule()] });
    for (const cwd of ['/work/acme', `${PROJECT}-two`]) {
      const res = await run(config, stop(cwd));
      assert.deepEqual(urls(res), ['/base'], cwd);
    }
  });

  it('no workspace in the payload leaves the config unchanged', async () => {
    const res = await run(baseConfig({ projects: [rule()] }), stop(undefined));
    assert.deepEqual(urls(res), ['/base']);
  });

  it('a subfolder of the project matches the rule', async () => {
    const config = baseConfig({ projects: [rule()] });
    for (const cwd of [`${PROJECT}/src`, `${PROJECT}/src/deep/er`, `${PROJECT}/`]) {
      const res = await run(config, stop(cwd));
      assert.deepEqual(urls(res), ['/project'], cwd);
    }
  });

  it('a glob rule matches workspaces under the pattern', async () => {
    const config = baseConfig({ projects: [{ match: '/work/*/app', webhook: { url: `${base}/glob` } }] });
    assert.deepEqual(urls(await run(config, stop('/work/acme/app/src'))), ['/glob']);
    assert.deepEqual(urls(await run(config, stop('/work/acme/tool'))), ['/base']);
  });

  it("a Cursor payload's first workspace_roots entry is the workspace", async () => {
    const config = baseConfig({ projects: [rule()] });
    const payload = { conversation_id: 'conv-1', workspace_roots: [PROJECT, '/work/other'] };
    const res = await run(config, payload, { source: 'cursor', args: ['--event', 'stop'] });
    assert.deepEqual(urls(res), ['/project']);
    const elsewhere = await run(config, { conversation_id: 'conv-2', workspace_roots: [OTHER] }, { source: 'cursor', args: ['--event', 'stop'] });
    assert.deepEqual(urls(elsewhere), ['/base']);
  });

  it('a rule can change the ntfy priority for its workspace only', async () => {
    const config = baseConfig({
      webhook: { enabled: false },
      ntfy: { enabled: true, server: base, topic: 'alerts' },
      projects: [{ match: PROJECT, events: { task_complete: { priority: 'high' } } }],
    });
    const inside = await run(config, stop(PROJECT));
    assert.equal(inside.requests.length, 1);
    assert.equal(inside.requests[0].url, '/alerts');
    assert.equal(inside.requests[0].headers.priority, 'high');
    const outside = await run(config, stop(OTHER));
    assert.equal(outside.requests[0].headers.priority, 'default');
  });

  it('a rule can send a workspace to a different ntfy topic', async () => {
    const config = baseConfig({
      webhook: { enabled: false },
      ntfy: { enabled: true, server: base, topic: 'alerts' },
      projects: [{ match: PROJECT, ntfy: { topic: 'acme-only' } }],
    });
    assert.deepEqual(urls(await run(config, stop(PROJECT))), ['/acme-only']);
    assert.deepEqual(urls(await run(config, stop(OTHER))), ['/alerts']);
  });

  it('a telegram rule that sets format but inherits chatId from the top level does not error', async () => {
    const config = baseConfig({
      webhook: { enabled: true, url: `${base}/tg`, format: 'generic', chatId: '12345' },
      projects: [{ match: PROJECT, webhook: { format: 'telegram' } }],
    });
    const res = await run(config, stop(PROJECT));
    assert.deepEqual(urls(res), ['/tg']);
    assert.equal(JSON.parse(res.requests[0].body).chat_id, '12345');
    assert.equal(res.errors, '', `errors.log should be empty, got: ${res.errors}`);
    // The same config elsewhere stays generic.
    const outside = await run(config, stop(OTHER));
    assert.equal(JSON.parse(outside.requests[0].body).chat_id, undefined);
    assert.equal(outside.errors, '');
  });

  it('the loader reports no problem for that telegram rule', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aan-proj-wire-cfg-'));
    try {
      const file = path.join(dir, 'config.json');
      fs.writeFileSync(file, JSON.stringify({
        webhook: { enabled: true, url: 'https://example.invalid/h', format: 'generic', chatId: '12345' },
        projects: [{ match: PROJECT, webhook: { format: 'telegram' } }],
      }));
      const { problem } = loadConfigResult(file);
      assert.equal(problem, null);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  describe('quiet hours inside a rule', () => {
    // A window of one hour either side of now, in local time (it may span midnight).
    const around = () => {
      const fmt = (min) => {
        const m = ((min % 1440) + 1440) % 1440;
        return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
      };
      const now = new Date();
      const minutes = now.getHours() * 60 + now.getMinutes();
      return { enabled: true, from: fmt(minutes - 60), to: fmt(minutes + 60) };
    };

    it('silences the matching workspace and nothing else', async () => {
      const config = baseConfig({ projects: [{ match: PROJECT, quietHours: around() }] });
      const inside = await run(config, stop(PROJECT));
      assert.deepEqual(urls(inside), []);
      assert.equal(inside.stdout, '{}\n');
      const outside = await run(config, stop(OTHER));
      assert.deepEqual(urls(outside), ['/base']);
    });

    it('a rule can lift the top-level quiet hours for its workspace', async () => {
      const config = baseConfig({
        quietHours: around(),
        projects: [{ match: PROJECT, quietHours: { enabled: false } }],
      });
      assert.deepEqual(urls(await run(config, stop(PROJECT))), ['/base']);
      assert.deepEqual(urls(await run(config, stop(OTHER))), []);
    });
  });

  describe('the minimum-duration filter inside a rule', () => {
    it('drops a short completion in the matching workspace only', async () => {
      const config = baseConfig({
        projects: [{ match: PROJECT, events: { task_complete: { minDurationSeconds: 3600 } } }],
      });
      requests = [];
      for (const [cwd, expected] of [[PROJECT, []], [OTHER, ['/base']]]) {
        const home = newHome(config);
        try {
          const session = `s-${Math.random()}`;
          const started = await runIn(home, { hook_event_name: 'UserPromptSubmit', cwd, session_id: session });
          assert.equal(started.status, 0, started.stderr);
          requests = [];
          const done = await runIn(home, { hook_event_name: 'Stop', cwd, session_id: session });
          assert.equal(done.status, 0, done.stderr);
          assert.deepEqual(urls({ requests }), expected, cwd);
        } finally {
          fs.rmSync(home, { recursive: true, force: true });
        }
      }
    });
  });
});

describe('loadEffectiveConfig (the one wiring point)', () => {
  function withConfig(config, fn) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aan-proj-wire-cfg-'));
    try {
      const file = path.join(dir, 'config.json');
      fs.writeFileSync(file, JSON.stringify(config));
      return fn(() => loadConfigResult(file).config);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }

  const rules = {
    projects: [{ match: PROJECT, events: { task_complete: { toastSound: 'Alarm' } } }],
  };
  const event = (cwd) => ({ source: 'claude', event: 'task_complete', cwd, projectName: 'app' });

  it("a matching rule changes the sound for that workspace only", () => {
    withConfig(rules, (load) => {
      const inside = loadEffectiveConfig(event(PROJECT), load);
      const outside = loadEffectiveConfig(event(OTHER), load);
      assert.equal(route(event(PROJECT), inside).toastSound, 'Alarm');
      assert.equal(route(event(OTHER), outside).toastSound, 'IM');
    });
  });

  it('a subfolder and a Cursor workspace_roots payload resolve to the same rule', () => {
    withConfig(rules, (load) => {
      const sub = loadEffectiveConfig(event(`${PROJECT}/src`), load);
      assert.equal(sub.events.task_complete.toastSound, 'Alarm');
      const cursor = parseInput({ conversation_id: 'c', workspace_roots: [PROJECT] }, 'cursor', 'stop');
      assert.equal(cursor.cwd, PROJECT);
      assert.equal(loadEffectiveConfig(cursor, load).events.task_complete.toastSound, 'Alarm');
    });
  });

  it('without a rule match or a workspace the result equals the loaded config minus the rule list', () => {
    withConfig(rules, (load) => {
      const { projects, ...plain } = load();
      assert.ok(Array.isArray(projects));
      assert.deepEqual(loadEffectiveConfig(event(OTHER), load), plain);
      assert.deepEqual(loadEffectiveConfig(event(''), load), plain);
      assert.deepEqual(loadEffectiveConfig({}, load), plain);
      assert.deepEqual(loadEffectiveConfig(undefined, load), plain);
    });
  });

  it('loads the config once per call and never touches the loaded object', () => {
    withConfig(rules, (load) => {
      let calls = 0;
      const counted = () => { calls++; return load(); };
      const loaded = load();
      const before = JSON.stringify(loaded);
      loadEffectiveConfig(event(PROJECT), counted);
      assert.equal(calls, 1);
      assert.equal(JSON.stringify(loaded), before);
    });
  });

  it('a rule cannot override a machine-level key', () => {
    withConfig({
      sentry: { enabled: false, dsn: '' },
      projects: [{ match: PROJECT, sentry: { enabled: true, dsn: 'https://x@example.invalid/1' } }],
    }, (load) => {
      // The loader drops the excluded key from the rule, and the resolver would skip it anyway.
      assert.equal(loadEffectiveConfig(event(PROJECT), load).sentry.enabled, false);
    });
  });
});
