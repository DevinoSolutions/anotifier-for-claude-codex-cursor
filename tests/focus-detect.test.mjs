// tests/focus-detect.test.mjs -- isAgentWindowFocused() with injected platform, env and exec.
// No real windows are needed: each case feeds the probe output its platform
// tool would print. The last block is an opt-in live check (ANOTIFIER_LIVE_FOCUS=1).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isAgentWindowFocused, DEFAULT_TIMEOUT_MS, WINDOWS_TIMEOUT_MS } from '../src/focus.mjs';

const ME = 4242; // pid of "this" process in every fixture

function enoent(file) {
  return Object.assign(new Error(`spawn ${file} ENOENT`), { code: 'ENOENT' });
}

// exec fake: handlers is a function (file, args, opts) -> string | Promise<string>.
// Every call is recorded in .calls.
function fakeExec(handler) {
  const exec = async (file, args, opts) => {
    exec.calls.push({ file, args, opts });
    return handler(file, args, opts);
  };
  exec.calls = [];
  return exec;
}

// foreground.ps1 output
function psOutput({ fg, chain = [] }) {
  const lines = [];
  if (fg) lines.push(['FG', fg.pid, fg.name, fg.ppid ?? 1, fg.title ?? ''].join('\t'));
  for (const c of chain) lines.push(['CHAIN', c.pid, c.name].join('\t'));
  return lines.join('\r\n') + '\r\n';
}

const TERMINAL_CHAIN = [
  { pid: ME, name: 'node.exe' },
  { pid: 3000, name: 'claude.exe' },
  { pid: 2000, name: 'pwsh.exe' },
  { pid: 1000, name: 'WindowsTerminal.exe' },
];

const win = (extra = {}) => ({ platform: 'win32', env: {}, pid: ME, source: 'claude', ...extra });

describe('windows', () => {
  it('true when the foreground process is an ancestor (Windows Terminal)', async () => {
    const exec = fakeExec(() => psOutput({
      fg: { pid: 1000, name: 'WindowsTerminal.exe', title: 'claude' },
      chain: TERMINAL_CHAIN,
    }));
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
      fg: { pid: 777, name: 'chrome.exe', title: 'Google Chrome' },
      chain: TERMINAL_CHAIN,
    }));
    assert.equal(await isAgentWindowFocused(win({ exec })), false);
  });

  it('false when the foreground is the shell, even if explorer.exe is an ancestor', async () => {
    const exec = fakeExec(() => psOutput({
      fg: { pid: 900, name: 'explorer.exe', title: '' },
      chain: [{ pid: ME, name: 'node.exe' }, { pid: 900, name: 'explorer.exe' }],
    }));
    assert.equal(await isAgentWindowFocused(win({ exec })), false);
  });

  it('counts a console window owned by conhost when its parent is an ancestor', async () => {
    const exec = fakeExec(() => psOutput({
      fg: { pid: 600, name: 'conhost.exe', ppid: 2000, title: 'cmd' },
      chain: TERMINAL_CHAIN,
    }));
    assert.equal(await isAgentWindowFocused(win({ exec })), true);
    const stranger = fakeExec(() => psOutput({
      fg: { pid: 601, name: 'conhost.exe', ppid: 5555, title: 'cmd' },
      chain: TERMINAL_CHAIN,
    }));
    assert.equal(await isAgentWindowFocused(win({ exec: stranger })), false);
  });

  describe('editor hosts own many windows', () => {
    const chain = [{ pid: ME, name: 'node.exe' }, { pid: 800, name: 'Code.exe' }];
    const codeFg = (title) => psOutput({ fg: { pid: 800, name: 'Code.exe', title }, chain });

    it('true when the window title carries the workspace folder', async () => {
      const exec = fakeExec(() => codeFg('index.mjs - ai-agent-notify - Visual Studio Code'));
      assert.equal(await isAgentWindowFocused(win({ exec, workspace: 'C:\\work\\ai-agent-notify' })), true);
    });

    it('false when another window of the same editor is in front', async () => {
      const exec = fakeExec(() => codeFg('main.ts - other-project - Visual Studio Code'));
      assert.equal(await isAgentWindowFocused(win({ exec, workspace: 'C:\\work\\ai-agent-notify' })), false);
    });

    it('without a workspace the ancestor match alone decides', async () => {
      const exec = fakeExec(() => codeFg('main.ts - other-project - Visual Studio Code'));
      assert.equal(await isAgentWindowFocused(win({ exec })), true);
    });
  });

  it('falls back to pwsh.exe when powershell.exe is missing', async () => {
    const exec = fakeExec((file) => {
      if (file === 'powershell.exe') throw enoent(file);
      return psOutput({ fg: { pid: 1000, name: 'WindowsTerminal.exe' }, chain: TERMINAL_CHAIN });
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

  it('null when the ancestor chain is missing (cannot compare)', async () => {
    const exec = fakeExec(() => psOutput({ fg: { pid: 1000, name: 'WindowsTerminal.exe' }, chain: [] }));
    assert.equal(await isAgentWindowFocused(win({ exec })), null);
  });
});

describe('linux (X11)', () => {
  const x11 = { DISPLAY: ':0' };
  const psTable = [
    `${ME} 3000 node`,
    '3000 2000 claude',
    '2000 1000 bash',
    '1000 1 gnome-terminal-',
    '800 1 code',
    '1 0 systemd',
  ].join('\n');
  const linux = (extra = {}) => ({ platform: 'linux', env: x11, pid: ME, isWsl: false, ...extra });
  const handler = (activePid, title = '') => (file, args) => {
    if (file === 'xdotool' && args.includes('getwindowpid')) return `${activePid}\n`;
    if (file === 'xdotool' && args.includes('getwindowname')) return `${title}\n`;
    if (file === 'ps') return psTable;
    throw enoent(file);
  };

  it('true when the active window belongs to an ancestor', async () => {
    assert.equal(await isAgentWindowFocused(linux({ exec: fakeExec(handler(1000)) })), true);
  });

  it('false when the active window belongs to something else', async () => {
    assert.equal(await isAgentWindowFocused(linux({ exec: fakeExec(handler(555)) })), false);
  });

  it('null when xdotool is missing', async () => {
    const exec = fakeExec((file) => { throw enoent(file); });
    assert.equal(await isAgentWindowFocused(linux({ exec })), null);
  });

  it('null when xdotool prints garbage', async () => {
    assert.equal(await isAgentWindowFocused(linux({ exec: fakeExec(handler('no window')) })), null);
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

  it('editor host: the window title must carry the workspace', async () => {
    const chainThroughCode = [
      `${ME} 3000 node`, '3000 800 claude', '800 1 code', '1 0 systemd',
    ].join('\n');
    const mk = (title) => fakeExec((file, args) => {
      if (file === 'xdotool' && args.includes('getwindowpid')) return '800';
      if (file === 'xdotool') return title;
      return chainThroughCode;
    });
    const workspace = '/home/me/ai-agent-notify';
    assert.equal(await isAgentWindowFocused(linux({ workspace, exec: mk('a.js - ai-agent-notify - Visual Studio Code') })), true);
    assert.equal(await isAgentWindowFocused(linux({ workspace, exec: mk('a.js - elsewhere - Visual Studio Code') })), false);
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

  it('__CFBundleIdentifier wins over TERM_PROGRAM', async () => {
    const exec = fakeExec(lsappinfo('com.mitchellh.ghostty'));
    const env = { TERM_PROGRAM: 'Apple_Terminal', __CFBundleIdentifier: 'com.mitchellh.ghostty' };
    assert.equal(await isAgentWindowFocused(mac({ env, exec })), true);
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

  it('VS Code remote: Code.exe with the workspace in the title', async () => {
    const env = { TERM_PROGRAM: 'vscode' };
    const workspace = '/home/me/ai-agent-notify';
    const yes = fakeExec(handler({ pid: 3, name: 'Code.exe', title: 'a.js - ai-agent-notify [WSL: Ubuntu] - Visual Studio Code' }));
    assert.equal(await isAgentWindowFocused(wsl({ env, workspace, exec: yes })), true);
    const other = fakeExec(handler({ pid: 3, name: 'Code.exe', title: 'a.js - elsewhere [WSL: Ubuntu] - Visual Studio Code' }));
    assert.equal(await isAgentWindowFocused(wsl({ env, workspace, exec: other })), false);
    const terminal = fakeExec(handler({ pid: 1, name: 'WindowsTerminal.exe', title: 'Ubuntu' }));
    assert.equal(await isAgentWindowFocused(wsl({ env, workspace, exec: terminal })), false);
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
      for (const platform of ['win32', 'darwin', 'linux']) {
        const exec = fakeExec(() => { throw new Error('must not be called'); });
        assert.equal(await isAgentWindowFocused({ platform, env: { ...env, DISPLAY: ':0', TERM_PROGRAM: 'Apple_Terminal' }, isWsl: false, exec }), null);
        assert.equal(exec.calls.length, 0);
      }
    }
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
