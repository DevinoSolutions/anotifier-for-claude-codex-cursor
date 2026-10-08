// tests/telemetry.test.mjs — opt-in usage stats: gates, counters, summary, no content.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {
  telemetryBlockedBy, isTelemetryActive, recordHookRun, maybeSendHookSummary,
  sendEvent, sendEvents, track, flushTelemetry, readState, clearState, getInstallId, configSnapshot, clampIdent, CORRUPT,
  MAX_UNMAPPED_KEYS, SUMMARY_INTERVAL_MS, TELEMETRY_KEY,
} from '../src/telemetry.mjs';
import { loadConfigResult } from '../src/config-loader.mjs';
import { resolveSetupConsent, hasAnswered } from '../cli/telemetry.mjs';
import { identityProbes } from './telemetry-helpers.mjs';

const ON = { telemetry: { enabled: true } };
// A clean, opted-in environment: nothing blocks, nothing hits the real host.
const envWith = (extra = {}) => ({ ANOTIFIER_TELEMETRY: '1', ...extra });
const tmpState = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'aan-tel-')), '.telemetry.json');

// The hook budget bounds the SEND, but maybeSendHookSummary also does plain sync
// file I/O after the send (re-reading and rewriting the state file), which can
// take hundreds of ms on a slow disk and is deliberately not part of the budget.
// This records every fs.readFileSync timestamp so a test can tell when the budget
// race ended: the re-read is the first thing that happens after it.
function recordReads() {
  const real = fs.readFileSync;
  const times = [];
  fs.readFileSync = (...args) => { times.push(Date.now()); return real(...args); };
  return {
    firstAfter: (t) => times.find((x) => x > t),
    stop: () => { fs.readFileSync = real; },
  };
}

// Content that must never appear in anything sent.
const SECRETS = {
  topic: 'secret-topic-9f3k2',
  server: 'https://ntfy.private-host.example',
  url: 'https://hooks.example.com/services/T000/B000/XXXX',
};
const secretConfig = {
  telemetry: { enabled: true },
  ntfy: { enabled: true, server: SECRETS.server, topic: SECRETS.topic, richContent: false },
  webhook: { enabled: true, url: SECRETS.url, format: 'slack' },
  toast: { enabled: true },
};
const assertNoSecrets = (payload) => {
  const text = JSON.stringify(payload);
  for (const value of Object.values(SECRETS)) assert.ok(!text.includes(value), `leaked ${value}: ${text}`);
  assert.ok(!text.includes('private-host'), text);
};

describe('telemetryBlockedBy', () => {
  it('nothing blocks a clean environment', () => {
    assert.equal(telemetryBlockedBy({}), null);
  });
  it('DO_NOT_TRACK wins over everything, including ANOTIFIER_TELEMETRY=1', () => {
    assert.equal(telemetryBlockedBy({ DO_NOT_TRACK: '1' }), 'DO_NOT_TRACK');
    assert.equal(telemetryBlockedBy({ DO_NOT_TRACK: 'true', ANOTIFIER_TELEMETRY: '1' }), 'DO_NOT_TRACK');
  });
  it('DO_NOT_TRACK=0 or empty does not block', () => {
    assert.equal(telemetryBlockedBy({ DO_NOT_TRACK: '0' }), null);
    assert.equal(telemetryBlockedBy({ DO_NOT_TRACK: '' }), null);
  });
  it('ANOTIFIER_TELEMETRY=0/false/off blocks', () => {
    for (const v of ['0', 'false', 'off', 'no']) assert.equal(telemetryBlockedBy({ ANOTIFIER_TELEMETRY: v }), 'ANOTIFIER_TELEMETRY');
  });
  it('CI blocks unless ANOTIFIER_TELEMETRY=1 explicitly lifts it', () => {
    assert.equal(telemetryBlockedBy({ CI: 'true' }), 'CI');
    assert.equal(telemetryBlockedBy({ CI: 'true', ANOTIFIER_TELEMETRY: '1' }), null);
  });
});

describe('consent', () => {
  it('the shipped default config is opted OUT', () => {
    const { config } = loadConfigResult(path.join(os.tmpdir(), 'aan-no-such-config.json'));
    assert.equal(config.telemetry.enabled, false);
    assert.equal(isTelemetryActive(config, envWith()), false);
  });
  it('active only when enabled AND not blocked', () => {
    assert.equal(isTelemetryActive(ON, envWith()), true);
    assert.equal(isTelemetryActive(ON, { DO_NOT_TRACK: '1' }), false);
    assert.equal(isTelemetryActive({ telemetry: { enabled: false } }, envWith()), false);
    assert.equal(isTelemetryActive({}, envWith()), false);
  });
  it('the project token is a write-only phc_ token', () => {
    assert.match(TELEMETRY_KEY, /^phc_[A-Za-z0-9]+$/);
  });
});

describe('setup consent (resolveSetupConsent)', () => {
  const fresh = () => ({ telemetry: { enabled: false } });
  const lines = [];
  const say = (m) => lines.push(m);
  let asked;
  const answering = (value) => async (...args) => { asked.push(args); return value; };
  const run = (config, extra) => resolveSetupConsent({}, config, { env: {}, say, ...extra });
  const reset = () => { asked = []; lines.length = 0; };

  it('a real terminal asks on the first setup, default Yes, and records the answer', async () => {
    reset();
    const config = fresh();
    assert.equal(await run(config, { interactive: true, ask: answering(true) }), 'yes');
    assert.equal(asked.length, 1);
    assert.equal(asked[0][2], true, 'default answer is Yes');
    assert.deepEqual(config.telemetry, { enabled: true, asked: true });
    assert.ok(lines.some((l) => /anonymous/i.test(l)) && lines.some((l) => /anotifier telemetry off/.test(l)));
  });

  it('an explicit No is stored as an answer', async () => {
    reset();
    const config = fresh();
    assert.equal(await run(config, { interactive: true, ask: answering(false) }), 'no');
    assert.deepEqual(config.telemetry, { enabled: false, asked: true });
  });

  it('a non-interactive setup NEVER opts in and never asks', async () => {
    reset();
    const config = fresh();
    assert.equal(await run(config, { interactive: false, ask: answering(true) }), 'non-interactive');
    assert.equal(asked.length, 0);
    assert.equal(config.telemetry.enabled, false);
    assert.equal(config.telemetry.asked, undefined);
    assert.ok(lines.some((l) => /Usage stats: off.*anotifier telemetry on/.test(l)), lines.join('|'));
  });

  it('input that closes before an answer (EOF) is not consent', async () => {
    reset();
    const config = fresh();
    assert.equal(await run(config, { interactive: true, ask: answering(null) }), 'eof');
    assert.equal(config.telemetry.enabled, false);
    assert.equal(config.telemetry.asked, undefined);
  });

  it('re-running setup never overrides a stored choice, and does not ask', async () => {
    for (const stored of [{ enabled: true }, { enabled: false, asked: true }]) {
      reset();
      const config = { telemetry: { ...stored } };
      const result = await run(config, { interactive: true, ask: answering(!stored.enabled) });
      assert.equal(result, stored.enabled ? 'kept-on' : 'kept-off');
      assert.equal(asked.length, 0);
      assert.deepEqual(config.telemetry, stored);
      assert.ok(lines.some((l) => /unchanged/.test(l)), lines.join('|'));
    }
  });

  it('a bare default enabled:false is not an answer', () => {
    assert.equal(hasAnswered({ telemetry: { enabled: false } }), false);
    assert.equal(hasAnswered({ telemetry: { enabled: false, asked: true } }), true);
    assert.equal(hasAnswered({ telemetry: { enabled: true } }), true);
  });

  it('DO_NOT_TRACK / CI skip the question and leave the choice alone', async () => {
    reset();
    const config = fresh();
    assert.equal(await resolveSetupConsent({}, config, { interactive: true, env: { DO_NOT_TRACK: '1' }, ask: answering(true), say }), 'blocked');
    assert.equal(asked.length, 0);
    assert.equal(config.telemetry.enabled, false);
  });
});

describe('recordHookRun', () => {
  it('writes nothing at all when telemetry is off', () => {
    const statePath = tmpState();
    recordHookRun({ telemetry: { enabled: false } }, { outcome: 'dispatched', source: 'claude' }, { env: envWith(), statePath });
    recordHookRun(ON, { outcome: 'dispatched', source: 'claude' }, { env: { DO_NOT_TRACK: '1' }, statePath });
    assert.equal(fs.existsSync(statePath), false);
  });

  it('counts outcomes, sources, events, channels and latency buckets', () => {
    const statePath = tmpState();
    const opts = { env: envWith(), statePath, now: 1000 };
    recordHookRun(ON, {
      outcome: 'dispatched', source: 'claude', event: 'task_complete', latencyMs: 320,
      channels: [{ channel: 'toast', ok: true }, { channel: 'ntfy', ok: false }],
    }, opts);
    recordHookRun(ON, { outcome: 'suppressed_quiet', source: 'codex', event: 'needs_input' }, opts);
    recordHookRun(ON, { outcome: 'unmapped', source: 'gemini', rawEvent: 'PreToolUse' }, opts);
    const { counters, windowStart } = readState(statePath);
    assert.equal(windowStart, 1000);
    assert.equal(counters.runs, 3);
    assert.deepEqual(counters.outcomes, { dispatched: 1, suppressed_quiet: 1, unmapped: 1 });
    assert.deepEqual(counters.sources, { claude: 1, codex: 1, gemini: 1 });
    assert.deepEqual(counters.events, { task_complete: 1, needs_input: 1 });
    assert.deepEqual(counters.channels, { toast: { ok: 1, fail: 0 }, ntfy: { ok: 0, fail: 1 } });
    assert.deepEqual(counters.latency, { lt_500ms: 1 });
    assert.deepEqual(counters.unmapped_events, { PreToolUse: 1 });
  });

  it('counts a skipped claude notification as its own outcome', () => {
    const statePath = tmpState();
    recordHookRun(ON, { outcome: 'skipped', source: 'claude', event: 'needs_input' }, { env: envWith(), statePath });
    const { counters } = readState(statePath);
    assert.deepEqual(counters.outcomes, { skipped: 1 });
    assert.equal(counters.unmapped_events, undefined, 'a skip is not an unmapped event');
  });

  it('clamps anything off-vocabulary to "other" so free text never lands in a key', () => {
    const statePath = tmpState();
    recordHookRun(ON, { outcome: 'unmapped', source: '/home/me/project', rawEvent: 'has spaces / and slashes' }, { env: envWith(), statePath });
    const { counters } = readState(statePath);
    assert.deepEqual(counters.sources, { other: 1 });
    assert.deepEqual(counters.unmapped_events, { other: 1 });
  });

  it('keeps at most MAX_UNMAPPED_KEYS distinct unrecognized event names, the rest under "other"', () => {
    const statePath = tmpState();
    for (let i = 0; i < 30; i++) {
      recordHookRun(ON, { outcome: 'unmapped', source: 'claude', rawEvent: `Event${i}` }, { env: envWith(), statePath });
    }
    recordHookRun(ON, { outcome: 'unmapped', source: 'claude', rawEvent: 'Event0' }, { env: envWith(), statePath });
    const { unmapped_events: seen } = readState(statePath).counters;
    assert.equal(Object.keys(seen).length, MAX_UNMAPPED_KEYS);
    assert.equal(seen.Event0, 2, 'an already-kept name keeps counting');
    assert.equal(seen.other, 30 - (MAX_UNMAPPED_KEYS - 1));
    assert.equal(Object.values(seen).reduce((a, b) => a + b, 0), 31);
  });

  it('a failed state write throws nothing and leaves nothing behind', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aan-tel-fail-'));
    const statePath = path.join(dir, '.telemetry.json');
    fs.mkdirSync(statePath); // a directory where the file should be: unreadable AND unwritable
    recordHookRun(ON, { outcome: 'dispatched', source: 'claude' }, { env: envWith(), statePath });
    assert.deepEqual(fs.readdirSync(dir), ['.telemetry.json']);
    assert.ok(fs.statSync(statePath).isDirectory());
  });

  it('never replaces the state file with rename: the hook path must not pay for rename-over-existing', async () => {
    // rename-replace took 1.4-4.7s per call on Windows (antivirus), on EVERY hook run.
    const statePath = tmpState();
    const real = fs.renameSync;
    let renames = 0;
    fs.renameSync = (...args) => { renames++; return real(...args); };
    try {
      const run = { outcome: 'dispatched', source: 'claude' };
      recordHookRun(ON, run, { env: envWith(), statePath, now: 0 });
      recordHookRun(ON, run, { env: envWith(), statePath, now: 0 }); // over an EXISTING file
      await maybeSendHookSummary(ON, { env: envWith(), statePath, now: SUMMARY_INTERVAL_MS + 1, send: async () => ({ ok: true }) });
      assert.ok(getInstallId(statePath));
    } finally {
      fs.renameSync = real;
    }
    assert.equal(renames, 0);
    assert.equal(fs.readdirSync(path.dirname(statePath)).length, 1, 'no temp or stray files');
  });

  it('a hook-path write costs milliseconds, not the seconds rename-over-existing cost', () => {
    const statePath = tmpState();
    const run = { outcome: 'dispatched', source: 'claude', event: 'task_complete', channels: [{ channel: 'toast', ok: true }] };
    recordHookRun(ON, run, { env: envWith(), statePath });
    const started = Date.now();
    for (let i = 0; i < 5; i++) recordHookRun(ON, run, { env: envWith(), statePath });
    const took = Date.now() - started;
    assert.equal(readState(statePath).counters.runs, 6);
    // Generous (a slow antivirus can add hundreds of ms per call) yet far below
    // what five rename-replaces cost on the machines that hit this (7-23s).
    assert.ok(took < 4000, `5 recordHookRun calls took ${took}ms`);
  });

  describe('a torn or corrupt state file', () => {
    const ID = '0b9a6e0c-4f6e-4a53-9a43-2f0e1f6d9c11';
    const GOOD = JSON.stringify({ installId: ID, windowStart: 5, counters: { runs: 7 } });
    const run = { outcome: 'dispatched', source: 'claude' };
    const age = (file, ms) => { const t = new Date(Date.now() - ms); fs.utimesSync(file, t, t); };

    it('readState tells MISSING ({}) from CORRUPT (the sentinel)', () => {
      const statePath = tmpState();
      assert.deepEqual(readState(statePath), {});
      assert.notEqual(readState(statePath), CORRUPT);
      for (const text of ['', '{"installId":"' + ID + '","count', 'null', '[]', '"x"', '7']) {
        fs.writeFileSync(statePath, text);
        assert.equal(readState(statePath), CORRUPT, JSON.stringify(text));
      }
      fs.writeFileSync(statePath, GOOD);
      assert.equal(readState(statePath).installId, ID);
    });

    it('recordHookRun skips a half-written file and keeps the install id and counters', () => {
      for (const torn of [GOOD.slice(0, 40), '']) { // truncated mid-write / just truncated
        const statePath = tmpState();
        fs.writeFileSync(statePath, torn);
        recordHookRun(ON, run, { env: envWith(), statePath, now: 1 });
        assert.equal(fs.readFileSync(statePath, 'utf8'), torn, 'a reader that caught a torn file writes nothing');
      }
    });

    it('a writer that finishes after the skip restores a whole file and nothing was lost but a count', () => {
      const statePath = tmpState();
      fs.writeFileSync(statePath, GOOD.slice(0, 30));
      recordHookRun(ON, run, { env: envWith(), statePath, now: 1 }); // skipped
      fs.writeFileSync(statePath, GOOD); // the other hook's write completes
      recordHookRun(ON, run, { env: envWith(), statePath, now: 1 });
      const state = readState(statePath);
      assert.equal(state.installId, ID);
      assert.equal(state.counters.runs, 8);
    });

    it('a stale corrupt file self-heals: rewritten, install id salvaged, counters restart', () => {
      const statePath = tmpState();
      fs.writeFileSync(statePath, GOOD.slice(0, GOOD.indexOf('"counters"') + 12)); // id intact, tail gone
      age(statePath, 30 * 1000);
      recordHookRun(ON, run, { env: envWith(), statePath, now: 1 });
      const state = readState(statePath);
      assert.notEqual(state, CORRUPT);
      assert.equal(state.installId, ID);
      assert.equal(state.counters.runs, 1);
    });

    it('a stale corrupt file with no readable id heals to a fresh state', () => {
      const statePath = tmpState();
      fs.writeFileSync(statePath, '{"wind');
      age(statePath, 30 * 1000);
      recordHookRun(ON, run, { env: envWith(), statePath, now: 1 });
      assert.equal(readState(statePath).counters.runs, 1);
      assert.match(getInstallId(statePath), /^[0-9a-f-]{36}$/);
    });

    it('getInstallId never mints a new id over a fresh corrupt file, and a send is skipped', async () => {
      const statePath = tmpState();
      fs.writeFileSync(statePath, GOOD.slice(0, 40));
      assert.equal(getInstallId(statePath), null);
      assert.deepEqual(await sendEvent('probe', {}, { env: envWith({ ANOTIFIER_TELEMETRY_URL: 'http://127.0.0.1:1/' }), statePath }), { ok: false, status: 0 });
      assert.equal(fs.readFileSync(statePath, 'utf8'), GOOD.slice(0, 40));
    });

    it('maybeSendHookSummary neither sends nor writes on a fresh corrupt file', async () => {
      const statePath = tmpState();
      fs.writeFileSync(statePath, GOOD.slice(0, 50));
      let calls = 0;
      const sent = await maybeSendHookSummary(ON, {
        env: envWith(), statePath, now: SUMMARY_INTERVAL_MS * 3, send: async () => { calls++; return { ok: true }; },
      });
      assert.equal(sent, false);
      assert.equal(calls, 0);
      assert.equal(fs.readFileSync(statePath, 'utf8'), GOOD.slice(0, 50));
      assert.equal(fs.existsSync(`${statePath}.lock`), false, 'no lock left behind');
    });

    it('maybeSendHookSummary leaves a file that went corrupt DURING the send alone', async () => {
      const statePath = tmpState();
      recordHookRun(ON, run, { env: envWith(), statePath, now: 0 });
      const torn = '{"installId":"' + ID + '","wind';
      const sent = await maybeSendHookSummary(ON, {
        env: envWith(), statePath, now: SUMMARY_INTERVAL_MS + 1,
        send: async () => { fs.writeFileSync(statePath, torn); return { ok: true }; }, // another hook mid-write
      });
      assert.equal(sent, true);
      assert.equal(fs.readFileSync(statePath, 'utf8'), torn);
    });
  });
});

describe('clampIdent', () => {
  it('passes short identifiers and rejects anything else', () => {
    assert.equal(clampIdent('TypeError'), 'TypeError');
    assert.equal(clampIdent('ENOENT'), 'ENOENT');
    assert.equal(clampIdent('/home/me/secret', 'x'), 'x');
    assert.equal(clampIdent('has space', 'x'), 'x');
    assert.equal(clampIdent('a'.repeat(41), 'x'), 'x');
    assert.equal(clampIdent(undefined, null), null);
  });
});

describe('maybeSendHookSummary', () => {
  const seed = (statePath, windowStart) => {
    recordHookRun(secretConfig, {
      outcome: 'dispatched', source: 'claude', event: 'task_complete', latencyMs: 80,
      channels: [{ channel: 'toast', ok: true }],
    }, { env: envWith(), statePath, now: windowStart });
  };

  it('does not send before the window is 24h old', async () => {
    const statePath = tmpState();
    seed(statePath, 0);
    let calls = 0;
    const sent = await maybeSendHookSummary(secretConfig, {
      env: envWith(), statePath, now: SUMMARY_INTERVAL_MS - 1, send: async () => { calls++; return { ok: true }; },
    });
    assert.equal(sent, false);
    assert.equal(calls, 0);
  });

  it('sends ONE summary with counts + feature flags and no content, then starts a new window', async () => {
    const statePath = tmpState();
    seed(statePath, 0);
    const calls = [];
    const now = SUMMARY_INTERVAL_MS + 5;
    const sent = await maybeSendHookSummary(secretConfig, {
      env: envWith(), statePath, now, send: async (event, props) => { calls.push({ event, props }); return { ok: true }; },
    });
    assert.equal(sent, true);
    assert.equal(calls.length, 1);
    const { event, props } = calls[0];
    assert.equal(event, 'hook_daily_summary');
    assert.equal(props.runs, 1);
    assert.equal(props.window_hours, 24);
    assert.equal(props.config.ntfy_enabled, true);
    assert.equal(props.config.ntfy_custom_server, true);
    assert.equal(props.config.webhook_format, 'slack');
    assertNoSecrets(props);

    const after = readState(statePath);
    assert.equal(after.counters, undefined);
    assert.equal(after.windowStart, now);
  });

  it('gives a stuck sender at most the 800ms hook budget', async () => {
    // The budget bounds the SEND, so it is measured from the moment the sender
    // is invoked to the moment the race ended (see recordReads). The total-time
    // bound only has to notice a regression back to multi-second sync file I/O
    // on the hook path (rename-replace cost 1.4-4.7s per call on Windows).
    const statePath = tmpState();
    seed(statePath, 0);
    let sendStartedAt = 0;
    const reads = recordReads();
    let started;
    let finished;
    let sent;
    try {
      started = Date.now();
      sent = await maybeSendHookSummary(secretConfig, {
        env: envWith(), statePath, now: SUMMARY_INTERVAL_MS + 5,
        send: () => { sendStartedAt = Date.now(); return new Promise(() => {}); },
      });
      finished = Date.now();
    } finally { reads.stop(); }
    assert.equal(sent, false);
    assert.ok(sendStartedAt > 0, 'the sender was invoked');
    const raceEnded = reads.firstAfter(sendStartedAt);
    assert.ok(raceEnded, 'the state file is re-read once the budget fires');
    const sendTook = raceEnded - sendStartedAt;
    assert.ok(sendTook >= 750 && sendTook < 800 + 700, `send was held for ${sendTook}ms`);
    assert.ok(finished - started < 3000, `whole call took ${finished - started}ms`);
    assert.ok(readState(statePath).retryAt, 'backs off after a timeout');
  });

  it('keeps the counts and backs off for an hour when the send fails', async () => {
    const statePath = tmpState();
    seed(statePath, 0);
    const now = SUMMARY_INTERVAL_MS + 5;
    const fail = async () => ({ ok: false, status: 0 });
    assert.equal(await maybeSendHookSummary(secretConfig, { env: envWith(), statePath, now, send: fail }), false);
    const state = readState(statePath);
    assert.equal(state.counters.runs, 1);
    assert.equal(state.retryAt, now + 60 * 60 * 1000);

    let calls = 0;
    const count = async () => { calls++; return { ok: true }; };
    await maybeSendHookSummary(secretConfig, { env: envWith(), statePath, now: now + 1000, send: count });
    assert.equal(calls, 0, 'retried inside the back-off window');
  });

  it('never sends when telemetry is off, even with counts pending', async () => {
    const statePath = tmpState();
    seed(statePath, 0);
    let calls = 0;
    await maybeSendHookSummary({ telemetry: { enabled: false } }, {
      env: envWith(), statePath, now: SUMMARY_INTERVAL_MS * 2, send: async () => { calls++; return { ok: true }; },
    });
    assert.equal(calls, 0);
  });
});

describe('configSnapshot', () => {
  it('reports features as booleans and enums, never topics, servers or URLs', () => {
    const snap = configSnapshot(secretConfig);
    assertNoSecrets(snap);
    for (const value of Object.values(snap)) {
      assert.ok(value === null || typeof value === 'boolean' || ['generic', 'slack', 'discord', 'telegram'].includes(value), `unexpected ${value}`);
    }
  });
  it('an unknown webhook format is reported as "other", never verbatim', () => {
    const snap = configSnapshot({ webhook: { enabled: true, url: 'https://x.example/h', format: 'https://x.example/secret' } });
    assert.equal(snap.webhook_format, 'other');
    assertNoSecrets(snap);
  });
  it('ntfy.sh is not a custom server', () => {
    assert.equal(configSnapshot({ ntfy: { server: 'https://ntfy.sh/' } }).ntfy_custom_server, false);
  });
});

describe('transport against a local capture server', () => {
  let server;
  let url;
  let dripping;
  let dripUrl;
  const dripArrivals = []; // Date.now() at which each request reached the drip server
  const requests = []; // { path, raw, json }
  const eventsOf = (json) => (json.batch ? json.batch : [json]);
  before(async () => {
    server = http.createServer((req, res) => {
      let body = '';
      req.on('data', (c) => { body += c; });
      req.on('end', () => { requests.push({ path: req.url, raw: body, json: JSON.parse(body) }); res.end('{"status":"Ok"}'); });
    });
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    url = `http://127.0.0.1:${server.address().port}/i/v0/e/`;
    // Answers with headers and then one byte every 50ms, forever: an idle timeout
    // that resets per byte would never fire against this.
    dripping = http.createServer((req, res) => {
      dripArrivals.push(Date.now());
      req.resume();
      res.writeHead(200);
      const t = setInterval(() => res.write('.'), 50);
      res.on('close', () => clearInterval(t));
    });
    await new Promise((r) => dripping.listen(0, '127.0.0.1', r));
    dripUrl = `http://127.0.0.1:${dripping.address().port}/i/v0/e/`;
  });
  after(() => { server.close(); dripping.closeAllConnections?.(); dripping.close(); });

  it('posts api_key, a stable random install id, and base properties', async () => {
    const statePath = tmpState();
    const env = envWith({ ANOTIFIER_TELEMETRY_URL: url });
    const first = await sendEvent('probe', { a: 1 }, { env, statePath });
    await sendEvent('probe', { a: 2 }, { env, statePath });
    assert.deepEqual(first, { ok: true, status: 200 });
    const [one, two] = requests.slice(-2);
    assert.equal(one.path, '/i/v0/e/');
    assert.equal(one.json.api_key, TELEMETRY_KEY);
    assert.equal(one.json.event, 'probe');
    assert.match(one.json.distinct_id, /^[0-9a-f-]{36}$/);
    assert.equal(one.json.distinct_id, two.json.distinct_id);
    assert.equal(one.json.properties.a, 1);
    assert.equal(one.json.properties.os, os.platform());
    assert.ok(one.json.properties.anotifier_version);
    assert.equal(one.json.properties.$geoip_disable, true, 'no geolocation is derived');
    // The install id is not derived from the machine or the user.
    for (const value of identityProbes()) assert.ok(!one.raw.toLowerCase().includes(value.toLowerCase()), `body contains ${value}`);
  });

  it('several events go out in ONE /batch/ request, each with geoip disabled', async () => {
    const statePath = tmpState();
    const env = envWith({ ANOTIFIER_TELEMETRY_URL: url });
    const before = requests.length;
    const result = await sendEvents([{ event: 'one', properties: {} }, { event: 'two', properties: { b: 2 } }], { env, statePath });
    assert.equal(result.ok, true);
    assert.equal(requests.length - before, 1);
    const { path: reqPath, json } = requests.at(-1);
    assert.equal(reqPath, '/batch/');
    assert.equal(json.api_key, TELEMETRY_KEY);
    assert.deepEqual(eventsOf(json).map((e) => e.event), ['one', 'two']);
    for (const e of eventsOf(json)) {
      assert.equal(e.properties.$geoip_disable, true);
      assert.equal(e.distinct_id, json.batch[0].distinct_id);
    }
  });

  it('track() queues; flushTelemetry() sends everything queued as one request', async () => {
    const statePath = tmpState();
    const env = envWith({ ANOTIFIER_TELEMETRY_URL: url });
    const before = requests.length;
    assert.equal(track('doctor_result', { deep: false }, { config: ON, env, statePath }), true);
    assert.equal(track('cli_command', { command: 'doctor' }, { config: ON, env, statePath }), true);
    assert.equal(requests.length, before, 'nothing is sent until the flush');
    assert.equal(await flushTelemetry(), true);
    assert.equal(requests.length - before, 1);
    assert.deepEqual(eventsOf(requests.at(-1).json).map((e) => e.event), ['doctor_result', 'cli_command']);
    assert.equal(await flushTelemetry(), false, 'the queue is empty after a flush');
  });

  it('track() sends nothing when opted out', async () => {
    const before = requests.length;
    const env = envWith({ ANOTIFIER_TELEMETRY_URL: url });
    assert.equal(track('x', {}, { config: { telemetry: { enabled: false } }, env, statePath: tmpState() }), false);
    assert.equal(track('x', {}, { config: ON, env: { ...env, DO_NOT_TRACK: '1' }, statePath: tmpState() }), false);
    assert.equal(await flushTelemetry(), false);
    assert.equal(requests.length, before);
  });

  it('clearState forgets the install id', async () => {
    const statePath = tmpState();
    const env = envWith({ ANOTIFIER_TELEMETRY_URL: url });
    await sendEvent('probe', {}, { env, statePath });
    const id = requests.at(-1).json.distinct_id;
    assert.equal(clearState(statePath), true);
    await sendEvent('probe', {}, { env, statePath });
    assert.notEqual(requests.at(-1).json.distinct_id, id);
  });

  it('an unreachable host resolves { ok: false } instead of throwing', async () => {
    const env = envWith({ ANOTIFIER_TELEMETRY_URL: 'http://127.0.0.1:1/i/v0/e/' });
    assert.deepEqual(await sendEvent('probe', {}, { env, statePath: tmpState() }), { ok: false, status: 0 });
  });

  it('the timeout is an absolute deadline, not an idle timeout that resets per byte', async () => {
    // The deadline covers the request, not the install-id file work that comes
    // first, so time it from the request reaching the server (the id is created
    // up front, and the server shares this event loop, so sync I/O before the
    // request can only move the arrival, never the measured interval).
    const env = envWith({ ANOTIFIER_TELEMETRY_URL: dripUrl });
    const statePath = tmpState();
    getInstallId(statePath);
    const arrivals = dripArrivals.length;
    const started = Date.now();
    const result = await sendEvent('probe', {}, { env, statePath, timeoutMs: 400 });
    const finished = Date.now();
    assert.deepEqual(result, { ok: false, status: 0 });
    assert.equal(dripArrivals.length, arrivals + 1, 'the request reached the drip server');
    const took = finished - dripArrivals.at(-1);
    assert.ok(took >= 350 && took < 400 + 500, `deadline fired ${took}ms after the request arrived`);
    assert.ok(finished - started < 3000, `whole call took ${finished - started}ms`);
  });

  it('the hook summary against a server that never finishes returns within the 800ms budget', async () => {
    const statePath = tmpState();
    recordHookRun(ON, { outcome: 'dispatched', source: 'claude' }, { env: envWith(), statePath, now: 0 });
    const arrivals = dripArrivals.length;
    const reads = recordReads();
    let started;
    let finished;
    let sent;
    try {
      started = Date.now();
      sent = await maybeSendHookSummary(ON, {
        env: envWith({ ANOTIFIER_TELEMETRY_URL: dripUrl }), statePath, now: SUMMARY_INTERVAL_MS + 1,
      });
      finished = Date.now();
    } finally { reads.stop(); }
    assert.equal(sent, false);
    assert.equal(dripArrivals.length, arrivals + 1, 'the request reached the drip server');
    // The budget timer is armed inside maybeSendHookSummary, a few sync ms after
    // `started`, before the request is even connected. Connecting and parsing
    // the request run on this same loop, so the drip server's arrival stamp can
    // land well after the timer was armed; timing from arrival shaved that
    // latency off the interval and dipped under the lower bound on slow runners.
    // So time from `started`. Arrival is only used to pick out the state-file
    // re-read that follows the race (earlier reads are the isDue/lock checks,
    // which happen before the request reaches the server). The re-read itself is
    // local sync I/O, covered by the total-time bound below.
    const raceEnded = reads.firstAfter(dripArrivals.at(-1));
    assert.ok(raceEnded, 'the state file is re-read once the budget fires');
    const took = raceEnded - started;
    // Lower: the 800ms budget must really be waited out (a shorter budget fails).
    // Upper: 800ms plus scheduling lag, but under a doubled budget (1600ms).
    assert.ok(took >= 790 && took < 800 + 700, `the send was cut off ${took}ms after it started`);
    assert.ok(finished - started < 3000, `whole call took ${finished - started}ms`);
  });
});
