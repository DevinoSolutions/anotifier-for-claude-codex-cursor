// src/platforms/wsl.mjs — WSL-aware Windows-native toast backend.
// Under WSL the Linux notify-send stack is usually absent, but the Windows host
// is a single interop hop away, so we raise a real Windows toast by invoking
// PowerShell across the /mnt/c boundary. Detection and delivery are both
// best-effort: every probe is guarded and any failure resolves to "unavailable"
// rather than throwing into the hook path.
import { execFile, execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import fs from 'node:fs';
import { logHookError } from '../error-log.mjs';

// --- Detection -------------------------------------------------------------

function readFileGuarded(readFile, file) {
  try { return String(readFile(file) || ''); } catch { return ''; }
}

function existsGuarded(existsSync, file) {
  try { return Boolean(existsSync(file)); } catch { return false; }
}

// deps are injectable so the truth table stays deterministic no matter what host
// runs it — including a real WSL shell, where process env and /proc would
// otherwise leak in and flip cases. Defaults are the real os/fs primitives.
export function isWsl(deps = {}) {
  const {
    platform = os.platform,
    release = os.release,
    readFile = (file) => fs.readFileSync(file, 'utf8'),
    existsSync = fs.existsSync,
    env = process.env,
  } = deps;

  // WSL is a Linux userland; nothing else can be it. Gate first so we never
  // touch /proc on Windows/macOS.
  let plat = '';
  try { plat = platform(); } catch { plat = ''; }
  if (plat !== 'linux') return false;

  // Docker Desktop runs its Linux engine on the same microsoft-tagged WSL2
  // kernel, so a container would otherwise look like WSL — bail on the container
  // markers before any positive signal.
  if (existsGuarded(existsSync, '/.dockerenv')) return false;
  if (existsGuarded(existsSync, '/run/.containerenv')) return false;

  // Primary signal (matches is-wsl): the microsoft tag in the kernel banner.
  let rel = '';
  try { rel = String(release() || ''); } catch { rel = ''; }
  if (rel.toLowerCase().includes('microsoft')) return true;
  if (readFileGuarded(readFile, '/proc/version').toLowerCase().includes('microsoft')) return true;

  // Custom kernels can drop the microsoft tag while WSL still exports its interop
  // env and marker files — treat those as authoritative fallbacks.
  if (env && (env.WSL_INTEROP || env.WSL_DISTRO_NAME)) return true;
  if (existsGuarded(existsSync, '/proc/sys/fs/binfmt_misc/WSLInterop')) return true;
  if (existsGuarded(existsSync, '/run/WSL')) return true;

  return false;
}

// --- Delivery --------------------------------------------------------------

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TOAST_SCRIPT = path.join(__dirname, '..', '..', 'assets', 'windows', 'toast-wsl.ps1');

// 7s mirrors the native Windows backend: the host hook budget is 10s total and
// the toast subprocess must never be the thing that blows it (cold interop start
// is a documented 600ms–2.5s).
const TOAST_TIMEOUT_MS = 7000;

// Probed in order on the first send; the winner is cached module-level so steady
// state is a single spawn. Absolute /mnt/c paths first (no PATH lookup), then
// bare names for setups where appendWindowsPath keeps interop on PATH.
const EXE_CANDIDATES = [
  '/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe',
  'powershell.exe',
  '/mnt/c/Program Files/PowerShell/7/pwsh.exe',
  'pwsh.exe',
];

let cachedExe = null;
let cachedWinPath = null;

function toWindowsPath(linuxPath) {
  return new Promise((resolve) => {
    try {
      execFile('wslpath', ['-w', linuxPath], { timeout: TOAST_TIMEOUT_MS }, (err, stdout) => {
        if (err) return resolve(null);
        const out = String(stdout || '').trim();
        resolve(out || null);
      });
    } catch {
      resolve(null);
    }
  });
}

// Resolves { ok, err, stderr } so a total failure can say why in errors.log.
function runToast(exe, winPath, title, message) {
  return new Promise((resolve) => {
    try {
      // -File + typed param() binding only — never -Command/-EncodedCommand,
      // which tripped an EDR false-positive against Codex when spawned from WSL.
      const args = [
        '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
        '-WindowStyle', 'Hidden', '-File', winPath,
        '-Title', title, '-Message', message,
      ];
      execFile(exe, args, { timeout: TOAST_TIMEOUT_MS }, (err, stdout, stderr) => {
        resolve({ ok: !err, err, stderr: String(stderr || '').slice(0, 400) });
      });
    } catch (err) {
      resolve({ ok: false, err, stderr: '' });
    }
  });
}

// `log` is injectable so tests can assert the failure record without writing
// to the real ~/.anotifier/errors.log.
export async function sendToast(notification, { log = logHookError } = {}) {
  const title = String(notification?.title ?? '');
  const message = String(notification?.message ?? '');

  // The script path is constant; translate once to its \\wsl.localhost\... UNC.
  if (!cachedWinPath) cachedWinPath = await toWindowsPath(TOAST_SCRIPT);
  if (!cachedWinPath) {
    log('toast:wsl', new Error('wslpath could not translate the toast script path'), { script: TOAST_SCRIPT });
    return false;
  }

  if (cachedExe) {
    const r = await runToast(cachedExe, cachedWinPath, title, message);
    if (!r.ok) log('toast:wsl', r.err, { exe: cachedExe, stderr: r.stderr });
    return r.ok;
  }

  // First send: walk the probe chain and cache the first exe that fires. A
  // missing exe or disabled interop just errors (ENOENT/timeout); we move on,
  // and only when every candidate failed is one error logged, naming each.
  const tried = [];
  for (const exe of EXE_CANDIDATES) {
    const r = await runToast(exe, cachedWinPath, title, message);
    if (r.ok) {
      cachedExe = exe;
      return true;
    }
    tried.push({ exe, error: (r.err && (r.err.code || r.err.message)) || 'failed', stderr: r.stderr || undefined });
  }
  log('toast:wsl', new Error('no Windows PowerShell reachable through WSL interop'), { tried });
  return false;
}

// For `anotifier doctor` and setup: the first PowerShell the toast path would
// try that exists, without firing anything. Absolute /mnt/c paths are checked on
// disk; bare names are looked up on PATH (interop appends the Windows PATH).
export function findWslPowerShell({ existsSync = fs.existsSync, onPath = whichSync } = {}) {
  for (const exe of EXE_CANDIDATES) {
    const found = exe.startsWith('/') ? existsGuarded(existsSync, exe) : onPath(exe);
    if (found) return exe;
  }
  return null;
}

function whichSync(bin) {
  try { execFileSync('which', [bin], { stdio: 'ignore', timeout: 5000 }); return true; }
  catch { return false; }
}
