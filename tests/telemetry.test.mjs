// tests/telemetry.test.mjs — opt-in usage stats: gates, counters, summary, no content.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {
  telemetryBlockedBy, isTelemetryActive, recordHookRun, maybeSendHookSummary,
  sendEvent, track, readState, clearState, configSnapshot, SUMMARY_INTERVAL_MS, TELEMETRY_KEY,
} from '../src/telemetry.mjs';
import { loadConfigResult } from '../src/config-loader.mjs';

const ON = { telemetry: { enabled: true } };
// A clean, opted-in environment: nothing blocks, nothing hits the real host.
const envWith = (extra = {}) => ({ ANOTIFIER_TELEMETRY: '1', ...extra });
const tmpState = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'aan-tel-')), '.telemetry.json');

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

  it('clamps anything off-vocabulary to "other" so free text never lands in a key', () => {
    const statePath = tmpState();
    recordHookRun(ON, { outcome: 'unmapped', source: '/home/me/project', rawEvent: 'has spaces / and slashes' }, { env: envWith(), statePath });
    const { counters } = readState(statePath);
    assert.deepEqual(counters.sources, { other: 1 });
    assert.deepEqual(counters.unmapped_events, { other: 1 });
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
  it('ntfy.sh is not a custom server', () => {
    assert.equal(configSnapshot({ ntfy: { server: 'https://ntfy.sh/' } }).ntfy_custom_server, false);
  });
});

describe('transport against a local capture server', () => {
  let server;
  let url;
  const received = [];
  before(async () => {
    server = http.createServer((req, res) => {
      let body = '';
      req.on('data', (c) => { body += c; });
      req.on('end', () => { received.push(JSON.parse(body)); res.end('{"status":"Ok"}'); });
    });
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    url = `http://127.0.0.1:${server.address().port}/i/v0/e/`;
  });
  after(() => server.close());

  it('posts api_key, a stable random install id, and base properties', async () => {
    const statePath = tmpState();
    const env = envWith({ ANOTIFIER_TELEMETRY_URL: url });
    const first = await sendEvent('probe', { a: 1 }, { env, statePath });
    await sendEvent('probe', { a: 2 }, { env, statePath });
    assert.deepEqual(first, { ok: true, status: 200 });
    const [one, two] = received.slice(-2);
    assert.equal(one.api_key, TELEMETRY_KEY);
    assert.equal(one.event, 'probe');
    assert.match(one.distinct_id, /^[0-9a-f-]{36}$/);
    assert.equal(one.distinct_id, two.distinct_id);
    assert.equal(one.properties.a, 1);
    assert.equal(one.properties.os, os.platform());
    assert.ok(one.properties.anotifier_version);
    // The install id is not derived from the machine or the user.
    assert.ok(!JSON.stringify(one).includes(os.hostname()));
    assert.ok(!JSON.stringify(one).includes(os.userInfo().username));
  });

  it('track() sends nothing when opted out', async () => {
    const before = received.length;
    const env = envWith({ ANOTIFIER_TELEMETRY_URL: url });
    assert.equal(await track('x', {}, { config: { telemetry: { enabled: false } }, env, statePath: tmpState() }), false);
    assert.equal(await track('x', {}, { config: ON, env: { ...env, DO_NOT_TRACK: '1' }, statePath: tmpState() }), false);
    assert.equal(received.length, before);
  });

  it('clearState forgets the install id', async () => {
    const statePath = tmpState();
    const env = envWith({ ANOTIFIER_TELEMETRY_URL: url });
    await sendEvent('probe', {}, { env, statePath });
    const id = received.at(-1).distinct_id;
    assert.equal(clearState(statePath), true);
    await sendEvent('probe', {}, { env, statePath });
    assert.notEqual(received.at(-1).distinct_id, id);
  });

  it('an unreachable host resolves { ok: false } instead of throwing', async () => {
    const env = envWith({ ANOTIFIER_TELEMETRY_URL: 'http://127.0.0.1:1/i/v0/e/' });
    assert.deepEqual(await sendEvent('probe', {}, { env, statePath: tmpState() }), { ok: false, status: 0 });
  });
});
