// tests/update-banner.test.mjs — regression for the stale "v1.3.0 → v1.3.0"
// banner. Both CLI call sites used to print whatever version the shared
// .update-check.json cache held, so for up to the 24h TTL after an upgrade they
// nagged you to install the version you had just installed. The semver gate is
// now re-asserted at both sites, exactly as the hook path already did.
//
// Every case seeds a FRESH cache, so the CLI is served entirely from disk and
// these run offline.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { makeTmpHome } from './fake-home.mjs';

const require = createRequire(import.meta.url);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = require('../package.json');

// Runs the real CLI with a throwaway HOME whose update cache claims `latest`.
function runCli(args, latest, { configText } = {}) {
  const home = makeTmpHome('aan-banner-');
  const cfgDir = path.join(home, '.anotifier');
  fs.mkdirSync(cfgDir, { recursive: true });
  fs.writeFileSync(
    path.join(cfgDir, '.update-check.json'),
    JSON.stringify({ checkedAt: Date.now(), latest }), // fresh: no network
  );
  if (configText !== undefined) fs.writeFileSync(path.join(cfgDir, 'config.json'), configText);
  const res = spawnSync(process.execPath, ['cli/index.mjs', ...args], {
    cwd: repoRoot,
    env: { ...process.env, HOME: home, USERPROFILE: home },
    encoding: 'utf8',
    timeout: 30000,
  });
  fs.rmSync(home, { recursive: true, force: true });
  return { status: res.status, stdout: res.stdout || '', stderr: res.stderr || '' };
}

// `--version` exercises the banner as cli/index.mjs places it (after the output);
// `status` places the same banner itself, above its support line, and index
// skips it for that command, so it exercises the second call site.
for (const [label, args] of [['--version', ['--version']], ['status', ['status']]]) {
  describe(`update banner via \`anotifier ${label}\``, () => {
    it('stays quiet when the cached version is the one already installed', () => {
      const res = runCli(args, pkg.version);
      assert.equal(res.status, 0, res.stderr);
      assert.ok(!res.stdout.includes('Update available'), `banner must not fire for v${pkg.version}: ${res.stdout}`);
    });

    it('stays quiet when the cached version is OLDER than the installed one', () => {
      const res = runCli(args, '0.0.1');
      assert.equal(res.status, 0, res.stderr);
      assert.ok(!res.stdout.includes('Update available'), `never nag a downgrade: ${res.stdout}`);
    });

    it('still fires for a genuinely newer version', () => {
      const res = runCli(args, '99.0.0');
      assert.equal(res.status, 0, res.stderr);
      assert.ok(res.stdout.includes('Update available'), `banner should fire: ${res.stdout}`);
      assert.ok(res.stdout.includes('99.0.0'), res.stdout);
    });

    it('stays quiet when the cache holds no version at all', () => {
      const res = runCli(args, null);
      assert.equal(res.status, 0, res.stderr);
      assert.ok(!res.stdout.includes('Update available'), res.stdout);
    });
  });
}

// One implementation (cli/update-banner.mjs), two placements. Pinned here so a
// refactor cannot print it twice, drop it, or move it.
describe('update banner placement', () => {
  const BANNER = /  ↑ Update available: v\S+ → v99\.0\.0\n    npm i -g anotifier@latest\n/g;
  const ansi = (text) => text.replace(/\x1b\[[0-9;]*m/g, '');

  it('--version: printed once, after the version line, ending in a blank line', () => {
    const res = runCli(['--version'], '99.0.0');
    const out = ansi(res.stdout);
    assert.equal((out.match(BANNER) || []).length, 1, out);
    assert.ok(out.indexOf('anotifier v') < out.indexOf('Update available'), out);
    assert.ok(out.endsWith('npm i -g anotifier@latest\n\n'), JSON.stringify(out));
  });

  it('status: printed exactly once, after a blank line and above the support line', () => {
    const res = runCli(['status'], '99.0.0');
    assert.equal(res.status, 0, res.stderr);
    const out = ansi(res.stdout);
    assert.equal((out.match(BANNER) || []).length, 1, out);
    const at = out.indexOf('  ↑ Update available');
    assert.equal(out.slice(at - 2, at), '\n\n', 'a blank line comes first');
    const support = out.indexOf('anotifier is free');
    assert.ok(support > at, 'the support line comes after the banner');
    assert.match(out.slice(at, support), /npm i -g anotifier@latest\n\n  /, 'one blank line between banner and support line');
    assert.ok(out.endsWith('\n\n'), 'status still ends with its trailing blank line');
  });

  it('status with a broken config prints the error and no banner (index must not add one)', () => {
    const res = runCli(['status'], '99.0.0', { configText: '{ not json' });
    assert.equal(res.status, 1);
    assert.ok(!res.stdout.includes('Update available'), res.stdout);
  });

  it('doctor --json stays pure JSON, banner or not', () => {
    const res = runCli(['doctor', '--json'], '99.0.0');
    assert.ok(!res.stdout.includes('Update available'), res.stdout);
    assert.doesNotThrow(() => JSON.parse(res.stdout));
  });
});
