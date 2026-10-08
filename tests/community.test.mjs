// tests/community.test.mjs — the community invite has one home per package and
// shows up where a stuck user looks. Spawns the real CLI the same way
// cli-support-line.test.mjs does (offline, seeded update cache) and asserts:
//   COMMUNITY_URL   → the canonical, permanent invite
//   --help          → prints it
//   doctor          → prints it under a run with anything to fix
//   doctor --json   → never (stdout must stay valid JSON)
//   README, site    → link the same invite; no other invite anywhere
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { COMMUNITY_URL } from '../src/support.mjs';

const CANONICAL = 'https://discord.gg/CWDxfEJGcS';
const INVITE = /https?:\/\/(?:www\.)?(?:discord\.gg|discord(?:app)?\.com\/invite)\/[A-Za-z0-9-]+/g;
// Every invite in a text, so assertions compare whole URLs, never substrings.
const invitesIn = (text) => [...text.matchAll(INVITE)].map((m) => m[0]);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function runCli(args) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'aan-community-'));
  const cfgDir = path.join(home, '.anotifier');
  fs.mkdirSync(cfgDir, { recursive: true });
  fs.writeFileSync(path.join(cfgDir, '.update-check.json'), JSON.stringify({ checkedAt: Date.now(), latest: null }));
  const res = spawnSync(process.execPath, ['cli/index.mjs', ...args], {
    cwd: repoRoot,
    env: { ...process.env, HOME: home, USERPROFILE: home, NO_COLOR: '1' },
    encoding: 'utf8',
    timeout: 60000,
  });
  fs.rmSync(home, { recursive: true, force: true });
  return { status: res.status, stdout: res.stdout || '', stderr: res.stderr || '' };
}

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    if (['node_modules', '.git', '.next', 'out'].includes(e.name)) return [];
    const p = path.join(dir, e.name);
    return e.isDirectory() ? walk(p) : [p];
  });
}

describe('community invite', () => {
  it('COMMUNITY_URL is the canonical invite', () => {
    assert.equal(COMMUNITY_URL, CANONICAL);
  });

  it('--help prints it', () => {
    const res = runCli(['--help']);
    assert.equal(res.status, 0, res.stderr);
    assert.ok(invitesIn(res.stdout).some((u) => u === CANONICAL), res.stdout);
  });

  it('doctor points at it when there is something to fix, doctor --json never', () => {
    // A fresh HOME has no ntfy topic, so doctor always has at least a warn.
    const human = runCli(['doctor']);
    assert.match(human.stdout, /⚠|✗/, human.stdout);
    assert.ok(invitesIn(human.stdout).some((u) => u === CANONICAL), human.stdout);
    const json = runCli(['doctor', '--json']);
    JSON.parse(json.stdout);
    assert.deepEqual(invitesIn(json.stdout), [], json.stdout);
  });

  it('the hook path never prints it', () => {
    const notify = fs.readFileSync(path.join(repoRoot, 'src', 'notify.mjs'), 'utf8');
    assert.deepEqual(invitesIn(notify), [], 'src/notify.mjs must not mention the community invite');
  });

  it('the README has a Community section linking it', () => {
    // A Windows checkout (core.autocrlf) has CRLF line endings.
    const readme = fs.readFileSync(path.join(repoRoot, 'README.md'), 'utf8').replace(/\r\n/g, '\n');
    const section = readme.split('\n## Community\n')[1]?.split('\n## ')[0] ?? '';
    assert.ok(invitesIn(section).some((u) => u === CANONICAL), 'README ## Community must link the invite');
  });

  it('the website reads the same invite from its one constant', () => {
    const site = fs.readFileSync(path.join(repoRoot, 'landing', 'lib', 'site.ts'), 'utf8');
    assert.match(site, new RegExp(`export const COMMUNITY_URL = "${CANONICAL}";`));
  });

  it('no other Discord invite ships anywhere in the repo', () => {
    for (const file of walk(repoRoot)) {
      if (!/\.(m?js|ts|tsx|md|txt|json|yml)$/.test(file)) continue;
      for (const [url] of fs.readFileSync(file, 'utf8').matchAll(INVITE)) {
        assert.equal(url, CANONICAL, `${path.relative(repoRoot, file)} links a non-canonical invite`);
      }
    }
  });
});
