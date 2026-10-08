// tests/toast-backend.test.mjs — setup turns toasts off when it finds no toast
// backend (and says so in status/doctor), and turns them back on once one exists.
// Pure functions, so these run on any OS.
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  applyToastBackendResult, toastOffBySetup, toastOffNoBackendLabel, TOAST_INSTALL_HINT,
  probeCommand, isProbeTimeout,
} from '../cli/toast-backend.mjs';
import { noteSetupDisabledToast, has } from '../cli/doctor-checks.mjs';
import { loadConfigResult, saveConfig } from '../src/config-loader.mjs';

describe('applyToastBackendResult', () => {
  it('backend missing + toasts on -> off, flagged', () => {
    const config = { toast: { enabled: true, clickToFocus: false } };
    assert.equal(applyToastBackendResult(config, false), 'disabled');
    assert.equal(config.toast.enabled, false);
    assert.equal(config.toast.disabledBySetup, true);
    assert.equal(config.toast.clickToFocus, false);
  });

  it('re-run with the backend present -> back on, flag cleared', () => {
    const config = { toast: { enabled: false, disabledBySetup: true } };
    assert.equal(applyToastBackendResult(config, true), 'enabled');
    assert.equal(config.toast.enabled, true);
    assert.ok(!('disabledBySetup' in config.toast));
  });

  it('user turned toasts off (no flag) -> stays off with the backend missing or present', () => {
    for (const ready of [false, true]) {
      const config = { toast: { enabled: false } };
      assert.equal(applyToastBackendResult(config, ready), null);
      assert.equal(config.toast.enabled, false);
      assert.ok(!('disabledBySetup' in config.toast));
    }
  });

  it('backend missing + already off by setup -> unchanged, flag kept', () => {
    const config = { toast: { enabled: false, disabledBySetup: true } };
    assert.equal(applyToastBackendResult(config, false), null);
    assert.deepEqual(config.toast, { enabled: false, disabledBySetup: true });
  });

  it('probe could not tell (null, e.g. timeout) never changes the config, flag or no flag', () => {
    for (const toast of [{ enabled: true }, { enabled: false }, { enabled: true, disabledBySetup: true }, { enabled: false, disabledBySetup: true }]) {
      const config = { toast: { ...toast } };
      assert.equal(applyToastBackendResult(config, null), null);
      assert.deepEqual(config.toast, toast);
    }
  });

  it('enabled + stale disabledBySetup + backend missing -> setup turns it off again and keeps the flag (intended)', () => {
    const config = { toast: { enabled: true, disabledBySetup: true } };
    assert.equal(applyToastBackendResult(config, false), 'disabled');
    assert.deepEqual(config.toast, { enabled: false, disabledBySetup: true });
  });

  it('backend present + toasts on -> nothing to do; a stale flag is dropped', () => {
    const on = { toast: { enabled: true } };
    assert.equal(applyToastBackendResult(on, true), null);
    assert.deepEqual(on.toast, { enabled: true });
    const stale = { toast: { enabled: true, disabledBySetup: true } };
    assert.equal(applyToastBackendResult(stale, true), null);
    assert.deepEqual(stale.toast, { enabled: true });
  });
});

describe('probeCommand / isProbeTimeout / has', () => {
  const failing = (props) => () => { throw Object.assign(new Error('x'), props); };

  it('uses command -v through /bin/sh, not the which binary', () => {
    let call;
    const r = probeCommand('notify-send', (cmd, args) => { call = [cmd, args]; });
    assert.equal(r, 'found');
    assert.equal(call[0], '/bin/sh');
    assert.match(call[1][1], /^command -v/);
    assert.equal(call[1].at(-1), 'notify-send');
  });

  it('a clean not-found exit is missing; a timeout, kill or unstartable shell is unknown', () => {
    assert.equal(probeCommand('x', failing({ status: 1 })), 'missing');
    assert.equal(probeCommand('x', failing({ status: 127 })), 'missing');
    assert.equal(probeCommand('x', failing({ code: 'ETIMEDOUT', status: null })), 'unknown');
    assert.equal(probeCommand('x', failing({ killed: true, signal: 'SIGTERM', status: null })), 'unknown');
    assert.equal(probeCommand('x', failing({ code: 'ENOENT' })), 'unknown');
  });

  it('isProbeTimeout recognises timeouts and kills only', () => {
    assert.equal(isProbeTimeout(Object.assign(new Error(), { code: 'ETIMEDOUT' })), true);
    assert.equal(isProbeTimeout(Object.assign(new Error(), { killed: true })), true);
    assert.equal(isProbeTimeout(Object.assign(new Error(), { status: 1 })), false);
  });

  it('doctor has(): unix goes through command -v; windows still uses where', () => {
    const calls = [];
    const run = (cmd, args) => { calls.push(cmd); };
    assert.equal(has('notify-send', { platform: 'linux', run }), true);
    assert.equal(has('pwsh', { platform: 'win32', run }), true);
    assert.deepEqual(calls, ['/bin/sh', 'where']);
    assert.equal(has('x', { platform: 'linux', run: failing({ status: 1 }) }), false);
  });
});

describe('status / doctor wording', () => {
  const off = { toast: { enabled: false, disabledBySetup: true } };

  it('toastOffNoBackendLabel names what to install per platform', () => {
    assert.equal(toastOffNoBackendLabel(off, 'linux'), `off, no backend (${TOAST_INSTALL_HINT.linux})`);
    assert.match(toastOffNoBackendLabel(off, 'linux'), /^off, no backend \(install libnotify/);
    assert.match(toastOffNoBackendLabel(off, 'win32'), /PowerShell 7/);
    assert.match(toastOffNoBackendLabel(off, 'wsl'), /interop/);
  });

  it('is null when the user (not setup) turned toasts off, or toasts are on', () => {
    assert.equal(toastOffNoBackendLabel({ toast: { enabled: false } }, 'linux'), null);
    assert.equal(toastOffNoBackendLabel({ toast: { enabled: true, disabledBySetup: true } }, 'linux'), null);
    assert.equal(toastOffBySetup({}), false);
  });

  it('doctor folds it into the existing backend row (no second row)', () => {
    const row = { id: 'toast-backend', channel: 'toast', status: 'warn', detail: 'notify-send missing', hint: 'install libnotify-bin' };
    noteSetupDisabledToast(row, off, 'linux');
    assert.equal(row.detail, `toast: off, no backend (${TOAST_INSTALL_HINT.linux})`);
    assert.equal(row.status, 'warn');
    assert.match(row.hint, /re-run: anotifier setup/);
  });

  it('doctor: backend now present but still flagged off -> says to re-run setup', () => {
    const row = { id: 'toast-backend', channel: 'toast', status: 'ok', detail: 'notify-send present' };
    noteSetupDisabledToast(row, off, 'linux');
    assert.equal(row.status, 'ok');
    assert.match(row.detail, /notify-send present; toasts are still off/);
    assert.match(row.hint, /re-run: anotifier setup/);
  });

  it('doctor leaves the row alone when the user turned toasts off themselves', () => {
    const row = { id: 'toast-backend', channel: 'toast', status: 'warn', detail: 'notify-send missing', hint: 'h' };
    noteSetupDisabledToast(row, { toast: { enabled: false } }, 'linux');
    assert.deepEqual(row, { id: 'toast-backend', channel: 'toast', status: 'warn', detail: 'notify-send missing', hint: 'h' });
  });
});

describe('config validation of toast.disabledBySetup', () => {
  let dir, configPath;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aan-toastflag-'));
    configPath = path.join(dir, 'config.json');
  });
  afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

  it('round-trips through saveConfig and loadConfigResult with no problem', () => {
    const { config } = loadConfigResult(configPath);
    applyToastBackendResult(config, false);
    saveConfig(config, configPath);
    const again = loadConfigResult(configPath);
    assert.equal(again.problem, null);
    assert.equal(again.config.toast.enabled, false);
    assert.equal(again.config.toast.disabledBySetup, true);
  });

  it('a non-boolean flag is reported and dropped', () => {
    fs.writeFileSync(configPath, JSON.stringify({ toast: { disabledBySetup: 'yes' } }), 'utf8');
    const { problem } = loadConfigResult(configPath);
    assert.equal(problem.type, 'validate');
    assert.match(problem.message, /toast\.disabledBySetup/);
  });
});
