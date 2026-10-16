import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { useFakeHome } from './fake-home.mjs';
useFakeHome();

const { matchesProjectPath, normalizeProjectPath, resolveProjectConfig, loadConfigResult } =
  await import('../src/config-loader.mjs');

const WIN = { platform: 'win32', home: 'C:\\Users\\me' };
const MAC = { platform: 'darwin', home: '/Users/me' };
const LINUX = { platform: 'linux', home: '/home/me' };

describe('normalizeProjectPath', () => {
  it('uses forward slashes, drops the Cursor drive-letter slash and trailing slashes', () => {
    assert.equal(normalizeProjectPath('C:\\Users\\x\\app\\', 'linux'), 'C:/Users/x/app');
    assert.equal(normalizeProjectPath('/C:/Users/x/app', 'linux'), 'C:/Users/x/app');
    assert.equal(normalizeProjectPath('/home/me//app///', 'linux'), '/home/me/app');
    assert.equal(normalizeProjectPath('/', 'linux'), '/');
  });
  it('folds case only on win32 and darwin', () => {
    assert.equal(normalizeProjectPath('C:/Users/X', 'win32'), 'c:/users/x');
    assert.equal(normalizeProjectPath('/Users/X', 'darwin'), '/users/x');
    assert.equal(normalizeProjectPath('/home/X', 'linux'), '/home/X');
  });
});

describe('matchesProjectPath', () => {
  it('a plain path matches the directory itself and anything below it', () => {
    assert.ok(matchesProjectPath('/home/me/app', '/home/me/app', LINUX));
    assert.ok(matchesProjectPath('/home/me/app', '/home/me/app/src/deep', LINUX));
    assert.ok(!matchesProjectPath('/home/me/app', '/home/me/application', LINUX));
    assert.ok(!matchesProjectPath('/home/me/app', '/home/me', LINUX));
  });

  it('* is exactly one path segment', () => {
    assert.ok(matchesProjectPath('/home/me/side/*', '/home/me/side/a', LINUX));
    assert.ok(!matchesProjectPath('/home/me/side/*', '/home/me/side', LINUX));
    assert.ok(!matchesProjectPath('/home/me/side/*', '/home/me/side/a/b', LINUX));
    assert.ok(matchesProjectPath('/home/me/side/*/src', '/home/me/side/a/src', LINUX));
    assert.ok(!matchesProjectPath('/home/me/side/*/src', '/home/me/side/a/b/src', LINUX));
    assert.ok(matchesProjectPath('/home/me/side/app-*', '/home/me/side/app-web', LINUX));
    assert.ok(!matchesProjectPath('/home/me/side/app-*', '/home/me/side/web-app', LINUX));
  });

  it('** is any depth, including none', () => {
    assert.ok(matchesProjectPath('/home/me/acme/**', '/home/me/acme', LINUX));
    assert.ok(matchesProjectPath('/home/me/acme/**', '/home/me/acme/a', LINUX));
    assert.ok(matchesProjectPath('/home/me/acme/**', '/home/me/acme/a/b/c', LINUX));
    assert.ok(!matchesProjectPath('/home/me/acme/**', '/home/me/acmeish/a', LINUX));
    assert.ok(matchesProjectPath('/home/me/**/app', '/home/me/app', LINUX));
    assert.ok(matchesProjectPath('/home/me/**/app', '/home/me/x/y/app', LINUX));
    assert.ok(!matchesProjectPath('/home/me/**/app', '/home/me/x/y/app2', LINUX));
    assert.ok(matchesProjectPath('/home/me/**/**/app', '/home/me/x/app', LINUX));
  });

  it('literal regex characters in a pattern stay literal', () => {
    assert.ok(matchesProjectPath('/home/me/a+b (1)/x.y', '/home/me/a+b (1)/x.y', LINUX));
    assert.ok(!matchesProjectPath('/home/me/a.b', '/home/me/aXb', LINUX));
  });

  it('~/ expands to the home directory', () => {
    assert.ok(matchesProjectPath('~/work/acme/**', '/home/me/work/acme/api', LINUX));
    assert.ok(!matchesProjectPath('~/work/acme/**', '/home/other/work/acme/api', LINUX));
    assert.ok(matchesProjectPath('~', '/home/me/anything', LINUX));
    assert.ok(matchesProjectPath('~/work', 'C:\\Users\\me\\work\\app', WIN));
  });

  it('handles Windows backslashes in the pattern and the workspace', () => {
    assert.ok(matchesProjectPath('C:\\Users\\me\\side\\*', 'C:\\Users\\me\\side\\app', WIN));
    assert.ok(matchesProjectPath('C:/Users/me/side/*', 'C:\\Users\\me\\side\\app', WIN));
    assert.ok(matchesProjectPath('C:\\Users\\me\\side', 'C:/Users/me/side/app/src', WIN));
  });

  it('accepts the Cursor /C:/... workspace form', () => {
    assert.ok(matchesProjectPath('C:/Users/me/side/*', '/C:/Users/me/side/app', WIN));
    assert.ok(matchesProjectPath('C:\\Users\\me\\app', '/C:/Users/me/app', WIN));
    assert.ok(matchesProjectPath('/C:/Users/me/app', 'C:\\Users\\me\\app\\src', WIN));
  });

  it('ignores a trailing slash on either side', () => {
    assert.ok(matchesProjectPath('/home/me/app/', '/home/me/app', LINUX));
    assert.ok(matchesProjectPath('/home/me/app', '/home/me/app/', LINUX));
    assert.ok(matchesProjectPath('/home/me/side/*/', '/home/me/side/a/', LINUX));
  });

  it('is case-insensitive on win32 and darwin, case-sensitive on linux', () => {
    assert.ok(matchesProjectPath('c:/users/me/App', 'C:\\Users\\Me\\app', WIN));
    assert.ok(matchesProjectPath('/Users/me/App', '/users/ME/app', MAC));
    assert.ok(!matchesProjectPath('/home/me/App', '/home/me/app', LINUX));
    assert.ok(matchesProjectPath('/home/me/App', '/home/me/App', LINUX));
  });

  it('never matches an unusable pattern or workspace', () => {
    for (const bad of ['', '   ', undefined, null, 5, {}]) {
      assert.equal(matchesProjectPath(bad, '/home/me/app', LINUX), false);
      assert.equal(matchesProjectPath('/home/me/app', bad, LINUX), false);
    }
  });
});

describe('resolveProjectConfig', () => {
  const base = () => ({
    ntfy: { enabled: true, topic: 'general', server: 'https://ntfy.sh' },
    toast: { enabled: true },
    sentry: { enabled: false, dsn: '' },
    telemetry: { enabled: false, asked: false },
    quietHours: { enabled: false, from: '22:00', to: '08:00' },
    events: {
      task_complete: { toastSound: 'IM', priority: 'default', minDurationSeconds: 0 },
      needs_input: { toastSound: 'Reminder', priority: 'urgent' },
    },
    projects: [],
  });
  const WS = '/home/me/work/acme/api';

  it('applies a matching rule and ignores a non-matching one', () => {
    const config = base();
    config.projects = [
      { match: '~/work/other/**', ntfy: { topic: 'other' } },
      { match: '~/work/acme/**', ntfy: { topic: 'acme-alerts' } },
    ];
    const out = resolveProjectConfig(config, WS, LINUX);
    assert.equal(out.ntfy.topic, 'acme-alerts');
    assert.equal(out.ntfy.server, 'https://ntfy.sh');
  });

  it('later matching rules win, in array order', () => {
    const config = base();
    config.projects = [
      { match: '~/work/acme/**', ntfy: { topic: 'first' }, toast: { enabled: false } },
      { match: '~/work/acme/api', ntfy: { topic: 'second' } },
    ];
    const out = resolveProjectConfig(config, WS, LINUX);
    assert.equal(out.ntfy.topic, 'second');
    assert.equal(out.toast.enabled, false); // only set by the earlier rule, still applied
    config.projects.reverse();
    assert.equal(resolveProjectConfig(config, WS, LINUX).ntfy.topic, 'first');
  });

  it('deep-merges nested keys instead of replacing the block', () => {
    const config = base();
    config.projects = [{
      match: '~/work/acme/**',
      quietHours: { enabled: true },
      events: { task_complete: { priority: 'high', minDurationSeconds: 30 } },
    }];
    const out = resolveProjectConfig(config, WS, LINUX);
    assert.deepEqual(out.quietHours, { enabled: true, from: '22:00', to: '08:00' });
    assert.deepEqual(out.events.task_complete, { toastSound: 'IM', priority: 'high', minDurationSeconds: 30 });
    assert.deepEqual(out.events.needs_input, { toastSound: 'Reminder', priority: 'urgent' });
  });

  it('does not mutate the input and does not alias it', () => {
    const config = base();
    config.projects = [{ match: '~/work/acme/**', events: { task_complete: { priority: 'high' } } }];
    const snapshot = JSON.parse(JSON.stringify(config));
    const out = resolveProjectConfig(config, WS, LINUX);
    assert.deepEqual(config, snapshot);
    out.events.task_complete.priority = 'min';
    out.ntfy.topic = 'changed';
    out.projectsMarker = true;
    assert.deepEqual(config, snapshot);
    assert.equal(config.projects[0].events.task_complete.priority, 'high');
  });

  it('strips projects from the output, matching or not', () => {
    const config = base();
    config.projects = [{ match: '~/work/acme/**', ntfy: { topic: 'a' } }];
    assert.ok(!('projects' in resolveProjectConfig(config, WS, LINUX)));
    assert.ok(!('projects' in resolveProjectConfig(config, '/elsewhere', LINUX)));
  });

  it('returns the config unchanged minus projects for an empty or invalid workspace', () => {
    const config = base();
    config.projects = [{ match: '/**', ntfy: { topic: 'everywhere' } }];
    const expected = base();
    delete expected.projects;
    for (const ws of ['', '   ', undefined, null, 42, {}, []]) {
      assert.deepEqual(resolveProjectConfig(config, ws, LINUX), expected);
    }
  });

  it('handles a config with no projects key or an empty list', () => {
    const noKey = base();
    delete noKey.projects;
    const expected = base();
    delete expected.projects;
    assert.deepEqual(resolveProjectConfig(noKey, WS, LINUX), expected);
    assert.deepEqual(resolveProjectConfig(base(), WS, LINUX), expected);
  });

  it('never throws on malformed input', () => {
    const config = base();
    config.projects = [null, 7, 'x', [], { match: 5 }, { ntfy: {} }, { match: '~/work/acme/**', ntfy: { topic: 'ok' } }];
    assert.equal(resolveProjectConfig(config, WS, LINUX).ntfy.topic, 'ok');
    config.projects = 'not-an-array';
    assert.ok(!('projects' in resolveProjectConfig(config, WS, LINUX)));
    const circular = base();
    circular.self = circular;
    assert.doesNotThrow(() => resolveProjectConfig(circular, WS, LINUX));
    assert.doesNotThrow(() => resolveProjectConfig(null, WS));
    assert.doesNotThrow(() => resolveProjectConfig(undefined, WS));
  });

  it('refuses to override machine-level keys even when validation was skipped', () => {
    const config = base();
    config.projects = [{
      match: '~/work/acme/**',
      sentry: { enabled: true, dsn: 'https://evil.example/1' },
      telemetry: { enabled: true },
      usageAlerts: { enabled: false },
      ntfy: { topic: 'ok' },
    }];
    const out = resolveProjectConfig(config, WS, LINUX);
    assert.equal(out.sentry.enabled, false);
    assert.equal(out.telemetry.enabled, false);
    assert.ok(!('usageAlerts' in out));
    assert.equal(out.ntfy.topic, 'ok');
  });

  it('ignores prototype-pollution keys in a rule', () => {
    const config = base();
    config.projects = [JSON.parse('{"match":"~/work/acme/**","__proto__":{"polluted":true},"ntfy":{"__proto__":{"polluted":true},"topic":"t"}}')];
    const out = resolveProjectConfig(config, WS, LINUX);
    assert.equal(out.ntfy.topic, 't');
    assert.equal({}.polluted, undefined);
    assert.equal(out.polluted, undefined);
    assert.equal(out.ntfy.polluted, undefined);
  });
});

describe('project rule validation', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'anotifier-projects-'));
  after(() => fs.rmSync(dir, { recursive: true, force: true }));
  let n = 0;
  const load = (user) => {
    const file = path.join(dir, `config-${n++}.json`);
    fs.writeFileSync(file, typeof user === 'string' ? user : JSON.stringify(user));
    return loadConfigResult(file);
  };

  it('a valid projects list round-trips without a problem', () => {
    const user = {
      projects: [
        { match: '~/work/acme/**', ntfy: { topic: 'acme-alerts' }, events: { task_complete: { priority: 'high', minDurationSeconds: 20 } } },
        { match: 'C:/Users/me/side/*', events: { task_complete: { toastSound: 'Default' } }, quietHours: { enabled: true, from: '21:00', to: '07:00' } },
      ],
    };
    const { config, problem } = load(user);
    assert.equal(problem, null);
    assert.deepEqual(config.projects, user.projects);
    assert.equal(config.ntfy.server, 'https://ntfy.sh'); // defaults still merged
  });

  it('a resolved loader config carries the rule over the user config over the defaults', () => {
    const { config } = load({
      ntfy: { topic: 'mine' },
      projects: [{ match: '/home/me/app', ntfy: { topic: 'app' } }],
    });
    const hit = resolveProjectConfig(config, '/home/me/app/src', LINUX);
    const miss = resolveProjectConfig(config, '/home/me/other', LINUX);
    assert.equal(hit.ntfy.topic, 'app');
    assert.equal(hit.ntfy.server, 'https://ntfy.sh');
    assert.equal(miss.ntfy.topic, 'mine');
  });

  it('reports a non-array projects and drops it', () => {
    for (const bad of [{ match: 'x' }, 'x', 5, null]) {
      const { config, problem } = load({ projects: bad });
      assert.equal(problem?.type, 'validate');
      assert.match(problem.message, /"projects" must be an array/);
      assert.equal(config.projects, undefined);
    }
  });

  it('reports a rule without a usable match and drops that rule only', () => {
    const { config, problem } = load({
      projects: [
        { ntfy: { topic: 'a' } },
        { match: '', ntfy: { topic: 'b' } },
        { match: 7 },
        'nope',
        { match: '/ok', ntfy: { topic: 'c' } },
      ],
    });
    assert.equal(problem?.type, 'validate');
    assert.match(problem.message, /"projects\[0\]\.match" must be a non-empty string/);
    assert.match(problem.message, /"projects\[1\]\.match" must be a non-empty string/);
    assert.match(problem.message, /"projects\[2\]\.match" must be a non-empty string/);
    assert.match(problem.message, /"projects\[3\]" must be an object/);
    assert.deepEqual(config.projects, [{ match: '/ok', ntfy: { topic: 'c' } }]);
  });

  it('reports a bad value inside a rule like a top-level one and drops just that value', () => {
    const { config, problem } = load({
      projects: [{
        match: '/ok',
        ntfy: { topic: 5, enabled: false },
        events: { task_complete: { priority: 'loud', toastSound: 'Default' } },
        quietHours: { from: '25:99' },
      }],
    });
    assert.equal(problem?.type, 'validate');
    assert.match(problem.message, /projects\[0\]: "ntfy\.topic" must be a string, got number/);
    assert.match(problem.message, /projects\[0\]: "events\.task_complete\.priority" must be one of min\|low\|default\|high\|urgent, got "loud"/);
    assert.match(problem.message, /projects\[0\]: "quietHours\.from" must be a "HH:MM" 24-hour time/);
    const [rule] = config.projects;
    assert.deepEqual(rule.ntfy, { enabled: false });
    assert.deepEqual(rule.events, { task_complete: { toastSound: 'Default' } });
    assert.deepEqual(rule.quietHours, {});
  });

  it('reports excluded and unknown keys inside a rule and removes them', () => {
    const { config, problem } = load({
      projects: [{
        match: '/ok',
        telemetry: { enabled: true },
        sentry: { dsn: 'https://evil.example/1' },
        usageAlerts: { enabled: false },
        projects: [],
        typo: 1,
        ntfy: { topic: 'kept' },
      }],
    });
    assert.equal(problem?.type, 'validate');
    for (const key of ['telemetry', 'sentry', 'usageAlerts', 'projects', 'typo']) {
      assert.match(problem.message, new RegExp(`projects\\[0\\]: unknown key "${key}"`));
    }
    assert.deepEqual(config.projects, [{ match: '/ok', ntfy: { topic: 'kept' } }]);
  });

  it('reports a __proto__ key inside a rule and never merges it', () => {
    const { config, problem } = load(
      '{"projects":[{"match":"/ok","__proto__":{"polluted":true},"ntfy":{"topic":"t"}}]}',
    );
    assert.equal(problem?.type, 'validate');
    assert.match(problem.message, /projects\[0\]: unknown key "__proto__"/);
    assert.equal({}.polluted, undefined);
    assert.equal(Object.getPrototypeOf(config.projects[0]), Object.prototype);
    assert.equal(config.projects[0].polluted, undefined);
    assert.equal(config.projects[0].ntfy.topic, 't');
  });
});
