// tests/update-check.test.mjs — the cached update check (CL-04/CL-11).
// Network is dependency-injected, so these run fully offline.
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { resolveUpdate, UPDATE_TTL_MS, isNewer } from '../src/update-check.mjs';

const tmpDir = path.join(os.tmpdir(), 'update-check-test-' + Date.now());
const cachePath = () => path.join(tmpDir, `.update-check-${Math.random().toString(36).slice(2)}.json`);

describe('resolveUpdate caching', () => {
  beforeEach(() => fs.mkdirSync(tmpDir, { recursive: true }));
  afterEach(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

  it('fetches and persists the result when no cache exists', async () => {
    const cp = cachePath();
    let calls = 0;
    const res = await resolveUpdate(cp, async () => { calls++; return '9.9.9'; }, 1_000_000);
    assert.equal(res, '9.9.9');
    assert.equal(calls, 1);
    const cached = JSON.parse(fs.readFileSync(cp, 'utf8'));
    assert.equal(cached.latest, '9.9.9');
    assert.equal(cached.checkedAt, 1_000_000);
  });

  it('serves a fresh cache without touching the network', async () => {
    const cp = cachePath();
    fs.writeFileSync(cp, JSON.stringify({ checkedAt: 1000, latest: '8.8.8' }));
    let calls = 0;
    const res = await resolveUpdate(cp, async () => { calls++; return '9.9.9'; }, 1000 + UPDATE_TTL_MS - 1);
    assert.equal(res, '8.8.8');
    assert.equal(calls, 0);
  });

  it('re-fetches once the TTL has expired', async () => {
    const cp = cachePath();
    fs.writeFileSync(cp, JSON.stringify({ checkedAt: 1000, latest: '8.8.8' }));
    let calls = 0;
    const res = await resolveUpdate(cp, async () => { calls++; return '9.9.9'; }, 1000 + UPDATE_TTL_MS + 1);
    assert.equal(res, '9.9.9');
    assert.equal(calls, 1);
  });

  it('caches the attempt time even when the check fails (offline stays quiet)', async () => {
    const cp = cachePath();
    const res = await resolveUpdate(cp, async () => { throw new Error('offline'); }, 5000);
    assert.equal(res, null);
    const cached = JSON.parse(fs.readFileSync(cp, 'utf8'));
    assert.equal(cached.checkedAt, 5000);
    assert.equal(cached.latest, null);
  });

  it('preserves lastNotifiedVersion, which the hook path owns in the same file', async () => {
    // A CLI-side check must not wipe the hook's "already told them" marker, or
    // the next hook run would re-announce a version the user has already seen.
    const cp = cachePath();
    fs.writeFileSync(cp, JSON.stringify({ checkedAt: 1000, latest: '9.9.9', lastNotifiedVersion: '9.9.9' }));
    await resolveUpdate(cp, async () => '9.9.9', 1000 + UPDATE_TTL_MS + 1);
    const cached = JSON.parse(fs.readFileSync(cp, 'utf8'));
    assert.equal(cached.lastNotifiedVersion, '9.9.9');
  });
});

describe('isNewer — semver "should we nag?" gate', () => {
  it('true only when strictly newer, field-by-field numeric (1.10.0 > 1.9.0)', () => {
    assert.equal(isNewer('1.10.0', '1.9.0'), true);
    assert.equal(isNewer('2.0.0', '1.9.9'), true);
    assert.equal(isNewer('1.2.2', '1.2.1'), true);
  });
  it('false when equal or OLDER — never nags a user to downgrade (repo 1.2.1 vs npm 1.0.6)', () => {
    assert.equal(isNewer('1.2.1', '1.2.1'), false);
    assert.equal(isNewer('1.0.6', '1.2.1'), false);
    assert.equal(isNewer('1.9.0', '1.10.0'), false);
  });
  it('unparseable input is treated as not-newer (stays quiet)', () => {
    assert.equal(isNewer('garbage', '1.2.1'), false);
    assert.equal(isNewer('', '1.2.1'), false);
    assert.equal(isNewer(undefined, '1.2.1'), false);
    assert.equal(isNewer('1.2.1', 'garbage'), true, 'garbage parses to 0.0.0, so anything real beats it');
  });

  it('compares the numeric core of a prerelease, ignoring the tag', () => {
    // Documented contract: pre-release/build metadata is stripped before the
    // compare. npm's `latest` dist-tag points at stable releases, so this only
    // matters for hand-published tags — 1.3.0-beta.1 and 1.3.0 rank EQUAL.
    assert.equal(isNewer('1.3.0-beta.1', '1.2.2'), true);
    assert.equal(isNewer('1.3.0', '1.3.0-beta.1'), false);
    assert.equal(isNewer('1.2.2+build.5', '1.2.2'), false);
  });
});
