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
// `anotifier uninstall` can restore it exactly. The usage check itself lives
// in usage-alert.mjs; any failure in it is logged and never touches the line.
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { loadConfig } from './config-loader.mjs';
import { isSuppressed } from './suppress.mjs';
import { checkUsage, spawnDelivery, WINDOWS } from './usage-alert.mjs';
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
  const candidates = [
    env.CLAUDE_CODE_GIT_BASH_PATH,
    env.ProgramFiles && path.join(env.ProgramFiles, 'Git', 'bin', 'bash.exe'),
    'C:\\Program Files\\Git\\bin\\bash.exe',
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

export function tapUsage(raw, { load = loadConfig, suppressed = isSuppressed, check = checkUsage, deliver = spawnDelivery } = {}) {
  try {
    const payload = JSON.parse(raw);
    if (!payload?.rate_limits) return [];
    const config = load();
    if (config?.usageAlerts?.enabled === false) return [];
    // While snoozed or in quiet hours nothing is recorded either, so a
    // threshold crossed in that time is still announced once it ends.
    if (suppressed(config)) return [];
    const notifications = check(payload, config);
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

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
