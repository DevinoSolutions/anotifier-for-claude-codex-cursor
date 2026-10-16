// src/focus.mjs -- is the agent's own terminal or editor window the foreground window?
//
// isAgentWindowFocused() answers true, false or null. The caller skips the alert
// on true. null means "could not tell" (unsupported platform, probe tool missing,
// timeout, garbage output, any error) and callers must treat it like false, so a
// failed probe never costs the user an alert. A wrong true is the expensive
// mistake (it swallows an alert), so every doubt resolves to false or null. The
// function never throws and never outlives timeoutMs; a probe still running at
// the deadline is killed.
//
// "The agent's window" is found the way click-to-focus finds it (assets/windows/
// toast.ps1, Get-AncestorWindowHandle): through the process tree. Walk up from
// this process and stop at the FIRST ancestor that owns a visible top-level
// window. That ancestor is the agent's window. Whatever launched it (a terminal
// started from Chrome, say) is above it and never counts. The walk also stops
// when a parent was created after its child, which means the parent pid was
// reused by an unrelated process. The walk also stops at a WindowsTerminal.exe
// that shows no window (quake mode, hidden to the tray): the answer is then null,
// not a climb to whatever launched the terminal. Then:
//
//   foreground window's process == that first window-owning ancestor  =>  true
//
// - Windows: assets/windows/foreground.ps1 returns the foreground window and the
//   owner from one Toolhelp32 snapshot, with creation times from GetProcessTimes.
//   A classic console window is owned by conhost.exe, so a conhost/OpenConsole
//   child of an ancestor counts as that ancestor's window. explorer.exe and other
//   shell windows never count. The shim is emitted with System.Reflection.Emit
//   (no csc.exe, no temp files).
// - Linux X11: `xdotool getactivewindow getwindowpid`; the owner is the first
//   ancestor (from `ps`, with the same pid-reuse guard using etimes) that has a
//   visible window per `xdotool search --onlyvisible --pid`. Wayland (and
//   XWayland sessions) return null: there is no portable way to ask for the
//   focused window.
// - macOS: `lsappinfo front` + `lsappinfo info -only bundleid`, compared with the
//   terminal app named by __CFBundleIdentifier (or TERM_PROGRAM as a fallback).
//   When both are set and disagree, null. lsappinfo needs no Automation or
//   Accessibility permission, unlike osascript against System Events.
// - WSL: powershell.exe (interop) reports the Windows foreground window. The
//   Linux pid tree means nothing to Windows, so the image is compared with the
//   host named by the environment. TERM_PROGRAM=vscode is checked BEFORE
//   WT_SESSION, because WSLENV carries WT_SESSION into VS Code's terminal.
//   WT_SESSION => any WindowsTerminal.exe window (see "tabs" below).
//   `wslpath -w` yields a \\wsl.localhost\... UNC path for powershell -File; that
//   exact case is not covered by a real-WSL test yet (it is the same call the WSL
//   toast backend makes).
//
// Editors are the exception to "one process, one window": one VS Code, Cursor or
// Windsurf process owns every window of that instance. For an editor host the
// window title must also name the workspace: `workspace` is required (without it
// the answer is null), and its folder name must equal a title segment exactly
// (see titleHasWorkspace). macOS cannot read window titles without a permission
// prompt, so an editor host there is null.
//
// Always null: under tmux, screen or zellij (the multiplexer's active pane is
// not the OS focus, and there is no cheap correct way to ask for it) and over
// ssh (the agent's machine is not the machine the user is looking at).
//
// Tabs and panes: another tab or pane of the same terminal window counts as
// focused. The OS only knows windows, and a terminal with several tabs
// (Windows Terminal, iTerm) is one window. On WSL, WT_SESSION matching is looser
// still: any Windows Terminal window counts, not only the agent's. The feature
// that calls this must be opt-in and say so. The same holds on macOS for separate
// windows of one multi-window app (iTerm, JetBrains IDEs): the frontmost-app
// check cannot tell them apart.
//
// Title separator: VS Code (and Cursor and Windsurf, which are forks and use the
// same title template) join the segments with " - " on Windows and Linux. The
// em dash (U+2014) is the default only on macOS, where titles are never read
// here (see above). Source: defaultWindowTitleSeparator in microsoft/vscode,
// src/vs/workbench/browser/parts/titlebar/windowTitle.ts:
//   isMacintosh ? ' \u2014 ' : ' - '
// A user who sets window.titleSeparator to something else gets false: the exact
// segment match finds no folder, which is the fail-safe direction.
import { execFile } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isWsl as realIsWsl } from './platforms/wsl.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FOREGROUND_SCRIPT = path.join(__dirname, '..', 'assets', 'windows', 'foreground.ps1');

// The generic budget. Windows gets more: powershell.exe needs ~270 ms for an
// empty script and 400-500 ms once the P/Invoke shim exists, so 400 ms would
// time out on most runs. An explicit timeoutMs always wins.
export const DEFAULT_TIMEOUT_MS = 400;
export const WINDOWS_TIMEOUT_MS = 1200;

const MULTIPLEXER_ENV = ['TMUX', 'ZELLIJ'];
const SCREEN_ENV = 'STY'; // GNU screen only; meaningless on Windows
const SSH_ENV = ['SSH_CONNECTION', 'SSH_CLIENT', 'SSH_TTY'];
const MAX_CHAIN = 32;

// Lowercase image names without ".exe". One process owns many windows.
const EDITOR_HOSTS = new Set([
  'code', 'code - insiders', 'code-insiders', 'code-oss', 'cursor', 'windsurf', 'vscodium', 'codium',
  'antigravity',
  'electron', // Linux comm of an Electron app launched without its own name
]);
const WINDOWS_TERMINAL_HOSTS = new Set(['windowsterminal']);
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

// VS Code, Cursor and Windsurf title: `[dirty][file - ]folder[ (Workspace)][ [WSL: Ubuntu]][ - profile] - <App>`.
// Reduce one segment to the bare folder name.
function folderOfSegment(segment) {
  let s = String(segment).trim();
  s = s.replace(/^(?:[\u25CF*]\s*)+/, '');                 // dirty marker
  s = s.replace(/^\[Extension Development Host\]\s*/, '');
  for (;;) {                                               // remote suffixes and (Workspace)
    const next = s.replace(/\s*(?:\[[^\]]*\]|\(Workspace\))\s*$/, '');
    if (next === s) break;
    s = next;
  }
  return s.trim();
}

// true when the workspace's folder name equals a title segment exactly (never a
// substring: `app` must not match `my-app-2`, `code` must not match "Visual
// Studio Code"). The last segment is the application name and is dropped.
// Segments are split on " - ", so a file name or profile name that happens to
// equal the folder name exactly would also match; accepted.
// null when there is no workspace to compare against.
export function titleHasWorkspace(title, workspace, { ignoreCase = false } = {}) {
  const leaf = baseName(workspace);
  if (!leaf) return null;
  const segments = String(title || '').split(' - ');
  if (segments.length < 2) return false;
  const norm = (s) => (ignoreCase ? s.toLowerCase() : s);
  const want = norm(leaf);
  return segments.slice(0, -1).some((seg) => norm(folderOfSegment(seg)) === want);
}

function parsePid(text) {
  const m = /^\s*(\d+)\s*$/.exec(String(text || ''));
  const n = m ? Number(m[1]) : 0;
  return n > 0 ? n : null;
}

// --- Windows (and WSL's Windows side) ----------------------------------------

// foreground.ps1 output -> { fg: {pid, name, ppid, title}, owner: {pid, name}|null },
// or null when there is no usable FG line.
function parseForeground(stdout) {
  let fg = null;
  let owner = null;
  for (const line of String(stdout || '').split(/\r?\n/)) {
    const f = line.split('\t');
    if (f[0] === 'FG' && f.length >= 5) {
      const pid = parsePid(f[1]);
      if (pid) fg = { pid, name: f[2], ppid: parsePid(f[3]), title: f.slice(4).join('\t') };
    } else if (f[0] === 'OWNER' && f.length >= 3 && !owner) {
      const pid = parsePid(f[1]);
      if (pid) owner = { pid, name: f[2] };
    }
  }
  return fg ? { fg, owner } : null;
}

function decideByOwner({ fg, owner }, workspace, ignoreCase) {
  const name = imageKey(fg.name);
  if (SHELL_WINDOWS.has(name)) return false;
  if (!owner) return null; // the agent has no window of its own to compare with
  if (SHELL_WINDOWS.has(imageKey(owner.name))) return false;
  if (fg.pid !== owner.pid) return false;
  if (EDITOR_HOSTS.has(name)) return titleHasWorkspace(fg.title, workspace, { ignoreCase });
  return true;
}

// WSL: the Linux pid tree is invisible to Windows, so go by the host named in env.
function decideWslHost({ fg }, env, workspace) {
  const name = imageKey(fg.name);
  if (SHELL_WINDOWS.has(name)) return false;
  // Before WT_SESSION: WSLENV forwards WT_SESSION into VS Code's own terminal.
  if (env.TERM_PROGRAM === 'vscode') {
    if (!EDITOR_HOSTS.has(name)) return false;
    return titleHasWorkspace(fg.title, workspace);
  }
  if (env.WT_SESSION) return WINDOWS_TERMINAL_HOSTS.has(name);
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
    return viaWsl ? decideWslHost(parsed, env, workspace) : decideByOwner(parsed, workspace, true);
  }
  return null;
}

// --- Linux X11 ----------------------------------------------------------------

// `ps -e -o pid=,ppid=,etimes=,comm=` -> Map(pid -> {ppid, age, comm}).
function parsePs(stdout) {
  const table = new Map();
  for (const line of String(stdout || '').split(/\r?\n/)) {
    const m = /^\s*(\d+)\s+(\d+)\s+(\d+)\s+(.*?)\s*$/.exec(line);
    if (m) table.set(Number(m[1]), { ppid: Number(m[2]), age: Number(m[3]), comm: m[4] });
  }
  return table;
}

// start, then its parents. Stops at a parent younger than its child (pid reuse;
// etimes is whole seconds, so one second of slack).
function ancestorsOf(table, start) {
  const chain = [];
  const seen = new Set();
  let id = start;
  for (let i = 0; i < MAX_CHAIN && table.has(id) && !seen.has(id); i++) {
    seen.add(id);
    chain.push(id);
    const { ppid, age } = table.get(id);
    const parent = table.get(ppid);
    if (!parent || parent.age + 1 < age) break;
    id = ppid;
  }
  return chain;
}

async function probeLinuxX11({ run, env, workspace, pid }) {
  if (env.WAYLAND_DISPLAY || String(env.XDG_SESSION_TYPE || '').toLowerCase() === 'wayland') return null;
  if (!env.DISPLAY) return null;
  const [activePid, psOut] = await Promise.all([
    run('xdotool', ['getactivewindow', 'getwindowpid']),
    run('ps', ['-e', '-o', 'pid=,ppid=,etimes=,comm=']),
  ]);
  const fgPid = parsePid(activePid);
  const table = parsePs(psOut);
  if (!fgPid || table.size === 0) return null;
  const chain = ancestorsOf(table, pid);
  if (chain.length === 0) return null;

  // First ancestor with a visible window; `xdotool search` exits 1 when there is none.
  const hasWindow = await Promise.all(chain.map((id) => run('xdotool', ['search', '--onlyvisible', '--pid', String(id)])
    .then((out) => String(out || '').trim() !== '', () => false)));
  const ownerIdx = hasWindow.indexOf(true);
  if (ownerIdx < 0) return null;
  const owner = chain[ownerIdx];
  if (owner !== fgPid) return false;

  if (EDITOR_HOSTS.has(imageKey(table.get(owner)?.comm))) {
    return titleHasWorkspace(await run('xdotool', ['getactivewindow', 'getwindowname']), workspace);
  }
  return true;
}

// --- macOS --------------------------------------------------------------------

async function probeMac({ run, env }) {
  const own = String(env.__CFBundleIdentifier || '').toLowerCase();
  const term = env.TERM_PROGRAM;
  const known = Boolean(term) && Object.hasOwn(MAC_BUNDLES_BY_TERM_PROGRAM, term);
  // A TERM_PROGRAM we do not know (Zed, Tabby, a multiplexer...) says the shell
  // runs in something other than what __CFBundleIdentifier names, so there is no
  // trusting either.
  if (term && !known) return null;
  const fromTerm = known ? MAC_BUNDLES_BY_TERM_PROGRAM[term].map((s) => s.toLowerCase()) : [];
  // Both set and disagreeing (com.apple.Terminal vs TERM_PROGRAM=vscode, say):
  // the env was inherited from somewhere else, so there is no telling.
  if (own && fromTerm.length > 0 && !fromTerm.includes(own)) return null;
  const expected = own ? [own] : fromTerm;
  if (expected.length === 0) return null;

  const asn = /ASN:\S+?:/.exec(await run('lsappinfo', ['front']));
  if (!asn) return null;
  const info = /"CFBundleIdentifier"\s*=\s*"([^"]+)"/.exec(await run('lsappinfo', ['info', '-only', 'bundleid', asn[0]]));
  if (!info) return null;
  const front = info[1].toLowerCase();

  if (!expected.includes(front)) return false;
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
 * @param {object} [opts]
 * @param {string} [opts.source] reserved: which agent is calling (claude, codex, ...).
 *   Detection does not depend on it today; it is accepted so callers keep a stable shape.
 * @param {string} [opts.workspace] the agent's working directory. Required to answer
 *   for an editor host (VS Code and friends), which owns many windows.
 * @returns {Promise<boolean|null>} true: the agent's own window is in the
 *   foreground; false: something else is; null: unknown (treat as not focused).
 *   Never rejects and never takes longer than timeoutMs.
 */
export async function isAgentWindowFocused({
  platform = process.platform,
  env = process.env,
  source, // reserved, see above
  workspace,
  timeoutMs,
  exec = defaultExec,
  pid = process.pid,
  isWsl,
} = {}) {
  void source;
  const e = env || {};
  if (MULTIPLEXER_ENV.some((k) => e[k]) || (platform !== 'win32' && e[SCREEN_ENV])) return null;
  if (SSH_ENV.some((k) => e[k])) return null;

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
