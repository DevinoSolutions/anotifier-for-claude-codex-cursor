// src/telemetry.mjs — opt-in, anonymous usage stats sent to PostHog.
//
// OFF unless the user said yes: the first interactive `anotifier setup` (a real
// terminal on both stdin and stdout) asks, default Yes; `anotifier telemetry
// on|off|status` changes or inspects the choice later. Piped or agent-driven
// setups never ask and never opt in, and a plugin-only install never runs setup,
// so neither sends anything. Even when opted in, DO_NOT_TRACK,
// ANOTIFIER_TELEMETRY=0 and CI environments send nothing.
//
// What is sent is experience, never content: which commands ran and how they
// ended, which channels delivered or failed, why a notification was skipped,
// latency buckets, OS / Node / anotifier versions, and which features are on.
// NEVER message text, project names, file paths, ntfy topics or servers,
// webhook URLs, hostnames or error messages. Every property below is an enum,
// a boolean, a count or a clamped short identifier — keep it that way. The
// exact list of events and properties is documented in the README ("Usage
// stats"); change both together.
//
// Two paths, one transport:
// - CLI commands queue their events and send them in ONE request when the
//   command ends (they are rare and interactive).
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
// Absolute wall-clock deadlines for a whole request, not per-byte idle timeouts.
const SEND_TIMEOUT_MS = 1000;
const HOOK_BUDGET_MS = 800;
// A summary lock older than this belongs to a hook that died mid-send.
const LOCK_STALE_MS = 30 * 1000;
// At most this many distinct unrecognized hook event names are kept per window
// (the last slot is reserved for "other", which also absorbs the overflow).
export const MAX_UNMAPPED_KEYS = 10;

export const STATE_PATH = path.join(getConfigDir(), '.telemetry.json');

const KNOWN_SOURCES = ['claude', 'codex', 'cursor', 'gemini'];
const KNOWN_EVENTS = ['task_complete', 'needs_input', 'session_start'];
const KNOWN_CHANNELS = ['toast', 'ntfy', 'webhook', 'bell'];
const WEBHOOK_FORMATS = ['generic', 'slack', 'discord', 'telegram'];
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

// ANOTIFIER_TELEMETRY_URL points the client at a local server in tests. A
// single event goes to the capture URL; several go to /batch/ on the same host.
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
// A failed rename must not leave the temp file behind.
function writeState(state, statePath) {
  try {
    fs.mkdirSync(path.dirname(statePath), { recursive: true });
    const tmp = `${statePath}.${process.pid}.tmp`;
    try {
      fs.writeFileSync(tmp, JSON.stringify(state), 'utf8');
      fs.renameSync(tmp, statePath);
    } catch (err) {
      try { fs.unlinkSync(tmp); } catch { /* never created */ }
      throw err;
    }
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
    // Never derive a location from the request's IP address.
    $geoip_disable: true,
    anotifier_version: pkg.version,
    os: os.platform(),
    os_release: os.release(),
    arch: os.arch(),
    node_version: process.versions.node,
  };
}

const pick = (value, known) => (known.includes(value) ? value : 'other');

// A short identifier or the fallback: letters, digits and _ . - only, 1-40
// characters. Used for any name that is not on a fixed list (raw hook event
// names, error class names, error codes) so free text can never ride along.
export function clampIdent(value, fallback = null) {
  const text = String(value ?? '');
  return /^[A-Za-z0-9_.-]{1,40}$/.test(text) ? text : fallback;
}

// Which features are on — booleans and enums only. `ntfy_custom_server` says
// whether the server is not ntfy.sh without ever saying which server it is.
export function configSnapshot(config = {}) {
  return {
    toast_enabled: config.toast?.enabled !== false,
    toast_rich: config.toast?.richContent !== false,
    ntfy_enabled: Boolean(config.ntfy?.enabled && config.ntfy?.topic),
    ntfy_rich: config.ntfy?.richContent === true,
    ntfy_custom_server: Boolean(config.ntfy?.server) && String(config.ntfy.server).replace(/\/+$/, '') !== 'https://ntfy.sh',
    webhook_enabled: Boolean(config.webhook?.enabled && config.webhook?.url),
    webhook_format: config.webhook?.enabled ? pick(config.webhook?.format || 'generic', WEBHOOK_FORMATS) : null,
    bell_enabled: config.terminalBell?.enabled !== false,
    quiet_hours_enabled: config.quietHours?.enabled === true,
    update_check_enabled: config.updateCheck?.enabled !== false,
    sentry_enabled: Boolean(config.sentry?.enabled && config.sentry?.dsn),
  };
}

// Raw hook event names (e.g. "PreToolUse") are tool vocabulary, not user
// content, but still clamp them to a short identifier.
const rawEventKey = (value) => clampIdent(value, 'other');

function latencyBucket(ms) {
  return LATENCY_BUCKETS.find(([limit]) => ms < limit)[1];
}

function bump(obj, key, by = 1) {
  obj[key] = (obj[key] || 0) + by;
}

// ── Transport ───────────────────────────────────────────────────────

const FAILED = { ok: false, status: 0 };

// POST one or more events in ONE request. Resolves { ok, status }; status 0 = no
// response. Never throws. `timeoutMs` is an absolute deadline for the whole
// request (connect, send and response), not an idle timeout that resets per byte.
export function sendEvents(events, { env = process.env, statePath = STATE_PATH, timeoutMs = SEND_TIMEOUT_MS } = {}) {
  return new Promise((resolve) => {
    let settled = false;
    let timer;
    const done = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };
    try {
      if (!events.length) { done(FAILED); return; }
      const base = new URL(captureUrl(env));
      const distinctId = getInstallId(statePath);
      const timestamp = new Date().toISOString();
      const shape = ({ event, properties }) => ({
        event,
        distinct_id: distinctId,
        properties: { ...baseProperties(), ...properties },
        timestamp,
      });
      const single = events.length === 1;
      const url = single ? base : new URL('/batch/', base);
      const body = JSON.stringify(single
        ? { api_key: TELEMETRY_KEY, ...shape(events[0]) }
        : { api_key: TELEMETRY_KEY, batch: events.map(shape) });
      const transport = url.protocol === 'https:' ? https : http;
      const req = transport.request(url, {
        method: 'POST',
        agent: false, // no keep-alive socket may outlive the hook's process.exit()
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
      }, (res) => {
        res.resume();
        const status = res.statusCode || 0;
        res.on('end', () => done({ ok: status >= 200 && status < 300, status }));
        res.on('error', () => done(FAILED));
      });
      req.on('error', () => done(FAILED));
      // A ref'd timer on purpose: it is cleared the moment the request settles,
      // and node <= 22 drains the event loop if only unref'd timers remain.
      timer = setTimeout(() => { req.destroy(); done(FAILED); }, timeoutMs);
      req.end(body);
    } catch { done(FAILED); }
  });
}

export function sendEvent(event, properties, options) {
  return sendEvents([{ event, properties }], options);
}

// ── CLI path: queue during the command, send once at the end ────────

const pending = [];

// Queue one CLI event if (and only if) the user opted in. `config` defaults to
// the file on disk, so a command that just changed it (setup, telemetry on)
// passes its own. Returns whether the event was queued. Nothing leaves the
// machine until flushTelemetry().
export function track(event, properties = {}, { config, env = process.env, statePath = STATE_PATH } = {}) {
  try {
    const cfg = config ?? loadConfigResult().config;
    if (!isTelemetryActive(cfg, env)) return false;
    pending.push({ event, properties, env, statePath });
    return true;
  } catch { return false; }
}

// Send everything queued by track() as a single request under one absolute
// deadline. Resolves false when nothing was queued or the send failed. Never throws.
export async function flushTelemetry() {
  try {
    if (!pending.length) return false;
    const batch = pending.splice(0);
    const { env, statePath } = batch[0];
    const { ok } = await sendEvents(batch.map(({ event, properties }) => ({ event, properties })), { env, statePath });
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
    if (run.outcome === 'unmapped') {
      c.unmapped_events ??= {};
      let key = rawEventKey(run.rawEvent);
      // Bound the distinct names: at most MAX_UNMAPPED_KEYS keys in total, the
      // last slot reserved for "other".
      const full = Object.keys(c.unmapped_events).length >= (key === 'other' ? MAX_UNMAPPED_KEYS : MAX_UNMAPPED_KEYS - 1);
      if (full && !(key in c.unmapped_events)) key = 'other';
      bump(c.unmapped_events, key);
    }
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
// counting window is 24h old, then starts a fresh window. The whole send is
// capped at budgetMs of wall time, never throws. Resolves true only when a
// summary was accepted.
export async function maybeSendHookSummary(config, {
  env = process.env,
  statePath = STATE_PATH,
  now = Date.now(),
  send = sendEvent,
  budgetMs = HOOK_BUDGET_MS,
} = {}) {
  const isDue = (state) => typeof state.windowStart === 'number'
    && Boolean(state.counters?.runs)
    && now - state.windowStart >= SUMMARY_INTERVAL_MS
    && !(typeof state.retryAt === 'number' && now < state.retryAt);
  try {
    if (!isTelemetryActive(config, env)) return false;
    if (!isDue(readState(statePath))) return false;

    const lockPath = `${statePath}.lock`;
    if (!acquireSummaryLock(lockPath, now)) return false;
    let budgetTimer;
    try {
      // Another hook may have sent (and reset the window) between our first
      // read and taking the lock, so decide again on fresh state.
      const state = readState(statePath);
      if (!isDue(state)) return false;
      const properties = {
        ...state.counters,
        window_start: new Date(state.windowStart).toISOString(),
        window_hours: Math.round((now - state.windowStart) / 3600000),
        config: configSnapshot(config),
      };
      const result = await Promise.race([
        send('hook_daily_summary', properties, { env, statePath, timeoutMs: budgetMs }),
        // Ref'd on purpose and cleared in `finally`: bounds an injected or
        // stuck sender, and keeps the loop alive on node <= 22.
        new Promise((resolve) => { budgetTimer = setTimeout(() => resolve(FAILED), budgetMs); }),
      ]);
      // Re-read so the install id and anything else written meanwhile survive.
      // Counts another hook added during the send are dropped with the reset.
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
      clearTimeout(budgetTimer);
      try { fs.unlinkSync(lockPath); } catch {}
    }
  } catch { return false; }
}
