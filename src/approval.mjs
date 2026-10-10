// src/approval.mjs — state for remote approval (docs/design/remote-approval.md).
//
// Remote approval turns an ntfy channel into a credential that can run
// commands on this machine, so everything here FAILS CLOSED: a missing,
// unreadable, corrupt, loosely-permissioned or out-of-range file means "no
// remote approval", and the agent shows its normal terminal prompt. That is
// the opposite of src/suppress.mjs, which fails open because the safe outcome
// there is to notify.
//
// What lives where (design section 2.1):
//   ~/.anotifier/approval.json   0600  server, request topic, response topic
//                                      prefix, optional agent access token
//   ~/.anotifier/approvals/      0700  pending-slot files (a PID and an
//                                      expiry, nothing else) and away.json
// No request content, token or topic is ever written under approvals/.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { getConfigDir } from './config-loader.mjs';

export const APPROVAL_VERSION = 1;
export const DEFAULT_WAIT_SECONDS = 300; // D9
export const MIN_WAIT_SECONDS = 30;
export const MAX_WAIT_SECONDS = 3600;
// The agent's hook timeout is the wait plus this margin, so the hook always
// exits on its own deadline first (design 2.6, D9: 300 s wait, 330 s timeout).
export const HOOK_TIMEOUT_MARGIN_SECONDS = 30;
export const MAX_PENDING = 5;
export const AWAY_MAX_MS = 24 * 60 * 60 * 1000;
export const DISPLAY_MODES = ['minimal', 'summary', 'full'];
// v1 decides Bash only (design 4.3). Other names in approval.tools are
// ignored, never honoured, until their display and denylist rules ship.
export const SUPPORTED_TOOLS = ['Bash'];

// Paths are functions, not constants: os.homedir() is read at call time so a
// test (or a hook run) with a different HOME gets its own files.
export function approvalPath() {
  return path.join(getConfigDir(), 'approval.json');
}

export function approvalsDir() {
  return path.join(getConfigDir(), 'approvals');
}

export function awayPath(dir = approvalsDir()) {
  return path.join(dir, 'away.json');
}

// POSIX modes mean nothing on Windows, where the profile ACL already limits
// %USERPROFILE% to the user (Q7: no icacls in v1).
const POSIX = process.platform !== 'win32';

// ── Names and one-time values (design 2.2) ──────────────────────────
// base64url keeps every name inside ntfy's [-_A-Za-z0-9] topic alphabet.
// `rand` is injectable like generateTopic in cli/setup.mjs.
const b64url = (buf) => Buffer.from(buf).toString('base64url');

export const REQUEST_TOPIC_RE = /^anr-[A-Za-z0-9_-]{32}$/;
export const RESPONSE_PREFIX_RE = /^ans-[A-Za-z0-9_-]{16}$/;
export const ONE_TIME_RE = /^[A-Za-z0-9_-]{22}$/;

// 192 bits: anr- + 32 chars, 36 in all.
export function generateRequestTopic(rand = crypto.randomBytes) {
  return `anr-${b64url(rand(24))}`;
}

// ans- + 16 chars (96 bits). The prefix only scopes the server ACL pattern;
// each response topic adds a fresh 128-bit suffix on top of it.
export function generateResponsePrefix(rand = crypto.randomBytes) {
  return `ans-${b64url(rand(12))}`;
}

// 128 bits each: the request id (also the response topic suffix and the
// notification's sequence id) and one token per button. Allow and Deny get
// DIFFERENT tokens, so seeing a Deny body never yields an Allow (T2).
export function generateOneTime(rand = crypto.randomBytes) {
  return b64url(rand(16));
}

// "anr-****…Ab3x": status and doctor never print the request topic in full (T1).
export function maskTopic(topic) {
  const s = String(topic || '');
  if (s.length < 8) return '****';
  return `${s.slice(0, 4)}****…${s.slice(-4)}`;
}

// ── Server checks (T8, D1, D8) ──────────────────────────────────────
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

export function isLoopbackHost(hostname) {
  const h = String(hostname || '').toLowerCase();
  return LOOPBACK_HOSTS.has(h) || /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(h);
}

// Public ntfy.sh. With an access token it is option B of design 2.5 (an
// account with a reserved request topic); without one it is option C, which
// v1 does not support (D1).
export function isPublicNtfySh(hostname) {
  const h = String(hostname || '').toLowerCase().replace(/\.$/, '');
  return h === 'ntfy.sh' || h.endsWith('.ntfy.sh');
}

// Returns { ok: true, base } with the server URL normalised (no trailing
// slash), or { ok: false, reason }. https only, except plain http on a
// loopback address (a server on this machine, or a test). Credentials, a
// query or a fragment in the URL are refused: they would be copied into every
// response URL the phone sees.
export function checkServer(server, token) {
  let url;
  try { url = new URL(String(server || '').trim()); } catch { return { ok: false, reason: 'server-invalid' }; }
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && isLoopbackHost(url.hostname))) {
    return { ok: false, reason: 'server-insecure' };
  }
  if (url.username || url.password || url.search || url.hash) return { ok: false, reason: 'server-invalid' };
  if (isPublicNtfySh(url.hostname) && !token) return { ok: false, reason: 'public-ntfy-sh' };
  return { ok: true, base: `${url.origin}${url.pathname.replace(/\/+$/, '')}` };
}

// D8: `full` only on a self-hosted or authenticated server. Anonymous ntfy.sh
// is already refused by checkServer, so this is a second, independent guard.
export function effectiveDisplay(mode, server, token) {
  const m = DISPLAY_MODES.includes(mode) ? mode : 'summary';
  if (m !== 'full') return m;
  let host = '';
  try { host = new URL(server).hostname; } catch { return 'summary'; }
  return isPublicNtfySh(host) && !token ? 'summary' : 'full';
}

// ── approval.json ───────────────────────────────────────────────────
// A token is sent as an HTTP header value: printable ASCII only, so a stray
// newline can never inject a second header.
const TOKEN_RE = /^[\x21-\x7e]{1,512}$/;

function loosePermissions(stat) {
  return POSIX && (stat.mode & 0o077) !== 0;
}

// The whole hook-side read. { ok: true, approval } or { ok: false, reason },
// never throws. Every field is checked; anything unexpected is a refusal.
export function readApproval(file = approvalPath(), now = Date.now()) {
  let raw;
  try {
    const stat = fs.statSync(file);
    if (!stat.isFile()) return { ok: false, reason: 'config-unreadable' };
    // Anyone who can read this file can learn the request topic, and anyone
    // who can read the request topic can approve (T1, T12).
    if (loosePermissions(stat)) return { ok: false, reason: 'config-permissions' };
    raw = fs.readFileSync(file, 'utf8');
  } catch (err) {
    return { ok: false, reason: err?.code === 'ENOENT' ? 'not-configured' : 'config-unreadable' };
  }
  let data;
  try { data = JSON.parse(raw); } catch { return { ok: false, reason: 'config-corrupt' }; }
  return validateApproval(data, now);
}

export function validateApproval(data, now = Date.now()) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return { ok: false, reason: 'config-corrupt' };
  if (data.v !== APPROVAL_VERSION) return { ok: false, reason: 'config-corrupt' };
  if (data.enabled !== true) return { ok: false, reason: 'disabled' };
  if (typeof data.requestTopic !== 'string' || !REQUEST_TOPIC_RE.test(data.requestTopic)) return { ok: false, reason: 'config-corrupt' };
  if (typeof data.responsePrefix !== 'string' || !RESPONSE_PREFIX_RE.test(data.responsePrefix)) return { ok: false, reason: 'config-corrupt' };
  if (data.token !== undefined && (typeof data.token !== 'string' || !TOKEN_RE.test(data.token))) return { ok: false, reason: 'config-corrupt' };
  const token = data.token || null;

  const server = checkServer(data.server, token);
  if (!server.ok) return { ok: false, reason: server.reason };

  let waitSeconds = DEFAULT_WAIT_SECONDS;
  if (data.waitSeconds !== undefined) {
    if (!Number.isInteger(data.waitSeconds) || data.waitSeconds < MIN_WAIT_SECONDS || data.waitSeconds > MAX_WAIT_SECONDS) {
      return { ok: false, reason: 'config-corrupt' };
    }
    waitSeconds = data.waitSeconds;
  }
  if (data.display !== undefined && !DISPLAY_MODES.includes(data.display)) return { ok: false, reason: 'config-corrupt' };

  // A recorded expiry that has passed means every publish would fail with an
  // auth error; skip the network and say why (design 2.5, token expiry).
  let tokenExpiresAt = null;
  if (data.tokenExpiresAt !== undefined && data.tokenExpiresAt !== null) {
    const t = typeof data.tokenExpiresAt === 'string' ? Date.parse(data.tokenExpiresAt) : NaN;
    if (!Number.isFinite(t)) return { ok: false, reason: 'config-corrupt' };
    if (t <= now) return { ok: false, reason: 'token-expired' };
    tokenExpiresAt = data.tokenExpiresAt;
  }

  const tools = data.tools === undefined ? ['Bash'] : data.tools;
  if (!Array.isArray(tools) || !tools.every((t) => typeof t === 'string')) return { ok: false, reason: 'config-corrupt' };
  const neverRemote = data.neverRemote === undefined ? [] : data.neverRemote;
  if (!Array.isArray(neverRemote) || neverRemote.length > 100 ||
      !neverRemote.every((p) => typeof p === 'string' && p.trim() && p.length <= 200)) {
    return { ok: false, reason: 'config-corrupt' };
  }

  return {
    ok: true,
    approval: {
      server: server.base,
      requestTopic: data.requestTopic,
      responsePrefix: data.responsePrefix,
      token,
      tokenExpiresAt,
      waitSeconds,
      display: effectiveDisplay(data.display, server.base, token),
      tools: tools.filter((t) => SUPPORTED_TOOLS.includes(t)),
      neverRemote: neverRemote.map((p) => p.trim()),
    },
  };
}

// The raw file for the CLI (status, setup re-runs, off). null when absent or
// unparseable; the CLI reports those itself.
export function readApprovalRaw(file = approvalPath()) {
  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    return data && typeof data === 'object' && !Array.isArray(data) ? data : null;
  } catch { return null; }
}

// Owner-only, atomically (temp file + rename), like saveConfig. CLI only, so
// failures throw.
export function writeApproval(data, file = approvalPath()) {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n', { encoding: 'utf8', mode: 0o600 });
  try { fs.chmodSync(tmp, 0o600); } catch { /* Windows: no POSIX modes */ }
  fs.renameSync(tmp, file);
}

// ── approvals/ directory ────────────────────────────────────────────
// Created 0700. A path that is not a plain directory (a symlink, a file) or a
// POSIX directory others can write to is refused: a stranger who can drop
// files there could plant an away.json and engage approvals.
export function ensureApprovalsDir(dir = approvalsDir()) {
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const st = fs.lstatSync(dir);
  if (!st.isDirectory()) throw new Error('approvals path is not a directory');
  if (POSIX && (st.mode & 0o022) !== 0) {
    try { fs.chmodSync(dir, 0o700); } catch {}
    if ((fs.lstatSync(dir).mode & 0o022) !== 0) throw new Error('approvals directory is writable by others');
  }
  return dir;
}

function writeOwnerOnly(file, content) {
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, content, { encoding: 'utf8', mode: 0o600 });
  try { fs.chmodSync(tmp, 0o600); } catch {}
  fs.renameSync(tmp, file);
}

// ── Away mode (design 4.1, D5) ──────────────────────────────────────
// The away deadline (epoch ms) or null. FAILS CLOSED: missing, unreadable,
// corrupt, loosely-permissioned, in the past, or implausibly far in the future
// (beyond the 24 h `anotifier away` accepts, plus a minute of clock slack) all
// read as "not engaged". Engagement must never come from a broken file.
export function readAwayUntil(file = awayPath(), now = Date.now()) {
  try {
    const st = fs.lstatSync(file);
    if (!st.isFile() || (POSIX && (st.mode & 0o022) !== 0)) return null;
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    const until = parsed && typeof parsed === 'object' ? parsed.until : undefined;
    if (typeof until !== 'number' || !Number.isFinite(until)) return null;
    if (until <= now || until > now + AWAY_MAX_MS + 60 * 1000) return null;
    return until;
  } catch {
    return null;
  }
}

export function writeAwayUntil(until, dir = approvalsDir()) {
  ensureApprovalsDir(dir);
  writeOwnerOnly(awayPath(dir), JSON.stringify({ until }) + '\n');
  return until;
}

export function clearAway(dir = approvalsDir()) {
  try {
    fs.unlinkSync(awayPath(dir));
    return true;
  } catch (err) {
    if (err?.code === 'ENOENT') return false;
    throw err;
  }
}

// ── Pending slots: the cross-process cap (design 2.3, step 2) ───────
// Each hook is its own process, so the cap of MAX_PENDING lives on disk: a
// hook holds slot-<n> by exclusive-creating it, the same primitive as
// acquireNotifyLock in src/notify.mjs. The file holds only "<pid> <expiresAt>".
export function isPidAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    // EPERM: the process exists but belongs to someone else.
    return err?.code === 'EPERM';
  }
}

const SLOT_RE = /^(\d+) (\d+)$/;
// A slot file is created empty and filled a moment later. An empty or
// half-written file younger than this belongs to a hook that is mid-claim.
const SLOT_WRITE_GRACE_MS = 2000;

function slotFile(dir, n) {
  return path.join(dir, `slot-${n}`);
}

function readSlot(file) {
  try {
    const st = fs.statSync(file);
    const m = SLOT_RE.exec(fs.readFileSync(file, 'utf8').trim());
    return { exists: true, mtimeMs: st.mtimeMs, pid: m ? Number(m[1]) : null, expiresAt: m ? Number(m[2]) : null, raw: m ? m[0] : null };
  } catch {
    return { exists: false };
  }
}

function slotIsStale(slot, now, isAlive) {
  if (!slot.exists) return false;
  if (slot.pid === null) return now - slot.mtimeMs > SLOT_WRITE_GRACE_MS;
  return slot.expiresAt <= now || !isAlive(slot.pid);
}

// Delete a slot only if it still holds what we judged stale. Two hooks can
// both see the same stale file; re-reading right before the unlink keeps the
// second one from deleting a slot the first has just re-claimed. (The window
// is not zero, so the cap can briefly be off by one under that race. It is a
// limit on prompts, not a security boundary.)
function unlinkIfUnchanged(file, seen) {
  const now = readSlot(file);
  if (!now.exists || now.raw !== seen.raw || (seen.raw === null && now.mtimeMs !== seen.mtimeMs)) return;
  try { fs.unlinkSync(file); } catch {}
}

// Live slot count, after clearing stale ones. For `approval status`.
export function countPendingSlots({ dir = approvalsDir(), now = Date.now(), isAlive = isPidAlive } = {}) {
  let live = 0;
  for (let n = 0; n < MAX_PENDING; n++) {
    const file = slotFile(dir, n);
    const slot = readSlot(file);
    if (!slot.exists) continue;
    if (slotIsStale(slot, now, isAlive)) unlinkIfUnchanged(file, slot);
    else live++;
  }
  return live;
}

// Claim the first free slot. Returns { file, content } or null when all
// MAX_PENDING are taken or the directory cannot be used at all. Never throws:
// null is "no decision", which fails closed for remote approval and safe for
// the user, who gets the terminal prompt.
export function claimSlot({ dir = approvalsDir(), pid = process.pid, expiresAt, now = Date.now(), isAlive = isPidAlive } = {}) {
  try {
    ensureApprovalsDir(dir);
  } catch {
    return null;
  }
  const content = `${pid} ${Math.floor(expiresAt)}`;
  for (let n = 0; n < MAX_PENDING; n++) {
    const file = slotFile(dir, n);
    const slot = readSlot(file);
    if (slotIsStale(slot, now, isAlive)) unlinkIfUnchanged(file, slot);
    let fd;
    try {
      fd = fs.openSync(file, 'wx', 0o600);
    } catch (err) {
      if (err?.code === 'EEXIST') continue;
      // Windows reports a file another process is deleting as EPERM; treat
      // it as taken. Anything else means the directory is unusable.
      if (['EPERM', 'EACCES', 'EBUSY'].includes(err?.code)) continue;
      return null;
    }
    try {
      fs.writeSync(fd, content);
    } catch {
      try { fs.closeSync(fd); } catch {}
      try { fs.unlinkSync(file); } catch {}
      return null;
    }
    try { fs.closeSync(fd); } catch {}
    return { file, content };
  }
  return null;
}

// Free our own slot, and only ours: if the file now holds someone else's
// claim, leave it. Safe to call more than once.
export function releaseSlot(slot) {
  if (!slot?.file) return;
  try {
    if (fs.readFileSync(slot.file, 'utf8').trim() !== slot.content) return;
    fs.unlinkSync(slot.file);
  } catch {}
}

// ── Last outcome, for `approval status` ─────────────────────────────
// The class of the last result (allow, deny, expired, auth, quota, network,
// ...) and when. Never a topic, token, command or project (design 2.5: "the
// hook also records the last failure class without content").
export function lastOutcomePath(dir = approvalsDir()) {
  return path.join(dir, 'last.json');
}

export function recordOutcome(outcome, { dir = approvalsDir(), now = Date.now() } = {}) {
  try {
    ensureApprovalsDir(dir);
    writeOwnerOnly(lastOutcomePath(dir), JSON.stringify({ outcome: String(outcome).slice(0, 40), at: now }) + '\n');
  } catch {}
}

export function readLastOutcome(dir = approvalsDir()) {
  try {
    const parsed = JSON.parse(fs.readFileSync(lastOutcomePath(dir), 'utf8'));
    return parsed && typeof parsed.outcome === 'string' && typeof parsed.at === 'number' ? parsed : null;
  } catch { return null; }
}
