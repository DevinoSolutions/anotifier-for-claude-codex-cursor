// Test helper: point HOME/USERPROFILE at a throwaway dir for the whole test file, so
// logHookError (baseDir defaults to os.homedir()) never appends to the developer's real
// ~/.anotifier/errors.log. Call once at the top level of a test file.
import { before } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export function useFakeHome() {
  const saved = { HOME: process.env.HOME, USERPROFILE: process.env.USERPROFILE };
  let dir;
  // Restore on process exit rather than in an after() hook: client sockets torn down by a
  // file's own after() hook can still log ("socket hang up") a tick later, and that late
  // write must still land in the fake home.
  const restore = () => {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k]; else process.env[k] = v;
    }
    if (dir) fs.rmSync(dir, { recursive: true, force: true });
  };
  before(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aan-fakehome-'));
    process.env.HOME = dir;
    process.env.USERPROFILE = dir;
    process.once('exit', restore);
  });
}

// Test helper: make a spawned hook or CLI hermetic with respect to the update
// check. Both read `<home>/.anotifier/.update-check.json` and, when it is missing
// or older than 24 h, ask registry.npmjs.org for the latest version. A test that
// spawns notify.mjs or cli/index.mjs must never reach the network: it would be
// slow offline, and it fails on any checkout whose version is behind npm's latest
// (the hook announces the update on a channel the test did not expect). A fresh
// "nothing newer" cache is the product's own offline state: no request is made and
// nothing is announced. This works for the hook and the CLI alike, whatever the
// test's config.json says. An existing cache file is left alone, so a test that
// seeds its own (update-banner, update-notify) keeps full control.
export function seedFreshUpdateCache(home, now = Date.now()) {
  const dir = path.join(home, '.anotifier');
  const file = path.join(dir, '.update-check.json');
  if (fs.existsSync(file)) return;
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(file, JSON.stringify({ checkedAt: now, latest: null }));
}

// Test helper: a throwaway HOME for a test that spawns the hook or the CLI (or
// feeds a module an explicit base dir). Returns the directory; the caller removes
// it. With `config`, also writes it as `<home>/.anotifier/config.json`, the one
// setup step nearly every hook test repeats. useFakeHome() is the other tool: it
// redirects THIS process's HOME for a whole file, this one hands out a HOME for a
// child process or an injected path.
export function makeTmpHome(prefix = 'aan-home-', { config } = {}) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  if (config !== undefined) {
    const dir = path.join(home, '.anotifier');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'config.json'), typeof config === 'string' ? config : JSON.stringify(config));
  }
  return home;
}
