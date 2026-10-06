// tests/cli-plain-output.test.mjs — the first thing `npx anotifier` prints.
// When an agent runs `npx anotifier setup` through its shell tool, or a user
// pipes the output, stdout is not a terminal: the output must be plain text,
// not 24-bit colour escapes. NO_COLOR forces plain text, FORCE_COLOR forces
// colour. Also guards the banner against the pre-rename "AI Notify" art.
// Spawns the real CLI offline (a fresh update cache means no registry call).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { colorEnabled } from '../cli/ui.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ANSI = /\x1b\[/;

function runCli(args, extraEnv) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'aan-plain-'));
  const cfgDir = path.join(home, '.anotifier');
  fs.mkdirSync(cfgDir, { recursive: true });
  fs.writeFileSync(path.join(cfgDir, '.update-check.json'), JSON.stringify({ checkedAt: Date.now(), latest: null }));
  const env = { ...process.env, HOME: home, USERPROFILE: home, ANOTIFIER_TELEMETRY: '0' };
  delete env.NO_COLOR;
  delete env.FORCE_COLOR;
  const res = spawnSync(process.execPath, ['cli/index.mjs', ...args], {
    cwd: repoRoot,
    env: { ...env, ...extraEnv },
    encoding: 'utf8',
    timeout: 30000,
  });
  fs.rmSync(home, { recursive: true, force: true });
  return { status: res.status, stdout: res.stdout || '', stderr: res.stderr || '' };
}

describe('CLI output off a terminal', () => {
  it('--help piped is plain text with the anotifier banner', () => {
    const res = runCli(['--help']);
    assert.equal(res.status, 0, res.stderr);
    assert.ok(!ANSI.test(res.stdout), `escape codes in piped output:\n${JSON.stringify(res.stdout.slice(0, 300))}`);
    // Bottom row of the figlet "anotifier" art; the old banner spelled "AI Notify".
    assert.ok(res.stdout.includes(String.raw` \__,_|_| |_|\___/ \__|_|_| |_|\___|_|`), res.stdout);
    assert.ok(!res.stdout.includes(String.raw`/_\ |_ _|`), 'old "AI Notify" banner is back');
  });

  it('--version piped is plain text', () => {
    const res = runCli(['--version']);
    assert.equal(res.status, 0, res.stderr);
    assert.ok(!ANSI.test(res.stdout), JSON.stringify(res.stdout));
    assert.match(res.stdout, /^anotifier v\d+\.\d+\.\d+/);
  });

  it('FORCE_COLOR=1 brings colour back when piped', () => {
    const res = runCli(['--version'], { FORCE_COLOR: '1' });
    assert.equal(res.status, 0, res.stderr);
    assert.ok(ANSI.test(res.stdout), JSON.stringify(res.stdout));
  });
});

describe('colorEnabled()', () => {
  const tty = { isTTY: true };
  const pipe = { isTTY: undefined };
  it('follows the stream when nothing is set', () => {
    assert.equal(colorEnabled({}, tty), true);
    assert.equal(colorEnabled({}, pipe), false);
  });
  it('NO_COLOR wins, even over FORCE_COLOR', () => {
    assert.equal(colorEnabled({ NO_COLOR: '1' }, tty), false);
    assert.equal(colorEnabled({ NO_COLOR: '1', FORCE_COLOR: '1' }, tty), false);
  });
  it('an empty NO_COLOR is ignored, per no-color.org', () => {
    assert.equal(colorEnabled({ NO_COLOR: '' }, tty), true);
  });
  it('FORCE_COLOR forces either way', () => {
    assert.equal(colorEnabled({ FORCE_COLOR: '1' }, pipe), true);
    assert.equal(colorEnabled({ FORCE_COLOR: '0' }, tty), false);
    assert.equal(colorEnabled({ FORCE_COLOR: 'false' }, tty), false);
  });
});
