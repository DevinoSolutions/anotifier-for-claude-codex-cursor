// src/channel-failure.mjs — why a channel failed, as a fixed enum.
//
// Senders resolve booleans (every caller and test relies on that), so the
// reason travels beside the boolean: a sender that fails calls noteFailure(),
// and the hook's trackChannel reads it back with takeFailure(). The value is
// ALWAYS one of FAILURE_REASONS: never a message, stderr, path, URL, topic or
// exit code, because it ends up in the opt-in daily summary (see telemetry.mjs).
// Nothing here can throw.

export const FAILURE_REASONS = [
  'timeout', 'spawn_error', 'exit_nonzero', 'no_tty', 'http_4xx', 'http_5xx', 'network', 'unsupported', 'other',
];

// Anything off the list, or not a string, is 'other'.
export function failureReason(value) {
  return FAILURE_REASONS.includes(value) ? value : 'other';
}

// execFile error codes meaning "the process could not be started".
const SPAWN_CODES = new Set(['ENOENT', 'EACCES', 'EPERM', 'ENOTDIR', 'EMFILE', 'ENFILE', 'ENOMEM', 'EAGAIN', 'E2BIG']);

// An execFile callback error. err.killed is only set when Node itself killed the
// child, and every sender here does that only on its timeout option.
export function execFailureReason(err) {
  try {
    if (err?.killed) return 'timeout';
    if (typeof err?.code === 'number') return 'exit_nonzero';
    if (SPAWN_CODES.has(err?.code)) return 'spawn_error';
  } catch { /* fall through */ }
  return 'other';
}

// An HTTP status that was not a 2xx.
export function httpFailureReason(status) {
  if (status >= 400 && status < 500) return 'http_4xx';
  if (status >= 500 && status < 600) return 'http_5xx';
  return 'other';
}

const NETWORK_CODES = new Set([
  'ECONNREFUSED', 'ECONNRESET', 'ECONNABORTED', 'ENOTFOUND', 'EAI_AGAIN', 'EHOSTUNREACH', 'ENETUNREACH',
  'ENETDOWN', 'EPIPE', 'EPROTO', 'CERT_HAS_EXPIRED', 'DEPTH_ZERO_SELF_SIGNED_CERT', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
  'SELF_SIGNED_CERT_IN_CHAIN', 'ERR_TLS_CERT_ALTNAME_INVALID',
]);

// An error from an HTTP request that never produced a status.
export function networkFailureReason(err) {
  try {
    if (err?.code === 'ETIMEDOUT' || err?.code === 'ESOCKETTIMEDOUT') return 'timeout';
    if (NETWORK_CODES.has(err?.code)) return 'network';
  } catch { /* fall through */ }
  return 'other';
}

const noted = new Map();

// Remember why `channel` just failed. The last call before takeFailure wins, so
// a fallback server's failure replaces the primary's.
export function noteFailure(channel, reason) {
  try { noted.set(String(channel), failureReason(reason)); } catch { /* never throws */ }
}

// The reason noted for `channel`, or 'other' when its sender noted none. Clears it.
export function takeFailure(channel) {
  try {
    const reason = noted.get(String(channel));
    noted.delete(String(channel));
    return failureReason(reason);
  } catch { return 'other'; }
}

// Forget a stale reason before a new send starts.
export function clearFailure(channel) {
  try { noted.delete(String(channel)); } catch { /* never throws */ }
}
