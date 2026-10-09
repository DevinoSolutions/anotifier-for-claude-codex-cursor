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
