// src/approval-ntfy.mjs — the ntfy side of a remote approval (design 2.3-2.4).
//
// One request, on the wire:
//   1. subscribe to the fresh response topic (GET <server>/<topic>/json,
//      streaming) and wait for ntfy's `open` event, so the subscription exists
//      before anything is published (no publish/subscribe race, no since=);
//   2. publish the request as JSON to <server>/ with Approve/Deny http actions
//      whose bodies carry one-time tokens;
//   3. read the stream until ONE body carries the right token for its
//      decision, or the deadline, or a cap is hit.
// Nothing in this file decides on its own: it reports what arrived and the
// verifier says whether it counts. Every failure is reported, never thrown.
import https from 'node:https';
import http from 'node:http';
import crypto from 'node:crypto';
import { ONE_TIME_RE, generateOneTime } from './approval.mjs';

// Stream caps (T15): past either one the hook gives up with no decision.
export const STREAM_BYTE_CAP = 64 * 1024;
export const STREAM_MESSAGE_CAP = 50;
// A response body is a few dozen bytes; anything much larger is not ours.
const RESPONSE_BODY_CAP = 512;
const PUBLISH_TIMEOUT_MS = 10000;
const OPEN_TIMEOUT_MS = 10000;

export const DENY_MESSAGE = 'Denied from phone via anotifier.';

function transportFor(url) {
  return url.protocol === 'https:' ? https : http;
}

function authHeaders(token) {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// ntfy status → the failure class recorded for `approval status`.
export function failureClass(status) {
  if (status === 401 || status === 403) return 'auth';
  if (status === 429) return 'quota';
  return 'server';
}

// POST a JSON message to <server>/. Resolves { ok, failure } where failure is
// null | 'auth' | 'quota' | 'server' | 'network' | 'timeout'. Never throws.
export function publishJson(base, payload, { token = null, timeoutMs = PUBLISH_TIMEOUT_MS } = {}) {
  return new Promise((resolve) => {
    let done = false;
    let timer;
    let req;
    const finish = (ok, failure = null) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      try { req?.destroy(); } catch {}
      resolve({ ok, failure });
    };
    try {
      const url = new URL(`${base}/`);
      const body = JSON.stringify(payload);
      req = transportFor(url).request(url, {
        method: 'POST',
        agent: false, // no keep-alive socket may outlive the hook (see sentry.mjs)
        rejectUnauthorized: true, // never trust NODE_TLS_REJECT_UNAUTHORIZED=0 (review of PR #96, M1)
        headers: { ...authHeaders(token), 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
      }, (res) => {
        res.resume();
        const ok = res.statusCode >= 200 && res.statusCode < 300;
        finish(ok, ok ? null : failureClass(res.statusCode));
      });
      timer = setTimeout(() => finish(false, 'timeout'), timeoutMs);
      req.on('error', () => finish(false, 'network'));
      req.end(body);
    } catch {
      finish(false, 'network');
    }
  });
}

// Open the streaming subscription. Returns a handle:
//   ready     Promise<{ ok, failure }>, resolved once ntfy's `open` event has
//             arrived (ok) or the subscription failed
//   onEvent   set to a function(eventObject) to receive every parsed line
//   onEnd     set to a function(reason) for the stream ending: 'closed',
//             'byte-cap', 'error'
//   close()   tear it down (idempotent)
export function subscribe(base, topic, { token = null, openTimeoutMs = OPEN_TIMEOUT_MS } = {}) {
  const handle = { onEvent: null, onEnd: null, close: () => {} };
  let closed = false;
  let req;
  let bytes = 0;
  let buf = '';
  let opened = false;
  let resolveReady;
  handle.ready = new Promise((r) => { resolveReady = r; });
  let readyDone = false;
  const ready = (ok, failure = null) => {
    if (readyDone) return;
    readyDone = true;
    clearTimeout(openTimer);
    resolveReady({ ok, failure });
  };
  const end = (reason) => {
    if (closed) return;
    closed = true;
    clearTimeout(openTimer);
    try { req?.destroy(); } catch {}
    ready(false, reason === 'closed' ? 'network' : reason);
    handle.onEnd?.(reason);
  };
  handle.close = () => {
    if (closed) return;
    closed = true;
    clearTimeout(openTimer);
    try { req?.destroy(); } catch {}
    ready(false, 'network');
  };
  const openTimer = setTimeout(() => end('timeout'), openTimeoutMs);

  try {
    const url = new URL(`${base}/${topic}/json`);
    req = transportFor(url).request(url, {
      method: 'GET',
      agent: false,
      rejectUnauthorized: true, // see publishJson
      headers: { ...authHeaders(token), Accept: 'application/x-ndjson' },
    }, (res) => {
      if (res.statusCode !== 200) {
        res.resume();
        ready(false, failureClass(res.statusCode));
        end('error');
        return;
      }
      res.setEncoding('utf8');
      res.on('data', (chunk) => {
        if (closed) return;
        bytes += Buffer.byteLength(chunk, 'utf8');
        if (bytes > STREAM_BYTE_CAP) { end('byte-cap'); return; }
        buf += chunk;
        let nl;
        while (!closed && (nl = buf.indexOf('\n')) !== -1) {
          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (!line) continue;
          let event;
          try { event = JSON.parse(line); } catch { continue; }
          if (!event || typeof event !== 'object') continue;
          if (event.event === 'open' && !opened) { opened = true; ready(true); continue; }
          handle.onEvent?.(event);
        }
      });
      res.on('end', () => end('closed'));
      res.on('error', () => end('error'));
    });
    req.on('error', () => end('error'));
    req.end();
  } catch {
    end('error');
  }
  return handle;
}

// ── The verifier: the ONLY thing that can turn a message into a decision ─
// Holds the request's one-time values in memory. offer(event) returns
// 'allow' | 'deny' | 'terminal' for the first valid response and null for
// everything else. After one valid decision it is inert: every later offer,
// valid or not, returns null (one decision per request, T3).
//
// A response counts only when ALL of these hold (design 2.3, step 6):
//   event === 'message' on exactly the response topic
//   the message field parses as a JSON object of at most RESPONSE_BODY_CAP
//   v === 1, rid matches, d is a decision this request offered
//   t is exactly that decision's token (crypto.timingSafeEqual)
//   now < expiresAt
export function createVerifier({ rid, topic, tokens, expiresAt, now = Date.now, messageCap = STREAM_MESSAGE_CAP }) {
  const expected = {};
  for (const [d, t] of Object.entries(tokens)) {
    if (t && ONE_TIME_RE.test(t)) expected[d] = Buffer.from(t, 'utf8');
  }
  let decided = null;
  let messages = 0;
  const verifier = {
    get decided() { return decided; },
    get exhausted() { return messages >= messageCap; },
    offer(event) {
      if (decided) return null;
      if (!event || event.event !== 'message') return null;
      messages++;
      if (messages > messageCap) return null;
      if (event.topic !== topic) return null;
      if (!(now() < expiresAt)) return null;
      const raw = event.message;
      if (typeof raw !== 'string' || raw.length > RESPONSE_BODY_CAP) return null;
      let body;
      try { body = JSON.parse(raw); } catch { return null; }
      if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
      if (body.v !== 1 || body.rid !== rid) return null;
      if (typeof body.d !== 'string' || !Object.hasOwn(expected, body.d)) return null;
      if (typeof body.t !== 'string' || !ONE_TIME_RE.test(body.t)) return null;
      const got = Buffer.from(body.t, 'utf8');
      const want = expected[body.d];
      if (got.length !== want.length || !crypto.timingSafeEqual(got, want)) return null;
      decided = body.d;
      return decided;
    },
  };
  return verifier;
}

// The body a button POSTs. Tokens go in the body, never the URL: query
// strings land in reverse-proxy access logs (design 2.4).
export function responseBody(rid, d, t) {
  return JSON.stringify({ v: 1, rid, d, t });
}

// The ntfy request message (design 2.3, step 5). `allowApprove` false drops
// the Approve button and offers "At terminal" instead (design 2.8: Approve is
// withheld when the command does not fit). At most three actions (ntfy limit).
export function buildRequestPayload({ requestTopic, base, responseTopic, rid, tokens, title, message, allowApprove }) {
  const url = `${base}/${responseTopic}`;
  const action = (label, d) => ({
    action: 'http', label, url, method: 'POST', body: responseBody(rid, d, tokens[d]), clear: true,
  });
  const actions = allowApprove
    ? [action('Approve', 'allow'), action('Deny', 'deny')]
    : [action('Deny', 'deny'), action('At terminal', 'terminal')];
  return {
    topic: requestTopic,
    title,
    message,
    priority: 4,
    tags: ['lock'],
    sequence_id: rid,
    actions,
  };
}

// Replaces the request notification (same sequence id) once the hook has
// stopped listening: a receipt after a decision, or "answer at the terminal"
// after expiry or a failure. No actions, so the stale buttons go away on
// Android and the web (iOS shows it as a second notification, T4).
export function buildFollowUpPayload({ requestTopic, rid, title, message }) {
  return { topic: requestTopic, title, message, priority: 3, tags: ['lock'], sequence_id: rid };
}

// Run one full request/response exchange. Resolves
//   { decision: 'allow'|'deny'|'terminal'|null, reason, published }
// where reason names why there is no decision ('expired', 'auth', 'quota',
// 'network', 'server', 'timeout', 'byte-cap', 'message-cap', 'aborted').
// Never throws. `signal` (an AbortSignal) ends the wait early with no decision.
export async function exchange({
  base, token, requestTopic, responseTopic, rid, tokens, title, message, allowApprove,
  expiresAt, now = Date.now, signal,
}) {
  const sub = subscribe(base, responseTopic, { token, openTimeoutMs: Math.max(1, Math.min(OPEN_TIMEOUT_MS, expiresAt - now())) });
  const verifier = createVerifier({ rid, topic: responseTopic, tokens, expiresAt, now });

  let settle;
  const outcome = new Promise((r) => { settle = r; });
  let settled = false;
  const finish = (decision, reason) => {
    if (settled) return;
    settled = true;
    settle({ decision, reason });
  };
  sub.onEvent = (event) => {
    const d = verifier.offer(event);
    if (d) finish(d, d);
    else if (verifier.exhausted) finish(null, 'message-cap');
  };
  sub.onEnd = (reason) => finish(null, reason === 'closed' ? 'network' : reason);

  const opened = await sub.ready;
  if (!opened.ok) {
    sub.close();
    return { decision: null, reason: opened.failure || 'network', published: false };
  }

  const payload = buildRequestPayload({ requestTopic, base, responseTopic, rid, tokens, title, message, allowApprove });
  const pub = await publishJson(base, payload, { token, timeoutMs: Math.max(1, Math.min(PUBLISH_TIMEOUT_MS, expiresAt - now())) });
  if (!pub.ok) {
    sub.close();
    return { decision: null, reason: pub.failure || 'server', published: false };
  }

  const remaining = Math.max(0, expiresAt - now());
  const timer = setTimeout(() => finish(null, 'expired'), remaining);
  const onAbort = () => finish(null, 'aborted');
  if (signal) {
    if (signal.aborted) onAbort();
    else signal.addEventListener('abort', onAbort, { once: true });
  }
  const result = await outcome;
  clearTimeout(timer);
  signal?.removeEventListener?.('abort', onAbort);
  sub.close();
  return { ...result, published: true };
}

// ── Is the server locked down? (setup, design 2.5; review of PR #96, M3) ──
// The design's safety rests on the ACL recipe: deny-all by default, so an
// anonymous client can neither read the request topic (T1, T7) nor publish a
// fake prompt to it (T10), and cannot read a response topic. A server that is
// open would make setup look like it worked while leaving all of that to the
// topic names. This asks the server, WITHOUT credentials, whether it enforces
// it. Never throws; makes at most three requests, none of them with a token.
const PROBE_TIMEOUT_MS = 8000;

// One anonymous request. Resolves { status } or { status: null, error }.
function anonymousRequest(method, url, { body, timeoutMs = PROBE_TIMEOUT_MS } = {}) {
  return new Promise((resolve) => {
    let done = false;
    let req;
    let timer;
    const finish = (value) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      try { req?.destroy(); } catch {}
      resolve(value);
    };
    try {
      const u = new URL(url);
      const headers = body === undefined ? {} : { 'Content-Type': 'text/plain', 'Content-Length': Buffer.byteLength(body) };
      req = transportFor(u).request(u, { method, agent: false, rejectUnauthorized: true, headers }, (res) => {
        res.resume();
        finish({ status: res.statusCode });
      });
      timer = setTimeout(() => finish({ status: null, error: 'timeout' }), timeoutMs);
      req.on('error', (err) => finish({ status: null, error: err?.code || 'network' }));
      req.end(body);
    } catch {
      finish({ status: null, error: 'network' });
    }
  });
}

const isDenied = (status) => status === 401 || status === 403;

// Resolves { ok, checks, failed } where checks is
//   [{ id, what, status, error, ok, ran }]
// in order (read-request, publish-request, read-response), and failed is the
// first check that did not pass (null when ok). The publish check runs only
// if the read check passed, so a lockdown failure never also writes to a
// topic anyone can read. checkResponseTopic false skips the third check: on
// ntfy.sh response topics are ordinary anonymous topics (design 2.5 B).
export async function probeLockdown(base, {
  requestTopic, responsePrefix, checkResponseTopic = true, timeoutMs = PROBE_TIMEOUT_MS, rand = crypto.randomBytes,
}) {
  const plan = [
    { id: 'read-request', what: 'an anonymous read of the request topic', run: () => anonymousRequest('GET', `${base}/${requestTopic}/json?poll=1`, { timeoutMs }) },
    { id: 'publish-request', what: 'an anonymous publish to the request topic', run: () => anonymousRequest('POST', `${base}/${requestTopic}`, { body: 'anotifier setup check: ignore this message', timeoutMs }) },
  ];
  if (checkResponseTopic) {
    const topic = `${responsePrefix}_${generateOneTime(rand)}`;
    plan.push({ id: 'read-response', what: 'an anonymous read of a response topic', run: () => anonymousRequest('GET', `${base}/${topic}/json?poll=1`, { timeoutMs }) });
  }
  const checks = [];
  let failed = null;
  for (const step of plan) {
    if (failed) { checks.push({ id: step.id, what: step.what, status: null, error: null, ok: false, ran: false }); continue; }
    const r = await step.run();
    const check = { id: step.id, what: step.what, status: r.status, error: r.error || null, ok: isDenied(r.status), ran: true };
    checks.push(check);
    if (!check.ok) failed = check;
  }
  return { ok: failed === null, checks, failed };
}
