// tests/turn-duration-helpers.mjs — read the fake HOME's errors.log (lines).
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

export function readErrorLog() {
  try {
    return fs.readFileSync(path.join(os.homedir(), '.anotifier', 'errors.log'), 'utf8').split('\n').filter(Boolean);
  } catch { return []; }
}
