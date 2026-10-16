// tests/focus-detect.test.mjs -- isAgentWindowFocused() with injected platform, env and exec.
// No real windows are needed: each case feeds the probe output its platform
// tool would print. The last block is an opt-in live check (ANOTIFIER_LIVE_FOCUS=1).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { isAgentWindowFocused, titleHasWorkspace, DEFAULT_TIMEOUT_MS, WINDOWS_TIMEOUT_MS } from '../src/focus.mjs';

const FOREGROUND_PS1 = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'windows', 'foreground.ps1');

const ME = 4242; // pid of "this" process in every fixture

function enoent(file) {
  return Object.assign(new Error(`spawn ${file} ENOENT`), { code: 'ENOENT' });
}

// exec fake: handler is a function (file, args, opts) -> string | Promise<string>.
// Every call is recorded in .calls.
function fakeExec(handler) {
  const exec = async (file, args, opts) => {
    exec.calls.push({ file, args, opts });
    return handler(file, args, opts);
  };
  exec.calls = [];
  return exec;
}

// foreground.ps1 output. chain is what the script walked; owner is its OWNER line.
function psOutput({ fg, chain = [], owner }) {
  const lines = [];
  if (fg) lines.push(['FG', fg.pid, fg.name, fg.ppid ?? 1, fg.title ?? ''].join('\t'));
  for (const c of chain) lines.push(['CHAIN', c.pid, c.name].join('\t'));
  if (owner) lines.push(['OWNER', owner.pid, owner.name].join('\t'));
  return lines.join('\r\n') + '\r\n';
}

const WT = { pid: 1000, name: 'WindowsTerminal.exe' };
const TERMINAL_CHAIN = [
  { pid: ME, name: 'node.exe' },
  { pid: 3000, name: 'claude.exe' },
  { pid: 2000, name: 'pwsh.exe' },
  WT,
];

const win = (extra = {}) => ({ platform: 'win32', env: {}, pid: ME, source: 'claude', ...extra });

describe('titleHasWorkspace', () => {
  const t = (title, ws, opts) => titleHasWorkspace(title, ws, opts);

  it('matches the folder segment exactly', () => {
    assert.equal(t('index.mjs - proj - Visual Studio Code', '/home/me/proj'), true);
    assert.equal(t('proj - Visual Studio Code', 'C:\\work\\proj'), true);
    assert.equal(t('proj - Cursor', '/home/me/proj/'), true);
  });

  it('never matches a substring', () => {
    assert.equal(t('x.js - my-app-2 - Visual Studio Code', '/w/app'), false);
    assert.equal(t('x.js - other - Visual Studio Code', '/w/code'), false);
    assert.equal(t('x.js - other - Visual Studio Code', '/w/Visual Studio Code'), false);
    assert.equal(t('x.js - app-old - Visual Studio Code', '/w/app'), false);
  });

  it('handles the dirty marker, (Workspace) and remote suffixes', () => {
    assert.equal(t('\u25CF index.mjs - proj - Visual Studio Code', '/w/proj'), true);
    assert.equal(t('proj (Workspace) - Visual Studio Code', '/w/proj'), true);
    assert.equal(t('a.js - proj [WSL: Ubuntu] - Visual Studio Code', '/w/proj'), true);
    assert.equal(t('a.js - proj [SSH: devbox] - Cursor', '/w/proj'), true);
    assert.equal(t('a.js - proj [SSH: proj] - Cursor', '/w/other'), false);
  });

  it('is case-sensitive unless asked otherwise', () => {
    assert.equal(t('App - Visual Studio Code', '/w/app'), false);
    assert.equal(t('App - Visual Studio Code', '/w/app', { ignoreCase: true }), true);
  });

  it('Cursor em-dash titles fail safe: false, never a wrong true', () => {
    assert.equal(t('a.js — proj — Cursor', '/w/proj'), false);
  });

  it('false for a window with no folder open; null without a workspace', () => {
    assert.equal(t('Visual Studio Code', '/w/proj'), false);
    assert.equal(t('Welcome - Visual Studio Code', '/w/proj'), false);
    assert.equal(t('proj - Visual Studio Code', ''), null);
    assert.equal(t('proj - Visual Studio Code', undefined), null);
  });
});

describe('windows', () => {
  it('true when the foreground process is the first window-owning ancestor (Windows Terminal)', async () => {
    const exec = fakeExec(() => psOutput({ fg: { ...WT, title: 'claude' }, chain: TERMINAL_CHAIN, owner: WT }));
    assert.equal(await isAgentWindowFocused(win({ exec })), true);
    const { file, args } = exec.calls[0];
    assert.equal(file, 'powershell.exe');
    assert.ok(args.includes('-File'));
    assert.ok(args[args.indexOf('-File') + 1].endsWith('foreground.ps1'));
    assert.equal(args[args.indexOf('-StartPid') + 1], String(ME));
    assert.ok(!args.includes('-Command') && !args.includes('-EncodedCommand'));
  });

  it('false when another application is in the foreground', async () => {
    const exec = fakeExec(() => psOutput({
      fg: { pid: 777, name: 'chrome.exe', title: 'Google Chrome' }, chain: TERMINAL_CHAIN, owner: WT,
    }));
    assert.equal(await isAgentWindowFocused(win({ exec })), false);
  });

  it('regression: a launcher above the terminal never counts (terminal started from Chrome)', async () => {
    // chain: node, claude, pwsh, WindowsTerminal, chrome. Chrome is in front.
    const chain = [...TERMINAL_CHAIN, { pid: 900, name: 'chrome.exe' }];
    const exec = fakeExec(() => psOutput({ fg: { pid: 900, name: 'chrome.exe', title: 'Google Chrome' }, chain, owner: WT }));
    assert.equal(await isAgentWindowFocused(win({ exec })), false);
  });

  it('null when no ancestor owns a window (no OWNER line, or a chain cut short)', async () => {
    const exec = fakeExec(() => psOutput({ fg: { ...WT }, chain: TERMINAL_CHAIN }));
    assert.equal(await isAgentWindowFocused(win({ exec })), null);
    const cut = fakeExec(() => psOutput({ fg: { ...WT }, chain: [{ pid: ME, name: 'node.exe' }] }));
    assert.equal(await isAgentWindowFocused(win({ exec: cut })), null);
  });

  it('regression: a hidden Windows Terminal (no OWNER) is null even with a launcher above it', async () => {
    // quake mode / hidden to tray: the script stops at WindowsTerminal.exe, prints no OWNER.
    const exec = fakeExec(() => psOutput({ fg: { pid: 900, name: 'chrome.exe', title: 'Google Chrome' }, chain: TERMINAL_CHAIN }));
    assert.equal(await isAgentWindowFocused(win({ exec })), null);
  });

  it('false when the foreground is the shell, even if explorer.exe owns the agent window', async () => {
    const explorer = { pid: 900, name: 'explorer.exe' };
    const exec = fakeExec(() => psOutput({ fg: { ...explorer, title: '' }, chain: [{ pid: ME, name: 'node.exe' }, explorer], owner: explorer }));
    assert.equal(await isAgentWindowFocused(win({ exec })), false);
  });

  it('a classic console window is owned by its conhost', async () => {
    const conhost = { pid: 600, name: 'conhost.exe' };
    const yes = fakeExec(() => psOutput({ fg: { ...conhost, title: 'cmd' }, owner: conhost, chain: TERMINAL_CHAIN }));
    assert.equal(await isAgentWindowFocused(win({ exec: yes })), true);
    const other = fakeExec(() => psOutput({ fg: { pid: 601, name: 'conhost.exe', title: 'cmd' }, owner: conhost, chain: TERMINAL_CHAIN }));
    assert.equal(await isAgentWindowFocused(win({ exec: other })), false);
  });

  describe('editor hosts own many windows', () => {
    const code = { pid: 800, name: 'Code.exe' };
    const codeFg = (title) => psOutput({ fg: { ...code, title }, chain: [{ pid: ME, name: 'node.exe' }, code], owner: code });
    const ws = 'C:\\work\\ai-agent-notify';

    it('true when a title segment is exactly the workspace folder', async () => {
      const exec = fakeExec(() => codeFg('index.mjs - ai-agent-notify - Visual Studio Code'));
      assert.equal(await isAgentWindowFocused(win({ exec, workspace: ws })), true);
    });

    it('false when another window of the same editor is in front', async () => {
      const exec = fakeExec(() => codeFg('main.ts - other-project - Visual Studio Code'));
      assert.equal(await isAgentWindowFocused(win({ exec, workspace: ws })), false);
    });

    it('regression: a folder name that is a substring of another folder does not match', async () => {
      const exec = fakeExec(() => codeFg('x.js - my-app-2 - Visual Studio Code'));
      assert.equal(await isAgentWindowFocused(win({ exec, workspace: 'C:\\work\\app' })), false);
    });

    it('regression: a workspace called "code" does not match the app name', async () => {
      const exec = fakeExec(() => codeFg('x.js - other - Visual Studio Code'));
      assert.equal(await isAgentWindowFocused(win({ exec, workspace: 'C:\\work\\code' })), false);
    });

    it('regression: null without a workspace, ancestry alone cannot pick one editor window', async () => {
      const exec = fakeExec(() => codeFg('main.ts - other-project - Visual Studio Code'));
      assert.equal(await isAgentWindowFocused(win({ exec })), null);
    });

    it('matches case-insensitively on Windows', async () => {
      const exec = fakeExec(() => codeFg('AI-Agent-Notify - Visual Studio Code'));
      assert.equal(await isAgentWindowFocused(win({ exec, workspace: ws })), true);
    });

    it('an Electron host with a generic image name still gets the title check', async () => {
      const electron = { pid: 801, name: 'electron.exe' };
      const out = psOutput({ fg: { ...electron, title: 'x - other - App' }, chain: [{ pid: ME, name: 'node.exe' }, electron], owner: electron });
      assert.equal(await isAgentWindowFocused(win({ exec: fakeExec(() => out), workspace: ws })), false);
    });
  });

  it('falls back to pwsh.exe when powershell.exe is missing', async () => {
    const exec = fakeExec((file) => {
      if (file === 'powershell.exe') throw enoent(file);
      return psOutput({ fg: { ...WT }, chain: TERMINAL_CHAIN, owner: WT });
    });
    assert.equal(await isAgentWindowFocused(win({ exec })), true);
    assert.deepEqual(exec.calls.map((c) => c.file), ['powershell.exe', 'pwsh.exe']);
  });

  it('null when no PowerShell can be started', async () => {
    const exec = fakeExec((file) => { throw enoent(file); });
    assert.equal(await isAgentWindowFocused(win({ exec })), null);
  });

  it('null when the probe exits non-zero', async () => {
    const exec = fakeExec(() => { throw Object.assign(new Error('exit 1'), { code: 1 }); });
    assert.equal(await isAgentWindowFocused(win({ exec })), null);
  });

  it('null when nothing is in the foreground or the output is garbage', async () => {
    for (const out of ['', '\r\n', 'not the expected output', 'FG\tabc\tfoo.exe', 'FG\t0\tfoo.exe\t1\tt', '\u0000\u0001garbage']) {
      const exec = fakeExec(() => out);
      assert.equal(await isAgentWindowFocused(win({ exec })), null, JSON.stringify(out));
    }
  });

  it('STY (GNU screen) is ignored on Windows', async () => {
    const exec = fakeExec(() => psOutput({ fg: { ...WT }, chain: TERMINAL_CHAIN, owner: WT }));
    assert.equal(await isAgentWindowFocused(win({ exec, env: { STY: 'stale' } })), true);
  });
});

describe('foreground.ps1', () => {
  it('emits the shim with Reflection.Emit: no Add-Type (csc.exe, temp files)', () => {
    const code = fs.readFileSync(FOREGROUND_PS1, 'utf8').replace(/^\s*#.*$/gm, '');
    assert.ok(!/Add-Type/.test(code), 'Add-Type outside comments');
    assert.match(code, /DefinePInvokeMethod/);
    assert.match(code, /GetProcessTimes/);
  });

  it('stops the walk at WindowsTerminal.exe even without a window', () => {
    const code = fs.readFileSync(FOREGROUND_PS1, 'utf8').replace(/^\s*#.*$/gm, '');
    assert.ok(code.includes("if ($names[$id] -ieq 'WindowsTerminal.exe') { break }"));
  });

  it('walks up from StartPid and stops at the first window owner', { skip: process.platform !== 'win32' }, () => {
    const inner = `
      const { execFileSync } = require('node:child_process');
      process.stdout.write(execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
        '-File', process.argv[1], '-StartPid', String(process.pid)], { encoding: 'utf8' }));`;
    const res = spawnSync(process.execPath, ['-e', inner, FOREGROUND_PS1], { encoding: 'utf8', timeout: 30000 });
    assert.equal(res.status, 0, res.stderr);
    const lines = res.stdout.split(/\r?\n/).filter(Boolean).map((l) => l.split('\t'));
    const chain = lines.filter((l) => l[0] === 'CHAIN');
    assert.ok(chain.length >= 2, res.stdout);
    assert.equal(chain[0][2].toLowerCase(), 'node.exe');
    assert.ok(chain.length <= 32);
    const owners = lines.filter((l) => l[0] === 'OWNER');
    assert.ok(owners.length <= 1);
    // The walk ends at the owner: nothing is printed above it.
    if (owners.length) assert.equal(chain.at(-1)[1], owners[0][1]);
  });
});

describe('linux (X11)', () => {
  const x11 = { DISPLAY: ':0' };
  // pid ppid etimes comm. Ages shrink toward the leaf (children are younger).
  const psTable = [
    `${ME} 3000 10 node`,
    '3000 2000 20 claude',
    '2000 1000 30 bash',
    '1000 900 40 gnome-terminal-',
    '900 1 50 chrome',
    '800 1 60 code',
    '1 0 100 systemd',
  ].join('\n');
  const linux = (extra = {}) => ({ platform: 'linux', env: x11, pid: ME, isWsl: false, ...extra });
  // windows: pids that own a visible window.
  const handler = (activePid, { title = '', ps = psTable, windows = [1000, 900, 800] } = {}) => (file, args) => {
    if (file === 'xdotool' && args[0] === 'getactivewindow' && args.includes('getwindowpid')) return `${activePid}\n`;
    if (file === 'xdotool' && args[0] === 'getactivewindow') return `${title}\n`;
    if (file === 'xdotool' && args[0] === 'search') {
      const p = Number(args[args.indexOf('--pid') + 1]);
      if (windows.includes(p)) return '12345678\n';
      throw Object.assign(new Error('exit 1'), { code: 1 });
    }
    if (file === 'ps') return ps;
    throw enoent(file);
  };

  it('true when the active window belongs to the first window-owning ancestor', async () => {
    assert.equal(await isAgentWindowFocused(linux({ exec: fakeExec(handler(1000)) })), true);
  });

  it('false when the active window belongs to something else', async () => {
    assert.equal(await isAgentWindowFocused(linux({ exec: fakeExec(handler(555)) })), false);
  });

  it('regression: a launcher above the terminal never counts (terminal opened from Chrome)', async () => {
    // chain: node, claude, bash, gnome-terminal-, chrome. Chrome (900) is in front.
    assert.equal(await isAgentWindowFocused(linux({ exec: fakeExec(handler(900)) })), false);
  });

  it('regression: a reused parent pid ends the walk (null, never true)', async () => {
    // gnome-terminal- (1000) is "younger" than its child bash (30 s): its pid was reused.
    const ps = psTable.replace('1000 900 40 gnome-terminal-', '1000 900 5 gnome-terminal-');
    const exec = fakeExec(handler(1000, { ps, windows: [1000] }));
    assert.equal(await isAgentWindowFocused(linux({ exec })), null);
  });

  it('null when no ancestor has a visible window', async () => {
    assert.equal(await isAgentWindowFocused(linux({ exec: fakeExec(handler(1000, { windows: [] })) })), null);
  });

  it('null when xdotool is missing', async () => {
    const exec = fakeExec((file) => { throw enoent(file); });
    assert.equal(await isAgentWindowFocused(linux({ exec })), null);
  });

  it('null when xdotool prints garbage', async () => {
    assert.equal(await isAgentWindowFocused(linux({ exec: fakeExec(handler('no window')) })), null);
  });

  it('null when ps has no etimes column (BusyBox)', async () => {
    const exec = fakeExec(handler(1000, { ps: `${ME} 3000 node\n3000 1 claude\n` }));
    assert.equal(await isAgentWindowFocused(linux({ exec })), null);
  });

  it('null without DISPLAY', async () => {
    const exec = fakeExec(handler(1000));
    assert.equal(await isAgentWindowFocused(linux({ env: {}, exec })), null);
    assert.equal(exec.calls.length, 0);
  });

  it('null on Wayland without probing', async () => {
    for (const env of [
      { DISPLAY: ':0', WAYLAND_DISPLAY: 'wayland-0' },
      { DISPLAY: ':0', XDG_SESSION_TYPE: 'wayland' },
      { WAYLAND_DISPLAY: 'wayland-0' },
    ]) {
      const exec = fakeExec(handler(1000));
      assert.equal(await isAgentWindowFocused(linux({ env, exec })), null);
      assert.equal(exec.calls.length, 0);
    }
  });

  describe('editor hosts', () => {
    const editorPs = (comm) => [
      `${ME} 3000 10 node`, '3000 800 20 claude', `800 1 60 ${comm}`, '1 0 100 systemd',
    ].join('\n');
    const mk = (title, comm = 'code') => fakeExec(handler(800, { title, ps: editorPs(comm), windows: [800] }));
    const workspace = '/home/me/ai-agent-notify';

    it('the window title must carry the workspace folder exactly', async () => {
      assert.equal(await isAgentWindowFocused(linux({ workspace, exec: mk('a.js - ai-agent-notify - Visual Studio Code') })), true);
      assert.equal(await isAgentWindowFocused(linux({ workspace, exec: mk('a.js - elsewhere - Visual Studio Code') })), false);
      assert.equal(await isAgentWindowFocused(linux({ workspace: '/w/app', exec: mk('a.js - my-app-2 - Visual Studio Code') })), false);
    });

    it('is case-sensitive on Linux', async () => {
      assert.equal(await isAgentWindowFocused(linux({ workspace: '/w/app', exec: mk('a.js - App - Visual Studio Code') })), false);
    });

    it('null without a workspace', async () => {
      assert.equal(await isAgentWindowFocused(linux({ exec: mk('a.js - ai-agent-notify - Visual Studio Code') })), null);
    });

    it('an Electron comm ("electron") does not skip the title check', async () => {
      assert.equal(await isAgentWindowFocused(linux({ workspace, exec: mk('a.js - elsewhere - Cursor', 'electron') })), false);
      assert.equal(await isAgentWindowFocused(linux({ workspace, exec: mk('a.js - ai-agent-notify - Cursor', 'electron') })), true);
      assert.equal(await isAgentWindowFocused(linux({ exec: mk('a.js - x - Cursor', 'electron') })), null);
    });
  });
});

describe('macOS', () => {
  const mac = (extra = {}) => ({ platform: 'darwin', pid: ME, ...extra });
  const lsappinfo = (bundle) => (file, args) => {
    if (file !== 'lsappinfo') throw enoent(file);
    if (args[0] === 'front') return 'ASN:0x0-0x1c01c:\n';
    if (args[0] === 'info') {
      assert.deepEqual(args.slice(1), ['-only', 'bundleid', 'ASN:0x0-0x1c01c:']);
      return `"CFBundleIdentifier"="${bundle}"\n`;
    }
    throw new Error(`unexpected ${args}`);
  };

  it('true when the frontmost app is the terminal app (TERM_PROGRAM)', async () => {
    const exec = fakeExec(lsappinfo('com.apple.Terminal'));
    assert.equal(await isAgentWindowFocused(mac({ env: { TERM_PROGRAM: 'Apple_Terminal' }, exec })), true);
  });

  it('false when another app is frontmost', async () => {
    const exec = fakeExec(lsappinfo('com.google.Chrome'));
    assert.equal(await isAgentWindowFocused(mac({ env: { TERM_PROGRAM: 'iTerm.app' }, exec })), false);
  });

  it('__CFBundleIdentifier alone, or agreeing with TERM_PROGRAM, decides', async () => {
    const exec = fakeExec(lsappinfo('com.mitchellh.ghostty'));
    assert.equal(await isAgentWindowFocused(mac({ env: { __CFBundleIdentifier: 'com.mitchellh.ghostty' }, exec })), true);
    const both = { TERM_PROGRAM: 'ghostty', __CFBundleIdentifier: 'com.mitchellh.ghostty' };
    assert.equal(await isAgentWindowFocused(mac({ env: both, exec: fakeExec(lsappinfo('com.mitchellh.ghostty')) })), true);
  });

  it('regression: null when TERM_PROGRAM is set but unknown, whatever __CFBundleIdentifier says', async () => {
    for (const term of ['zed', 'Tabby', 'tmux-ish', 'constructor']) {
      const env = { TERM_PROGRAM: term, __CFBundleIdentifier: 'com.mitchellh.ghostty' };
      const exec = fakeExec(lsappinfo('com.mitchellh.ghostty'));
      assert.equal(await isAgentWindowFocused(mac({ env, exec })), null, term);
      assert.equal(exec.calls.length, 0);
    }
    // With no TERM_PROGRAM at all the bundle id alone still decides.
    const exec = fakeExec(lsappinfo('com.mitchellh.ghostty'));
    assert.equal(await isAgentWindowFocused(mac({ env: { __CFBundleIdentifier: 'com.mitchellh.ghostty' }, exec })), true);
  });

  it('regression: null when __CFBundleIdentifier and TERM_PROGRAM disagree', async () => {
    for (const front of ['com.apple.Terminal', 'com.microsoft.VSCode', 'com.google.Chrome']) {
      const env = { TERM_PROGRAM: 'vscode', __CFBundleIdentifier: 'com.apple.Terminal' };
      const exec = fakeExec(lsappinfo(front));
      assert.equal(await isAgentWindowFocused(mac({ env, exec })), null, front);
      assert.equal(exec.calls.length, 0);
    }
  });

  it('null for an editor host: titles are not readable without a permission prompt', async () => {
    const exec = fakeExec(lsappinfo('com.microsoft.VSCode'));
    const env = { TERM_PROGRAM: 'vscode', __CFBundleIdentifier: 'com.microsoft.VSCode' };
    assert.equal(await isAgentWindowFocused(mac({ env, exec, workspace: '/Users/me/proj' })), null);
  });

  it('false when an editor is expected but a terminal is frontmost', async () => {
    const exec = fakeExec(lsappinfo('com.apple.Terminal'));
    assert.equal(await isAgentWindowFocused(mac({ env: { TERM_PROGRAM: 'vscode' }, exec })), false);
  });

  it('null when the terminal app is unknown', async () => {
    const exec = fakeExec(lsappinfo('com.apple.Terminal'));
    assert.equal(await isAgentWindowFocused(mac({ env: {}, exec })), null);
    assert.equal(exec.calls.length, 0);
  });

  it('null when lsappinfo is missing', async () => {
    const exec = fakeExec((file) => { throw enoent(file); });
    assert.equal(await isAgentWindowFocused(mac({ env: { TERM_PROGRAM: 'Apple_Terminal' }, exec })), null);
  });

  it('null on garbage output', async () => {
    for (const out of ['', 'ASN', 'nothing useful']) {
      const exec = fakeExec(() => out);
      assert.equal(await isAgentWindowFocused(mac({ env: { TERM_PROGRAM: 'Apple_Terminal' }, exec })), null, out);
    }
    const noBundle = fakeExec((file, args) => (args[0] === 'front' ? 'ASN:0x0-0x1c01c:' : '"CFBundleIdentifier"=[ NULL ]'));
    assert.equal(await isAgentWindowFocused(mac({ env: { TERM_PROGRAM: 'Apple_Terminal' }, exec: noBundle })), null);
  });
});

describe('WSL', () => {
  const wsl = (extra = {}) => ({ platform: 'linux', isWsl: true, pid: ME, ...extra });
  const handler = (fg) => (file, args) => {
    if (file === 'wslpath') return '\\\\wsl.localhost\\Ubuntu\\opt\\anotifier\\assets\\windows\\foreground.ps1\n';
    if (/powershell\.exe$/.test(file)) {
      assert.ok(args.includes('-File'));
      assert.ok(args[args.indexOf('-File') + 1].startsWith('\\\\wsl.localhost'));
      assert.equal(args[args.indexOf('-StartPid') + 1], '0'); // Linux pids mean nothing to Windows
      return psOutput({ fg });
    }
    throw enoent(file);
  };

  it('true when Windows Terminal is in the foreground and WT_SESSION is set', async () => {
    const exec = fakeExec(handler({ pid: 1, name: 'WindowsTerminal.exe', title: 'Ubuntu' }));
    assert.equal(await isAgentWindowFocused(wsl({ env: { WT_SESSION: 'abc' }, exec })), true);
  });

  it('false when another Windows app is in the foreground', async () => {
    const exec = fakeExec(handler({ pid: 2, name: 'chrome.exe', title: 'Google Chrome' }));
    assert.equal(await isAgentWindowFocused(wsl({ env: { WT_SESSION: 'abc' }, exec })), false);
  });

  it('VS Code remote: Code.exe with the workspace folder in the title', async () => {
    const env = { TERM_PROGRAM: 'vscode' };
    const workspace = '/home/me/ai-agent-notify';
    const yes = fakeExec(handler({ pid: 3, name: 'Code.exe', title: 'a.js - ai-agent-notify [WSL: Ubuntu] - Visual Studio Code' }));
    assert.equal(await isAgentWindowFocused(wsl({ env, workspace, exec: yes })), true);
    const other = fakeExec(handler({ pid: 3, name: 'Code.exe', title: 'a.js - elsewhere [WSL: Ubuntu] - Visual Studio Code' }));
    assert.equal(await isAgentWindowFocused(wsl({ env, workspace, exec: other })), false);
    const sub = fakeExec(handler({ pid: 3, name: 'Code.exe', title: 'a.js - my-ai-agent-notify-2 [WSL: Ubuntu] - Visual Studio Code' }));
    assert.equal(await isAgentWindowFocused(wsl({ env, workspace, exec: sub })), false);
    const terminal = fakeExec(handler({ pid: 1, name: 'WindowsTerminal.exe', title: 'Ubuntu' }));
    assert.equal(await isAgentWindowFocused(wsl({ env, workspace, exec: terminal })), false);
    const noWorkspace = fakeExec(handler({ pid: 3, name: 'Code.exe', title: 'a.js - ai-agent-notify [WSL: Ubuntu] - Visual Studio Code' }));
    assert.equal(await isAgentWindowFocused(wsl({ env, exec: noWorkspace })), null);
  });

  it('regression: TERM_PROGRAM=vscode wins over WT_SESSION (WSLENV forwards WT_SESSION into VS Code)', async () => {
    const env = { TERM_PROGRAM: 'vscode', WT_SESSION: 'abc' };
    const workspace = '/home/me/proj';
    // A Windows Terminal window in front is not VS Code's terminal.
    const terminal = fakeExec(handler({ pid: 1, name: 'WindowsTerminal.exe', title: 'Ubuntu' }));
    assert.equal(await isAgentWindowFocused(wsl({ env, workspace, exec: terminal })), false);
    const code = fakeExec(handler({ pid: 3, name: 'Code.exe', title: 'a.js - proj [WSL: Ubuntu] - Visual Studio Code' }));
    assert.equal(await isAgentWindowFocused(wsl({ env, workspace, exec: code })), true);
  });

  it('null when the environment does not say which Windows app hosts the shell', async () => {
    const exec = fakeExec(handler({ pid: 1, name: 'WindowsTerminal.exe' }));
    assert.equal(await isAgentWindowFocused(wsl({ env: {}, exec })), null);
  });

  it('null when interop is unavailable (no powershell.exe, no wslpath)', async () => {
    const exec = fakeExec((file) => { throw enoent(file); });
    assert.equal(await isAgentWindowFocused(wsl({ env: { WT_SESSION: 'abc' }, exec })), null);
  });

  it('uses the Windows probe on WSL, not X11, even when DISPLAY is set', async () => {
    const exec = fakeExec(handler({ pid: 1, name: 'WindowsTerminal.exe' }));
    await isAgentWindowFocused(wsl({ env: { WT_SESSION: 'abc', DISPLAY: ':0' }, exec }));
    assert.ok(exec.calls.every((c) => c.file !== 'xdotool'));
  });
});

describe('null policy', () => {
  it('tmux, screen and zellij return null without probing', async () => {
    for (const env of [{ TMUX: '/tmp/tmux-1000/default,1,0' }, { STY: '123.pts-0.host' }, { ZELLIJ: '0' }]) {
      for (const platform of ['darwin', 'linux']) {
        const exec = fakeExec(() => { throw new Error('must not be called'); });
        assert.equal(await isAgentWindowFocused({ platform, env: { ...env, DISPLAY: ':0', TERM_PROGRAM: 'Apple_Terminal' }, isWsl: false, exec }), null);
        assert.equal(exec.calls.length, 0);
      }
    }
    // psmux sets TMUX on Windows too.
    const exec = fakeExec(() => { throw new Error('must not be called'); });
    assert.equal(await isAgentWindowFocused({ platform: 'win32', env: { TMUX: '/tmp/psmux-1/x,2,0' }, exec }), null);
    assert.equal(exec.calls.length, 0);
  });

  it('ssh sessions return null: the agent is not on the machine in front of the user', async () => {
    const exec = fakeExec(() => { throw new Error('must not be called'); });
    assert.equal(await isAgentWindowFocused({ platform: 'linux', env: { SSH_CONNECTION: '1.2.3.4 22 5.6.7.8 22', DISPLAY: ':0' }, isWsl: false, exec }), null);
    assert.equal(exec.calls.length, 0);
  });

  it('an unsupported platform returns null', async () => {
    const exec = fakeExec(() => 'x');
    assert.equal(await isAgentWindowFocused({ platform: 'freebsd', env: {}, exec }), null);
    assert.equal(exec.calls.length, 0);
  });

  it('never throws, whatever exec does', async () => {
    const throwing = () => { throw new Error('boom'); };
    const rejecting = () => Promise.reject(new Error('boom'));
    const weird = () => ({ stdout: undefined });
    for (const handler of [throwing, rejecting, weird, () => null, () => undefined]) {
      for (const [platform, env] of [['win32', {}], ['darwin', { TERM_PROGRAM: 'Apple_Terminal' }], ['linux', { DISPLAY: ':0' }]]) {
        const r = await isAgentWindowFocused({ platform, env, isWsl: false, exec: fakeExec(handler) });
        assert.equal(r, null);
      }
    }
    // Hostile arguments do not throw either.
    assert.equal(await isAgentWindowFocused({ platform: 'win32', env: null, exec: fakeExec(throwing), workspace: 42, timeoutMs: 'soon' }), null);
  });

  it('a hanging probe returns null by the deadline and the child is killed', async () => {
    let signal;
    const exec = fakeExec((file, args, opts) => new Promise((resolve, reject) => {
      signal = opts.signal;
      opts.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
    }));
    const t0 = Date.now();
    const result = await isAgentWindowFocused({ platform: 'win32', env: {}, pid: ME, exec, timeoutMs: 80 });
    const elapsed = Date.now() - t0;
    assert.equal(result, null);
    assert.ok(elapsed >= 70 && elapsed < 400, `elapsed ${elapsed} ms`);
    assert.equal(signal.aborted, true);
  });

  it('does not outlive the deadline across the powershell.exe -> pwsh.exe fallback', async () => {
    const exec = fakeExec(async (file) => {
      await new Promise((r) => setTimeout(r, 60));
      throw enoent(file);
    });
    const t0 = Date.now();
    assert.equal(await isAgentWindowFocused({ platform: 'win32', env: {}, pid: ME, exec, timeoutMs: 100 }), null);
    assert.ok(Date.now() - t0 < 350);
  });

  it('passes the remaining budget to exec as its timeout', async () => {
    const exec = fakeExec(() => '');
    await isAgentWindowFocused({ platform: 'win32', env: {}, pid: ME, exec, timeoutMs: 900 });
    assert.ok(exec.calls[0].opts.timeout > 0 && exec.calls[0].opts.timeout <= 900);
  });

  it('default budgets: 400 ms generic, longer on Windows where PowerShell startup dominates', async () => {
    assert.equal(DEFAULT_TIMEOUT_MS, 400);
    assert.ok(WINDOWS_TIMEOUT_MS > DEFAULT_TIMEOUT_MS);
    const win32 = fakeExec(() => '');
    await isAgentWindowFocused({ platform: 'win32', env: {}, exec: win32 });
    assert.ok(win32.calls[0].opts.timeout > DEFAULT_TIMEOUT_MS);
    const mac = fakeExec(() => '');
    await isAgentWindowFocused({ platform: 'darwin', env: { TERM_PROGRAM: 'Apple_Terminal' }, exec: mac });
    assert.ok(mac.calls[0].opts.timeout <= DEFAULT_TIMEOUT_MS);
  });

  it('the real exec resolves null when the probe tool does not exist', { skip: process.platform === 'darwin' }, async () => {
    // No injected exec: lsappinfo is absent off macOS, so spawn fails with ENOENT.
    const r = await isAgentWindowFocused({ platform: 'darwin', env: { TERM_PROGRAM: 'Apple_Terminal' }, timeoutMs: 2000 });
    assert.equal(r, null);
  });
});

// Opt-in: runs the real probe on this machine. Which answer is right depends on
// what is in front of you, so only the contract is asserted.
describe('live smoke (ANOTIFIER_LIVE_FOCUS=1)', { skip: process.env.ANOTIFIER_LIVE_FOCUS !== '1' }, () => {
  it('answers true, false or null within the budget', async () => {
    const t0 = Date.now();
    const result = await isAgentWindowFocused({ source: 'claude', workspace: process.cwd(), timeoutMs: 5000 });
    const elapsed = Date.now() - t0;
    console.log(`live focus probe: ${result} in ${elapsed} ms`);
    assert.ok(result === true || result === false || result === null);
    assert.ok(elapsed < 5500);
  });
});
