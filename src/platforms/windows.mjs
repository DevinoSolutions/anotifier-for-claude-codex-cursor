// src/platforms/windows.mjs
import { execFile } from 'node:child_process';
import { platform } from 'node:process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { logHookError } from '../error-log.mjs';
import { execFailureReason, noteFailure } from '../channel-failure.mjs';
import { PLAY_SCRIPT, isSoundFilePath, playFirst, prepareSoundFile, windowsPlayerArgs } from './sound.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TOAST_SCRIPT = path.join(__dirname, '..', '..', 'assets', 'windows', 'toast.ps1');

// 7s: the host hook budget is 10s total (hooks.json), shared with stdin read
// and the other channels — the toast subprocess must never be the thing that
// blows that budget.
const TOAST_TIMEOUT_MS = 7000;

// What to record next to a failed toast. execFile's own message is just
// "Command failed: <cmd>", which reads the same for a timeout kill, a non-zero
// exit and a missing pwsh, so the cause is spelled out here.
//
// err.killed is only set when Node itself killed the child, and sendToast only
// does that on the timeout, so killed alone means timed out. Comparing elapsed
// time against the timeout would misread a timer that fires a millisecond early.
export function toastFailureDetail(err, stderr, elapsedMs, timeoutMs = TOAST_TIMEOUT_MS) {
  let cause;
  if (err?.killed) cause = `timed out after ${timeoutMs} ms`;
  else if (err?.code === 'ENOENT') cause = 'pwsh not found';
  else if (typeof err?.code === 'number') cause = `exit code ${err.code}`;
  else if (typeof err?.code === 'string' && err.code) cause = err.code;
  else if (err?.signal) cause = `killed by ${err.signal}`;
  else cause = 'unknown';
  return {
    cause,
    exitCode: typeof err?.code === 'number' ? err.code : null,
    signal: err?.signal ?? null,
    elapsedMs: Math.round(elapsedMs),
    stderr: (stderr || '').slice(0, 400),
  };
}

// deps are injectable for tests: the platform, execFile, the spawn that starts
// the sound player, and the error logger.
export async function sendToast(notification, deps = {}) {
  const { platform: host = platform, execFileImpl = execFile, log = logHookError, ...soundDeps } = deps;
  if (host !== 'win32') {
    noteFailure('toast', 'unsupported');
    return false;
  }

  // A custom sound file plays in its own detached pwsh and the toast is made
  // silent; if the file is unusable or the player cannot start, the toast keeps
  // the default sound.
  const file = prepareSoundFile(notification.toastSound, 'toast:windows', { log, ...soundDeps });
  const playing = file
    ? await playFirst([['pwsh', windowsPlayerArgs(PLAY_SCRIPT, file)]], 'toast:windows', { log, windowsHide: true, ...soundDeps })
    : false;
  // A path is never a BurntToast sound name, so it never goes into -Sound.
  const sound = isSoundFilePath(notification.toastSound) ? 'Default' : (notification.toastSound || 'Default');

  return new Promise((resolve) => {
    const args = [
      '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', TOAST_SCRIPT,
      '-Title', notification.title,
      '-Message', notification.message,
      '-Sound', sound,
      '-ClickToFocus', notification.clickToFocus === false ? 'false' : 'true',
    ];
    if (playing) args.push('-Silent', 'true');

    if (notification.projectName) {
      args.push('-ProjectName', notification.projectName);
    }

    if (notification.cwd) {
      args.push('-Cwd', notification.cwd);
    }

    if (notification.source) {
      args.push('-Source', notification.source);
    }

    // windowsHide: a caller with no console of its own (the detached usage-alert
    // sender) would otherwise get a visible PowerShell window flashing up.
    const started = Date.now();
    execFileImpl('pwsh', args, { timeout: TOAST_TIMEOUT_MS, windowsHide: true }, (err, stdout, stderr) => {
      if (err) {
        // The first line of the message is what `anotifier status` prints, so
        // it names the cause; execFile's "Command failed: <cmd>" goes to extra.
        const detail = toastFailureDetail(err, stderr, Date.now() - started);
        // The original stack is not copied: its first line repeats the whole
        // command line, which extra.command already keeps once.
        const logged = new Error(`toast.ps1 failed: ${detail.cause}`);
        log('toast:windows', logged, { ...detail, command: String(err.message || '').split('\n')[0].slice(0, 300) });
        noteFailure('toast', execFailureReason(err));
      }
      resolve(!err);
    });
  });
}
