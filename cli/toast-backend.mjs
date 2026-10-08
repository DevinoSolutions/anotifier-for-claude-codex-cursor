import { execFileSync } from 'node:child_process';

// What to do when a machine has no toast backend. Setup turns the toast channel
// off (and remembers it did, via toast.disabledBySetup) so a channel that can
// only fail is not left on; re-running setup turns it back on once the backend
// exists. status and doctor read the same flag so they can say why toasts are off.

// Per-platform "what to install" line. Keyed by toastPlatform().
export const TOAST_INSTALL_HINT = {
  win32: 'install PowerShell 7: winget install --id Microsoft.PowerShell --source winget',
  wsl: 'enable Windows interop ([interop] enabled=true in /etc/wsl.conf) so powershell.exe is reachable',
  linux: 'install libnotify (notify-send), e.g. sudo apt install libnotify-bin',
  darwin: 'osascript ships with macOS',
};

const hintFor = (platform) => TOAST_INSTALL_HINT[platform] || TOAST_INSTALL_HINT.linux;

// True when the toast channel was switched off by setup, not by the user.
export function toastOffBySetup(config) {
  return config?.toast?.enabled === false && config.toast.disabledBySetup === true;
}

// "off, no backend (<what to install>)" for status and doctor; null when toasts
// are not off because of setup.
export function toastOffNoBackendLabel(config, platform) {
  if (!toastOffBySetup(config)) return null;
  return `off, no backend (${hintFor(platform)})`;
}

// toastReady is true (backend found), false (definitely missing) or null (the
// probe could not tell, e.g. it timed out). null never changes the config.
// Mutates config.toast according to what setup found. Returns
// 'disabled' | 'enabled' | null so the caller can print the matching line.
//   backend unknown (timeout)             -> unchanged
//   backend missing, toasts on            -> off + flag (also when a stale flag is
//                                            still set: it goes back off, flag kept)
//   backend missing, already off          -> unchanged (the user's choice, or ours)
//   backend ready, off AND flag is set    -> back on, flag cleared
//   backend ready, off without the flag   -> unchanged (the user turned it off)
export function applyToastBackendResult(config, toastReady) {
  if (toastReady === null) return null;
  if (!config.toast || typeof config.toast !== 'object') config.toast = {};
  const toast = config.toast;
  if (toastReady === false) {
    if (toast.enabled === false) return null;
    toast.enabled = false;
    toast.disabledBySetup = true;
    return 'disabled';
  }
  if (toast.disabledBySetup === true) {
    delete toast.disabledBySetup;
    if (toast.enabled === false) { toast.enabled = true; return 'enabled'; }
  }
  return null;
}

// A probe that timed out (or was killed) says nothing about whether the backend
// exists, so it must never be read as "missing".
export function isProbeTimeout(err) {
  return Boolean(err && (err.killed || err.code === 'ETIMEDOUT' || err.signal));
}

// Is `bin` on PATH? 'found' | 'missing' | 'unknown'. Goes through `command -v`
// in /bin/sh because the `which` binary is absent on some distros even when the
// tool itself is installed. Only a clean "not found" exit is 'missing'; a
// timeout or a shell that cannot start is 'unknown'.
export function probeCommand(bin, run = execFileSync) {
  try {
    run('/bin/sh', ['-c', 'command -v "$1"', 'sh', bin], { stdio: 'ignore', timeout: 10000 });
    return 'found';
  } catch (err) {
    if (isProbeTimeout(err) || typeof err?.status !== 'number') return 'unknown';
    return 'missing';
  }
}
