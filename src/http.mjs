// src/http.mjs: one HTTP request with one overall deadline, for the senders
// that run on the hook path (ntfy, webhook, Sentry, telemetry). A leaf module
// on purpose: it imports node builtins only, so error-log.mjs -> sentry.mjs ->
// http.mjs cannot form a cycle. It does no logging; callers log what they
// need, because what may be written to errors.log differs per channel (a
// webhook URL is a secret, a ntfy server origin is not).
//
// Why node:http(s) with `agent: false` and not fetch: undici's keep-alive
// socket pool trips a libuv assertion (0xC0000409) on Windows when the hook
// calls process.exit() right after sending, and a keep-alive socket must not
// outlive that process.exit() anyway.
//
// Why one overall deadline and not the socket `timeout` option: that option
// is only an idle timer, so a server sending one byte at a time keeps it
// alive far past the hook's 10 s budget. The deadline here covers DNS,
// connect, the wait for headers and (when asked) the body.
import https from 'node:https';
import http from 'node:http';

const DEFAULT_TIMEOUT_MS = 5000;
// The most body `collectBody` will hold. The one caller (the npm registry's
// `latest` manifest) is a few KB; a server sending more than this is not
// answering that question, and the deadline alone would let it fill memory for
// the whole timeout first.
export const MAX_COLLECTED_BODY_BYTES = 1024 * 1024;

// Send one request. Resolves, never rejects, with:
//   status      the HTTP status; 0 when no complete response was obtained
//   timedOut    true when the deadline fired before the request finished
//   error       the underlying Error for a network failure or a synchronous
//               setup failure, else null (a timeout carries no error)
//   setupError  true when `error` was thrown synchronously while building the
//               request (an unsupported protocol such as ftp://, an invalid
//               header value, an unparseable URL string) rather than reported
//               by the network
//
// `target` is a URL or a URL string. The method defaults to GET; `body` is a
// string or Buffer written with req.end(). No redirect is followed: a 3xx is
// returned as the status.
//
// By default the promise resolves as soon as the response headers arrive and
// the body is drained in the background (a sender only needs the status).
// With `waitForBody: true` it resolves when the body has been fully read, and
// a body that ends early (connection reset mid-body) resolves status 0.
//
// `collectBody: true` (which implies `waitForBody`) also returns the body as a
// UTF-8 string in `body`, up to MAX_COLLECTED_BODY_BYTES: a larger body resolves
// status 0 with an error and destroys the response. The `body` key exists only
// in this mode, so every other caller's result is unchanged.
//
// On the deadline the request and the response are both destroyed, so no
// socket lingers. The timer is deliberately ref'd, and is cleared when the
// request ends (when the response closes in the default mode, even though the
// promise has already resolved at the headers); node <= 22 drains the event
// loop if only unref'd timers remain.
export function httpRequest(target, {
  method = 'GET', headers, body, timeoutMs = DEFAULT_TIMEOUT_MS, waitForBody = false, collectBody = false,
} = {}) {
  return new Promise((resolve) => {
    let settled = false;
    let timer;
    let req;
    let res;

    const settle = (status, extra) => {
      if (settled) return;
      settled = true;
      resolve({ status, timedOut: false, error: null, setupError: false, ...extra });
    };
    const stop = () => clearTimeout(timer);
    const destroyAll = () => {
      try { req?.destroy(); } catch { /* already gone */ }
      try { res?.destroy(); } catch { /* already gone */ }
    };

    try {
      const url = target instanceof URL ? target : new URL(target);
      const transport = url.protocol === 'https:' ? https : http;

      // transport.request can throw SYNCHRONOUSLY (not via 'error') on a
      // non-http(s) protocol that still parses as a URL and on invalid header
      // characters, so the whole setup is inside this try block.
      req = transport.request(url, { method, agent: false, headers }, (response) => {
        res = response;
        const status = response.statusCode || 0;
        if (!waitForBody && !collectBody) {
          settle(status);
          // The deadline stays armed until the drained response closes, so a
          // body that never ends is still cut at the deadline.
          response.on('close', stop);
          response.on('error', stop);
          response.resume();
          return;
        }
        const chunks = [];
        let size = 0;
        if (collectBody) {
          response.on('data', (chunk) => {
            if (settled) return;
            size += chunk.length;
            if (size > MAX_COLLECTED_BODY_BYTES) {
              stop();
              settle(0, { error: new Error('response body too large') });
              destroyAll();
              return;
            }
            chunks.push(chunk);
          });
        }
        response.on('end', () => {
          stop();
          settle(status, collectBody ? { body: Buffer.concat(chunks).toString('utf8') } : undefined);
        });
        response.on('error', (error) => { stop(); settle(0, { error }); });
        // A reset mid-body closes the response without 'end' and without an
        // error event when nothing listens for one.
        response.on('close', () => {
          stop();
          settle(0, { error: new Error('response closed before the body ended') });
        });
        response.resume();
      });

      timer = setTimeout(() => {
        settle(0, { timedOut: true });
        destroyAll();
      }, timeoutMs);

      // A destroy() below also emits 'error' on the request; this listener
      // swallows it (the promise is already settled) instead of crashing.
      req.on('error', (error) => { stop(); settle(0, { error }); });
      req.end(body);
    } catch (error) {
      stop();
      settle(0, { error, setupError: true });
      destroyAll();
    }
  });
}
