// src/probe-binary.mjs — is a command on PATH? The one probe the CLI (setup,
// doctor) and the WSL backend share. A leaf module: it imports nothing from
// this package, so both cli/ and src/platforms/ can use it.
import os from 'node:os';
import { execFileSync } from 'node:child_process';

// A probe that timed out (or was killed) says nothing about whether the binary
// exists, so it must never be read as "missing".
export function isProbeTimeout(err) {
  return Boolean(err && (err.killed || err.code === 'ETIMEDOUT' || err.signal));
}

// 'found' | 'missing' | 'unknown'. Windows asks `where`. Everywhere else goes
// through `command -v` in /bin/sh, because the `which` binary is absent on some
// distros even when the tool itself is installed. On POSIX only a clean "not
// found" exit is 'missing': a timeout, or a shell that cannot start, is
// 'unknown'. `platform` and `run` are injectable so tests run on any OS.
export function probeBinary(bin, { platform = os.platform(), run = execFileSync, timeout = 10000 } = {}) {
  if (platform === 'win32') {
    try {
      run('where', [bin], { stdio: 'ignore', timeout });
      return 'found';
    } catch (err) {
      return isProbeTimeout(err) ? 'unknown' : 'missing';
    }
  }
  try {
    run('/bin/sh', ['-c', 'command -v "$1"', 'sh', bin], { stdio: 'ignore', timeout });
    return 'found';
  } catch (err) {
    if (isProbeTimeout(err) || typeof err?.status !== 'number') return 'unknown';
    return 'missing';
  }
}
