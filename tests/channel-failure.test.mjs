// tests/channel-failure.test.mjs — why a channel failed: the fixed reason enum,
// the classifiers, and the reason threaded from each sender to the hook counters.
import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {
  FAILURE_REASONS, failureReason, execFailureReason, httpFailureReason, networkFailureReason,
  noteFailure, takeFailure, clearFailure,
} from '../src/channel-failure.mjs';
import { sendBellUnix, sendBell } from '../src/bell.mjs';
import { sendToast as sendWindowsToast } from '../src/platforms/windows.mjs';
import { sendToast as sendLinuxToast } from '../src/platforms/linux.mjs';
import { sendToast as sendMacToast } from '../src/platforms/macos.mjs';
import { sendToast as sendWslToast } from '../src/platforms/wsl.mjs';
import { sendNtfy } from '../src/ntfy.mjs';
import { sendWebhook } from '../src/webhook.mjs';
import { trackChannel } from '../src/notify.mjs';
import { recordHookRun, readState } from '../src/telemetry.mjs';
import { useFakeHome } from './fake-home.mjs';
useFakeHome();

const ON = { telemetry: { enabled: true } };
const tmpState = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'aan-reason-')), '.telemetry.json');

afterEach(() => { for (const c of ['toast', 'ntfy', 'webhook', 'bell']) clearFailure(c); });

describe('failure reason enum', () => {
  it('is exactly the documented list', () => {
    assert.deepEqual(FAILURE_REASONS, [
      'timeout', 'spawn_error', 'exit_nonzero', 'no_tty', 'http_4xx', 'http_5xx', 'network', 'unsupported', 'other',
    ]);
  });
  it('maps anything off the list to other', () => {
    for (const reason of FAILURE_REASONS) assert.equal(failureReason(reason), reason);
    for (const bad of ['ENOENT', 'exit code 3', 'https://x.example/hook', '/home/me', '', null, undefined, 3, {}]) {
      assert.equal(failureReason(bad), 'other');
    }
  });
  it('noteFailure stores only an enum value and takeFailure clears it', () => {
    noteFailure('toast', 'Command failed: /home/me/secret.ps1');
    assert.equal(takeFailure('toast'), 'other');
    assert.equal(takeFailure('toast'), 'other', 'a second take has nothing noted');
    noteFailure('ntfy', 'http_5xx');
    assert.equal(takeFailure('ntfy'), 'http_5xx');
  });
});

describe('classifiers', () => {
  it('execFile errors', () => {
    assert.equal(execFailureReason({ killed: true, signal: 'SIGTERM', code: null }), 'timeout');
    assert.equal(execFailureReason({ code: 3 }), 'exit_nonzero');
    assert.equal(execFailureReason({ code: 1, killed: false }), 'exit_nonzero');
    assert.equal(execFailureReason({ code: 'ENOENT' }), 'spawn_error');
    assert.equal(execFailureReason({ code: 'EACCES' }), 'spawn_error');
    assert.equal(execFailureReason({ code: 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER' }), 'other');
    assert.equal(execFailureReason({ signal: 'SIGKILL', killed: false }), 'other');
    assert.equal(execFailureReason(undefined), 'other');
    assert.equal(execFailureReason(null), 'other');
  });
  it('HTTP statuses', () => {
    assert.equal(httpFailureReason(400), 'http_4xx');
    assert.equal(httpFailureReason(429), 'http_4xx');
    assert.equal(httpFailureReason(500), 'http_5xx');
    assert.equal(httpFailureReason(503), 'http_5xx');
    assert.equal(httpFailureReason(302), 'other');
    assert.equal(httpFailureReason(undefined), 'other');
  });
  it('network errors', () => {
    assert.equal(networkFailureReason({ code: 'ECONNREFUSED' }), 'network');
    assert.equal(networkFailureReason({ code: 'ENOTFOUND' }), 'network');
    assert.equal(networkFailureReason({ code: 'ETIMEDOUT' }), 'timeout');
    assert.equal(networkFailureReason({ code: 'ERR_SOMETHING_ELSE' }), 'other');
    assert.equal(networkFailureReason(undefined), 'other');
  });
});

describe('trackChannel threads the reason', () => {
  it('a success carries no reason', async () => {
    assert.deepEqual(await trackChannel('toast', Promise.resolve(true)), { channel: 'toast', ok: true });
  });
  it('a failure carries the reason its sender noted', async () => {
    noteFailure('toast', 'timeout');
    assert.deepEqual(await trackChannel('toast', Promise.resolve(false)), { channel: 'toast', ok: false, reason: 'timeout' });
  });
  it('a failure with nothing noted is other', async () => {
    assert.deepEqual(await trackChannel('webhook', Promise.resolve(false)), { channel: 'webhook', ok: false, reason: 'other' });
  });
  it('a sender that throws is other', async () => {
    assert.deepEqual(await trackChannel('ntfy', Promise.reject(new Error('boom'))), { channel: 'ntfy', ok: false, reason: 'other' });
  });
});

describe('recordHookRun counts reasons beside ok/fail', () => {
  it('adds channels.<name>.reasons and keeps ok/fail', () => {
    const statePath = tmpState();
    const opts = { env: { ANOTIFIER_TELEMETRY: '1' }, statePath, now: 1000 };
    recordHookRun(ON, {
      outcome: 'dispatched', source: 'codex',
      channels: [
        { channel: 'toast', ok: false, reason: 'spawn_error' },
        { channel: 'bell', ok: false, reason: 'no_tty' },
        { channel: 'ntfy', ok: true },
      ],
    }, opts);
    recordHookRun(ON, { outcome: 'dispatched', source: 'codex', channels: [{ channel: 'toast', ok: false, reason: 'spawn_error' }] }, opts);
    const { counters } = readState(statePath);
    assert.deepEqual(counters.channels, {
      toast: { ok: 0, fail: 2, reasons: { spawn_error: 2 } },
      bell: { ok: 0, fail: 1, reasons: { no_tty: 1 } },
      ntfy: { ok: 1, fail: 0 },
    });
  });
  it('an unknown or missing reason is other, and a success never gets one', () => {
    const statePath = tmpState();
    recordHookRun(ON, {
      outcome: 'dispatched', source: 'claude',
      channels: [
        { channel: 'webhook', ok: false, reason: 'https://hooks.example.com/services/SECRET' },
        { channel: 'webhook', ok: false },
        { channel: 'webhook', ok: true, reason: 'timeout' },
      ],
    }, { env: { ANOTIFIER_TELEMETRY: '1' }, statePath });
    const { counters } = readState(statePath);
    assert.deepEqual(counters.channels.webhook, { ok: 1, fail: 2, reasons: { other: 2 } });
    assert.ok(!JSON.stringify(counters).includes('SECRET'));
  });
});

describe('bell reasons', () => {
  // Hold TMUX_PANE out of the way so the tmux fallback cannot find a pane.
  const withoutTmux = async (fn) => {
    const saved = process.env.TMUX_PANE;
    delete process.env.TMUX_PANE;
    try { return await fn(); } finally { if (saved !== undefined) process.env.TMUX_PANE = saved; }
  };
  const canOpenTty = () => {
    try { fs.closeSync(fs.openSync('/dev/tty', 'w')); return true; } catch { return false; }
  };

  // Runs on Windows too: there /dev/tty cannot be opened, which is the same
  // "no controlling terminal" path a hook takes on Linux and WSL.
  it('sendBellUnix with no controlling terminal notes no_tty', async () => {
    await withoutTmux(async () => {
      const ok = await sendBellUnix();
      assert.equal(ok, canOpenTty());
      if (!ok) assert.equal(takeFailure('bell'), 'no_tty');
    });
  });
  it('sendBell carries the same reason through', async (t) => {
    if (os.platform() === 'win32') return t.skip('not Unix');
    await withoutTmux(async () => {
      const ok = await sendBell();
      if (!ok) assert.equal(takeFailure('bell'), 'no_tty');
    });
  });
});

describe('toast reasons', () => {
  const note = { title: 'T', message: 'M' };
  const failWith = (props) => (cmd, args, opts, cb) => cb(Object.assign(new Error('failed'), props), '', '');
  const quiet = () => {};

  it('windows: a missing pwsh is spawn_error', async () => {
    assert.equal(await sendWindowsToast(note, { platform: 'win32', log: quiet, execFileImpl: failWith({ code: 'ENOENT' }) }), false);
    assert.equal(takeFailure('toast'), 'spawn_error');
  });
  it('windows: toast.ps1 exiting 3 is exit_nonzero', async () => {
    assert.equal(await sendWindowsToast(note, { platform: 'win32', log: quiet, execFileImpl: failWith({ code: 3 }) }), false);
    assert.equal(takeFailure('toast'), 'exit_nonzero');
  });
  it('windows: the timeout kill is timeout', async () => {
    assert.equal(await sendWindowsToast(note, { platform: 'win32', log: quiet, execFileImpl: failWith({ killed: true, signal: 'SIGTERM', code: null }) }), false);
    assert.equal(takeFailure('toast'), 'timeout');
  });
  it('windows: a non-windows host is unsupported', async () => {
    assert.equal(await sendWindowsToast(note, { platform: 'linux' }), false);
    assert.equal(takeFailure('toast'), 'unsupported');
  });
  it('windows: success notes nothing', async () => {
    assert.equal(await sendWindowsToast(note, { platform: 'win32', log: quiet, execFileImpl: (c, a, o, cb) => cb(null, '', '') }), true);
    assert.equal(takeFailure('toast'), 'other');
  });
  it('linux: notify-send missing is spawn_error', async () => {
    assert.equal(await sendLinuxToast(note, { log: quiet, execFileImpl: failWith({ code: 'ENOENT' }) }), false);
    assert.equal(takeFailure('toast'), 'spawn_error');
  });
  it('macos: osascript exit 1 is exit_nonzero', async () => {
    assert.equal(await sendMacToast(note, { log: quiet, execFileImpl: failWith({ code: 1 }) }), false);
    assert.equal(takeFailure('toast'), 'exit_nonzero');
  });
});

describe('wsl toast reasons', () => {
  const note = { title: 'T', message: 'M' };
  const quiet = () => {};

  it('a script path wslpath cannot translate is unsupported', async () => {
    const run = { toWindowsPath: async () => null };
    assert.equal(await sendWslToast(note, { log: quiet, run }), false);
    assert.equal(takeFailure('toast'), 'unsupported');
  });
  it('every PowerShell missing is spawn_error; one that ran and failed names the failure', async () => {
    const missing = { ok: false, err: Object.assign(new Error('x'), { code: 'ENOENT' }), stderr: '' };
    const run = { toWindowsPath: async () => 'C:\toast-wsl.ps1', runToast: async () => missing };
    assert.equal(await sendWslToast(note, { log: quiet, run }), false);
    assert.equal(takeFailure('toast'), 'spawn_error');

    const results = [missing, missing, { ok: false, err: Object.assign(new Error('x'), { code: 1 }), stderr: '' }, missing];
    const mixed = { ...run, runToast: async () => results.shift() };
    assert.equal(await sendWslToast(note, { log: quiet, run: mixed }), false);
    assert.equal(takeFailure('toast'), 'exit_nonzero');
  });
});

describe('ntfy and webhook reasons (real local HTTP server)', () => {
  const n = { title: 'T', message: 'm' };
  let status = 200;

  // A server that answers `status`, plus helpers that hand back its base URL.
  const withServer = async (fn) => {
    const server = http.createServer((req, res) => { req.resume(); req.on('end', () => { res.statusCode = status; res.end('x'); }); });
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    try { return await fn(`http://127.0.0.1:${server.address().port}`); } finally { await new Promise((r) => server.close(r)); }
  };
  // A URL nothing listens on: bind a port, then release it.
  const deadUrl = () => withServer(async (b) => b);

  it('ntfy 4xx and 5xx', async () => {
    await withServer(async (base) => {
      status = 404;
      assert.equal(await sendNtfy({ server: base, topic: 't' }, n), false);
      assert.equal(takeFailure('ntfy'), 'http_4xx');
      status = 503;
      assert.equal(await sendNtfy({ server: base, topic: 't' }, n), false);
      assert.equal(takeFailure('ntfy'), 'http_5xx');
    });
  });
  it('ntfy refused connection is network', async () => {
    const dead = await deadUrl();
    assert.equal(await sendNtfy({ server: dead, topic: 't' }, n), false);
    assert.equal(takeFailure('ntfy'), 'network');
  });
  it('ntfy fallback that delivers leaves no failure behind', async () => {
    const dead = await deadUrl();
    await withServer(async (live) => {
      status = 200;
      assert.equal(await sendNtfy({ server: dead, topic: 't', fallbackServer: live }, n), true);
      assert.equal(takeFailure('ntfy'), 'other');
    });
  });
  it('ntfy: when the fallback fails too, its reason is the one reported', async () => {
    const dead = await deadUrl();
    await withServer(async (live) => {
      status = 500;
      assert.equal(await sendNtfy({ server: dead, topic: 't', fallbackServer: live }, n), false);
      assert.equal(takeFailure('ntfy'), 'http_5xx');
    });
  });
  it('ntfy without a topic is other', async () => {
    assert.equal(await sendNtfy({ topic: '' }, n), false);
    assert.equal(takeFailure('ntfy'), 'other');
  });
  it('webhook 4xx and 5xx', async () => {
    await withServer(async (base) => {
      status = 401;
      assert.equal(await sendWebhook({ url: base }, n), false);
      assert.equal(takeFailure('webhook'), 'http_4xx');
      status = 502;
      assert.equal(await sendWebhook({ url: base }, n), false);
      assert.equal(takeFailure('webhook'), 'http_5xx');
    });
  });
  it('webhook timeout, refused connection and bad url', async () => {
    const hang = http.createServer(() => {});
    await new Promise((r) => hang.listen(0, '127.0.0.1', r));
    try {
      assert.equal(await sendWebhook({ url: `http://127.0.0.1:${hang.address().port}` }, n, { timeoutMs: 100 }), false);
      assert.equal(takeFailure('webhook'), 'timeout');
    } finally {
      hang.closeAllConnections?.();
      await new Promise((r) => hang.close(r));
    }
    assert.equal(await sendWebhook({ url: await deadUrl() }, n), false);
    assert.equal(takeFailure('webhook'), 'network');
    assert.equal(await sendWebhook({ url: 'not a url' }, n), false);
    assert.equal(takeFailure('webhook'), 'other');
  });
});
