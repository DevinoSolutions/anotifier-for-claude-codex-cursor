// What to do when a machine has no toast backend. Setup turns the toast channel
// off (and remembers it did, via toast.disabledBySetup) so a channel that can
// only fail is not left on; re-running setup turns it back on once the backend
// exists. status and doctor read the same flag so they can say why toasts are off.

// The "is this command on PATH?" probe lives in src/ so the WSL backend can use
// it too; setup and doctor import it from here.
export { probeBinary, isProbeTimeout } from '../src/probe-binary.mjs';

// Everything the CLI says about a platform, keyed by toastPlatform(): setup and
// status name it (label), status names its toast backend (toast), and setup and
// status/doctor say what to install when toasts are off (installHint). WSL sends
// a Windows toast through interop, so it must not be reported as notify-send.
export const PLATFORM_INFO = {
  win32: {
    label: 'Windows',
    toast: 'BurntToast',
    installHint: 'install PowerShell 7: winget install --id Microsoft.PowerShell --source winget',
  },
  darwin: {
    label: 'macOS',
    toast: 'osascript',
    installHint: 'osascript ships with macOS',
  },
  wsl: {
    label: 'WSL',
    toast: 'Windows toast (WSL interop)',
    installHint: 'enable Windows interop ([interop] enabled=true in /etc/wsl.conf) so powershell.exe is reachable',
  },
  linux: {
    label: 'Linux',
    toast: 'notify-send',
    installHint: 'install libnotify (notify-send), e.g. sudo apt install libnotify-bin',
  },
};

const hintFor = (platform) => (PLATFORM_INFO[platform] || PLATFORM_INFO.linux).installHint;

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
