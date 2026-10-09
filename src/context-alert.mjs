// src/context-alert.mjs — early warning before Claude Code auto-compacts a chat.
//
// The statusline payload carries the chat's context size:
// context_window.total_input_tokens (input + cache creation + cache read; 0
// before the first API response) and context_window.context_window_size (the
// model's FULL window). Claude Code compacts earlier than the full window, at
// the auto-compact window, so this resolves that window and warns ONCE PER
// SESSION when the chat passes a threshold (85% by default) of it. That leaves
// time to wrap up or /compact on your own terms.
//
// context_window.used_percentage is deliberately not used: it is measured
// against the full model window, not the auto-compact window.
//
// Unlike the usage limits (account-wide), context belongs to one chat, so the
// "already told you" state is keyed by session_id. It lives in its own file,
// written under the same exclusive lock as usage-alert.mjs and BEFORE anything
// is sent. A session warns once and never again, even after /compact drops its
// usage. Delivery reuses usage-alert.mjs (toast + ntfy + webhook, never the bell).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { getConfigDir } from './config-loader.mjs';
import { chatLabel, readState as readJson, writeState, withLock } from './usage-alert.mjs';
import { logHookError } from './error-log.mjs';

export const DEFAULT_CONTEXT_THRESHOLD = 85;
// What Claude Code documents for CLAUDE_CODE_AUTO_COMPACT_WINDOW.
export const MIN_ENV_WINDOW = 100000;
export const MAX_ENV_WINDOW = 1000000;
// Warned sessions older than this are forgotten on the next write.
export const STATE_TTL_MS = 14 * 24 * 3600 * 1000;

export const contextStatePath = () => path.join(getConfigDir(), '.context-alerts.json');

const positive = (n) => typeof n === 'number' && Number.isFinite(n) && n > 0;

// The configured threshold when it is a number in (0, 100], else the default.
export function effectiveContextThreshold(config) {
  const t = config?.contextAlerts?.threshold;
  return typeof t === 'number' && t > 0 && t <= 100 ? t : DEFAULT_CONTEXT_THRESHOLD;
}

// `autoCompactWindow` from ~/.claude/settings.local.json, then settings.json
// (where /autocompact <n> stores it). A file that is missing, unreadable or
// not JSON, or a value that is not a positive number, is skipped silently.
function settingsWindow(home, fsImpl) {
  for (const name of ['settings.local.json', 'settings.json']) {
    try {
      const value = JSON.parse(fsImpl.readFileSync(path.join(home, '.claude', name), 'utf8'))?.autoCompactWindow;
      if (positive(value)) return value;
    } catch { /* try the next file */ }
  }
  return null;
}

// The auto-compact window, in tokens, or null when nothing is known. Order:
//   1. payload.auto_compact_window (undocumented, forward-compatible)
//   2. env CLAUDE_CODE_AUTO_COMPACT_WINDOW, a plain positive integer clamped to
//      [100000, 1000000]; the docs say it overrides the setting and /autocompact
//   3. the autoCompactWindow setting (settings.local.json, then settings.json)
//   4. the model's own window, context_window.context_window_size
// The result never exceeds the model window when that is known. And when the
// chat is already past the resolved window (it captured another value at
// startup), the model window is used instead: a percentage over 100 means nothing.
export function resolveAutoCompactWindow(payload, { env = process.env, home = os.homedir(), fsImpl = fs } = {}) {
  const ctx = payload?.context_window;
  const model = positive(ctx?.context_window_size) ? ctx.context_window_size : null;

  let window = null;
  if (positive(payload?.auto_compact_window)) {
    window = payload.auto_compact_window;
  } else {
    const fromEnv = /^\d+$/.test(String(env?.CLAUDE_CODE_AUTO_COMPACT_WINDOW ?? '').trim())
      ? Number(String(env.CLAUDE_CODE_AUTO_COMPACT_WINDOW).trim())
      : 0;
    if (fromEnv > 0) window = Math.min(MAX_ENV_WINDOW, Math.max(MIN_ENV_WINDOW, fromEnv));
    else window = settingsWindow(home, fsImpl);
  }
  if (window === null) window = model;
  if (window === null) return null;

  if (model !== null && window > model) window = model;
  const used = ctx?.total_input_tokens;
  if (model !== null && positive(used) && used > window) window = model;
  return window;
}

// What a payload says about its chat's context: { sessionId, tokens, window,
// percent } or null when it cannot be judged (no session id to dedupe on, no
// tokens yet, or no window known). percent is capped at 100.
export function contextUsage(payload, deps) {
  const sessionId = typeof payload?.session_id === 'string' ? payload.session_id.trim() : '';
  if (!sessionId) return null;
  const tokens = payload?.context_window?.total_input_tokens;
  if (!positive(tokens)) return null;
  const window = resolveAutoCompactWindow(payload, deps);
  if (window === null) return null;
  return { sessionId, tokens, window, percent: Math.min(100, (tokens / window) * 100) };
}

// Pure alert rule. state is { [sessionId]: warnedAtEpochMs }. Returns the alert
// (or null) and the state to store. A session already in the state never warns
// again; storing the warning also prunes entries older than STATE_TTL_MS.
export function evaluateContext(payload, state, { threshold = DEFAULT_CONTEXT_THRESHOLD, now = Date.now(), ...deps } = {}) {
  const current = state && typeof state === 'object' ? state : {};
  const usage = contextUsage(payload, deps);
  if (!usage || Object.hasOwn(current, usage.sessionId) || usage.percent < threshold) {
    return { alert: null, state: current };
  }
  const next = Object.create(null);
  for (const [id, at] of Object.entries(current)) {
    if (typeof at === 'number' && Number.isFinite(at) && now - at <= STATE_TTL_MS) next[id] = at;
  }
  next[usage.sessionId] = now;
  return { alert: usage, state: next };
}

export function buildContextNotification(alert, payload) {
  const pct = Math.round(alert.percent);
  const chat = chatLabel(payload);
  const usedK = Math.round(alert.tokens / 1000);
  const windowK = Math.round(alert.window / 1000);
  return {
    title: `Claude Code · context at ${pct}%`,
    message: `${chat} is at ${pct}% of its auto-compact window (${usedK}K of ${windowK}K tokens). ` +
      'It will compact soon — wrap up or /compact now.',
    toastSound: 'Reminder',
    priority: 'high',
    ntfyTags: 'brain',
    icon: '',
    clickToFocus: false,
    source: 'claude',
    projectName: chat,
    event: 'context_limit',
  };
}

// Decide and record in one locked step; returns the notifications to send
// (zero or one). The statusline refreshes constantly, so everything that needs
// no lock (an already-warned session, a chat under the threshold) is settled
// first and the lock is only taken for a real warning. A run that cannot get
// the lock skips; the next refresh tries again. Never throws.
export function checkContext(payload, config, { statePath = contextStatePath(), now = Date.now(), ...deps } = {}) {
  if (config?.contextAlerts?.enabled === false) return [];
  try {
    const threshold = effectiveContextThreshold(config);
    const usage = contextUsage(payload, deps);
    if (!usage || usage.percent < threshold) return [];
    if (Object.hasOwn(readJson(statePath), usage.sessionId)) return [];
    const alert = withLock(`${statePath}.lock`, () => {
      const result = evaluateContext(payload, readJson(statePath), { threshold, now, ...deps });
      if (result.alert) writeState(statePath, result.state);
      return result.alert;
    }, 'context-alert:lock');
    return alert ? [buildContextNotification(alert, payload)] : [];
  } catch (err) {
    logHookError('context-alert', err);
    return [];
  }
}
