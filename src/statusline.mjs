#!/usr/bin/env node
// src/statusline.mjs — Claude Code statusline tap for usage-limit warnings.
//
// Claude Code allows ONE statusline command, and it is the only place the
// account's usage numbers (rate_limits.*) show up. So this script is either
// the statusline itself, printing a short "5h 42% · 7d 12%" line, or it wraps
// the user's own statusline command:
//
//   node ".../statusline.mjs" --wrap-b64 <base64 of the original command>
//
// With a wrapped command, the payload goes to that command unchanged and its
// output is what Claude Code shows; this script only taps the payload. The
// original command rides base64-encoded so no shell quoting can mangle it and
// `anotifier uninstall` can restore it exactly. The usage check lives in
// usage-alert.mjs and the context-window check in context-alert.mjs; any
// failure in either is logged and never touches the line.
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { loadConfigResult } from './config-loader.mjs';
import { isSuppressed } from './suppress.mjs';
import { checkUsage, spawnDelivery, isEntry, WINDOWS } from './usage-alert.mjs';
import { checkContext as checkContextUsage } from './context-alert.mjs';
import { logHookError } from './error-log.mjs';

export const WRAP_FLAG = '--wrap-b64';

export function encodeWrapped(command) {
  return Buffer.from(command, 'utf8').toString('base64');
}

export function decodeWrapped(argv) {
  const i = argv.indexOf(WRAP_FLAG);
  if (i === -1 || !argv[i + 1]) return null;
  try {
    const cmd = Buffer.from(argv[i + 1], 'base64').toString('utf8');
    return cmd.trim() ? cmd : null;
  } catch { return null; }
}

// The line printed when there is no wrapped command: model, then each window.
export function defaultLine(payload) {
  const parts = [];
  const model = payload?.model?.display_name;
  if (model) parts.push(model);
  for (const [key, { short }] of Object.entries(WINDOWS)) {
    const used = payload?.rate_limits?.[key]?.used_percentage;
    if (typeof used === 'number') parts.push(`${short} ${Math.round(used)}%`);
  }
  return parts.join(' · ');
}

function readStdin() {
  return new Promise((resolve) => {
    if (process.stdin.isTTY) { resolve(''); return; }
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (c) => { data += c; });
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', () => resolve(data));
  });
}

// The shell the wrapped command runs in. Claude Code on Windows runs its
// statusline through Git Bash, so a wrapped command written for bash must get
// bash here too, not cmd.exe. Elsewhere (and without Git Bash) node's default
// shell is the same one Claude Code would use.
export function wrapShell(platform = process.platform, env = process.env, exists = fs.existsSync) {
  if (platform !== 'win32') return true;
  // Git for Windows found through PATH (scoop, per-user, another drive) has
  // git.exe in <root>\cmd or <root>\bin, and bash.exe in <root>\bin.
  const fromPath = String(env.PATH || env.Path || '').split(';').filter(Boolean)
    .filter((dir) => exists(path.win32.join(dir, 'git.exe')))
    .map((dir) => path.win32.join(dir, '..', 'bin', 'bash.exe'));
  const candidates = [
    env.CLAUDE_CODE_GIT_BASH_PATH,
    env.ProgramFiles && path.join(env.ProgramFiles, 'Git', 'bin', 'bash.exe'),
    'C:\\Program Files\\Git\\bin\\bash.exe',
    ...fromPath,
  ].filter(Boolean);
  return candidates.find((p) => exists(p)) || true;
}

// Run the wrapped command through the shell with the payload on its stdin and
// its stdout/stderr passed straight through. Resolves its exit code.
function runWrapped(command, input) {
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(command, { shell: wrapShell(), stdio: ['pipe', 'inherit', 'inherit'], windowsHide: true });
    } catch (err) {
      logHookError('statusline:wrap', err);
      resolve(1);
      return;
    }
    child.on('error', (err) => { logHookError('statusline:wrap', err); resolve(1); });
    child.on('close', (code) => resolve(code ?? 0));
    child.stdin.on('error', () => {}); // a command that ignores stdin closes it early
    child.stdin.end(input);
  });
}

// Config problems are NOT logged here: the statusline refreshes constantly,
// so a typo in config.json would flood errors.log. Hooks and `status` report
// it already.
const loadQuietly = () => loadConfigResult().config;

export function tapUsage(raw, {
  load = loadQuietly,
  suppressed = isSuppressed,
  check = checkUsage,
  checkContext = checkContextUsage,
  deliver = spawnDelivery,
} = {}) {
  try {
    const payload = JSON.parse(raw);
    // Each check has its own precondition: usage needs rate_limits (Claude.ai
    // Pro/Max only), context needs the context_window block. API-key and proxy
    // sessions have the second without the first.
    const wantUsage = Boolean(payload?.rate_limits);
    const wantContext = Boolean(payload?.context_window);
    if (!wantUsage && !wantContext) return [];
    const config = load();
    const doUsage = wantUsage && config?.usageAlerts?.enabled !== false;
    const doContext = wantContext && config?.contextAlerts?.enabled !== false;
    if (!doUsage && !doContext) return [];
    // While snoozed or in quiet hours nothing is recorded either, so a
    // threshold crossed in that time is still announced once it ends.
    if (suppressed(config)) return [];
    // One failing check must neither break the other nor the statusline.
    const notifications = [];
    for (const [wanted, label, run] of [[doUsage, 'statusline', check], [doContext, 'statusline:context', checkContext]]) {
      if (!wanted) continue;
      try { notifications.push(...run(payload, config)); } catch (err) { logHookError(label, err); }
    }
    if (notifications.length) deliver(notifications);
    return notifications;
  } catch (err) {
    if (raw && raw.trim()) logHookError('statusline', err);
    return [];
  }
}

async function main() {
  const raw = await readStdin();
  const wrapped = decodeWrapped(process.argv);
  // Start the user's own statusline first so the tap never delays it.
  const running = wrapped ? runWrapped(wrapped, raw) : null;
  tapUsage(raw);
  if (running) {
    process.exitCode = await running;
    return;
  }
  let payload = null;
  try { payload = JSON.parse(raw); } catch {}
  process.stdout.write(defaultLine(payload));
}

if (isEntry(process.argv[1], import.meta.url)) {
  main();
}
