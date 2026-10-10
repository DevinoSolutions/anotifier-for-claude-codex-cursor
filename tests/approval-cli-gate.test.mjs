// tests/approval-cli-gate.test.mjs — the experimental remote-approval commands
// exist only with ANOTIFIER_EXPERIMENTAL_APPROVAL=1 (design D4), so a release
// cannot hand them to users before the real-phone check. Real CLI, throwaway HOME.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

describe('remote approval CLI gate', () => {
  let home;
  before(() => { home = fs.mkdtempSync(path.join(os.tmpdir(), 'aan-approval-gate-')); });
  after(() => fs.rmSync(home, { recursive: true, force: true }));

  const cli = (args, extraEnv = {}) => {
    const env = { ...process.env, HOME: home, USERPROFILE: home, NO_COLOR: '1', ...extraEnv };
    if (!('ANOTIFIER_EXPERIMENTAL_APPROVAL' in extraEnv)) delete env.ANOTIFIER_EXPERIMENTAL_APPROVAL;
    return spawnSync(process.execPath, ['cli/index.mjs', ...args], { cwd: repoRoot, env, encoding: 'utf8', timeout: 30000 });
  };

  for (const command of ['approval', 'away']) {
    it(`"${command}" is an unknown command without the flag`, () => {
      const r = cli([command, 'status']);
      assert.equal(r.status, 1);
      assert.match(r.stderr, new RegExp(`Unknown command "${command}"`));
    });

    it(`"${command}" is not an unknown command with ANOTIFIER_EXPERIMENTAL_APPROVAL=1`, () => {
      const r = cli([command, 'status'], { ANOTIFIER_EXPERIMENTAL_APPROVAL: '1' });
      assert.doesNotMatch(r.stderr, /Unknown command/);
    });
  }

  it('--help never mentions the experimental commands', () => {
    const r = cli(['--help'], { ANOTIFIER_EXPERIMENTAL_APPROVAL: '1' });
    assert.equal(r.status, 0);
    assert.doesNotMatch(r.stdout, /\bapproval\b|\baway\b/);
  });
});
