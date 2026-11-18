// src/state-file.mjs — the small-JSON-file primitives shared by every module that
// keeps state in ~/.anotifier: read a JSON object, write a file atomically, and
// take an exclusive lock file around a read-modify-write.
//
// A leaf module on purpose: it imports only error-log.mjs (itself a leaf apart
// from the Sentry sender), so config-loader, usage-alert, turn-timer and the rest
// can all depend on it without an import cycle.
//
// What is NOT here, deliberately: telemetry.mjs (its in-place write and CORRUPT
// grace state machine are a different design) and notify.mjs's dedup lock (a
// different, shorter wait with no Windows release handling).
import fs from 'node:fs';
import path from 'node:path';
import { logHookError } from './error-log.mjs';

export const sleepSync = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

// Read a JSON object from `file` and say HOW it went, because callers differ on
// what a bad read means:
//   { status: 'ok',         data: <the object> }
//   { status: 'missing',    data: {} }              ENOENT: nothing stored yet
//   { status: 'corrupt',    data: {} }              not JSON, or JSON that is not a plain object
//   { status: 'unreadable', data: {}, error }       any other read error (EBUSY, EACCES, EISDIR, ...)
// `data` is always an object, so a caller that does not care can use it as is.
export function readJsonFile(file) {
  let raw;
  try {
    raw = fs.readFileSync(file, 'utf8');
  } catch (error) {
    return error?.code === 'ENOENT'
      ? { status: 'missing', data: {} }
      : { status: 'unreadable', data: {}, error };
  }
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? { status: 'ok', data: parsed }
      : { status: 'corrupt', data: {} };
  } catch {
    return { status: 'corrupt', data: {} };
  }
}

// The common case of readJsonFile: the object, with {} for a missing or corrupt
// file (nothing stored yet) and null for a file that could not be READ. A caller
// that reads, changes and writes back must treat null as "skip this round":
// writing back from an empty stand-in would wipe whatever the file really holds
// (other sessions' entries, an already-sent warning). `label`, when given, logs
// the read error to errors.log so a path that stays unreadable shows up in
// `anotifier status` instead of silently ending a feature.
export function readJsonObject(file, label) {
  const { status, data, error } = readJsonFile(file);
  if (status !== 'unreadable') return data;
  if (label) logHookError(label, error);
  return null;
}

// Atomic write: temp file + rename, so a crash mid-write can never leave a
// truncated file behind. `mode` (e.g. 0o600) is applied to the temp file and
// chmod-ed again (best effort; Windows has no POSIX modes) because the write's
// own mode is masked by the umask; the rename then replaces any older, looser
// file. `dirMode` is the mode for a directory created on the way. Pass
// `mkdir: false` when the caller has already made (and vetted) the directory.
// Throws on failure; callers decide whether that is fatal.
export function writeFileAtomic(file, content, { mode, dirMode, mkdir = true } = {}) {
  if (mkdir) {
    fs.mkdirSync(path.dirname(file), dirMode === undefined ? { recursive: true } : { recursive: true, mode: dirMode });
  }
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, content, mode === undefined ? 'utf8' : { encoding: 'utf8', mode });
  if (mode !== undefined) {
    try { fs.chmodSync(tmp, mode); } catch { /* Windows: no POSIX modes */ }
  }
  fs.renameSync(tmp, file);
}

// writeFileAtomic for a value, as compact JSON (what the hook-path state files use).
export function writeJsonAtomic(file, value, options) {
  writeFileAtomic(file, JSON.stringify(value), options);
}

// ── Exclusive lock file ──────────────────────────────────────────────
// Several chats refresh their statuslines at once, so a read-decide-write runs
// under an exclusive lock file. A run that cannot get the lock simply skips: the
// holder is evaluating the same shared numbers.
//
// On Windows, creating a file that another process has just unlinked, while a
// handle to it is still open, fails with EPERM (or EACCES/EBUSY) rather than
// EEXIST. That is the lock being released, not a permissions problem. A real
// permissions problem leaves no lock file behind, so stat tells them apart. A
// lock older than the stale age should have been cleared first; one that is
// still there could not be deleted, which would silence every warning, so it
// is reported too. Stat can lose the race: the other chat may finish unlinking
// between our failed create and our stat, leaving nothing to see. So a release
// code with no lock file is retried once after a short wait; only a failure
// that still looks like a real problem is reported.
export const DEFAULT_LOCK_STALE_MS = 5000;
const RELEASE_CODES = ['EPERM', 'EACCES', 'EBUSY'];
const RETRY_WAIT_MS = 25;

function lockBeingReleased(lockPath, err, staleMs) {
  if (!RELEASE_CODES.includes(err?.code)) return false;
  try {
    return Date.now() - fs.statSync(lockPath).mtimeMs <= staleMs;
  } catch {
    return false;
  }
}

// Runs `fn` while holding `lockPath` and returns its result, or null when the
// lock could not be had (held by someone else, or a problem that was logged
// under `label`). `staleMs` is how old a lock file must be before it is taken
// to be a crashed holder's and deleted.
export function withLock(lockPath, fn, label = 'state-file:lock', { staleMs = DEFAULT_LOCK_STALE_MS } = {}) {
  try {
    const st = fs.statSync(lockPath);
    if (Date.now() - st.mtimeMs > staleMs) fs.unlinkSync(lockPath);
  } catch {}
  let fd;
  try {
    fs.mkdirSync(path.dirname(lockPath), { recursive: true });
    try {
      fd = fs.openSync(lockPath, 'wx');
    } catch (err) {
      if (!RELEASE_CODES.includes(err?.code)) throw err;
      if (lockBeingReleased(lockPath, err, staleMs)) return null;
      sleepSync(RETRY_WAIT_MS);
      fd = fs.openSync(lockPath, 'wx');
    }
  } catch (err) {
    // EEXIST: another chat holds it. Anything else (permissions, a file where
    // the directory should be) would silence every warning, so say so.
    if (err?.code !== 'EEXIST' && !lockBeingReleased(lockPath, err, staleMs)) logHookError(label, err);
    return null;
  }
  try {
    return fn();
  } finally {
    try { fs.closeSync(fd); } catch {}
    try { fs.unlinkSync(lockPath); } catch {}
  }
}
