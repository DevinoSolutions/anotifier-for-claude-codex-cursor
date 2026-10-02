// tests/e2e/telemetry.e2e.test.mjs — real hook + CLI subprocesses against a
// local capture server: consent is honored end to end and nothing typed by the
// user ever reaches a payload.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { seedTempHome, writeUserConfig, runNodeAsync } from './helpers.mjs';
import { identityProbes } from '../telemetry-helpers.mjs';

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
  // Every event received, flattened out of single and /batch/ requests alike.
  const received = [];
  // Every request: { path, raw, count } so a test can check batching and the raw bytes.
  const requests = [];
  const homes = [];
  const home = () => { const h = seedTempHome(); homes.push(h); return h; };

  before(async () => {
    server = http.createServer((req, res) => {
      let body = '';
      req.on('data', (c) => { body += c; });
      req.on('end', () => {
        const json = JSON.parse(body);
        const events = json.batch ?? [json];
        received.push(...events);
        requests.push({ path: req.url, raw: body, count: events.length });
        res.end('{"status":"Ok"}');
      });
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
    // The install id is what a deletion request needs, so \`telemetry\` shows it.
    const installId = readJSON(statePath(h)).installId;
    assert.match(installId, /^[0-9a-f-]{36}$/);
    res = await runNodeAsync(['cli/index.mjs', 'telemetry'], { home: h, extraEnv: env });
    assert.match(res.stdout.replace(/[[0-9;]*m/g, ''), new RegExp(`Install id: ${installId}`));

    before = received.length;
    res = await runNodeAsync(['cli/index.mjs', 'telemetry', 'off'], { home: h, extraEnv: env });
    assert.equal(res.status, 0, res.stderr);
    assert.ok(res.stdout.includes(installId), 'off prints the id it just deleted, for a deletion request');
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

  // The piped answers cover: enable ntfy? -> server -> topic -> (a usage-stats
  // question that must never be asked here: stdin is not a terminal).
  const setupArgs = (extra = {}) => ({ stdin: ['y', 'https://ntfy.sh', `t-${Date.now()}`, 'y', 'y'].join('\n') + '\n', extraEnv: env, ...extra });

  it('a piped setup never opts in, even when the answers say yes', async () => {
    const h = home();
    const before = received.length;
    const res = await runNodeAsync(['cli/index.mjs', 'setup'], { home: h, ...setupArgs() });
    assert.equal(res.status, 0, res.stderr);
    assert.equal(readJSON(path.join(h, '.anotifier', 'config.json')).telemetry.enabled, false);
    assert.doesNotMatch(res.stdout, /Share anonymous usage stats/);
    assert.match(res.stdout, /Usage stats: off \(run `anotifier telemetry on` to share anonymous usage stats\)/);
    assert.equal(received.length, before, 'nothing was sent');
    assert.equal(fs.existsSync(statePath(h)), false, 'no install id was created');
  });

  it('setup with empty or closed stdin leaves telemetry off', async () => {
    for (const stdin of ['', '\n\n\n\n', 'n\n']) {
      const h = home();
      const before = received.length;
      const res = await runNodeAsync(['cli/index.mjs', 'setup'], { home: h, stdin, extraEnv: env });
      assert.equal(res.status, 0, res.stderr);
      assert.equal(readJSON(path.join(h, '.anotifier', 'config.json')).telemetry.enabled, false, JSON.stringify(stdin));
      assert.equal(received.length, before);
    }
  });

  it('re-running setup keeps an earlier choice: on stays on, off stays off', async () => {
    // On: opted in with `telemetry on`, then setup (not a terminal, so it cannot ask).
    let h = home();
    writeUserConfig(h, silentConfig(false));
    let res = await runNodeAsync(['cli/index.mjs', 'telemetry', 'on'], { home: h, extraEnv: env });
    assert.equal(res.status, 0, res.stderr);
    let before = received.length;
    res = await runNodeAsync(['cli/index.mjs', 'setup'], { home: h, ...setupArgs() });
    assert.equal(res.status, 0, res.stderr);
    assert.match(res.stdout, /Usage stats: on, unchanged/);
    const cfg = readJSON(path.join(h, '.anotifier', 'config.json'));
    assert.deepEqual(cfg.telemetry, { enabled: true, asked: true });
    // It reports completion without the topic or the home directory.
    const events = received.slice(before);
    const completed = events.find((e) => e.event === 'setup_completed');
    assert.ok(completed, JSON.stringify(events.map((e) => e.event)));
    assert.deepEqual([...completed.properties.tools_detected].sort(), ['claude', 'codex', 'cursor', 'gemini']);
    assert.ok(!JSON.stringify(events).includes(h));
    assert.equal(completed.properties.$geoip_disable, true);

    // Off: an explicit No stays No.
    h = home();
    writeUserConfig(h, silentConfig(false));
    res = await runNodeAsync(['cli/index.mjs', 'telemetry', 'off'], { home: h, extraEnv: env });
    assert.equal(res.status, 0, res.stderr);
    before = received.length;
    res = await runNodeAsync(['cli/index.mjs', 'setup'], { home: h, ...setupArgs() });
    assert.equal(res.status, 0, res.stderr);
    assert.match(res.stdout, /Usage stats: off, unchanged/);
    assert.equal(readJSON(path.join(h, '.anotifier', 'config.json')).telemetry.enabled, false);
    assert.equal(received.length, before);
  });

  it('a command that sends two events sends them in ONE batch request', async () => {
    const h = home();
    writeUserConfig(h, silentConfig(true));
    const beforeEvents = received.length;
    const beforeRequests = requests.length;
    const res = await runNodeAsync(['cli/index.mjs', 'doctor'], { home: h, extraEnv: env });
    assert.ok([0, 1].includes(res.status), res.stderr); // doctor exits 1 when a check fails
    assert.deepEqual(received.slice(beforeEvents).map((e) => e.event), ['doctor_result', 'cli_command']);
    assert.equal(requests.length - beforeRequests, 1);
    assert.equal(requests.at(-1).path, '/batch/');
    // Keyed by check id, never by free text.
    const checks = received[beforeEvents].properties.checks;
    for (const [id, status] of Object.entries(checks)) {
      assert.match(id, /^[a-z-]{1,20}$/);
      assert.ok(['ok', 'info', 'warn', 'fail'].includes(status), status);
    }
  });

  it('a real hook run never leaks the payload, the machine or an odd event name', async () => {
    const h = home();
    writeUserConfig(h, silentConfig(true));
    fs.mkdirSync(path.dirname(statePath(h)), { recursive: true });
    // A due summary: it goes out from the tail of THIS run, which also counts
    // this run (an unrecognized event name) into the same window.
    fs.writeFileSync(statePath(h), JSON.stringify({
      windowStart: Date.now() - 25 * 3600 * 1000,
      counters: { runs: 3, outcomes: { dispatched: 3 }, sources: { claude: 3 } },
    }));
    const secrets = {
      cwd: '/home/secret-user/ProjectX',
      message: 'SECRET MESSAGE 123',
      session_id: 'sess-7c1e9f4a-do-not-leak',
      transcript_path: '/home/secret-user/.claude/projects/x/transcript-do-not-leak.jsonl',
    };
    const payload = { ...secrets, hook_event_name: 'Weird/Event Name!!' };
    const before = requests.length;
    const res = await runNodeAsync(['src/notify.mjs', '--source', 'claude'], { home: h, stdin: JSON.stringify(payload), extraEnv: env });
    assert.equal(res.status, 0, res.stderr);
    assert.equal(res.stdout.trim(), '{}', 'the hook response is unchanged');

    const sent = requests.slice(before);
    assert.equal(sent.length, 1);
    const raw = sent[0].raw;
    const body = JSON.parse(raw);
    assert.equal(body.event, 'hook_daily_summary');
    assert.equal(body.properties.runs, 4);
    assert.deepEqual(body.properties.unmapped_events, { other: 1 });

    const forbidden = [
      'secret-user', 'ProjectX', 'SECRET MESSAGE', 'do-not-leak', secrets.session_id, secrets.transcript_path,
      'Weird', 'Event Name', ...identityProbes(),
    ];
    for (const value of forbidden) {
      assert.ok(!raw.toLowerCase().includes(value.toLowerCase()), `the request body contains "${value}": ${raw}`);
    }
  });
});
