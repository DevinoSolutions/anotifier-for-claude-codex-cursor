// tests/channel-failure.test.mjs — why a channel failed: the fixed reason enum,
// the classifiers, and the reason threaded from each sender to the hook counters.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {
  FAILURE_REASONS, failureReason, execFailureReason, httpFailureReason, networkFailureReason,
  noteFailure, runScoped,
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

// Run one send the way the hook does and report { ok, reason }. The reason is only
// meaningful when ok is false (trackChannel reads it on failure alone).
async function scoped(work) {
  const { promise, reason } = runScoped(work);
  return { ok: await promise, reason: reason() };
}

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
  it('noteFailure stores only an enum value, and only inside a scope', async () => {
    assert.deepEqual(await scoped(async () => { noteFailure('toast', 'Command failed: /home/me/secret.ps1'); return false; }), { ok: false, reason: 'other' });
    assert.deepEqual(await scoped(async () => { noteFailure('ntfy', 'http_5xx'); return false; }), { ok: false, reason: 'http_5xx' });
    assert.deepEqual(await scoped(async () => false), { ok: false, reason: 'other' }, 'nothing noted');
    assert.doesNotThrow(() => noteFailure('toast', 'timeout'), 'outside a scope it is a no-op');
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
    assert.deepEqual(await trackChannel('toast', async () => true), { channel: 'toast', ok: true });
  });
  it('a failure carries the reason its sender noted', async () => {
    const send = async () => { noteFailure('toast', 'timeout'); return false; };
    assert.deepEqual(await trackChannel('toast', send), { channel: 'toast', ok: false, reason: 'timeout' });
  });
  it('a failure with nothing noted is other', async () => {
    assert.deepEqual(await trackChannel('webhook', async () => false), { channel: 'webhook', ok: false, reason: 'other' });
  });
  it('a bare promise is accepted and reads other', async () => {
    assert.deepEqual(await trackChannel('webhook', Promise.resolve(false)), { channel: 'webhook', ok: false, reason: 'other' });
  });
  it('a sender that throws, synchronously or not, is other', async () => {
    assert.deepEqual(await trackChannel('ntfy', () => Promise.reject(new Error('boom'))), { channel: 'ntfy', ok: false, reason: 'other' });
    assert.deepEqual(await trackChannel('ntfy', () => { throw new Error('boom'); }), { channel: 'ntfy', ok: false, reason: 'other' });
  });
  it('a reason noted by an unrelated send is not picked up', async () => {
    const stray = runScoped(async () => { noteFailure('toast', 'timeout'); return false; });
    assert.deepEqual(await trackChannel('toast', async () => false), { channel: 'toast', ok: false, reason: 'other' });
    await stray.promise;
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
      const r = await scoped(() => sendBellUnix());
      assert.equal(r.ok, canOpenTty());
      if (!r.ok) assert.equal(r.reason, 'no_tty');
    });
  });
  it('sendBell carries the same reason through', async (t) => {
    if (os.platform() === 'win32') return t.skip('not Unix');
    await withoutTmux(async () => {
      const r = await scoped(() => sendBell());
      if (!r.ok) assert.equal(r.reason, 'no_tty');
    });
  });
});

describe('toast reasons', () => {
  const note = { title: 'T', message: 'M' };
  const failWith = (props) => (cmd, args, opts, cb) => cb(Object.assign(new Error('failed'), props), '', '');
  const quiet = () => {};

  it('windows: a missing pwsh is spawn_error', async () => {
    assert.deepEqual(await scoped(() => sendWindowsToast(note, { platform: 'win32', log: quiet, execFileImpl: failWith({ code: 'ENOENT' }) })), { ok: false, reason: 'spawn_error' });
  });
  it('windows: toast.ps1 exiting 3 is exit_nonzero', async () => {
    assert.deepEqual(await scoped(() => sendWindowsToast(note, { platform: 'win32', log: quiet, execFileImpl: failWith({ code: 3 }) })), { ok: false, reason: 'exit_nonzero' });
  });
  it('windows: the timeout kill is timeout', async () => {
    assert.deepEqual(await scoped(() => sendWindowsToast(note, { platform: 'win32', log: quiet, execFileImpl: failWith({ killed: true, signal: 'SIGTERM', code: null }) })), { ok: false, reason: 'timeout' });
  });
  it('windows: a non-windows host is unsupported', async () => {
    assert.deepEqual(await scoped(() => sendWindowsToast(note, { platform: 'linux' })), { ok: false, reason: 'unsupported' });
  });
  it('windows: success notes nothing', async () => {
    assert.equal((await scoped(() => sendWindowsToast(note, { platform: 'win32', log: quiet, execFileImpl: (c, a, o, cb) => cb(null, '', '') }))).ok, true);
  });
  it('linux: notify-send missing is spawn_error', async () => {
    assert.deepEqual(await scoped(() => sendLinuxToast(note, { log: quiet, execFileImpl: failWith({ code: 'ENOENT' }) })), { ok: false, reason: 'spawn_error' });
  });
  it('macos: osascript exit 1 is exit_nonzero', async () => {
    assert.deepEqual(await scoped(() => sendMacToast(note, { log: quiet, execFileImpl: failWith({ code: 1 }) })), { ok: false, reason: 'exit_nonzero' });
  });
});

describe('wsl toast reasons', () => {
  const note = { title: 'T', message: 'M' };
  const quiet = () => {};

  it('a script path wslpath cannot translate is unsupported', async () => {
    const run = { toWindowsPath: async () => null };
    assert.deepEqual(await scoped(() => sendWslToast(note, { log: quiet, run })), { ok: false, reason: 'unsupported' });
  });
  it('every PowerShell missing is spawn_error; one that ran and failed names the failure', async () => {
    const missing = { ok: false, err: Object.assign(new Error('x'), { code: 'ENOENT' }), stderr: '' };
    const run = { toWindowsPath: async () => 'C:\toast-wsl.ps1', runToast: async () => missing };
    assert.deepEqual(await scoped(() => sendWslToast(note, { log: quiet, run })), { ok: false, reason: 'spawn_error' });

    const results = [missing, missing, { ok: false, err: Object.assign(new Error('x'), { code: 1 }), stderr: '' }, missing];
    const mixed = { ...run, runToast: async () => results.shift() };
    assert.deepEqual(await scoped(() => sendWslToast(note, { log: quiet, run: mixed })), { ok: false, reason: 'exit_nonzero' });
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
      assert.deepEqual(await scoped(() => sendNtfy({ server: base, topic: 't' }, n)), { ok: false, reason: 'http_4xx' });
      status = 503;
      assert.deepEqual(await scoped(() => sendNtfy({ server: base, topic: 't' }, n)), { ok: false, reason: 'http_5xx' });
    });
  });
  it('ntfy refused connection is network', async () => {
    const dead = await deadUrl();
    assert.deepEqual(await scoped(() => sendNtfy({ server: dead, topic: 't' }, n)), { ok: false, reason: 'network' });
  });
  it('ntfy fallback that delivers leaves no failure behind', async () => {
    const dead = await deadUrl();
    await withServer(async (live) => {
      status = 200;
      assert.equal((await scoped(() => sendNtfy({ server: dead, topic: 't', fallbackServer: live }, n))).ok, true);
    });
  });
  it('ntfy: when the fallback fails too, its reason is the one reported', async () => {
    const dead = await deadUrl();
    await withServer(async (live) => {
      status = 500;
      assert.deepEqual(await scoped(() => sendNtfy({ server: dead, topic: 't', fallbackServer: live }, n)), { ok: false, reason: 'http_5xx' });
    });
  });
  it('ntfy without a topic is other', async () => {
    assert.deepEqual(await scoped(() => sendNtfy({ topic: '' }, n)), { ok: false, reason: 'other' });
  });
  it('webhook 4xx and 5xx', async () => {
    await withServer(async (base) => {
      status = 401;
      assert.deepEqual(await scoped(() => sendWebhook({ url: base }, n)), { ok: false, reason: 'http_4xx' });
      status = 502;
      assert.deepEqual(await scoped(() => sendWebhook({ url: base }, n)), { ok: false, reason: 'http_5xx' });
    });
  });
  it('webhook timeout, refused connection and bad url', async () => {
    const hang = http.createServer(() => {});
    await new Promise((r) => hang.listen(0, '127.0.0.1', r));
    try {
      assert.deepEqual(await scoped(() => sendWebhook({ url: `http://127.0.0.1:${hang.address().port}` }, n, { timeoutMs: 100 })), { ok: false, reason: 'timeout' });
    } finally {
      hang.closeAllConnections?.();
      await new Promise((r) => hang.close(r));
    }
    const dead = await deadUrl();
    assert.deepEqual(await scoped(() => sendWebhook({ url: dead }, n)), { ok: false, reason: 'network' });
    assert.deepEqual(await scoped(() => sendWebhook({ url: 'not a url' }, n)), { ok: false, reason: 'other' });
  });
});

// A URL nothing listens on: bind a port, then release it.
async function deadUrl() {
  const server = http.createServer();
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${server.address().port}`;
  await new Promise((r) => server.close(r));
  return url;
}

// A server that holds every request until `hold.open()`, then answers `status`.
function slowServer(hold, status) {
  return http.createServer((req, res) => {
    req.resume();
    req.on('end', () => { hold.p.then(() => { res.statusCode = status; res.end('x'); }); });
  });
}
const listen = (srv) => new Promise((r) => srv.listen(0, '127.0.0.1', r));
const close = (srv) => { srv.closeAllConnections?.(); return new Promise((r) => srv.close(r)); };
const urlOf = (srv) => `http://127.0.0.1:${srv.address().port}`;
const gate = () => { let open; const p = new Promise((r) => { open = r; }); return { p, open }; };

describe('concurrent sends on one channel keep their own reason', () => {
  const quiet = () => {};
  const killed = Object.assign(new Error('x'), { killed: true, signal: 'SIGTERM', code: null });

  it('toast: a timeout is not turned into other by a second toast finishing first', async () => {
    const slow = gate();
    // First toast fails as a timeout, but only after the second one has finished.
    const first = scoped(() => sendWindowsToast({ title: 'T', message: 'M' }, {
      platform: 'win32', log: quiet,
      execFileImpl: (c, a, o, cb) => { slow.p.then(() => cb(killed, '', '')); },
    }));
    // The second fails differently and settles while the first is still pending.
    const second = await scoped(() => sendWindowsToast({ title: 'T', message: 'M' }, {
      platform: 'win32', log: quiet, execFileImpl: (c, a, o, cb) => cb(Object.assign(new Error('x'), { code: 'ENOENT' }), '', ''),
    }));
    assert.deepEqual(second, { ok: false, reason: 'spawn_error' });
    slow.open();
    assert.deepEqual(await first, { ok: false, reason: 'timeout' });
  });

  it('toast: a failing toast and a successful toast do not share a reason', async () => {
    const slow = gate();
    const failing = scoped(() => sendLinuxToast({ title: 'T', message: 'M' }, {
      log: quiet, execFileImpl: (c, a, o, cb) => { slow.p.then(() => cb(Object.assign(new Error('x'), { code: 1 }), '', '')); },
    }));
    const ok = await scoped(() => sendLinuxToast({ title: 'T', message: 'M' }, { log: quiet, execFileImpl: (c, a, o, cb) => cb(null, '', '') }));
    assert.equal(ok.ok, true);
    slow.open();
    assert.deepEqual(await failing, { ok: false, reason: 'exit_nonzero' });
  });

  it('wsl toast: the reason survives another toast finishing while the sound player is pending', async () => {
    const playerGate = gate();
    const missing = { ok: false, err: Object.assign(new Error('x'), { code: 'ENOENT' }), stderr: '' };
    const timedOut = { ok: false, err: killed, stderr: '' };
    const base = { toWindowsPath: async () => 'C:\\toast-wsl.ps1' };
    // A sound file makes sendToast wait on the player promise as well as the toast.
    const soundFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'aan-snd-')), 'a.wav');
    fs.writeFileSync(soundFile, 'x');
    const slowRun = { ...base, runToast: async () => timedOut, runPowerShell: async () => { await playerGate.p; return missing; } };
    const first = scoped(() => sendWslToast({ title: 'T', message: 'M', toastSound: soundFile }, { log: quiet, run: slowRun }));
    const second = await scoped(() => sendWslToast({ title: 'T', message: 'M' }, { log: quiet, run: { ...base, runToast: async () => missing } }));
    assert.deepEqual(second, { ok: false, reason: 'spawn_error' });
    playerGate.open();
    assert.deepEqual(await first, { ok: false, reason: 'timeout' });
  });

  it('ntfy: a send that fails over to a working fallback does not erase another send\'s failure', async () => {
    const hold = gate();
    const live = http.createServer((req, res) => { req.resume(); req.on('end', () => { res.statusCode = 200; res.end('x'); }); });
    const broken = http.createServer((req, res) => { req.resume(); req.on('end', () => { res.statusCode = 503; res.end('x'); }); });
    const slow = slowServer(hold, 503);
    await Promise.all([live, broken, slow].map(listen));
    try {
      const n = { title: 'T', message: 'm' };
      // A: slow primary that ends in a 503, no fallback; finishes last.
      const a = scoped(() => sendNtfy({ server: urlOf(slow), topic: 't' }, n));
      // B: primary 503, then a working fallback; succeeds while A is in flight.
      const b = await scoped(() => sendNtfy({ server: urlOf(broken), topic: 't', fallbackServer: urlOf(live) }, n));
      assert.equal(b.ok, true);
      hold.open();
      assert.deepEqual(await a, { ok: false, reason: 'http_5xx' });
    } finally {
      await Promise.all([live, broken, slow].map(close));
    }
  });

  it('ntfy: two failures at once keep different categories', async () => {
    const hold = gate();
    const slow = slowServer(hold, 404);
    await listen(slow);
    const dead = await deadUrl();
    try {
      const n = { title: 'T', message: 'm' };
      const a = scoped(() => sendNtfy({ server: urlOf(slow), topic: 't' }, n));
      const b = await scoped(() => sendNtfy({ server: dead, topic: 't' }, n));
      assert.deepEqual(b, { ok: false, reason: 'network' });
      hold.open();
      assert.deepEqual(await a, { ok: false, reason: 'http_4xx' });
    } finally {
      await close(slow);
    }
  });
});
