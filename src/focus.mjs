// src/focus.mjs -- is the agent's own terminal or editor window the foreground window?
//
// isAgentWindowFocused() answers true, false or null. The caller skips the alert
// on true. null means "could not tell" (unsupported platform, probe tool missing,
// timeout, garbage output, any error) and callers must treat it like false, so a
// failed probe never costs the user an alert. The function never throws and never
// outlives timeoutMs; a probe still running at the deadline is killed.
//
// "The agent's window" is found the way click-to-focus finds it (assets/windows/
// toast.ps1, Get-AncestorWindowHandle): through the process tree. The window
// that owns the agent's terminal is the one whose process is an ancestor of this
// process. So the rule on every platform with a process tree is
//
//   foreground window's process is an ancestor of this process  =>  true
//
// - Windows: assets/windows/foreground.ps1 returns the foreground pid and this
//   process's ancestor chain from one Toolhelp32 snapshot. A console window
//   owned by conhost.exe/OpenConsole.exe counts when that host's parent is in
//   the chain. Shell and taskbar windows (explorer.exe) never count even though
//   a process started from Explorer has it as an ancestor.
// - Linux X11: `xdotool getactivewindow getwindowpid`, then the ancestor check
//   over one `ps` listing. Wayland (and XWayland sessions) return null: there is
//   no portable way to ask for the focused window.
// - macOS: `lsappinfo front` + `lsappinfo info -only bundleid`, compared with the
//   terminal app named by __CFBundleIdentifier (or TERM_PROGRAM as a fallback).
//   lsappinfo needs no Automation/Accessibility permission, unlike osascript
//   against System Events, which would pop a permission prompt.
// - WSL: powershell.exe (interop) reports the Windows foreground window. The
//   Linux pid tree means nothing to Windows, so the image is compared with the
//   host named by the environment: WT_SESSION => WindowsTerminal.exe,
//   TERM_PROGRAM=vscode => a VS Code family editor.
//
// Editors are the exception to "the process owns one window": one VS Code or
// Cursor process owns every window of that instance. When `workspace` is given
// and the host is an editor, the window title must also contain the workspace
// folder name. macOS cannot read window titles without a permission prompt, so
// an editor host there is null rather than a guess.
//
// Always null: under tmux, screen or zellij (the multiplexer's active pane is
// not the OS focus, and there is no cheap correct way to ask for it) and over
// ssh (the agent's machine is not the machine the user is looking at).
//
// Known limit: a terminal with several tabs or panes (Windows Terminal, iTerm)
// is one window, so a different tab of the same terminal counts as focused.
import { execFile } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isWsl as realIsWsl } from './platforms/wsl.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FOREGROUND_SCRIPT = path.join(__dirname, '..', 'assets', 'windows', 'foreground.ps1');

// The generic budget. Windows gets more: powershell.exe needs ~270 ms for an
// empty script and 400-500 ms once Add-Type has compiled the P/Invoke shim, so
// 400 ms would time out on most runs. An explicit timeoutMs always wins.
export const DEFAULT_TIMEOUT_MS = 400;
export const WINDOWS_TIMEOUT_MS = 1200;

const MULTIPLEXER_ENV = ['TMUX', 'STY', 'ZELLIJ'];
const SSH_ENV = ['SSH_CONNECTION', 'SSH_CLIENT', 'SSH_TTY'];

// Lowercase image names without ".exe". One process owns many windows.
const EDITOR_HOSTS = new Set([
  'code', 'code - insiders', 'code-insiders', 'cursor', 'windsurf', 'vscodium', 'codium', 'antigravity',
]);
const WINDOWS_TERMINAL_HOSTS = new Set(['windowsterminal']);
const CONSOLE_HOSTS = new Set(['conhost', 'openconsole']);
// Foreground windows that are never the agent's window, whatever the ancestry.
const SHELL_WINDOWS = new Set([
  'explorer', 'searchhost', 'searchapp', 'startmenuexperiencehost', 'shellexperiencehost',
  'lockapp', 'logonui', 'dwm',
]);

const MAC_BUNDLES_BY_TERM_PROGRAM = {
  Apple_Terminal: ['com.apple.terminal'],
  'iTerm.app': ['com.googlecode.iterm2'],
  WarpTerminal: ['dev.warp.warp-stable', 'dev.warp.warp'],
  ghostty: ['com.mitchellh.ghostty'],
  WezTerm: ['com.github.wez.wezterm'],
  Hyper: ['co.zeit.hyper'],
  alacritty: ['org.alacritty'],
  kitty: ['net.kovidgoyal.kitty'],
  vscode: ['com.microsoft.vscode', 'com.microsoft.vscodeinsiders', 'com.todesktop.230313mzl4w4u92', 'com.exafunction.windsurf', 'com.vscodium'],
};
const MAC_EDITOR_BUNDLES = new Set(MAC_BUNDLES_BY_TERM_PROGRAM.vscode);

function defaultExec(file, args, { timeout, signal } = {}) {
  return new Promise((resolve, reject) => {
    execFile(
      file, args,
      { timeout, signal, killSignal: 'SIGKILL', windowsHide: true, encoding: 'utf8', maxBuffer: 1 << 20 },
      (err, stdout) => (err ? reject(err) : resolve(stdout)),
    );
  });
}

function imageKey(name) {
  return String(name || '').trim().toLowerCase().replace(/\.exe$/, '');
}

function baseName(p) {
  const parts = String(p || '').split(/[\\/]+/).filter(Boolean);
  return parts.length ? parts[parts.length - 1] : '';
}

// null when there is no workspace name to look for.
function titleHasWorkspace(title, workspace) {
  const leaf = baseName(workspace).toLowerCase();
  if (!leaf) return null;
  return String(title || '').toLowerCase().includes(leaf);
}

function parsePid(text) {
  const m = /^\s*(\d+)\s*$/.exec(String(text || ''));
  const n = m ? Number(m[1]) : 0;
  return n > 0 ? n : null;
}

// --- Windows (and WSL's Windows side) ----------------------------------------

// foreground.ps1 output -> { fg: {pid, name, ppid, title}, chain: [{pid, name}] },
// or null when there is no usable FG line.
function parseForeground(stdout) {
  let fg = null;
  const chain = [];
  for (const line of String(stdout || '').split(/\r?\n/)) {
    const f = line.split('\t');
    if (f[0] === 'FG' && f.length >= 5) {
      const pid = parsePid(f[1]);
      if (pid) fg = { pid, name: f[2], ppid: parsePid(f[3]), title: f.slice(4).join('\t') };
    } else if (f[0] === 'CHAIN' && f.length >= 3) {
      const pid = parsePid(f[1]);
      if (pid) chain.push({ pid, name: f[2] });
    }
  }
  return fg ? { fg, chain } : null;
}

function decideByAncestry({ fg, chain }, workspace) {
  const name = imageKey(fg.name);
  if (SHELL_WINDOWS.has(name)) return false;
  if (chain.length === 0) return null; // no ancestry to compare against
  const inChain = (pid) => pid != null && chain.some((c) => c.pid === pid);
  const hosted = inChain(fg.pid) || (CONSOLE_HOSTS.has(name) && inChain(fg.ppid));
  if (!hosted) return false;
  if (workspace && EDITOR_HOSTS.has(name)) return titleHasWorkspace(fg.title, workspace);
  return true;
}

// WSL: the Linux pid tree is invisible to Windows, so go by the host named in env.
function decideWslHost({ fg }, env, workspace) {
  const name = imageKey(fg.name);
  if (SHELL_WINDOWS.has(name)) return false;
  if (env.WT_SESSION) return WINDOWS_TERMINAL_HOSTS.has(name);
  if (env.TERM_PROGRAM === 'vscode') {
    if (!EDITOR_HOSTS.has(name)) return false;
    return workspace ? titleHasWorkspace(fg.title, workspace) : true;
  }
  return null; // no way to know which Windows app hosts this shell
}

const POWERSHELL_NATIVE = ['powershell.exe', 'pwsh.exe'];
// Same probe order as the WSL toast backend (src/platforms/wsl.mjs).
const POWERSHELL_WSL = [
  '/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe',
  'powershell.exe',
  '/mnt/c/Program Files/PowerShell/7/pwsh.exe',
  'pwsh.exe',
];

async function probeWindows({ run, env, workspace, pid, viaWsl }) {
  let script = FOREGROUND_SCRIPT;
  if (viaWsl) script = String((await run('wslpath', ['-w', FOREGROUND_SCRIPT])) || '').trim();
  if (!script) return null;
  // -File with typed params only, never -Command/-EncodedCommand (EDR heuristics).
  const args = [
    '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden',
    '-File', script, '-StartPid', String(viaWsl ? 0 : pid),
  ];
  for (const exe of viaWsl ? POWERSHELL_WSL : POWERSHELL_NATIVE) {
    let stdout;
    try {
      stdout = await run(exe, args);
    } catch (err) {
      if (err?.timedOut) throw err;
      continue; // not installed or interop off: try the next candidate
    }
    const parsed = parseForeground(stdout);
    if (!parsed) return null;
    return viaWsl ? decideWslHost(parsed, env, workspace) : decideByAncestry(parsed, workspace);
  }
  return null;
}

// --- Linux X11 ----------------------------------------------------------------

// `ps -e -o pid=,ppid=,comm=` -> Map(pid -> {ppid, comm}).
function parsePs(stdout) {
  const table = new Map();
  for (const line of String(stdout || '').split(/\r?\n/)) {
    const m = /^\s*(\d+)\s+(\d+)\s+(.*?)\s*$/.exec(line);
    if (m) table.set(Number(m[1]), { ppid: Number(m[2]), comm: m[3] });
  }
  return table;
}

function ancestorsOf(table, start) {
  const chain = [];
  const seen = new Set();
  for (let id = start, i = 0; id > 0 && table.has(id) && !seen.has(id) && i < 64; i++) {
    seen.add(id);
    chain.push(id);
    id = table.get(id).ppid;
  }
  return chain;
}

async function probeLinuxX11({ run, env, workspace, pid }) {
  if (env.WAYLAND_DISPLAY || String(env.XDG_SESSION_TYPE || '').toLowerCase() === 'wayland') return null;
  if (!env.DISPLAY) return null;
  const [activePid, psOut] = await Promise.all([
    run('xdotool', ['getactivewindow', 'getwindowpid']),
    run('ps', ['-e', '-o', 'pid=,ppid=,comm=']),
  ]);
  const fgPid = parsePid(activePid);
  const table = parsePs(psOut);
  if (!fgPid || table.size === 0) return null;
  const chain = ancestorsOf(table, pid);
  if (chain.length === 0) return null;
  if (!chain.includes(fgPid)) return false;
  if (workspace && EDITOR_HOSTS.has(imageKey(table.get(fgPid)?.comm))) {
    return titleHasWorkspace(await run('xdotool', ['getactivewindow', 'getwindowname']), workspace);
  }
  return true;
}

// --- macOS --------------------------------------------------------------------

async function probeMac({ run, env }) {
  const expected = new Set();
  const own = String(env.__CFBundleIdentifier || '').toLowerCase();
  if (own) expected.add(own);
  else for (const id of MAC_BUNDLES_BY_TERM_PROGRAM[env.TERM_PROGRAM] || []) expected.add(id);
  if (expected.size === 0) return null;

  const asn = /ASN:\S+?:/.exec(await run('lsappinfo', ['front']));
  if (!asn) return null;
  const info = /"CFBundleIdentifier"\s*=\s*"([^"]+)"/.exec(await run('lsappinfo', ['info', '-only', 'bundleid', asn[0]]));
  if (!info) return null;
  const front = info[1].toLowerCase();

  if (!expected.has(front)) return false;
  // An editor owns many windows and titles are not readable without a prompt.
  if (MAC_EDITOR_BUNDLES.has(front)) return null;
  return true;
}

// --- Entry point --------------------------------------------------------------

function timedOutError() {
  const err = new Error('focus probe timed out');
  err.timedOut = true;
  return err;
}

/**
 * @returns {Promise<boolean|null>} true: the agent's own window is in the
 *   foreground; false: something else is; null: unknown (treat as not focused).
 *   Never rejects and never takes longer than timeoutMs.
 */
export async function isAgentWindowFocused({
  platform = process.platform,
  env = process.env,
  source, // accepted so callers have a stable shape; detection does not depend on it yet
  workspace,
  timeoutMs,
  exec = defaultExec,
  pid = process.pid,
  isWsl,
} = {}) {
  void source;
  const e = env || {};
  if (MULTIPLEXER_ENV.some((k) => e[k]) || SSH_ENV.some((k) => e[k])) return null;

  const wsl = platform === 'linux'
    && (typeof isWsl === 'function' ? isWsl() : typeof isWsl === 'boolean' ? isWsl : realIsWsl({ platform: () => platform, env: e }));
  const native = platform === 'win32' ? 'windows' : platform === 'darwin' ? 'mac' : platform === 'linux' ? 'linux' : null;
  if (!native) return null;

  const budget = Number.isFinite(timeoutMs) && timeoutMs > 0
    ? timeoutMs
    : (platform === 'win32' || wsl ? WINDOWS_TIMEOUT_MS : DEFAULT_TIMEOUT_MS);
  const deadline = Date.now() + budget;
  const controller = new AbortController();
  const run = async (file, args) => {
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw timedOutError();
    const out = await exec(file, args, { timeout: remaining, signal: controller.signal });
    return typeof out === 'string' ? out : String(out?.stdout ?? '');
  };
  const ctx = { run, env: e, workspace: workspace ? String(workspace) : '', pid };

  let timer;
  const deadlineHit = new Promise((resolve) => {
    timer = setTimeout(() => { controller.abort(); resolve(null); }, budget);
  });
  const probe = (async () => {
    if (wsl) return probeWindows({ ...ctx, viaWsl: true });
    if (native === 'windows') return probeWindows({ ...ctx, viaWsl: false });
    if (native === 'mac') return probeMac(ctx);
    return probeLinuxX11(ctx);
  })().then((v) => (v === true || v === false ? v : null), () => null);

  try {
    return await Promise.race([probe, deadlineHit]);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}
