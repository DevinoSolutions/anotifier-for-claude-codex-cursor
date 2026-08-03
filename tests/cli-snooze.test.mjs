// tests/cli-snooze.test.mjs — `anotifier snooze` end to end through the real
// CLI entry point, against a throwaway HOME. Run as a subprocess rather than by
// importing cli/snooze.mjs directly: the state path is resolved from the home
// directory, and an in-process test would write a real snooze into the
// developer's own ~/.anotifier.
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

describe('anotifier snooze (real CLI, throwaway HOME)', () => {
  let home, statePath;

  beforeEach(() => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), 'aan-cli-snooze-'));
    statePath = path.join(home, '.anotifier', '.snooze.json');
    // A fresh update cache keeps every run offline (no registry request).
    fs.mkdirSync(path.join(home, '.anotifier'), { recursive: true });
    fs.writeFileSync(path.join(home, '.anotifier', '.update-check.json'),
      JSON.stringify({ checkedAt: Date.now(), latest: null }));
  });
  afterEach(() => fs.rmSync(home, { recursive: true, force: true }));

  const snooze = (...args) => spawnSync(process.execPath, ['cli/index.mjs', 'snooze', ...args], {
    cwd: repoRoot,
    env: { ...process.env, HOME: home, USERPROFILE: home },
    encoding: 'utf8',
    timeout: 30000,
  });

  it('reports "Not snoozed" on a machine that never snoozed', () => {
    const res = snooze();
    assert.equal(res.status, 0, res.stderr);
    assert.match(res.stdout, /Not snoozed/);
  });

  it('a duration writes a future deadline the hook path can read back', () => {
    const before = Date.now();
    const res = snooze('30m');
    assert.equal(res.status, 0, res.stderr);
    assert.match(res.stdout, /Snoozed until \d\d:\d\d/);
    const { until } = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    assert.ok(until >= before + 30 * 60 * 1000, `deadline should be ~30m out, got ${until - before}ms`);
    assert.ok(until <= Date.now() + 30 * 60 * 1000);
    // And a bare `snooze` reports it rather than changing it.
    assert.match(snooze().stdout, /Snoozed until/);
    assert.equal(JSON.parse(fs.readFileSync(statePath, 'utf8')).until, until, 'reporting must not re-snooze');
  });

  it('a bare number is minutes, not milliseconds or seconds', () => {
    const before = Date.now();
    assert.equal(snooze('45').status, 0);
    const { until } = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    assert.ok(until >= before + 45 * 60 * 1000 && until <= Date.now() + 45 * 60 * 1000, `got ${until - before}ms`);
  });

  it('`off` cancels an active snooze and removes the state file', () => {
    snooze('2h');
    const res = snooze('off');
    assert.equal(res.status, 0, res.stderr);
    assert.match(res.stdout, /Snooze cancelled/);
    assert.equal(fs.existsSync(statePath), false);
    assert.match(snooze().stdout, /Not snoozed/);
  });

  it('`off` with nothing to cancel is not an error', () => {
    const res = snooze('off');
    assert.equal(res.status, 0, res.stderr);
    assert.match(res.stdout, /nothing to cancel/);
  });

  // Strict CLI: bad input fails loudly rather than being rounded to a default.
  for (const bad of ['banana', '0', '-5', '1.5h']) {
    it(`exits 1 on \`snooze ${bad}\` and writes no state`, () => {
      const res = snooze(bad);
      assert.equal(res.status, 1, res.stdout);
      assert.match(res.stderr, /Invalid duration/);
      assert.match(res.stderr, new RegExp(bad.replace('.', '\\.')));
      assert.equal(fs.existsSync(statePath), false, 'a rejected duration must not write a snooze');
    });
  }
});
