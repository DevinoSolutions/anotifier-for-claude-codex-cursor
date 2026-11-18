// tests/probe-binary.test.mjs — the one "is this command on PATH?" probe shared
// by setup, doctor and the WSL backend. Exec and platform are injected, so these
// run the same on any OS.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { probeBinary, isProbeTimeout } from '../src/probe-binary.mjs';

const failing = (props) => () => { throw Object.assign(new Error('x'), props); };

describe('probeBinary (POSIX)', () => {
  it('uses command -v through /bin/sh, not the which binary', () => {
    let call;
    const r = probeBinary('notify-send', { platform: 'linux', run: (cmd, args) => { call = [cmd, args]; } });
    assert.equal(r, 'found');
    assert.equal(call[0], '/bin/sh');
    assert.match(call[1][1], /^command -v/);
    assert.equal(call[1].at(-1), 'notify-send');
  });

  it('a clean not-found exit is missing; a timeout, kill or unstartable shell is unknown', () => {
    const probe = (props) => probeBinary('x', { platform: 'linux', run: failing(props) });
    assert.equal(probe({ status: 1 }), 'missing');
    assert.equal(probe({ status: 127 }), 'missing');
    assert.equal(probe({ code: 'ETIMEDOUT', status: null }), 'unknown');
    assert.equal(probe({ killed: true, signal: 'SIGTERM', status: null }), 'unknown');
    assert.equal(probe({ code: 'ENOENT' }), 'unknown');
  });

  it('passes the timeout through to the exec call (default 10s)', () => {
    const seen = [];
    const run = (cmd, args, opts) => { seen.push(opts.timeout); };
    probeBinary('x', { platform: 'darwin', run });
    probeBinary('x', { platform: 'linux', run, timeout: 5000 });
    assert.deepEqual(seen, [10000, 5000]);
  });
});

describe('probeBinary (Windows)', () => {
  it('asks where.exe', () => {
    let call;
    assert.equal(probeBinary('pwsh', { platform: 'win32', run: (cmd, args) => { call = [cmd, args]; } }), 'found');
    assert.deepEqual(call, ['where', ['pwsh']]);
  });

  it('any failure but a timeout is missing; a timeout is unknown', () => {
    const probe = (props) => probeBinary('pwsh', { platform: 'win32', run: failing(props) });
    assert.equal(probe({ status: 1 }), 'missing');
    assert.equal(probe({ code: 'ENOENT' }), 'missing');
    assert.equal(probe({ code: 'ETIMEDOUT', status: null }), 'unknown');
    assert.equal(probe({ killed: true, signal: 'SIGTERM' }), 'unknown');
  });
});

describe('isProbeTimeout', () => {
  it('recognises timeouts and kills only', () => {
    assert.equal(isProbeTimeout(Object.assign(new Error(), { code: 'ETIMEDOUT' })), true);
    assert.equal(isProbeTimeout(Object.assign(new Error(), { killed: true })), true);
    assert.equal(isProbeTimeout(Object.assign(new Error(), { status: 1 })), false);
    assert.equal(isProbeTimeout(null), false);
  });
});
