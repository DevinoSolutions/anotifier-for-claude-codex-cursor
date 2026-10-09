// src/usage-alert.mjs — early warning before a Claude Code usage limit stops
// the session.
//
// Claude Code hands its statusline command a JSON payload that carries the
// account's subscription usage: rate_limits.five_hour and rate_limits.seven_day,
// each with used_percentage (0-100) and resets_at (Unix epoch seconds). Hooks
// never see these numbers, so src/statusline.mjs taps the statusline and calls
// in here. When a window crosses a threshold (70/85/95% by default) we post
// ONE notification through the channels the user already has on, naming the
// chat, the window, and when it resets.
//
// The limits belong to the ACCOUNT, not to a chat, so every open session sees
// the same numbers. The "already told you" state is therefore one shared file
// per machine: whichever chat's statusline sees the crossing first sends it and
// the rest stay quiet. A window's state is forgotten once its resets_at passes,
// so the next window warns again from scratch.
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { getConfigDir, loadConfig } from './config-loader.mjs';
import { sendNtfy } from './ntfy.mjs';
import { sendWebhook } from './webhook.mjs';
import { resolveToastBackend } from './platforms/index.mjs';
import { logHookError, flushErrorReporting } from './error-log.mjs';

export const DEFAULT_THRESHOLDS = [70, 85, 95];

// The windows Claude Code reports, in the order they are checked.
export const WINDOWS = {
  five_hour: { label: '5-hour', short: '5h' },
  seven_day: { label: 'weekly', short: '7d' },
};

export const STATE_PATH = path.join(getConfigDir(), '.usage-alerts.json');
const LOCK_STALE_MS = 5000;

// A resets_at that moves later by more than this is a new window even if the
// old one's reset time has not been reached on our clock (clock skew, or a
// payload that arrived from a session started after a reset).
const NEW_WINDOW_SKEW_SEC = 10 * 60;

// The thresholds actually in force: the configured list when it is a usable
// list of numbers in (0, 100], else the defaults. Sorted ascending, deduped.
export function effectiveThresholds(config) {
  const list = config?.usageAlerts?.thresholds;
  if (!Array.isArray(list)) return DEFAULT_THRESHOLDS;
  const valid = [...new Set(list.filter((n) => typeof n === 'number' && n > 0 && n <= 100))].sort((a, b) => a - b);
  return valid.length ? valid : DEFAULT_THRESHOLDS;
}

// Pure core. Given a statusline payload and the stored state, returns the
// alerts to send now and the state to store. At most one alert per window per
// call: a jump from 60% to 96% sends the 95% warning, not three in a row.
// state shape: { [window]: { resetsAt: number|null, level: number } }
export function evaluateUsage(payload, state, { thresholds = DEFAULT_THRESHOLDS, now = Date.now() } = {}) {
  const limits = payload?.rate_limits;
  const next = { ...(state && typeof state === 'object' ? state : {}) };
  const alerts = [];
  if (!limits || typeof limits !== 'object') return { alerts, state: next };

  const nowSec = now / 1000;
  for (const window of Object.keys(WINDOWS)) {
    const entry = limits[window];
    const used = entry?.used_percentage;
    if (typeof used !== 'number' || !Number.isFinite(used)) continue;
    const resetsAt = typeof entry.resets_at === 'number' && Number.isFinite(entry.resets_at) ? entry.resets_at : null;

    let stored = next[window];
    const over = stored && typeof stored.resetsAt === 'number' && (
      nowSec >= stored.resetsAt ||
      (resetsAt !== null && resetsAt - stored.resetsAt > NEW_WINDOW_SKEW_SEC)
    );
    // Without any reset time to go on, usage falling well under the lowest
    // threshold is the only sign a new window began.
    const drained = stored && stored.resetsAt == null && used < thresholds[0] - 10;
    if (!stored || typeof stored.level !== 'number' || over || drained) stored = { resetsAt, level: 0 };

    const crossed = thresholds.filter((t) => used >= t).pop() ?? 0;
    if (crossed > stored.level) {
      alerts.push({ window, threshold: crossed, used, resetsAt });
      stored = { resetsAt: resetsAt ?? stored.resetsAt, level: crossed };
    } else if (resetsAt !== null && stored.resetsAt == null) {
      stored = { ...stored, resetsAt };
    }
    next[window] = stored;
  }
  return { alerts, state: next };
}

// "14:30 (in 2h 10m)" for a reset today, "Tue 14:30 (in 3d 4h)" further out.
export function formatReset(resetsAt, now = Date.now()) {
  if (typeof resetsAt !== 'number') return null;
  const at = new Date(resetsAt * 1000);
  const ms = Math.max(0, at.getTime() - now);
  const mins = Math.round(ms / 60000);
  const d = Math.floor(mins / 1440);
  const h = Math.floor((mins % 1440) / 60);
  const m = mins % 60;
  const inText = d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : `${m}m`;
  const clock = `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`;
  const sameDay = at.toDateString() === new Date(now).toDateString();
  const day = sameDay ? '' : `${at.toLocaleDateString('en-US', { weekday: 'short' })} `;
  return `${day}${clock} (in ${inText})`;
}

// Which chat saw it: the session's name when it has one (/rename, --name, or
// an AI title), else the project folder, plus a short session id so two chats
// in the same folder stay distinguishable.
export function chatLabel(payload) {
  const dir = payload?.workspace?.project_dir || payload?.workspace?.current_dir || payload?.cwd || '';
  const project = dir ? path.basename(String(dir).replace(/[\\/]+$/, '')) : '';
  const name = typeof payload?.session_name === 'string' ? payload.session_name.trim() : '';
  const id = typeof payload?.session_id === 'string' ? payload.session_id.slice(0, 8) : '';
  const main = name && project && name !== project ? `${name} (${project})` : name || project || 'Claude Code';
  return id ? `${main} [${id}]` : main;
}

const LEVEL_STYLE = [
  // [minimum threshold, ntfy/toast priority, ntfy tags, toast sound]
  [95, 'urgent', 'rotating_light', 'Reminder'],
  [85, 'high', 'warning', 'Reminder'],
  [0, 'default', 'hourglass_flowing_sand', 'Default'],
];

export function buildUsageNotification(alert, payload, now = Date.now()) {
  const win = WINDOWS[alert.window];
  const used = Math.round(alert.used);
  const reset = formatReset(alert.resetsAt, now);
  const [, priority, ntfyTags, toastSound] = LEVEL_STYLE.find(([min]) => alert.threshold >= min);
  const chat = chatLabel(payload);
  return {
    title: `Claude Code · ${win.label} limit at ${used}%`,
    message: `${chat} crossed ${alert.threshold}% of the ${win.label} usage limit.` +
      (reset ? ` Resets ${reset}.` : ''),
    toastSound,
    priority,
    ntfyTags,
    icon: '',
    clickToFocus: false,
    source: 'claude',
    projectName: chat,
    event: 'usage_limit',
  };
}

function readState(statePath) {
  try {
    const parsed = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch { return {}; }
}

function writeState(statePath, state) {
  fs.mkdirSync(path.dirname(statePath), { recursive: true });
  const tmp = `${statePath}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(state), 'utf8');
  fs.renameSync(tmp, statePath);
}

// Several chats refresh their statuslines at once, so the read-decide-write
// runs under an exclusive lock file. A run that cannot get the lock simply
// skips: the holder is evaluating the same account-wide numbers.
function withLock(lockPath, fn) {
  try {
    const st = fs.statSync(lockPath);
    if (Date.now() - st.mtimeMs > LOCK_STALE_MS) fs.unlinkSync(lockPath);
  } catch {}
  let fd;
  try {
    fs.mkdirSync(path.dirname(lockPath), { recursive: true });
    fd = fs.openSync(lockPath, 'wx');
  } catch { return null; }
  try {
    return fn();
  } finally {
    try { fs.closeSync(fd); } catch {}
    try { fs.unlinkSync(lockPath); } catch {}
  }
}

// Decide and record in one locked step. The state is written BEFORE anything
// is sent, like the update notice: at most one attempt per threshold per
// window, so a slow or broken channel can never turn into repeated alerts.
// Returns the notifications to send (possibly empty). Never throws.
export function checkUsage(payload, config, { statePath = STATE_PATH, now = Date.now() } = {}) {
  if (config?.usageAlerts?.enabled === false) return [];
  if (!payload?.rate_limits) return [];
  try {
    const result = withLock(`${statePath}.lock`, () => {
      const { alerts, state } = evaluateUsage(payload, readState(statePath), { thresholds: effectiveThresholds(config), now });
      if (alerts.length || JSON.stringify(state) !== JSON.stringify(readState(statePath))) writeState(statePath, state);
      return alerts;
    });
    return (result || []).map((a) => buildUsageNotification(a, payload, now));
  } catch (err) {
    logHookError('usage-alert', err);
    return [];
  }
}

// Fan the warnings out over the channels the user has on. No terminal bell: a
// statusline has no terminal of its own to ring.
export async function sendUsageNotifications(config, notifications, {
  resolveBackend = resolveToastBackend,
  ntfy = sendNtfy,
  webhook = sendWebhook,
} = {}) {
  const tasks = [];
  for (const n of notifications) {
    if (config?.toast?.enabled !== false) tasks.push(resolveBackend().then((send) => send(n)));
    if (config?.ntfy?.enabled && config?.ntfy?.topic) tasks.push(ntfy(config.ntfy, n));
    if (config?.webhook?.enabled && config?.webhook?.url) tasks.push(webhook(config.webhook, n));
  }
  return Promise.allSettled(tasks);
}

// A statusline must print and exit fast, and Claude Code cancels a run that is
// still going when the next refresh fires. So delivery happens in a detached
// child that outlives the statusline: node usage-alert.mjs --deliver <base64>.
export function spawnDelivery(notifications, { spawnImpl = spawn, scriptPath = fileURLToPath(import.meta.url) } = {}) {
  const arg = Buffer.from(JSON.stringify(notifications), 'utf8').toString('base64');
  const child = spawnImpl(process.execPath, [scriptPath, '--deliver', arg], {
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
  });
  child.on?.('error', (err) => logHookError('usage-alert:spawn', err));
  child.unref?.();
  return child;
}

async function deliverMain(arg) {
  try {
    const notifications = JSON.parse(Buffer.from(arg, 'base64').toString('utf8'));
    if (Array.isArray(notifications) && notifications.length) {
      await sendUsageNotifications(loadConfig(), notifications);
    }
  } catch (err) {
    logHookError('usage-alert:deliver', err);
  }
  await flushErrorReporting();
  process.exit(0);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const i = process.argv.indexOf('--deliver');
  if (i !== -1 && process.argv[i + 1]) deliverMain(process.argv[i + 1]);
}
