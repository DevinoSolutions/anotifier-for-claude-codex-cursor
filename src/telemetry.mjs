// src/telemetry.mjs — opt-in, anonymous usage stats sent to PostHog.
//
// OFF unless the user said yes: `anotifier setup` asks (default Yes), and
// `anotifier telemetry on|off|status` changes or inspects the choice later. A
// plugin-only install never runs setup, so it never sends anything. Even when
// opted in, DO_NOT_TRACK, ANOTIFIER_TELEMETRY=0 and CI environments send nothing.
//
// What is sent is experience, never content: which commands ran and how they
// ended, which channels delivered or failed, why a notification was skipped,
// latency buckets, OS / Node / anotifier versions, and which features are on.
// NEVER message text, project names, file paths, ntfy topics or servers,
// webhook URLs, hostnames or error messages. Every property below is an enum,
// a boolean or a count — keep it that way.
//
// Two paths, one transport:
// - CLI commands capture an event directly (they are rare and interactive).
// - The hook path runs on every agent turn, so it only bumps local counters in
//   ~/.anotifier/.telemetry.json and sends ONE summary event per 24h from its
//   tail, budget-capped like the update check. Counters are best-effort: two
//   hooks racing on the file can lose an increment, which is fine for stats.
//
// Transport is node:https with agent:false and never throws (see sentry.mjs).
import http from 'node:http';
import https from 'node:https';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { getConfigDir, loadConfigResult } from './config-loader.mjs';

const require = createRequire(import.meta.url);
const pkg = require('../package.json');

// Project "anotifier" on Devino's self-hosted PostHog. A project token is
// write-only by design (it can send events, not read them), so it is safe in a
// public package — the same token every PostHog browser snippet ships.
export const TELEMETRY_HOST = 'https://posthog.devino.ca';
export const TELEMETRY_KEY = 'phc_nvRK44RKHRniECEJg6P5kKCtN9URMNhGfcUZzTjpXVnY';

export const SUMMARY_INTERVAL_MS = 24 * 60 * 60 * 1000;
// An offline machine retries the summary hourly, not on every hook run.
const RETRY_AFTER_MS = 60 * 60 * 1000;
const SEND_TIMEOUT_MS = 1500;
const HOOK_BUDGET_MS = 2000;
// A summary lock older than this belongs to a hook that died mid-send.
const LOCK_STALE_MS = 30 * 1000;

export const STATE_PATH = path.join(getConfigDir(), '.telemetry.json');

const KNOWN_SOURCES = ['claude', 'codex', 'cursor', 'gemini'];
const KNOWN_EVENTS = ['task_complete', 'needs_input', 'session_start'];
const KNOWN_CHANNELS = ['toast', 'ntfy', 'webhook', 'bell'];
export const HOOK_OUTCOMES = ['dispatched', 'suppressed_snooze', 'suppressed_quiet', 'held_back', 'duplicate', 'unmapped', 'error'];
const LATENCY_BUCKETS = [[250, 'lt_250ms'], [500, 'lt_500ms'], [1000, 'lt_1s'], [2500, 'lt_2500ms'], [Infinity, 'ge_2500ms']];

const truthy = (v) => v !== undefined && v !== '' && !/^(0|false|no|off)$/i.test(String(v));
const explicitlyOn = (v) => /^(1|true|yes|on)$/i.test(String(v ?? ''));

// Why telemetry is forced off regardless of config, or null. DO_NOT_TRACK is
// the cross-tool convention (consoledonottrack.com). CI is off because a CI
// run is not a person; ANOTIFIER_TELEMETRY=1 lifts only the CI rule (our own
// e2e tests need that), never a DO_NOT_TRACK.
export function telemetryBlockedBy(env = process.env) {
  if (truthy(env.DO_NOT_TRACK)) return 'DO_NOT_TRACK';
  if (env.ANOTIFIER_TELEMETRY !== undefined && !truthy(env.ANOTIFIER_TELEMETRY)) return 'ANOTIFIER_TELEMETRY';
  if (truthy(env.CI) && !explicitlyOn(env.ANOTIFIER_TELEMETRY)) return 'CI';
  return null;
}

export function isTelemetryActive(config, env = process.env) {
  return config?.telemetry?.enabled === true && telemetryBlockedBy(env) === null;
}

// ANOTIFIER_TELEMETRY_URL points the client at a local server in tests.
function captureUrl(env) {
  return env.ANOTIFIER_TELEMETRY_URL || `${TELEMETRY_HOST}/i/v0/e/`;
}

// ── State file ──────────────────────────────────────────────────────

export function readState(statePath = STATE_PATH) {
  try {
    const parsed = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch { return {}; }
}

// Temp file + rename so a concurrent reader never sees half a JSON document.
function writeState(state, statePath) {
  try {
    fs.mkdirSync(path.dirname(statePath), { recursive: true });
    const tmp = `${statePath}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(state), 'utf8');
    fs.renameSync(tmp, statePath);
  } catch { /* best-effort: a lost write only loses a count */ }
}

// Opting out removes the install id and every pending count.
export function clearState(statePath = STATE_PATH) {
  try { fs.unlinkSync(statePath); return true; } catch { return false; }
}

// Random, per-install, created on first use. Not derived from anything about
// the machine or the user, and regenerated after `telemetry off`.
export function getInstallId(statePath = STATE_PATH) {
  const state = readState(statePath);
  if (typeof state.installId === 'string' && state.installId) return state.installId;
  state.installId = crypto.randomUUID();
  writeState(state, statePath);
  return state.installId;
}

// ── Payload helpers ─────────────────────────────────────────────────

export function baseProperties() {
  return {
    $lib: 'anotifier',
    $lib_version: pkg.version,
    anotifier_version: pkg.version,
    os: os.platform(),
    os_release: os.release(),
    arch: os.arch(),
    node_version: process.versions.node,
  };
}

// Which features are on — booleans and enums only. `ntfy_custom_server` says
// whether the server is not ntfy.sh without ever saying which server it is.
export function configSnapshot(config = {}) {
  return {
    toast_enabled: config.toast?.enabled !== false,
    toast_rich: config.toast?.richContent !== false,
    ntfy_enabled: Boolean(config.ntfy?.enabled && config.ntfy?.topic),
    ntfy_rich: config.ntfy?.richContent === true,
    ntfy_custom_server: Boolean(config.ntfy?.server) && config.ntfy.server.replace(/\/+$/, '') !== 'https://ntfy.sh',
    webhook_enabled: Boolean(config.webhook?.enabled && config.webhook?.url),
    webhook_format: config.webhook?.enabled ? (config.webhook?.format || 'generic') : null,
    bell_enabled: config.terminalBell?.enabled !== false,
    quiet_hours_enabled: config.quietHours?.enabled === true,
    update_check_enabled: config.updateCheck?.enabled !== false,
    sentry_enabled: Boolean(config.sentry?.enabled && config.sentry?.dsn),
  };
}

const pick = (value, known) => (known.includes(value) ? value : 'other');
// Raw hook event names (e.g. "PreToolUse") are tool vocabulary, not user
// content, but still clamp them to a short identifier.
const rawEventKey = (value) => (/^[A-Za-z0-9_.-]{1,40}$/.test(String(value ?? '')) ? String(value) : 'other');

function latencyBucket(ms) {
  return LATENCY_BUCKETS.find(([limit]) => ms < limit)[1];
}

function bump(obj, key, by = 1) {
  obj[key] = (obj[key] || 0) + by;
}

// ── Transport ───────────────────────────────────────────────────────

// POST one event. Resolves { ok, status }; status 0 = no response. Never throws.
export function sendEvent(event, properties, { env = process.env, statePath = STATE_PATH, timeoutMs = SEND_TIMEOUT_MS } = {}) {
  return new Promise((resolve) => {
    let url;
    try { url = new URL(captureUrl(env)); } catch { resolve({ ok: false, status: 0 }); return; }
    const body = JSON.stringify({
      api_key: TELEMETRY_KEY,
      event,
      distinct_id: getInstallId(statePath),
      properties: { ...baseProperties(), ...properties },
      timestamp: new Date().toISOString(),
    });
    const transport = url.protocol === 'https:' ? https : http;
    const req = transport.request(url, {
      method: 'POST',
      agent: false, // no keep-alive socket may outlive the hook's process.exit()
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
      timeout: timeoutMs,
    }, (res) => {
      res.resume();
      const status = res.statusCode || 0;
      res.on('end', () => resolve({ ok: status >= 200 && status < 300, status }));
    });
    req.on('error', () => resolve({ ok: false, status: 0 }));
    req.on('timeout', () => { req.destroy(); resolve({ ok: false, status: 0 }); });
    req.end(body);
  });
}

// CLI entry point: capture one event if (and only if) the user opted in.
// `config` defaults to the file on disk, so a command that just changed it
// (setup, telemetry on) passes its own. Resolves false when nothing was sent.
export async function track(event, properties = {}, { config, env = process.env, statePath = STATE_PATH } = {}) {
  try {
    const cfg = config ?? loadConfigResult().config;
    if (!isTelemetryActive(cfg, env)) return false;
    const { ok } = await sendEvent(event, properties, { env, statePath });
    return ok;
  } catch { return false; }
}

// ── Hook path: local counters + one daily summary ───────────────────

// Record one hook run. `run` = { outcome, source, event, rawEvent?,
// channels?: [{ channel, ok }], latencyMs? }. Writes nothing when telemetry is
// off — an opted-out install never grows a state file.
export function recordHookRun(config, run, { env = process.env, statePath = STATE_PATH, now = Date.now() } = {}) {
  try {
    if (!isTelemetryActive(config, env)) return;
    const state = readState(statePath);
    const c = state.counters && typeof state.counters === 'object' ? state.counters : {};
    if (typeof state.windowStart !== 'number') state.windowStart = now;

    bump(c, 'runs');
    c.outcomes ??= {}; bump(c.outcomes, pick(run.outcome, HOOK_OUTCOMES));
    c.sources ??= {}; bump(c.sources, pick(run.source, KNOWN_SOURCES));
    if (run.event) { c.events ??= {}; bump(c.events, pick(run.event, KNOWN_EVENTS)); }
    if (run.outcome === 'unmapped') { c.unmapped_events ??= {}; bump(c.unmapped_events, rawEventKey(run.rawEvent)); }
    for (const { channel, ok } of run.channels || []) {
      c.channels ??= {};
      const slot = (c.channels[pick(channel, KNOWN_CHANNELS)] ??= { ok: 0, fail: 0 });
      bump(slot, ok ? 'ok' : 'fail');
    }
    if (typeof run.latencyMs === 'number' && run.latencyMs >= 0) {
      c.latency ??= {}; bump(c.latency, latencyBucket(run.latencyMs));
    }
    state.counters = c;
    writeState(state, statePath);
  } catch { /* stats must never affect a notification */ }
}

// Exclusive-create lock so two hooks finishing together send one summary.
function acquireSummaryLock(lockPath, now) {
  try {
    const stat = fs.statSync(lockPath);
    if (now - stat.mtimeMs > LOCK_STALE_MS) fs.unlinkSync(lockPath);
  } catch {}
  try { fs.closeSync(fs.openSync(lockPath, 'wx')); return true; } catch { return false; }
}

// Called at the tail of every hook run. Sends `hook_daily_summary` when the
// counting window is 24h old, then starts a fresh window. Capped at budgetMs,
// never throws. Resolves true only when a summary was accepted.
export async function maybeSendHookSummary(config, {
  env = process.env,
  statePath = STATE_PATH,
  now = Date.now(),
  send = sendEvent,
  budgetMs = HOOK_BUDGET_MS,
} = {}) {
  try {
    if (!isTelemetryActive(config, env)) return false;
    const state = readState(statePath);
    if (typeof state.windowStart !== 'number' || !state.counters?.runs) return false;
    if (now - state.windowStart < SUMMARY_INTERVAL_MS) return false;
    if (typeof state.retryAt === 'number' && now < state.retryAt) return false;

    const lockPath = `${statePath}.lock`;
    if (!acquireSummaryLock(lockPath, now)) return false;
    try {
      const properties = {
        ...state.counters,
        window_start: new Date(state.windowStart).toISOString(),
        window_hours: Math.round((now - state.windowStart) / 3600000),
        config: configSnapshot(config),
      };
      const result = await Promise.race([
        send('hook_daily_summary', properties, { env, statePath }),
        new Promise((resolve) => setTimeout(() => resolve({ ok: false, status: 0 }), budgetMs).unref?.()),
      ]);
      // Re-read so the install id and anything else written meanwhile survive.
      // Counts another hook added during the ~1s send go out with the reset.
      const latest = readState(statePath);
      if (result.ok) {
        delete latest.counters;
        delete latest.retryAt;
        latest.windowStart = now;
      } else {
        latest.retryAt = now + RETRY_AFTER_MS;
      }
      writeState(latest, statePath);
      return result.ok;
    } finally {
      try { fs.unlinkSync(lockPath); } catch {}
    }
  } catch { return false; }
}
