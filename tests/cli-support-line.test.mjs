// tests/cli-support-line.test.mjs — where the support/docs URLs may and may NOT
// appear. Spawns the real CLI (offline: a fresh seeded update cache means no
// registry request) and asserts:
//   --help          → both the docs URL and the support URL
//   status          → the support line, once, at the end
//   doctor --json   → neither (stdout must stay valid JSON)
// The hook path (src/notify.mjs) is covered separately: it must never print them.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { SUPPORT_URL, DOCS_URL } from '../src/support.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function runCli(args) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'aan-support-'));
  const cfgDir = path.join(home, '.anotifier');
  fs.mkdirSync(cfgDir, { recursive: true });
  // Fresh cache → served from disk, no network.
  fs.writeFileSync(path.join(cfgDir, '.update-check.json'), JSON.stringify({ checkedAt: Date.now(), latest: null }));
  const res = spawnSync(process.execPath, ['cli/index.mjs', ...args], {
    cwd: repoRoot,
    env: { ...process.env, HOME: home, USERPROFILE: home, NO_COLOR: '1' },
    encoding: 'utf8',
    timeout: 30000,
  });
  fs.rmSync(home, { recursive: true, force: true });
  return { status: res.status, stdout: res.stdout || '', stderr: res.stderr || '' };
}

const count = (hay, needle) => hay.split(needle).length - 1;

describe('support & docs URLs in CLI output', () => {
  it('--help prints the docs URL and the support URL', () => {
    const res = runCli(['--help']);
    assert.equal(res.status, 0, res.stderr);
    assert.ok(res.stdout.includes(DOCS_URL), `missing docs URL:\n${res.stdout}`);
    assert.ok(res.stdout.includes(SUPPORT_URL), `missing support URL:\n${res.stdout}`);
  });

  it('status ends with exactly one support line', () => {
    const res = runCli(['status']);
    assert.equal(res.status, 0, res.stderr);
    assert.equal(count(res.stdout, SUPPORT_URL), 1, res.stdout);
    assert.match(res.stdout, /consider supporting/i);
    // "at the end": nothing but whitespace (and ANSI resets — ui.mjs colors
    // regardless of NO_COLOR) follows the support line.
    const plain = res.stdout.replace(/\x1b\[[0-9;]*m/g, '');
    const after = plain.slice(plain.indexOf(SUPPORT_URL) + SUPPORT_URL.length);
    assert.equal(after.trim(), '', `support line must be last, got trailing: ${JSON.stringify(after)}`);
  });

  it('doctor --json stays machine-parseable and carries neither URL', () => {
    const res = runCli(['doctor', '--json']);
    // doctor exits 1 when a check fails (e.g. ntfy unconfigured is only a warn,
    // but a missing backend on a bare runner can fail) — parseability is the
    // contract here, not the exit code.
    const parsed = JSON.parse(res.stdout);
    assert.ok(Array.isArray(parsed.checks));
    assert.ok(!res.stdout.includes(SUPPORT_URL), res.stdout);
    assert.ok(!res.stdout.includes(DOCS_URL), res.stdout);
  });

  it('the hook path never imports or prints the support line', () => {
    const notify = fs.readFileSync(path.join(repoRoot, 'src', 'notify.mjs'), 'utf8');
    assert.ok(!notify.includes('support.mjs'), 'src/notify.mjs must not import src/support.mjs');
    assert.ok(!notify.includes('sponsors/'), 'src/notify.mjs must not mention sponsorship');
  });
});
