#!/usr/bin/env node
// src/notify.mjs — Entry point called by all AI tool hooks
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseInput } from './parse-input.mjs';
import { route, isSilentNotification, isIdleReminder } from './router.mjs';
import { readAwayUntil } from './approval.mjs';
import { loadConfig, resolveProjectConfig } from './config-loader.mjs';
import { sendNtfy } from './ntfy.mjs';
import { sendWebhook } from './webhook.mjs';
import { deriveRichViews } from './transcript.mjs';
import { sendBell } from './bell.mjs';
import { resolveToastBackend } from './platforms/index.mjs';
import { enableSentryMirror, logHookError, flushErrorReporting } from './error-log.mjs';
import { maybeNotifyUpdate } from './update-check.mjs';
import { isSuppressed } from './suppress.mjs';
import { recordHookRun, maybeSendHookSummary } from './telemetry.mjs';
import { takeFailure } from './channel-failure.mjs';
import { recordTurnStart, finishTurn, supportsTurnTiming, isBelowMinDuration } from './turn-timer.mjs';

// Some tools (Cursor) fire the same hook twice simultaneously. Exclusive file
// creation is the atomic lock that lets only one invocation notify. The key
// includes event (and session when present) so DISTINCT events — e.g. a
// task_complete followed seconds later by a needs_input — never suppress each
// other; only true double-fires of the same event collide.
const DEDUP_WINDOW_MS = 1500;

// A claude notification_type joins the key too, so an informational notice
// can never swallow a permission prompt that lands right behind it. Events
// without a type keep exactly the old key.
export function dedupKey(event) {
  const sessionSuffix = event.sessionId ? `-${event.sessionId.slice(0, 8)}` : '';
  const typeSuffix = typeof event.notificationType === 'string' && event.notificationType
    ? `-${event.notificationType}`
    : '';
  return `${event.source}-${event.event}${typeSuffix}${sessionSuffix}`.replace(/[^A-Za-z0-9_.-]/g, '_');
}

export function acquireNotifyLock(key, baseDir = os.homedir()) {
  const dir = path.join(baseDir, '.anotifier');
  const lockFile = path.join(dir, `.lock-${key}`);
  try { fs.mkdirSync(dir, { recursive: true }); } catch {}
  // Clean up locks older than the dedup window (locks are never released —
  // the short window makes that harmless)
  try {
    const stat = fs.statSync(lockFile);
    if (Date.now() - stat.mtimeMs > DEDUP_WINDOW_MS) fs.unlinkSync(lockFile);
  } catch {}
  // Exclusive create — only the first process wins
  try {
    const fd = fs.openSync(lockFile, 'wx');
    fs.writeSync(fd, String(process.pid));
    fs.closeSync(fd);
    return true;
  } catch (err) {
    // EEXIST is the one true duplicate signal (a concurrent invocation won the
    // exclusive create). Any other failure — read-only HOME, ENOTDIR, quota —
    // fails OPEN: a rare double notification beats never notifying again.
    return err?.code !== 'EEXIST';
  }
}

export function parseArgs(argv) {
  const args = { source: 'claude' };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--source' && argv[i + 1]) {
      args.source = argv[i + 1];
      i++;
    }
    if (argv[i] === '--event' && argv[i + 1]) {
      args.event = argv[i + 1];
      i++;
    }
  }
  return args;
}

function readStdin() {
  return new Promise((resolve) => {
    if (process.stdin.isTTY) { resolve('{}'); return; }
    let data = '';
    let resolved = false;
    const done = (val) => { if (!resolved) { resolved = true; resolve(val); } };
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => { data += chunk; });
    process.stdin.on('end', () => done(data || '{}'));
    // Short timeout: hook callers should pipe data quickly.
    // 500ms is enough for any tool to deliver stdin, avoids blocking notification.
    setTimeout(() => done(data || '{}'), 500);
  });
}

// Run one channel send. Senders resolve booleans and log their own failure
// detail at the source; this wrapper only has to catch unexpected throws so
// one broken channel can never take down the others.
export function trackChannel(channel, promise) {
  return promise.then(
    // A failed send says why through noteFailure (a fixed enum, see
    // channel-failure.mjs); the reason only rides along when it failed.
    (ok) => (ok ? { channel, ok } : { channel, ok, reason: takeFailure(channel) }),
    (err) => { logHookError(channel, err); return { channel, ok: false, reason: 'other' }; },
  );
}

// Count this run toward the opt-in daily usage summary, and send the summary
// when one is due. Both are no-ops unless the user opted in (see
// src/telemetry.mjs), and neither can throw or outlast its own budget.
async function countRun(config, run) {
  recordHookRun(config, run);
  await maybeSendHookSummary(config);
}

// Antigravity CLI's Stop hook must answer with a decision: "continue" re-enters
// the agent loop, any other value lets it stop. Always answer "stop" so a
// suppressed, failed or unmapped run can never keep the agent running.
export function defaultResponseBody(source) {
  return source === 'antigravity' ? '{"decision":"stop"}\n' : '{}\n';
}

// The config every later step of a hook run reads: the user's config with the
// matching per-project rules (`projects` in ~/.anotifier/config.json) applied
// for the workspace this event came from. THE one place that happens, so quiet
// hours, the minimum-duration filter, routing, the channels and the update
// notice all see the same answer; nothing downstream re-reads the file. With no
// workspace, or no rule matching, the result is the loaded config minus the
// `projects` list. Never throws (resolveProjectConfig does not).
export function loadEffectiveConfig(event, load = loadConfig) {
  return resolveProjectConfig(load(), event?.cwd);
}

// A probe that never settles must not hold the alert: the probe has its own
// budget (about 1.2 s on Windows, 400 ms elsewhere), this is the backstop above it.
const FOCUS_PROBE_CAP_MS = 2500;

const probeFocus = async (opts) => (await import('./focus.mjs')).isAgentWindowFocused(opts);

// Opt-in focus suppression (`suppressWhenFocused`). Returns null, WITHOUT running
// the probe, when the key is not exactly true (the default), when the event is
// the idle reminder, or while `anotifier away` is active. A window left in front
// while the user is away still counts as in front, so those two must always be
// sent; deciding here, before the probe starts, also spares them the probe's
// delay. Otherwise it returns a promise of true / false / null for "is the
// agent's own window in front?". It is started as early as the event is known
// and awaited right before dispatch, so while it is on every alert waits for it:
// about 1 s extra on Windows. The promise never rejects: a throw, a rejection or
// a probe that outlives the cap all read as null ("could not tell"), and only an
// exact `true` skips the alert. A failure goes to errors.log, never stdout (hook
// output matters).
export function startFocusProbe(config, event, {
  probe = probeFocus,
  capMs = FOCUS_PROBE_CAP_MS,
  isAway = () => readAwayUntil() !== null,
} = {}) {
  if (config?.suppressWhenFocused !== true) return null;
  if (isIdleReminder(event)) return null;
  let away = false;
  try { away = isAway(); } catch { away = false; }
  if (away) return null;
  let timer;
  // Not unref'd: while the probe is pending the backstop must keep the event loop alive.
  const cap = new Promise((resolve) => { timer = setTimeout(() => resolve(null), capMs); });
  const run = (async () => probe({ source: event?.source, workspace: event?.cwd }))()
    .then((v) => (v === true || v === false ? v : null))
    .catch((err) => { logHookError('focus', err); return null; });
  return Promise.race([run, cap]).finally(() => clearTimeout(timer));
}

// `focus` carries startFocusProbe's options; only tests pass it (a fake probe).
export async function main({ focus } = {}) {
  // Function-scoped, not built at the write site: the catch branch and the
  // dedup-skip / unmapped-event early exits must fall through to a plain '{}\n'
  // so a crash or a suppressed duplicate never rings. Only the fully-successful
  // claude path (after Promise.all, below) upgrades it to a terminalSequence
  // bell — which is also why claude no longer spawns bell.mjs: emitting both
  // would double-ring tmux via the TMUX_PANE pane-tty on Claude Code >=2.1.141,
  // the exact bug this path fixes.
  let responseBody = defaultResponseBody(parseArgs(process.argv).source);
  const startedAt = Date.now();
  let config;
  let event;
  try {
    const args = parseArgs(process.argv);
    const stdinData = await readStdin();

    let raw;
    try {
      // Cursor on Windows can prefix stdin with a UTF-8 BOM, which JSON.parse
      // rejects, dropping the whole payload.
      raw = JSON.parse(stdinData.replace(/^\uFEFF/, ''));
    } catch {
      raw = {};
      logHookError('stdin', new Error('malformed hook stdin JSON'), { source: args.source, bytes: stdinData.length });
    }

    event = parseInput(raw, args.source, args.event);

    // A prompt was just submitted: note the time and leave. This runs on every
    // prompt the user sends, so it comes first and touches nothing else (no
    // config, no snooze, no channels, no telemetry), and it can only ever write
    // the plain empty-object response. recordTurnStart never throws; a start
    // that could not be recorded just means that turn has no duration.
    if (event.event === 'turn_start') {
      recordTurnStart(event);
      process.stdout.write(defaultResponseBody(event.source), () => process.exit(0));
      return;
    }

    config = loadEffectiveConfig(event);
    enableSentryMirror(config.sentry);

    // An active snooze or quiet-hours window silences EVERY channel. Checked
    // before the dedup lock and before routing so a suppressed run does the
    // least possible work, and — the part that matters — falls through to the
    // plain '{}\n' response below: no toast, no ntfy, no webhook, no bell, and
    // no claude terminalSequence (which is only set on the successful path
    // further down). The update notice goes quiet with everything else; its
    // check simply runs on a later un-suppressed run.
    const suppressed = isSuppressed(config);
    if (suppressed) {
      await countRun(config, {
        outcome: suppressed.reason === 'snooze' ? 'suppressed_snooze' : 'suppressed_quiet',
        source: event.source,
        event: event.event,
      });
      await flushErrorReporting();
      process.stdout.write(defaultResponseBody(event?.source));
      process.exit(0);
    }

    // A claude Stop can fire while the turn's background subagents and shells are
    // still grinding — Claude Code's own background_tasks ledger says so. Pinging
    // "Task complete" at that moment is simply wrong, so leave exactly like the
    // suppression gate above: plain '{}\n', no channel, no terminalSequence. And
    // like it, BEFORE the dedup lock — a held-back run should do the least work
    // and must not burn the lock the real completion will need. This is expected
    // behavior, not a fault, so nothing goes to errors.log (unlike the unmapped
    // event below). Self-correcting by design: when the work drains, Claude Code
    // re-invokes the agent and its final Stop carries an empty ledger, which
    // notifies for real — no timers or bookkeeping on our side. Claude-only:
    // codex/gemini send no such field, and cursor's subagentStop -> task_complete
    // is per-subagent by design, so neither may be gated on it.
    if (event.source === 'claude' && event.event === 'task_complete' && event.hasLiveBackgroundWork) {
      await countRun(config, { outcome: 'held_back', source: event.source, event: event.event });
      await flushErrorReporting();
      process.stdout.write(defaultResponseBody(event?.source));
      process.exit(0);
    }

    // A Cursor run the user stopped themselves (status 'aborted'): they are at
    // the keyboard and "Task complete" would be false. Same quiet exit as the
    // held-back Stop above, for the same reasons (before the dedup lock, an
    // expected outcome so nothing in errors.log). An errored run is NOT skipped:
    // it goes out as "Task failed" (router.mjs).
    if (event.event === 'task_complete' && event.runStatus === 'aborted') {
      await countRun(config, { outcome: 'skipped', source: event.source, event: event.event });
      await flushErrorReporting();
      process.stdout.write(defaultResponseBody(event?.source));
      process.exit(0);
    }

    // How long the turn took, for the agents that give us both ends of it. Read
    // here, after the held-back gate (a Stop that is not the end of the turn
    // must not stamp its end) and before the dedup lock (a filtered run must not
    // burn the lock the next real alert needs). Unknown stays null: it is
    // never filtered and never shown.
    if (event.event === 'task_complete' && supportsTurnTiming(event.source)) {
      event.durationMs = finishTurn(event);
      // Completions only. needs_input (permission prompts, questions) blocks
      // the agent and never reaches this branch, whatever the threshold says.
      if (isBelowMinDuration(event.durationMs, config)) {
        // Counted as 'skipped' (an expected no-alert exit): a new outcome name
        // would widen the opt-in telemetry payload the README itemizes.
        await countRun(config, { outcome: 'skipped', source: event.source, event: event.event });
        await flushErrorReporting();
        process.stdout.write(defaultResponseBody(event?.source));
        process.exit(0);
      }
    }

    // Some claude Notification types are not alerts at all (auth_success, an
    // answered elicitation; see CLAUDE_NOTIFICATION_TYPES in router.mjs). Same
    // exit as the held-back Stop above: plain '{}\n', no channel, no bell, no
    // lock, and nothing in errors.log, because this is expected, not a fault.
    if (isSilentNotification(event)) {
      await countRun(config, { outcome: 'skipped', source: event.source, event: event.event });
      await flushErrorReporting();
      process.stdout.write(defaultResponseBody(event?.source));
      process.exit(0);
    }

    // Deduplicate AFTER parsing so the lock can key on source+event+session
    if (!acquireNotifyLock(dedupKey(event))) {
      await countRun(config, { outcome: 'duplicate', source: event.source, event: event.event });
      await flushErrorReporting();
      process.stdout.write(defaultResponseBody(event?.source));
      process.exit(0);
    }

    const notification = route(event, config);
    if (!notification) {
      // A hook fired an event we don't map to any notification. That's either
      // wiring pointed at the wrong event or a tool's new event type — say so
      // in errors.log (surfaced by `status`) instead of exiting silently.
      logHookError('router', new Error(`hook event '${event.rawEvent || '(none)'}' from ${event.source} is not mapped to a notification`), {
        rawEvent: event.rawEvent,
        source: event.source,
      });
      await countRun(config, { outcome: 'unmapped', source: event.source, rawEvent: event.rawEvent });
      await flushErrorReporting();
      process.stdout.write(defaultResponseBody(event?.source));
      process.exit(0);
    }

    // Start the focus probe now (a no-op unless suppressWhenFocused is on and
    // this is neither the idle reminder nor an away session). It is awaited
    // just before dispatch, so it still adds its delay to the alert.
    // The skip below runs after the dedup lock, so a skipped run holds the lock
    // for DEDUP_WINDOW_MS: acceptable, a double-fire is what the lock is for.
    const focusProbe = startFocusProbe(config, event, focus);

    // Check per-event overrides
    const eventConfig = config.events?.[event.event] || {};

    // Per-channel message views: for a claude task_complete/needs_input this can
    // upgrade the generic "Task complete" to the assistant's actual words, gated
    // per channel by richContent (toast/webhook default ON, ntfy default OFF for
    // privacy). Every other source/event returns the generic notification for
    // all three channels. Derivation only reads the transcript when a
    // rich-capable channel is actually enabled, so codex/cursor/gemini and
    // fully-disabled runs pay no I/O.
    const views = deriveRichViews(event, config, eventConfig, notification);

    // The user is looking at the agent's own window: they see the prompt or the
    // result already, so send nothing on any channel. Exactly `true` only; false,
    // null, a timeout and an error all fall through to the normal dispatch. Same
    // quiet exit as the gates above (plain '{}\n', no bell, no update notice) and
    // counted as 'skipped' so the telemetry outcome names stay as they were.
    if (focusProbe && (await focusProbe) === true) {
      await countRun(config, { outcome: 'skipped', source: event.source, event: event.event });
      await flushErrorReporting();
      process.stdout.write(defaultResponseBody(event?.source));
      process.exit(0);
    }

    const tasks = [];

    // Toast
    if (config.toast?.enabled !== false && eventConfig.toastEnabled !== false) {
      const sendToast = await resolveToastBackend();
      tasks.push(trackChannel('toast', sendToast(views.toast)));
    }

    // ntfy
    if (config.ntfy?.enabled && config.ntfy?.topic && eventConfig.ntfyEnabled !== false) {
      tasks.push(trackChannel('ntfy', sendNtfy(config.ntfy, views.ntfy)));
    }

    // webhook
    if (config.webhook?.enabled && config.webhook?.url && eventConfig.webhookEnabled !== false) {
      tasks.push(trackChannel('webhook', sendWebhook(config.webhook, views.webhook)));
    }

    // Terminal bell (best-effort by design: `ok: false` here usually just
    // means "no controlling terminal", so only unexpected throws are logged)
    if (config.terminalBell?.enabled !== false && eventConfig.terminalBellEnabled !== false) {
      if (event.source === 'claude') {
        // Claude Code >=2.1.141 rings via the terminalSequence set on
        // responseBody after Promise.all — its own terminal write path is
        // tmux/screen/Windows-safe. Spawning bell.mjs too would double-ring in
        // tmux. Still report `bell` as a channel result so it stays observable.
        tasks.push(trackChannel('bell', Promise.resolve(true)));
      } else {
        tasks.push(trackChannel('bell', sendBell()));
      }
    }

    const results = await Promise.all(tasks);
    // Measured here, before the update check below, so it is the time the user
    // actually waited for their notification.
    const latencyMs = Date.now() - startedAt;

    // Ring the claude bell by handing Claude Code a bare BEL to write through
    // its own terminal path (see the responseBody comment above). Same gate as
    // the bell dispatch, and only reachable on the fully-successful path — never
    // after a catch, a dedup-skip, or an unmapped event.
    if (event.source === 'claude' && config.terminalBell?.enabled !== false && eventConfig.terminalBellEnabled !== false) {
      responseBody = JSON.stringify({ terminalSequence: '\x07' }) + '\n';
    }

    // Dead last, and only after the real notification has already been
    // dispatched: announce a newly published anotifier once per version through
    // whichever channels are already on. Hits the network at most once per 24h
    // (every other run is a cached file read), is internally capped, and never
    // throws — so it can neither delay hook exit nor fail a successful run.
    await maybeNotifyUpdate(config);

    await countRun(config, { outcome: 'dispatched', source: event.source, event: event.event, channels: results, latencyMs });
  } catch (err) {
    // Never crash — hooks must not block the AI tool. But never hide it
    // either: errors.log + `status` (+ Sentry when enabled) make it visible.
    logHookError('hook', err);
    // Only the fact of a crash is counted — never its message.
    await countRun(config, { outcome: 'error', source: event?.source, event: event?.event });
  }
  await flushErrorReporting();
  // Write the hook response — normally '{}\n' (some tools, e.g. Cursor, expect
  // stdout output and may retry if they get nothing); on the successful claude
  // bell path it carries the terminalSequence set above.
  // Exit only after the write drains: on a back-pressured stdout an immediate
  // process.exit() can drop the hook response (e.g. the claude bell sequence).
  process.stdout.write(responseBody, () => process.exit(0));
}

// Only run main when invoked directly as a hook (node src/notify.mjs ...),
// not when imported by tests for unit-testing the real exported functions.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
