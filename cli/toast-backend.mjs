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

// Mutates config.toast according to what setup found. Returns
// 'disabled' | 'enabled' | null so the caller can print the matching line.
//   backend missing, toasts on            -> off + flag
//   backend missing, already off          -> unchanged (the user's choice, or ours)
//   backend ready, off AND flag is set    -> back on, flag cleared
//   backend ready, off without the flag   -> unchanged (the user turned it off)
export function applyToastBackendResult(config, toastReady) {
  if (!config.toast || typeof config.toast !== 'object') config.toast = {};
  const toast = config.toast;
  if (!toastReady) {
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
