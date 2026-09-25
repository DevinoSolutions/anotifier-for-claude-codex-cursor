// src/platforms/index.mjs — Single owner of platform → toast-backend selection.
// Imported by the hook path (notify.mjs), the CLI test command, and the demo
// script so all three always dispatch identically.
import os from 'node:os';
import { isWsl as realIsWsl } from './wsl.mjs';

// Which toast path this machine uses: 'win32' | 'darwin' | 'wsl' | 'linux'.
// WSL is a Linux userland but reaches the user through a Windows-native toast,
// so setup, status and doctor must describe it as its own platform rather than
// warn about notify-send. isWsl is injected so callers stay deterministic even
// when the suite itself runs inside WSL. Unknown platforms fall back to linux.
export function toastPlatform(platform = os.platform(), { isWsl = realIsWsl } = {}) {
  if (platform === 'win32' || platform === 'darwin') return platform;
  if (platform === 'linux' && isWsl()) return 'wsl';
  return 'linux';
}

export async function resolveToastBackend(platform = os.platform(), deps = {}) {
  const target = toastPlatform(platform, deps);
  if (target === 'win32') return (await import('./windows.mjs')).sendToast;
  if (target === 'darwin') return (await import('./macos.mjs')).sendToast;
  if (target === 'wsl') return (await import('./wsl.mjs')).sendToast;
  return (await import('./linux.mjs')).sendToast;
}
