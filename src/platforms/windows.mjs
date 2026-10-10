// src/platforms/windows.mjs
import { execFile } from 'node:child_process';
import { platform } from 'node:process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { logHookError } from '../error-log.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TOAST_SCRIPT = path.join(__dirname, '..', '..', 'assets', 'windows', 'toast.ps1');

// 7s: the host hook budget is 10s total (hooks.json), shared with stdin read
// and the other channels — the toast subprocess must never be the thing that
// blows that budget.
const TOAST_TIMEOUT_MS = 7000;

// What to record next to a failed toast. execFile's own message is just
// "Command failed: <cmd>", which reads the same for a timeout kill, a non-zero
// exit and a missing pwsh, so the cause is spelled out here.
export function toastFailureDetail(err, stderr, elapsedMs, timeoutMs = TOAST_TIMEOUT_MS) {
  const timedOut = Boolean(err?.killed) && elapsedMs >= timeoutMs;
  let cause;
  if (timedOut) cause = `timed out after ${timeoutMs} ms`;
  else if (err?.code === 'ENOENT') cause = 'pwsh not found';
  else if (typeof err?.code === 'number') cause = `exit code ${err.code}`;
  else if (err?.signal) cause = `killed by ${err.signal}`;
  else cause = 'unknown';
  return {
    cause,
    exitCode: err?.code ?? null,
    signal: err?.signal ?? null,
    elapsedMs: Math.round(elapsedMs),
    stderr: (stderr || '').slice(0, 400),
  };
}

export async function sendToast(notification) {
  if (platform !== 'win32') return false;
  return new Promise((resolve) => {
    const args = [
      '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', TOAST_SCRIPT,
      '-Title', notification.title,
      '-Message', notification.message,
      '-Sound', notification.toastSound || 'Default',
      '-ClickToFocus', notification.clickToFocus === false ? 'false' : 'true',
    ];

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
    execFile('pwsh', args, { timeout: TOAST_TIMEOUT_MS, windowsHide: true }, (err, stdout, stderr) => {
      if (err) {
        // The first line of the message is what `anotifier status` prints, so
        // it names the cause; execFile's "Command failed: <cmd>" goes to extra.
        const detail = toastFailureDetail(err, stderr, Date.now() - started);
        const logged = new Error(`toast.ps1 failed: ${detail.cause}`);
        logged.stack = err.stack;
        logHookError('toast:windows', logged, { ...detail, command: String(err.message || '').split('\n')[0].slice(0, 300) });
      }
      resolve(!err);
    });
  });
}
