// tests/e2e/telemetry.e2e.test.mjs — real hook + CLI subprocesses against a
// local capture server: consent is honored end to end and nothing typed by the
// user ever reaches a payload.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { seedTempHome, writeUserConfig, runNodeAsync } from './helpers.mjs';

const readJSON = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const statePath = (home) => path.join(home, '.anotifier', '.telemetry.json');

// Every channel off, so a hook run exercises the full path without side effects.
const silentConfig = (telemetryEnabled) => ({
  toast: { enabled: false },
  ntfy: { enabled: false },
  terminalBell: { enabled: false },
  updateCheck: { enabled: false },
  telemetry: { enabled: telemetryEnabled },
});

describe('telemetry through real subprocesses', () => {
  let server;
  let env;
  const received = [];
  const homes = [];
  const home = () => { const h = seedTempHome(); homes.push(h); return h; };

  before(async () => {
    server = http.createServer((req, res) => {
      let body = '';
      req.on('data', (c) => { body += c; });
      req.on('end', () => { received.push(JSON.parse(body)); res.end('{"status":"Ok"}'); });
    });
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    // ANOTIFIER_TELEMETRY=1 lifts the CI rule for these tests only.
    env = { ANOTIFIER_TELEMETRY: '1', ANOTIFIER_TELEMETRY_URL: `http://127.0.0.1:${server.address().port}/i/v0/e/` };
  });
  after(() => {
    server.close();
    for (const h of homes) fs.rmSync(h, { recursive: true, force: true });
  });

  it('an opted-out hook run writes no state file and sends nothing', async () => {
    const h = home();
    writeUserConfig(h, silentConfig(false));
    const before = received.length;
    const res = await runNodeAsync(['src/notify.mjs', '--source', 'codex'], { home: h, stdin: '{"hook_event_name":"Stop"}', extraEnv: env });
    assert.equal(res.status, 0, res.stderr);
    assert.equal(fs.existsSync(statePath(h)), false);
    assert.equal(received.length, before);
  });

  it('an opted-in hook run only counts locally (the summary waits 24h)', async () => {
    const h = home();
    writeUserConfig(h, silentConfig(true));
    const before = received.length;
    const res = await runNodeAsync(['src/notify.mjs', '--source', 'codex'], { home: h, stdin: '{"hook_event_name":"Stop"}', extraEnv: env });
    assert.equal(res.status, 0, res.stderr);
    const { counters } = readJSON(statePath(h));
    assert.equal(counters.runs, 1);
    assert.deepEqual(counters.outcomes, { dispatched: 1 });
    assert.deepEqual(counters.sources, { codex: 1 });
    assert.equal(received.length, before);
  });

  it('a due summary goes out from the hook tail exactly once', async () => {
    const h = home();
    writeUserConfig(h, silentConfig(true));
    fs.mkdirSync(path.dirname(statePath(h)), { recursive: true });
    fs.writeFileSync(statePath(h), JSON.stringify({ windowStart: Date.now() - 25 * 3600 * 1000, counters: { runs: 4, outcomes: { dispatched: 4 } } }));
    const before = received.length;
    const res = await runNodeAsync(['src/notify.mjs', '--source', 'codex'], { home: h, stdin: '{"hook_event_name":"Stop"}', extraEnv: env });
    assert.equal(res.status, 0, res.stderr);
    const sent = received.slice(before);
    assert.equal(sent.length, 1);
    assert.equal(sent[0].event, 'hook_daily_summary');
    assert.equal(sent[0].properties.runs, 5);
    assert.equal(readJSON(statePath(h)).counters, undefined);
  });

  it('CLI usage events carry the argument SHAPE, never what was typed', async () => {
    const h = home();
    writeUserConfig(h, silentConfig(true));
    const before = received.length;
    const res = await runNodeAsync(['cli/index.mjs', 'snooze', '37m'], { home: h, extraEnv: env });
    assert.equal(res.status, 0, res.stderr);
    const [event] = received.slice(before);
    assert.equal(event.event, 'cli_command');
    assert.equal(event.properties.command, 'snooze');
    assert.deepEqual(event.properties.args, ['other']);
    assert.ok(!JSON.stringify(event).includes('37m'));
  });

  it('`telemetry on` reports the opt-in; `telemetry off` sends nothing and forgets the install id', async () => {
    const h = home();
    writeUserConfig(h, silentConfig(false));
    let before = received.length;
    let res = await runNodeAsync(['cli/index.mjs', 'telemetry', 'on'], { home: h, extraEnv: env });
    assert.equal(res.status, 0, res.stderr);
    assert.equal(readJSON(path.join(h, '.anotifier', 'config.json')).telemetry.enabled, true);
    assert.deepEqual(received.slice(before).map((e) => e.event), ['telemetry_enabled']);
    assert.equal(fs.existsSync(statePath(h)), true);

    before = received.length;
    res = await runNodeAsync(['cli/index.mjs', 'telemetry', 'off'], { home: h, extraEnv: env });
    assert.equal(res.status, 0, res.stderr);
    assert.equal(readJSON(path.join(h, '.anotifier', 'config.json')).telemetry.enabled, false);
    assert.equal(received.length, before);
    assert.equal(fs.existsSync(statePath(h)), false);
  });

  it('DO_NOT_TRACK silences an opted-in install', async () => {
    const h = home();
    writeUserConfig(h, silentConfig(true));
    const before = received.length;
    const res = await runNodeAsync(['cli/index.mjs', 'telemetry'], { home: h, extraEnv: { ...env, DO_NOT_TRACK: '1' } });
    assert.equal(res.status, 0, res.stderr);
    assert.match(res.stdout, /DO_NOT_TRACK/);
    const res2 = await runNodeAsync(['cli/index.mjs', 'snooze', 'off'], { home: h, extraEnv: { ...env, DO_NOT_TRACK: '1' } });
    assert.equal(res2.status, 0, res2.stderr);
    assert.equal(received.length, before);
  });

  it('setup asks, defaults to Yes, and reports completion without the topic', async () => {
    const h = home();
    const topic = `private-topic-${Date.now()}`;
    const before = received.length;
    // prompts: enable ntfy? -> server -> topic -> usage stats? (Enter = default Yes)
    const res = await runNodeAsync(['cli/index.mjs', 'setup'], {
      home: h, stdin: ['y', 'https://ntfy.sh', topic, ''].join('\n') + '\n', extraEnv: env,
    });
    assert.equal(res.status, 0, res.stderr);
    assert.match(res.stdout, /anonymous usage stats/i);
    assert.equal(readJSON(path.join(h, '.anotifier', 'config.json')).telemetry.enabled, true);
    const events = received.slice(before);
    const completed = events.find((e) => e.event === 'setup_completed');
    assert.ok(completed, JSON.stringify(events.map((e) => e.event)));
    assert.deepEqual([...completed.properties.tools_detected].sort(), ['claude', 'codex', 'cursor', 'gemini']);
    assert.ok(!JSON.stringify(events).includes(topic));
    assert.ok(!JSON.stringify(events).includes(h));
  });

  it('answering No at setup stores the opt-out and sends nothing', async () => {
    const h = home();
    const before = received.length;
    const res = await runNodeAsync(['cli/index.mjs', 'setup'], { home: h, stdin: 'n\nn\n', extraEnv: env });
    assert.equal(res.status, 0, res.stderr);
    assert.equal(readJSON(path.join(h, '.anotifier', 'config.json')).telemetry.enabled, false);
    assert.equal(received.length, before);
  });
});
