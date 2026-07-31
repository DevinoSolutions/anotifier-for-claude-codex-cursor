// src/update-check.mjs — cached "is there a newer version?" check, plus the
// hook-path notification that announces one.
//
// Lives in src/ rather than cli/ because the hook path uses it too: src is the
// packaged runtime layer and must never import from cli/ (cli already imports
// src/config-loader.mjs, so the reverse would invert the layering). Both callers
// share ONE cache file, so the network fetch runs at most once per process and
// at most once per 24h — a `status` run also satisfies the hook's daily check,
// and offline/slow networks never repeatedly stall either path.
import https from 'node:https';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { getConfigDir } from './config-loader.mjs';
import { sendNtfy } from './ntfy.mjs';
import { sendWebhook } from './webhook.mjs';
import { resolveToastBackend } from './platforms/index.mjs';

const require = createRequire(import.meta.url);
const pkg = require('../package.json');

export const UPDATE_TTL_MS = 24 * 60 * 60 * 1000;
export const UPGRADE_COMMAND = 'npm i -g anotifier@latest';
export const RELEASES_URL = 'https://github.com/DevinoSolutions/anotifier-for-claude-codex-cursor/releases/latest';

const CACHE_PATH = path.join(getConfigDir(), '.update-check.json');

// The CLI can afford npm's occasional slow response; the hook cannot. 2s keeps
// the tail of a hook run well inside the 10s host budget it already shares with
// the stdin read, the toast subprocess, and the Sentry flush.
const CLI_FETCH_TIMEOUT_MS = 3000;
const HOOK_FETCH_TIMEOUT_MS = 2000;
// Hard ceiling on the whole hook-path check (fetch + sends). Even a pathological
// channel cannot hold hook exit past this.
const HOOK_BUDGET_MS = 2500;

let inFlight;

// Public entry point. Memoized for the life of the process so a single command
// run makes at most one network request even if several call sites ask.
// Resolves to a newer version string (update available) or null. Never throws.
export function checkForUpdate() {
  if (!inFlight) inFlight = resolveUpdate(CACHE_PATH, fetchLatest, Date.now());
  return inFlight;
}

// Core logic, dependency-injected for tests (cache path, fetch impl, clock).
// A fresh cache (< TTL) is served without any network access. On a stale/absent
// cache we fetch, then persist the result — INCLUDING the timestamp of a failed
// attempt — so an offline machine waits a full TTL before trying again.
export async function resolveUpdate(cachePath, fetchImpl, now) {
  const cached = readCache(cachePath);
  if (cached && typeof cached.checkedAt === 'number' && now - cached.checkedAt < UPDATE_TTL_MS) {
    return cached.latest || null;
  }
  let latest = null;
  try { latest = await fetchImpl(); } catch { latest = null; }
  writeCache(cachePath, { checkedAt: now, latest: latest || null });
  return latest || null;
}

function readCache(cachePath) {
  try {
    const parsed = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
    // A JSON scalar (`null`, `7`, `"x"`) parses fine but would throw on property
    // access — only an object is usable state.
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch { return null; }
}

// MERGES rather than overwrites: `lastNotifiedVersion` shares this file and is
// owned by the hook path, so a CLI-side check must not wipe it — that would make
// the hook re-announce a version it already told the user about.
function writeCache(cachePath, data) {
  try {
    const prev = readCache(cachePath) || {};
    fs.mkdirSync(path.dirname(cachePath), { recursive: true });
    fs.writeFileSync(cachePath, JSON.stringify({ ...prev, ...data }), 'utf8');
  } catch { /* cache is best-effort — a write failure just re-checks next run */ }
}

// True when `a` is a strictly newer semver than `b` (field-by-field numeric
// compare, so 1.10.0 > 1.9.0 — a plain string `!==` would also fire when the
// local build is AHEAD of npm's latest and nag users to "update" to an older
// version). Pre-release/build metadata is ignored; anything unparseable is
// treated as not-newer, so the check stays quiet rather than nagging wrongly.
export function isNewer(a, b) {
  const parse = (v) => String(v).split('-')[0].split('.').map((n) => parseInt(n, 10) || 0);
  const [pa, pb] = [parse(a), parse(b)];
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0);
  }
  return false;
}

// Query npm for the published 'latest' version. Resolves to the version string
// only when it is strictly newer than ours (an update is available), else null.
// Never throws.
export function fetchLatest({ timeoutMs = CLI_FETCH_TIMEOUT_MS, currentVersion = pkg.version } = {}) {
  return new Promise((resolve) => {
    const req = https.get('https://registry.npmjs.org/anotifier/latest', {
      agent: false, // no keep-alive socket may outlive the hook's process.exit() (see sentry.mjs)
      timeout: timeoutMs,
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const latest = JSON.parse(data).version;
          resolve(latest && isNewer(latest, currentVersion) ? latest : null);
        } catch { resolve(null); }
      });
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
  });
}

// Hook-path entry point, called at the very END of a successful notify run.
// Announces a newly published version EXACTLY ONCE, through the channels the
// user already has enabled. Best-effort in every direction: it never throws,
// never rejects, and is capped at budgetMs so it cannot push the hook past its
// budget. Resolves the announced version, or null when nothing was announced.
export async function maybeNotifyUpdate(config, {
  cachePath = CACHE_PATH,
  fetchImpl = () => fetchLatest({ timeoutMs: HOOK_FETCH_TIMEOUT_MS }),
  now = Date.now(),
  notify = sendUpdateNotification,
  currentVersion = pkg.version,
  budgetMs = HOOK_BUDGET_MS,
} = {}) {
  // Opt-out is total: no network, no state file, no notification.
  if (config?.updateCheck?.enabled === false) return null;
  try {
    return await Promise.race([
      runUpdateCheck({ config, cachePath, fetchImpl, now, notify, currentVersion }),
      // unref so a pending timer can never be the reason the event loop stays
      // alive (same guard as flushErrorReporting).
      new Promise((resolve) => setTimeout(() => resolve(null), budgetMs).unref?.()),
    ]);
  } catch {
    // resolveUpdate and the senders already swallow their own failures; this is
    // the last backstop so an update nag can never fail a hook run.
    return null;
  }
}

async function runUpdateCheck({ config, cachePath, fetchImpl, now, notify, currentVersion }) {
  const latest = await resolveUpdate(cachePath, fetchImpl, now);
  // The cache can hold a hit recorded BEFORE the user upgraded, so re-assert the
  // semver gate rather than trusting it: never announce a version that is already
  // installed (or older than what is installed).
  if (!latest || !isNewer(latest, currentVersion)) return null;

  const state = readCache(cachePath) || {};
  if (state.lastNotifiedVersion === latest) return null;

  // Marked BEFORE dispatching, deliberately. This guarantees at most ONE attempt
  // per published version: a channel that is slow or down would otherwise leave
  // the marker unwritten (the budget race below can cut the send short) and every
  // hook run for the next 24h would re-attempt it and re-pay that latency. A nag
  // that fails to send is not a lost signal — the CLI banner still reports the
  // update on every `anotifier` command.
  writeCache(cachePath, { lastNotifiedVersion: latest });
  await notify(config, { latest, currentVersion });
  return latest;
}

// Fan one update notice out across the channels the user already has on, reusing
// the event path's senders and enable gates. Per-event overrides are deliberately
// not consulted — this is not a routed agent event, so there is no event whose
// settings would apply. The terminal bell is deliberately NOT rung either: the
// run that triggered this already rang for the real event, and a second ring for
// a version nag would just be noise.
export function sendUpdateNotification(config, { latest, currentVersion }, {
  resolveBackend = resolveToastBackend,
  ntfy = sendNtfy,
  webhook = sendWebhook,
} = {}) {
  const notification = {
    title: `anotifier v${latest} available`,
    message: `You have v${currentVersion} — update with: ${UPGRADE_COMMAND}`,
    toastSound: 'Default',
    // A version nag must never outrank a real agent event: 'low' stays quiet on
    // the phone and maps to notify-send's low urgency on Linux.
    priority: 'low',
    ntfyTags: 'arrow_up',
    icon: '',
    clickToFocus: false, // there is no project window this could focus
    event: 'update_available',
  };
  // Toast backends render title + body and nothing else — none of the three can
  // carry a link — so the release page goes in the body, where it is at least
  // readable. Same for webhooks, whose payload shapes have no link field.
  const withLink = { ...notification, message: `${notification.message} — ${RELEASES_URL}` };

  const tasks = [];

  if (config?.toast?.enabled !== false) {
    tasks.push(resolveBackend().then((sendToast) => sendToast(withLink)));
  }

  if (config?.ntfy?.enabled && config?.ntfy?.topic) {
    // ntfy DOES support a tap target, so the release page rides in the Click
    // header instead of cluttering the body. Overridden per-send rather than read
    // from config.ntfy.click so the user's own click URL still owns real events.
    tasks.push(ntfy({ ...config.ntfy, click: RELEASES_URL }, notification));
  }

  if (config?.webhook?.enabled && config?.webhook?.url) {
    tasks.push(webhook(config.webhook, withLink));
  }

  // allSettled, not all: the senders resolve false rather than reject, but the
  // dynamic toast-backend import can reject on a broken install and must not
  // propagate out of a best-effort path.
  return Promise.allSettled(tasks);
}
