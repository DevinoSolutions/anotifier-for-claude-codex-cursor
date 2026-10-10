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
import { chatLabel, writeState, withLock } from './usage-alert.mjs';
import { logHookError } from './error-log.mjs';

export const DEFAULT_CONTEXT_THRESHOLD = 85;
// What Claude Code documents for CLAUDE_CODE_AUTO_COMPACT_WINDOW; the same
// bounds are applied to the autoCompactWindow setting.
export const MIN_WINDOW = 100000;
export const MAX_WINDOW = 1000000;
// Warned sessions older than this are forgotten the next time one is recorded.
export const STATE_TTL_MS = 14 * 24 * 3600 * 1000;

export const contextStatePath = () => path.join(getConfigDir(), '.context-alerts.json');

const positive = (n) => typeof n === 'number' && Number.isFinite(n) && n > 0;
const clampWindow = (n) => Math.min(MAX_WINDOW, Math.max(MIN_WINDOW, n));
const isTruthyEnv = (v) => /^(1|true|yes|on)$/i.test(String(v ?? '').trim());

// The configured threshold when it is a number in (0, 100], else the default.
export function effectiveContextThreshold(config) {
  const t = config?.contextAlerts?.threshold;
  return typeof t === 'number' && t > 0 && t <= 100 ? t : DEFAULT_CONTEXT_THRESHOLD;
}

// The settings files that can define autoCompactWindow / autoCompactEnabled,
// parsed, in precedence order (first hit wins):
//   <project_dir>/.claude/settings.local.json
//   <project_dir>/.claude/settings.json
//   <CLAUDE_CONFIG_DIR or ~/.claude>/settings.json
// (~/.claude/settings.local.json is not a Claude Code user scope.) A file that
// is missing, unreadable or not a JSON object is skipped silently. Managed
// settings and the --autocompact flag never reach a statusline, so they are
// invisible here.
function loadSettings(payload, { env, home, fsImpl }) {
  const projectDir = payload?.workspace?.project_dir;
  const userDir = typeof env?.CLAUDE_CONFIG_DIR === 'string' && env.CLAUDE_CONFIG_DIR.trim()
    ? env.CLAUDE_CONFIG_DIR
    : path.join(home, '.claude');
  const files = [
    ...(typeof projectDir === 'string' && projectDir
      ? [path.join(projectDir, '.claude', 'settings.local.json'), path.join(projectDir, '.claude', 'settings.json')]
      : []),
    path.join(userDir, 'settings.json'),
  ];
  const out = [];
  for (const file of files) {
    try {
      const parsed = JSON.parse(fsImpl.readFileSync(file, 'utf8'));
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) out.push(parsed);
    } catch { /* try the next file */ }
  }
  return out;
}

// The per-model setting "auto": use the window Claude Code tunes for the model.
const MODEL_WINDOW = Symbol('model window');

// Claude Code >= 2.1.288 saves /autocompact per model under
// modelSettings.<model id>.autoCompactWindow (a number, or "auto" for the
// window tuned for the model); older versions write the top-level key. In each
// file the per-model value wins, so a per-model "auto" also overrides a
// top-level number and resolves to the model's own window.
function settingsWindow(settings, modelId) {
  for (const s of settings) {
    const perModel = typeof modelId === 'string' && s.modelSettings && Object.hasOwn(s.modelSettings, modelId)
      ? s.modelSettings[modelId]?.autoCompactWindow
      : undefined;
    if (perModel === 'auto') return MODEL_WINDOW;
    if (positive(perModel)) return clampWindow(perModel);
    if (positive(s.autoCompactWindow)) return clampWindow(s.autoCompactWindow);
  }
  return null;
}

// Nothing will compact, so there is nothing to warn about: DISABLE_AUTO_COMPACT
// or DISABLE_COMPACT set truthy, or autoCompactEnabled false in the first
// settings file that defines it.
function compactDisabled(env, settings) {
  if (isTruthyEnv(env?.DISABLE_AUTO_COMPACT) || isTruthyEnv(env?.DISABLE_COMPACT)) return true;
  const defining = settings.find((s) => typeof s.autoCompactEnabled === 'boolean');
  return defining ? defining.autoCompactEnabled === false : false;
}

function windowFrom(payload, env, settings) {
  const ctx = payload?.context_window;
  const model = positive(ctx?.context_window_size) ? ctx.context_window_size : null;

  let window = null;
  // auto_compact_window is NOT in Claude Code's documented statusline payload.
  // Speculative and forward-compatible only: honoured if a future version adds
  // it, never relied on.
  if (positive(payload?.auto_compact_window)) {
    window = payload.auto_compact_window;
  } else {
    // parseInt semantics, as the docs describe: "500k" reads as 500 and clamps
    // up to the minimum; anything that does not start with a positive integer
    // is invalid and ignored.
    const fromEnv = Number.parseInt(String(env?.CLAUDE_CODE_AUTO_COMPACT_WINDOW ?? '').trim(), 10);
    window = fromEnv > 0 ? clampWindow(fromEnv) : settingsWindow(settings, payload?.model?.id);
  }
  if (window === null || window === MODEL_WINDOW) window = model;
  if (window === null) return null;
  return model !== null && window > model ? model : window;
}

const defaultDeps = (deps = {}) => ({ env: process.env, home: os.homedir(), fsImpl: fs, ...deps });

// The auto-compact window, in tokens, or null when nothing is known. Order:
//   1. payload.auto_compact_window (undocumented, speculative)
//   2. env CLAUDE_CODE_AUTO_COMPACT_WINDOW, clamped to [100000, 1000000]; the
//      docs say it overrides the setting and /autocompact
//   3. the autoCompactWindow setting, clamped the same way (see loadSettings
//      for the files, settingsWindow for the per-model key)
//   4. the model's own window, context_window.context_window_size
// The result never exceeds the model window when that is known. A chat that is
// already past the resolved window keeps it: its percentage just caps at 100.
export function resolveAutoCompactWindow(payload, deps) {
  const d = defaultDeps(deps);
  return windowFrom(payload, d.env, loadSettings(payload, d));
}

// True when auto-compact is switched off, so no warning makes sense.
export function autoCompactDisabled(payload, deps) {
  const d = defaultDeps(deps);
  return compactDisabled(d.env, loadSettings(payload, d));
}

// What a payload says about its chat's context: { sessionId, tokens, window,
// percent } or null when it cannot be judged (no session id to dedupe on, no
// tokens yet, auto-compact off, or no window known). percent is capped at 100.
export function contextUsage(payload, deps) {
  const sessionId = typeof payload?.session_id === 'string' ? payload.session_id.trim() : '';
  if (!sessionId) return null;
  const tokens = payload?.context_window?.total_input_tokens;
  if (!positive(tokens)) return null;
  const d = defaultDeps(deps);
  const settings = loadSettings(payload, d);
  if (compactDisabled(d.env, settings)) return null;
  const window = windowFrom(payload, d.env, settings);
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

// The warned-sessions map, or null when the file could not be read. A missing
// file and unparseable content both mean "nobody warned yet" ({}); any other
// read error (EBUSY, EACCES, ...) is null so the caller skips the run: writing
// back from an empty read would wipe every other session's entry.
function readWarned(statePath) {
  let raw;
  try {
    raw = fs.readFileSync(statePath, 'utf8');
  } catch (err) {
    if (err?.code === 'ENOENT') return {};
    // Logged (only reached above the threshold, once per refresh) so a state
    // path that stays unreadable shows up in `anotifier status` instead of
    // silently ending every context warning.
    logHookError('context-alert:state', err);
    return null;
  }
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch { return {}; }
}

// Decide and record in one locked step; returns the notifications to send
// (zero or one). The statusline refreshes constantly, so everything that needs
// no lock (an already-warned session, a chat under the threshold) is settled
// first and the lock is only taken for a real warning. A run that cannot get
// the lock, or cannot read the state, skips; the next refresh tries again.
// Never throws.
export function checkContext(payload, config, { statePath = contextStatePath(), now = Date.now(), ...deps } = {}) {
  if (config?.contextAlerts?.enabled === false) return [];
  try {
    const threshold = effectiveContextThreshold(config);
    const usage = contextUsage(payload, deps);
    if (!usage || usage.percent < threshold) return [];
    const seen = readWarned(statePath);
    if (!seen || Object.hasOwn(seen, usage.sessionId)) return [];
    const alert = withLock(`${statePath}.lock`, () => {
      const state = readWarned(statePath);
      if (!state) return null;
      const result = evaluateContext(payload, state, { threshold, now, ...deps });
      if (result.alert) writeState(statePath, result.state);
      return result.alert;
    }, 'context-alert:lock');
    return alert ? [buildContextNotification(alert, payload)] : [];
  } catch (err) {
    logHookError('context-alert', err);
    return [];
  }
}
